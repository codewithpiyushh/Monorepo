"""
seed_demo_data.py – Run once to populate the database with 3 rich demo projects.

Usage:
    cd backend
    python seed_demo_data.py
"""
import sys, os, json, shutil
from pathlib import Path

# Make sure app is importable
sys.path.insert(0, str(Path(__file__).parent))

from app.database import SessionLocal, engine
from app import models
from app.main import TEMPLATES_DIR, DATA_ROOT, _sync_template_to_file
from app.fpna_generator import FPnAGenerator, GeneratorRequest

models.Base.metadata.create_all(bind=engine)

db = SessionLocal()


def get_or_create_industry(name: str):
    ind = db.query(models.Industry).filter_by(name=name).first()
    if not ind:
        ind = models.Industry(name=name)
        db.add(ind)
        db.commit()
        db.refresh(ind)
    return ind


def create_project_with_datasets(name, industry_name, description, datasets_spec):
    # Check if project already exists
    existing = db.query(models.Project).filter_by(name=name).first()
    if existing:
        print(f"  ✓ Project '{name}' already exists, skipping.")
        return

    ind = get_or_create_industry(industry_name)
    project = models.Project(name=name, industry_id=ind.id, description=description)
    db.add(project)
    db.commit()
    db.refresh(project)

    project_dir = DATA_ROOT / str(project.id)
    project_dir.mkdir(parents=True, exist_ok=True)

    print(f"  → Created project '{name}' (id={project.id})")

    for ds_spec in datasets_spec:
        ds = models.Dataset(project_id=project.id, name=ds_spec["name"], status="Generating...")
        db.add(ds)
        db.commit()
        db.refresh(ds)

        output_dir = DATA_ROOT / str(project.id) / str(ds.id)

        gen_req = GeneratorRequest(
            industry=industry_name,
            project_name=name,
            output_dir=str(output_dir),
            **ds_spec["params"],
        )

        try:
            generator = FPnAGenerator(gen_req, templates_dir=str(TEMPLATES_DIR))
            files_written = generator.generate()

            row_count = 0
            for key, path_str in (files_written or {}).items():
                p = Path(path_str)
                if p.name.startswith("fact_") and p.exists():
                    with open(p) as f:
                        row_count += max(0, sum(1 for _ in f) - 1)

            ds.status = "Completed"
            ds.total_row_count = row_count

            for scen_name in ds_spec["params"].get("scenarios", ["Base Scenario"]):
                existing_s = db.query(models.Scenario).filter_by(project_id=project.id, name=scen_name).first()
                if not existing_s:
                    db.add(models.Scenario(project_id=project.id, name=scen_name))

            for key, path_str in (files_written or {}).items():
                fp = Path(path_str)
                db.add(models.DatasetFile(
                    dataset_id=ds.id,
                    file_path=fp.name,
                    file_size_kb=round(fp.stat().st_size / 1024, 2) if fp.exists() else 0,
                ))

            db.commit()
            print(f"    ✓ Dataset '{ds_spec['name']}' generated – {row_count:,} rows")
        except Exception as exc:
            ds.status = "Failed"
            db.commit()
            print(f"    ✗ Dataset '{ds_spec['name']}' failed: {exc}")


