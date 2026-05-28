"""
PATCH for backend/app/main.py
──────────────────────────────
This file documents all the bugs found and their fixes.
Copy the corrected functions below into your main.py.

BUG LIST
─────────
1. _sync_template_to_file() writes the JSON file TWICE (two with-open blocks).
   Fix: Remove the duplicate write at the bottom.

2. The TEMPLATES_DIR auto-detection skips the most common layout.
   The function `BASE_DIR` points to `backend/app/` but templates live at
   `backend/app/config/templates/`. This is already handled correctly —
   no change needed here, just confirming.

3. config.js sets API_BASE to "/api" (relative) which works only when the
   frontend is proxied. For standalone dev, it should be
   "http://localhost:8000/api".  → Fixed in config.js.

4. api.js is missing deleteDataset(), getCustomLogic(), saveCustomLogic(),
   getDashboardStats(), getCustomChartData() methods.  → Fixed in api.js.

HOW TO APPLY THE MAIN.PY FIX
──────────────────────────────
Open backend/app/main.py and find the `_sync_template_to_file` function.
Replace the entire function body with the one below.
"""

FIXED_SYNC_TEMPLATE = '''
def _sync_template_to_file(db_template: models.Template):
    """Automatically generates the physical JSON file required by FPnAGenerator."""
    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)

    safe_industry_key = db_template.industry_key.lower()
    file_path = TEMPLATES_DIR / f"{safe_industry_key}.json"

    if file_path.exists():
        try:
            file_path.unlink()
        except Exception:
            pass

    custom_dims = db_template.available_dimensions or {}

    template_data = {
        "industry": safe_industry_key,
        "label": db_template.label,
        "description": db_template.description,
        "available_dimensions": {
            "product": custom_dims.get("product", ["Standard", "Premium"]),
            "region": custom_dims.get("region", ["North America", "EMEA"]),
            "channel": custom_dims.get("channel", ["Direct Sales", "Partner"]),
            "scenario": ["Base Scenario", "Optimistic", "Pessimistic"],
        },
        "defaults": {
            "base_price": 850.00,
            "base_units_per_month": 3200,
            "cogs_pct": 0.18,
            "marketing_pct_revenue": 0.22,
            "other_opex_pct_revenue": 0.35,
            "depreciation_monthly": 95000,
            "interest_monthly": 42000,
            "tax_rate": 0.21,
            "capacity_max_units": 15000,
            "price_elasticity": -0.7,
            "marketing_lift_factor": 0.9,
            "sentiment_lift_factor": 0.5,
            "fx_cogs_passthrough": 0.20,
            "fx_price_passthrough": 0.10,
            "inflation_cogs_passthrough": 0.45,
            "inflation_price_passthrough": 0.20,
        },
        "seasonality_profiles": {
            "flat": [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
            "enterprise_cycles": [0.70, 0.85, 1.05, 1.10, 1.05, 1.00, 0.80, 0.75, 1.00, 1.15, 1.25, 1.30],
        },
        "inflation_curve_presets": {
            "low": 0.015,
            "medium": 0.03,
            "high": 0.055,
            "hyperflation": 0.12,
        },
        "available_accounts": {
            "financial": [
                "units", "price", "revenue", "cogs", "gross_profit",
                "marketing_expense", "other_opex", "ebitda", "depreciation",
                "ebit", "interest", "taxes", "net_income",
            ],
            "statistical": [
                "seasonality_index", "sentiment_index", "fx_rate",
                "inflation_index", "promo_depth", "capacity_utilization", "stockout_flag",
            ],
        },
        "fx_base_currency": "USD",
        "regional_fx": {
            "North America": 1.00,
            "EMEA": 1.08,
            "APAC": 0.74,
            "LATAM": 0.19,
        },
    }

    # ✅ FIXED: Only ONE write block (the original had a duplicate second write)
    with open(file_path, "w") as f:
        json.dump(template_data, f, indent=4)
'''

print(FIXED_SYNC_TEMPLATE)
