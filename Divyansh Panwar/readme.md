# FP&A Studio — Synthetic Data Generator

A full-stack application for generating correlated, industry-specific synthetic FP&A datasets with a complete P&L model.

---

## Quick Start

### 1. Backend

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the API server
uvicorn app.main:app --reload --port 8000
```

The API will be available at http://localhost:8000  
Interactive docs: http://localhost:8000/docs

### 2. Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

The UI will be available at http://localhost:3000

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/templates` | List all industry templates |
| GET | `/api/templates/{industry}` | Get template details |
| POST | `/api/projects` | Create a project |
| GET | `/api/projects` | List all projects |
| GET | `/api/projects/{id}` | Get project details |
| DELETE | `/api/projects/{id}` | Delete project + all data |
| POST | `/api/projects/{id}/datasets` | Generate a new dataset |
| GET | `/api/projects/{id}/datasets` | List project datasets |
| GET | `/api/projects/{id}/datasets/{dsId}` | Get dataset metadata |
| GET | `/api/projects/{id}/datasets/{dsId}/download?file=X` | Download a CSV file |

### POST /api/projects — Request body
```json
{
  "name": "Q1 2025 Planning",
  "industry": "cpg",
  "description": "Annual planning scenarios"
}
```

### POST /api/projects/{id}/datasets — Request body
```json
{
  "name": "Base + Optimistic",
  "description": "Two-year projection with holiday seasonality",
  "start_year": 2023,
  "num_years": 2,
  "dimensions": ["product", "region", "channel"],
  "products": ["Snacks", "Beverages"],
  "regions": ["North America", "Europe"],
  "channels": ["Grocery", "E-Commerce"],
  "scenarios": ["Base", "Optimistic"],
  "seasonality_profile": "holiday_peak",
  "marketing_intensity": 1.2,
  "sentiment_volatility": 0.15,
  "fx_volatility": 0.08,
  "inflation_preset": "medium",
  "random_seed": 42
}
```

---

## Generated Files

Each dataset produces 5 CSV files:

| File | Description |
|------|-------------|
| `fact_sales.csv` | Full fact table with all measures and drivers at the lowest grain |
| `pnl_consolidated.csv` | Monthly P&L rolled up by scenario, with margin % |
| `dim_product.csv` | Product dimension |
| `dim_region.csv` | Region dimension with FX base rates |
| `dim_time.csv` | Calendar dimension with year/quarter/month |

### Fact Table Columns

**Dimensions:** date, year, month, product, region, channel, scenario

**Driver Accounts:**
- `seasonality_index` — Monthly seasonal multiplier (from profile)
- `sentiment_index` — AR(1) mean-reverting sentiment (drives demand)
- `fx_rate` — GBM FX path per region
- `inflation_index` — Cumulative inflation factor
- `promo_depth` — Beta-distributed promotion intensity
- `capacity_utilization` — Actual units / capacity
- `stockout_flag` — 1 when capacity ≥ 98%

**Financial Accounts:**
- `units`, `price`, `revenue`
- `cogs`, `gross_profit`
- `marketing_expense`, `other_opex`
- `ebitda`, `depreciation`, `ebit`
- `interest`, `taxes`, `net_income`

---

## Correlation Logic

### Units (Demand)
```
demand = base_units
       × seasonal_multiplier
       × (price / base_price) ^ elasticity        # price elasticity
       × (1 + marketing_lift × (mktg_pct - base_mktg_pct))  # marketing lift
       × (1 + sentiment_lift × (sentiment - 1))   # sentiment
       × scenario_multiplier
units = min(demand, capacity_max)                  # capacity constraint
```

### Price
```
price = base_price
      × inflation_passthrough(inflation_index)
      × fx_passthrough(fx_rate)
      × (1 - promo_depth × 0.30)                  # promo discount
      × scenario_multiplier
```

### COGS
```
cogs_pct = base_cogs_pct
         × inflation_cogs_passthrough(inflation_index)
         × fx_cogs_passthrough(abs(fx_change))
cogs = revenue × cogs_pct
```

### P&L Waterfall
```
Revenue
- COGS
= Gross Profit
- Marketing Expense
- Other OpEx
= EBITDA
- Depreciation
= EBIT
- Interest
= EBT
- Taxes
= Net Income
```

---

## Adding a New Industry Template

1. Create `/backend/config/templates/{industry}.json` following the schema of existing templates
2. Key fields: `defaults`, `seasonality_profiles`, `available_dimensions`, `available_accounts`, `regional_fx`, `inflation_curve_presets`
3. Restart the backend — the new template is automatically discovered

---

## Use with Pandas

```python
import pandas as pd

fact = pd.read_csv("fact_sales.csv", parse_dates=["date"])
pnl  = pd.read_csv("pnl_consolidated.csv", parse_dates=["date"])

# Monthly P&L for Base scenario
base = pnl[pnl["scenario"] == "Base"].set_index("date")
print(base[["revenue", "ebitda", "ebitda_margin_pct"]].tail(12))

# Pivot revenue by product and month
pivot = fact.pivot_table(
    index=["year", "month"], columns="product",
    values="revenue", aggfunc="sum"
)
```

---

## Reproducibility

Pass the same `random_seed` to get identical datasets. The seed controls:
- Sentiment AR(1) path
- FX GBM paths (per region)
- Promo depth draws

All other computation is deterministic given the same parameters and template.
