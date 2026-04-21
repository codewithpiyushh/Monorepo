prompt = '''
You are an expert FP&A data modeler + full-stack engineer.You are an expert driven synthetic FP&A generator that produces correlated Sales Projections and full P&L.
User selects:
	•	Dimensions (Product, Region, Time, optional Channel/Currency/Scenario)
	•	Accounts (financial + statistical/driver accounts)
	•	Parameters (seasonality profile, marketing intensity, sentiment volatility, FX volatility, inflation curve, price elasticity, production capacity constraints)
Then user creates a Project, generates one or more datasets, and can list + download datasets.
Hard requirements:
	1.	Use backend JSON templates per industry stored in /config/templates/{industry}.json.
	2.	Generator must create correlated measures:
units, price, revenue, cogs, gross_profit, marketing_expense, other_opex, ebitda, depreciation, ebit, interest, taxes, net_income.
Include drivers: seasonality_index, sentiment_index, fx_rate, inflation_index, promo_depth, capacity_utilization, stockout_flag.
	3.	Provide Python code:
	◦	A generator module that takes (template_config, request_params) and writes CSVs for fact and dims + P&L.
	◦	Ensure reproducibility via random seed.
	◦	Implement correlations:
units respond negatively to price (elasticity), positively to marketing & sentiment, seasonal multipliers;
price responds to inflation and FX pass-through and promo depth;
cogs responds to inflation/FX;
capacity caps units and creates stockouts.
	4.	Provide a backend API (FastAPI preferred):
POST /api/projects
POST /api/projects/{projectId}/datasets (runs generator, writes files)
GET /api/projects/{projectId}/datasets
GET /api/projects/{projectId}/datasets/{datasetId}/download?file=...
	5.	Provide a React UI:
	◦	Project creation + template selection
	◦	Multi-select dimensions and accounts
	◦	Parameter inputs (sliders, dropdowns)
	◦	Generate dataset button
	◦	Datasets list with description + download buttons
	6.	Use clean code, typed request models, and include sample template JSON files for at least two industries (e.g., CPG and SaaS).
Return:
	•	Backend code (Python)
	•	Frontend code (React)
	•	Sample template JSONs
	•	Brief instructions to run locally
	•

'''
