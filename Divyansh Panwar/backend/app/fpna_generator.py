"""
fpna_generator.py
-----------------
Correlated FP&A synthetic data generator with fully dynamic dimensions.
"""

from __future__ import annotations

import csv
import json
import math
import itertools
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class GeneratorRequest:
    industry: str
    project_name: str
    start_year: int = 2023
    num_years: int = 2
    dimensions: list[str] = field(default_factory=lambda: ["product", "region"])
    products: list[str] = field(default_factory=list)
    regions: list[str] = field(default_factory=list)
    channels: list[str] = field(default_factory=list)
    scenarios: list[str] = field(default_factory=lambda: ["Base"])
    accounts: list[str] = field(default_factory=list)
    seasonality_profile: str = "flat"
    marketing_intensity: float = 1.0        
    sentiment_volatility: float = 0.15      
    fx_volatility: float = 0.05             
    inflation_preset: str = "medium"        
    custom_inflation_rate: float | None = None
    random_seed: int = 42
    custom_dimensions: dict = field(default_factory=dict) # The dynamic payload
    output_dir: str = "./output"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_template(industry: str, templates_dir: str = None) -> dict:
    if templates_dir is None:
        here = Path(__file__).parent
        templates_dir = here / "config" / "templates"
    path = Path(templates_dir) / f"{industry}.json"
    if not path.exists():
        raise FileNotFoundError(f"No template found for industry '{industry}' at {path}")
    with open(path) as f:
        return json.load(f)


def _month_range(start_year: int, num_years: int) -> list[date]:
    months = []
    for y in range(start_year, start_year + num_years):
        for m in range(1, 13):
            months.append(date(y, m, 1))
    return months


def _gbm_path(n: int, mu: float, sigma: float, s0: float, rng: np.random.Generator) -> np.ndarray:
    dt = 1 / 12
    shocks = rng.normal((mu - 0.5 * sigma**2) * dt, sigma * math.sqrt(dt), n)
    log_returns = np.cumsum(shocks)
    return s0 * np.exp(log_returns)


def _ar1_path(n: int, mu: float, phi: float, sigma: float, rng: np.random.Generator) -> np.ndarray:
    path = np.empty(n)
    path[0] = mu + rng.normal(0, sigma)
    for i in range(1, n):
        path[i] = mu + phi * (path[i - 1] - mu) + rng.normal(0, sigma)
    return np.clip(path, 0.1, 2.5)


# ---------------------------------------------------------------------------
# Core generator
# ---------------------------------------------------------------------------

class FPnAGenerator:
    def __init__(self, request: GeneratorRequest, templates_dir: str = None):
        self.req = request
        self.tmpl = _load_template(request.industry, templates_dir)
        self.rng = np.random.default_rng(request.random_seed)

        d = self.tmpl["defaults"]
        self.base_price = d["base_price"]
        self.base_units = d["base_units_per_month"]
        self.cogs_pct = d["cogs_pct"]
        self.mktg_pct = d["marketing_pct_revenue"] * request.marketing_intensity
        self.opex_pct = d["other_opex_pct_revenue"]
        self.depreciation = d["depreciation_monthly"]
        self.interest = d["interest_monthly"]
        self.tax_rate = d["tax_rate"]
        self.capacity_max = d["capacity_max_units"]
        self.elasticity = d["price_elasticity"]
        self.mktg_lift = d["marketing_lift_factor"]
        self.sentiment_lift = d["sentiment_lift_factor"]
        self.fx_cogs_pt = d["fx_cogs_passthrough"]
        self.fx_price_pt = d["fx_price_passthrough"]
        self.infl_cogs_pt = d["inflation_cogs_passthrough"]
        self.infl_price_pt = d["inflation_price_passthrough"]

        inflation_curve = self.tmpl.get("inflation_curve_presets", {})
        if request.custom_inflation_rate is not None:
            self.annual_inflation = request.custom_inflation_rate
        else:
            self.annual_inflation = inflation_curve.get(request.inflation_preset, 0.04)

        self.months = _month_range(request.start_year, request.num_years)
        n = len(self.months)

        self.sentiment_path = _ar1_path(n, mu=1.0, phi=0.75, sigma=request.sentiment_volatility, rng=self.rng)
        self.inflation_path = np.array([(1 + self.annual_inflation / 12) ** (i + 1) for i in range(n)])
        self.seasonality_profile = self.tmpl["seasonality_profiles"].get(request.seasonality_profile, [1.0] * 12)