# ─── DEMO PROJECT 1: CPG – NutriCo Foods ───────────────────────────────────
create_project_with_datasets(
    name="NutriCo Foods – Annual Planning 2024",
    industry_name="cpg",
    description="Multi-scenario FP&A dataset for CPG snack & beverage brand across 3 regions.",
    datasets_spec=[
        {
            "name": "Base + Optimistic (2Y)",
            "params": {
                "start_year": 2023,
                "num_years": 2,
                "dimensions": ["product", "region", "channel"],
                "products": ["Snacks", "Beverages", "Health Bars"],
                "regions": ["North America", "Europe", "Asia Pacific"],
                "channels": ["Grocery", "E-Commerce", "Convenience"],
                "scenarios": ["Base Scenario", "Optimistic"],
                "seasonality_profile": "holiday_peak",
                "marketing_intensity": 1.2,
                "sentiment_volatility": 0.15,
                "fx_volatility": 0.08,
                "inflation_preset": "medium",
                "random_seed": 42,
                "accounts": [],
                "custom_dimensions": {},
            },
        },
        {
            "name": "Recession Stress Test",
            "params": {
                "start_year": 2024,
                "num_years": 1,
                "dimensions": ["product", "region"],
                "products": ["Snacks", "Beverages"],
                "regions": ["North America", "Europe"],
                "channels": [],
                "scenarios": ["Pessimistic"],
                "seasonality_profile": "flat",
                "marketing_intensity": 0.7,
                "sentiment_volatility": 0.35,
                "fx_volatility": 0.15,
                "inflation_preset": "high",
                "random_seed": 99,
                "accounts": [],
                "custom_dimensions": {},
            },
        },
    ],
)

# ─── DEMO PROJECT 2: SaaS – CloudMetrics Platform ──────────────────────────
create_project_with_datasets(
    name="CloudMetrics – SaaS Revenue Model",
    industry_name="saas",
    description="Subscription revenue model with enterprise cycles and multi-tier pricing.",
    datasets_spec=[
        {
            "name": "Enterprise Subscription Baseline",
            "params": {
                "start_year": 2023,
                "num_years": 3,
                "dimensions": ["product", "region", "channel"],
                "products": ["Starter Plan", "Pro Plan", "Enterprise"],
                "regions": ["North America", "EMEA", "APAC"],
                "channels": ["Direct Sales", "Partner Network", "Online Self-Service"],
                "scenarios": ["Base Scenario", "Optimistic", "Pessimistic"],
                "seasonality_profile": "enterprise_cycles",
                "marketing_intensity": 1.5,
                "sentiment_volatility": 0.1,
                "fx_volatility": 0.06,
                "inflation_preset": "low",
                "random_seed": 7,
                "accounts": [],
                "custom_dimensions": {},
            },
        },
    ],
)

# ─── DEMO PROJECT 3: Retail – StyleHouse Omnichannel ───────────────────────
create_project_with_datasets(
    name="StyleHouse – Retail Omnichannel FY2024",
    industry_name="retail",
    description="Multi-channel fashion retailer with physical stores and digital presence.",
    datasets_spec=[
        {
            "name": "Full-Year Forecast",
            "params": {
                "start_year": 2024,
                "num_years": 1,
                "dimensions": ["product", "region", "channel"],
                "products": ["Apparel", "Footwear", "Accessories", "Outerwear"],
                "regions": ["Northeast", "Southeast", "West Coast", "Midwest"],
                "channels": ["In-Store", "Online", "Mobile App"],
                "scenarios": ["Base Scenario", "Holiday Upside"],
                "seasonality_profile": "holiday_peak",
                "marketing_intensity": 1.3,
                "sentiment_volatility": 0.2,
                "fx_volatility": 0.03,
                "inflation_preset": "medium",
                "random_seed": 55,
                "accounts": [],
                "custom_dimensions": {},
            },
        },
        {
            "name": "Q4 Holiday Sprint",
            "params": {
                "start_year": 2024,
                "num_years": 1,
                "dimensions": ["product", "channel"],
                "products": ["Apparel", "Accessories"],
                "regions": ["Northeast", "West Coast"],
                "channels": ["In-Store", "Online"],
                "scenarios": ["Base Scenario", "Optimistic"],
                "seasonality_profile": "holiday_peak",
                "marketing_intensity": 2.0,
                "sentiment_volatility": 0.12,
                "fx_volatility": 0.02,
                "inflation_preset": "medium",
                "random_seed": 77,
                "accounts": [],
                "custom_dimensions": {},
            },
        },
    ],
)

db.close()
print("\n✅ Demo seed completed successfully!")
print("   Start your backend: uvicorn app.main:app --reload --port 8000")
print("   Then open: http://localhost:3000")