# ---------------------------------------------------------
        # Dynamic Dimension Mapping
        # ---------------------------------------------------------
        self.dimensions = request.dimensions
        self.dimension_members = {}
        
        # CRITICAL FIX: Prevent empty arrays from collapsing the matrix to 0 rows!
        for dim in self.dimensions:
            if dim in request.custom_dimensions and len(request.custom_dimensions[dim]) > 0:
                self.dimension_members[dim] = request.custom_dimensions[dim]
            else:
                self.dimension_members[dim] = ["Undefined"] # Fallback if array is empty

        # Safely extract core dimensions for baseline math
        self.products = self.dimension_members.get("product", ["Core Product"])
        self.regions = self.dimension_members.get("region", ["HQ"])

        # Per-region FX paths
        regional_fx_base = self.tmpl.get("regional_fx", {})
        self.fx_paths: dict[str, np.ndarray] = {}
        for region in self.regions:
            s0 = regional_fx_base.get(region, 1.0)
            self.fx_paths[region] = _gbm_path(n, mu=0.0, sigma=request.fx_volatility, s0=s0, rng=self.rng)

        # Per-product slight price / unit variation
        self.product_price_mult: dict[str, float] = {}
        self.product_unit_mult: dict[str, float] = {}
        for p in self.products:
            self.product_price_mult[p] = self.rng.uniform(0.7, 1.4)
            self.product_unit_mult[p] = self.rng.uniform(0.5, 1.6)

        # Per-scenario adjustment
        self.scenario_mult: dict[str, float] = {
            "Base": 1.0, "Optimistic": 1.15, "Pessimistic": 0.82,
            "Stress Test": 0.65, "Board Case": 1.05, "Turnaround": 0.90,
        }

    # ------------------------------------------------------------------
    # Compute one row using dynamic kwargs
    # ------------------------------------------------------------------

    def _compute_row(self, t: int, current_dims: dict[str, str]) -> dict[str, Any]:
        month_date = self.months[t]
        month_idx = month_date.month - 1  

        # Safely pull out core dimensions for the math formulas
        product = current_dims.get("product", self.products[0])
        region = current_dims.get("region", self.regions[0])
        scenario = current_dims.get("scenario", "Base")

        # --- drivers ---
        season_idx = self.seasonality_profile[month_idx]
        sentiment = float(self.sentiment_path[t])
        fx = float(self.fx_paths[region][t])
        inflation = float(self.inflation_path[t])
        promo_depth = float(self.rng.beta(2, 8)) 
        sc_mult = self.scenario_mult.get(scenario, 1.0)

        # --- price ---
        base_p = self.base_price * self.product_price_mult[product]
        price_infl_adj = base_p * (1 + self.infl_price_pt * (inflation - 1))
        price_fx_adj = price_infl_adj * (1 + self.fx_price_pt * (fx - self.fx_paths[region][0]))
        price_promo_adj = price_fx_adj * (1 - promo_depth * 0.3)
        price = max(price_promo_adj * sc_mult, base_p * 0.4)

        # --- units (demand) ---
        base_u = self.base_units * self.product_unit_mult[product]
        price_ratio = price / (base_p + 1e-9)
        demand_price_effect = price_ratio ** self.elasticity
        demand_mktg_effect = 1 + self.mktg_lift * (self.mktg_pct - self.tmpl["defaults"]["marketing_pct_revenue"])
        demand_sentiment_effect = 1 + self.sentiment_lift * (sentiment - 1)
        demand = base_u * season_idx * demand_price_effect * max(demand_mktg_effect, 0.5) * max(demand_sentiment_effect, 0.3) * sc_mult
        demand = max(demand, 0)

        capacity_utilization = min(demand / (self.capacity_max * self.product_unit_mult[product] + 1), 1.0)
        stockout_flag = 1 if capacity_utilization >= 0.98 else 0
        units = min(demand, self.capacity_max * self.product_unit_mult[product])

        # --- financials ---
        revenue = units * price
        cogs_base_pct = self.cogs_pct
        cogs_infl_adj = cogs_base_pct * (1 + self.infl_cogs_pt * (inflation - 1))
        cogs_fx_adj = cogs_infl_adj * (1 + self.fx_cogs_pt * abs(fx - self.fx_paths[region][0]))
        cogs = revenue * min(cogs_fx_adj, 0.92)
        gross_profit = revenue - cogs
        marketing_expense = revenue * self.mktg_pct
        other_opex = revenue * self.opex_pct
        ebitda = gross_profit - marketing_expense - other_opex
        
        # Spread fixed costs across the total dimension combinations
        total_combinations = math.prod(len(members) for members in self.dimension_members.values())
        
        depreciation = self.depreciation / max(total_combinations, 1)
        ebit = ebitda - depreciation
        interest = self.interest / max(total_combinations, 1)
        ebt = ebit - interest
        taxes = max(ebt * self.tax_rate, 0)
        net_income = ebt - taxes

        # Unpack the dynamic dimensions dictionary directly into the row payload
        return {
            "date": month_date.strftime("%Y-%m-%d"),
            "year": month_date.year,
            "month": month_date.month,
            **current_dims,
            "seasonality_index": round(season_idx, 4),
            "sentiment_index": round(sentiment, 4),
            "fx_rate": round(fx, 4),
            "inflation_index": round(inflation, 4),
            "promo_depth": round(promo_depth, 4),
            "capacity_utilization": round(capacity_utilization, 4),
            "stockout_flag": stockout_flag,
            "units": round(units, 0),
            "price": round(price, 2),
            "revenue": round(revenue, 2),
            "cogs": round(cogs, 2),
            "gross_profit": round(gross_profit, 2),
            "marketing_expense": round(marketing_expense, 2),
            "other_opex": round(other_opex, 2),
            "ebitda": round(ebitda, 2),
            "depreciation": round(depreciation, 2),
            "ebit": round(ebit, 2),
            "interest": round(interest, 2),
            "taxes": round(taxes, 2),
            "net_income": round(net_income, 2),
        }

    # ------------------------------------------------------------------
    # Generate all files dynamically
    # ------------------------------------------------------------------

    def generate(self) -> dict[str, str]:
        out_dir = Path(self.req.output_dir)
        out_dir.mkdir(parents=True, exist_ok=True)

        # Build ordered lists for the Cartesian Product
        dim_names = self.dimensions
        dim_lists = [self.dimension_members.get(d, ["Undefined"]) for d in dim_names]

        all_rows: list[dict] = []
        for t in range(len(self.months)):
            # itertools.product replaces all hardcoded nested for loops
            for combo in itertools.product(*dim_lists):
                current_dims = dict(zip(dim_names, combo))
                all_rows.append(self._compute_row(t, current_dims))

        # --- Fact table ---
        fact_path = out_dir / "fact_sales.csv"
        _write_csv(fact_path, all_rows)
        files_written = {"fact_sales": str(fact_path)}

        # --- Dynamic Dimension Tables ---
        for dim_name in dim_names:
            dim_path = out_dir / f"dim_{dim_name}.csv"
            
            if dim_name == "product":
                _write_csv(dim_path, [{"product": p, "product_group": p.split()[0], "industry": self.req.industry} for p in self.products])
            elif dim_name == "region":
                _write_csv(dim_path, [{"region": r, "fx_base": round(self.fx_paths[r][0], 4), "currency": self.tmpl.get("fx_base_currency", "USD")} for r in self.regions])
            else:
                _write_csv(dim_path, [{dim_name: val} for val in self.dimension_members[dim_name]])
            
            files_written[f"dim_{dim_name}"] = str(dim_path)

        dim_time_path = out_dir / "dim_time.csv"
        _write_csv(dim_time_path, [{"date": m.strftime("%Y-%m-%d"), "year": m.year, "month": m.month, "quarter": f"Q{(m.month - 1) // 3 + 1}", "month_name": m.strftime("%b")} for m in self.months])
        files_written["dim_time"] = str(dim_time_path)

        # --- Consolidated P&L ---
        pl_rows = _aggregate_pl(all_rows)
        pl_path = out_dir / "pnl_consolidated.csv"
        _write_csv(pl_path, pl_rows)
        files_written["pnl_consolidated"] = str(pl_path)

        return files_written


# ---------------------------------------------------------------------------
# Aggregation & I/O helpers
# ---------------------------------------------------------------------------

def _aggregate_pl(rows: list[dict]) -> list[dict]:
    agg: dict[tuple, dict] = {}
    for r in rows:
        # Fallback to "Base" if user deleted the scenario dimension
        scenario = r.get("scenario", "Base") 
        key = (r["date"], r["year"], r["month"], scenario)
        
        if key not in agg:
            agg[key] = {
                "date": r["date"], "year": r["year"], "month": r["month"],
                "scenario": scenario,
                "units": 0, "revenue": 0, "cogs": 0, "gross_profit": 0,
                "marketing_expense": 0, "other_opex": 0,
                "ebitda": 0, "depreciation": 0, "ebit": 0,
                "interest": 0, "taxes": 0, "net_income": 0,
            }
        for col in ["units", "revenue", "cogs", "gross_profit",
                    "marketing_expense", "other_opex", "ebitda",
                    "depreciation", "ebit", "interest", "taxes", "net_income"]:
            agg[key][col] = round(agg[key][col] + r[col], 2)

    pl_rows = sorted(agg.values(), key=lambda x: (x["scenario"], x["date"]))
    for row in pl_rows:
        rev = row["revenue"] or 1
        row["gross_margin_pct"] = round(row["gross_profit"] / rev * 100, 2)
        row["ebitda_margin_pct"] = round(row["ebitda"] / rev * 100, 2)
        row["net_margin_pct"] = round(row["net_income"] / rev * 100, 2)
    return pl_rows


def _write_csv(path: Path, rows: list[dict]) -> None:
    if not rows:
        return
    with open(path, "w", newline="") as f:
        # Because we dynamically unpacked current_dims into the row dictionaries,
        # rows[0].keys() will automatically generate headers for every custom dimension!
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)