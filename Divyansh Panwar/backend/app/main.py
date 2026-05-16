"""
main.py  –  FastAPI backend for the FP&A Synthetic Data Generator
"""
from __future__ import annotations
import sys
import os
from pathlib import Path
import numpy as np
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

try:
    import config
    sys.modules['app.config'] = config
except ImportError:
    pass

# Auto-detect templates directory
if (BASE_DIR / "config" / "templates").exists():
    TEMPLATES_DIR = BASE_DIR / "config" / "templates"
elif (BASE_DIR / "app" / "config" / "templates").exists():
    TEMPLATES_DIR = BASE_DIR / "app" / "config" / "templates"
else:
    TEMPLATES_DIR = BASE_DIR / "config" / "templates"

DATA_ROOT = BASE_DIR / "data"
DATA_ROOT.mkdir(exist_ok=True, parents=True)

from app import models
from app.database import engine, SessionLocal
import json
import shutil
import io
import zipfile
import pandas as pd
from datetime import datetime
from typing import Any, Optional, Dict, List

from fastapi import FastAPI, HTTPException, Depends
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, selectinload

from app.fpna_generator import FPnAGenerator, GeneratorRequest
from app.core.middleware import setup_middleware

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="FP&A Synthetic Data Generator", version="1.0.0")
setup_middleware(app)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- NEW CODE LOGIC: Auto-sync DB to Files ---
def _sync_template_to_file(db_template: models.Template):
    """Automatically generates the physical JSON file required by FPnAGenerator."""
    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    
    safe_industry_key = db_template.industry_key.lower()
    file_path = TEMPLATES_DIR / f"{safe_industry_key}.json"
    
    # Force delete the old broken file so Windows doesn't cache it
    if file_path.exists():
        try:
            file_path.unlink()
        except Exception:
            pass
            
    # Safely get the user's custom dimensions
    custom_dims = db_template.available_dimensions or {}
    
    # Build the comprehensive template data
    template_data = {
        "industry": safe_industry_key,
        "label": db_template.label,
        "description": db_template.description,
        
        "available_dimensions": {
            "product": custom_dims.get("product", ["Standard", "Premium"]),
            "region": custom_dims.get("region", ["North America", "EMEA"]),
            "channel": custom_dims.get("channel", ["Direct Sales", "Partner"]),
            "scenario": ["Base Scenario", "Optimistic", "Pessimistic"]
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
            "inflation_price_passthrough": 0.20
        },
        
        # CRITICAL FIX: Hardcode these arrays/floats so the generator math never crashes!
        "seasonality_profiles": {
            "flat": [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
            "enterprise_cycles": [0.70, 0.85, 1.05, 1.10, 1.05, 1.00, 0.80, 0.75, 1.00, 1.15, 1.25, 1.30]
        },
        
        "inflation_curve_presets": {
            "low": 0.015,
            "medium": 0.03,
            "high": 0.055,
            "hyperflation": 0.12
        },
        
        "available_accounts": {
            "financial": ["units", "price", "revenue", "cogs", "gross_profit", "marketing_expense", "other_opex", "ebitda", "depreciation", "ebit", "interest", "taxes", "net_income"],
            "statistical": ["seasonality_index", "sentiment_index", "fx_rate", "inflation_index", "promo_depth", "capacity_utilization", "stockout_flag"]
        },
        
        "fx_base_currency": "USD",
        "regional_fx": {
            "North America": 1.00,
            "EMEA": 1.08,
            "APAC": 0.74,
            "LATAM": 0.19
        }
    }
    
    # Write the fresh, mathematically sound file
    with open(file_path, "w") as f:
        json.dump(template_data, f, indent=4)
    
    # 4. Write the fresh, valid file
    with open(file_path, "w") as f:
        json.dump(template_data, f, indent=4)

# --- PYDANTIC SCHEMAS ---
class ProjectCreate(BaseModel):
    name: str
    industry: str
    description: Optional[str] = ""
    template_overrides: dict = Field(default_factory=dict)
# Add this near your other Pydantic models at the top
class CustomChartRequest(BaseModel):
    dimension: str
    metrics: list[str]

class IndustryResp(BaseModel):
    name: str
    class Config: from_attributes = True

class ScenarioResp(BaseModel):
    name: str
    class Config: from_attributes = True

class DatasetRespShort(BaseModel):
    id: int
    total_row_count: int
    status: str
    class Config: from_attributes = True

class ProjectResponse(BaseModel):
    id: int
    name: str
    description: str
    created_at: datetime
    industry: Optional[IndustryResp] = None
    scenarios: list[ScenarioResp] = []
    datasets: list[DatasetRespShort] = []
    parameters: dict = Field(default_factory=dict) 
    class Config: from_attributes = True

class AdvancedSliceRequest(BaseModel):
    selected_columns: list[str] = []
    filters: dict = {}  
    custom_file_name: Optional[str] = None

class DatasetRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    start_year: int = Field(default=2023, ge=2015, le=2035)
    num_years: int = Field(default=2, ge=1, le=5)
    dimensions: list[str] = Field(default=["product", "region"])
    products: list[str] = Field(default=[])
    regions: list[str] = Field(default=[])
    channels: list[str] = Field(default=[])
    scenarios: list[str] = Field(default=["Base Scenario"])
    accounts: list[str] = Field(default=[])
    seasonality_profile: str = "flat"
    marketing_intensity: float = Field(default=1.0, ge=0.1, le=3.0)
    sentiment_volatility: float = Field(default=0.15, ge=0.0, le=1.0)
    fx_volatility: float = Field(default=0.05, ge=0.0, le=0.5)
    inflation_preset: str = "medium"
    custom_inflation_rate: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    random_seed: int = Field(default=42, ge=0)
    custom_dimensions: dict = Field(default_factory=dict)

class TemplateCreate(BaseModel):
    industry: str
    label: str
    description: str
    available_dimensions: Dict[str, List[str]]
    seasonality_profiles: Dict[str, Any]
    inflation_presets: Dict[str, Any]

# --- TEMPLATE ROUTES ---
@app.post("/api/templates")
def create_template(template: TemplateCreate, db: Session = Depends(get_db)):
    existing = db.query(models.Template).filter(models.Template.industry_key == template.industry).first()
    if existing:
        raise HTTPException(status_code=400, detail="A template with this unique key already exists.")

    new_template = models.Template(
        industry_key=template.industry,
        label=template.label,
        description=template.description,
        available_dimensions=template.available_dimensions,
        seasonality_profiles=template.seasonality_profiles,
        inflation_presets=template.inflation_presets
    )
    
    db.add(new_template)
    db.commit()
    db.refresh(new_template)
    
    _sync_template_to_file(new_template) # Auto-generate file
    return {"status": "success", "id": new_template.id}

@app.put("/api/templates/{industry}")
def update_template(industry: str, template: TemplateCreate, db: Session = Depends(get_db)):
    db_template = db.query(models.Template).filter(models.Template.industry_key == industry).first()
    
    # If it's a hardcoded file template, we convert it to a DB template so you can edit it!
    if not db_template:
        db_template = models.Template(
            industry_key=industry,
            seasonality_profiles={"flat": {}},
            inflation_presets={"medium": {}}
        )
        db.add(db_template)

    db_template.label = template.label
    db_template.description = template.description
    
    current_dims = db_template.available_dimensions or {}
    current_dims["product"] = template.available_dimensions.get("product", [])
    current_dims["region"] = template.available_dimensions.get("region", [])
    db_template.available_dimensions = current_dims
    
    db.commit()
    _sync_template_to_file(db_template) # Auto-update file
    
    return {"status": "success", "message": "Template updated"}

@app.delete("/api/templates/{industry}")
def delete_template(industry: str, db: Session = Depends(get_db)):
    db_template = db.query(models.Template).filter(models.Template.industry_key == industry).first()
    if db_template:
        db.delete(db_template)
        db.commit()
        
    file_path = TEMPLATES_DIR / f"{industry}.json"
    if file_path.exists():
        file_path.unlink() # Auto-delete file
        
    return {"status": "success", "message": "Template deleted"}

@app.get("/api/templates")
def list_templates(db: Session = Depends(get_db)) -> list[dict]:
    result = []
    
    # 1. Fetch File-based templates (CPG, Retail, SaaS)
    if TEMPLATES_DIR.exists():
        for f in TEMPLATES_DIR.glob("*.json"):
            try:
                with open(f) as fp:
                    t = json.load(fp)
                result.append({
                    "industry": t.get("industry", "Unknown"),
                    "label": t.get("label", "Unknown"),
                    "description": t.get("description", ""),
                    "seasonality_profiles": list(t.get("seasonality_profiles", {}).keys()),
                    "available_dimensions": t.get("available_dimensions", {}),
                    "available_accounts": t.get("available_accounts", []),
                    "inflation_presets": list(t.get("inflation_curve_presets", {}).keys()),
                })
            except Exception:
                pass
                
    # 2. Fetch DB-based custom templates
    db_templates = db.query(models.Template).all()
    for t in db_templates:
        # Prevent duplicates if it was synced to a file
        if any(r["industry"] == t.industry_key for r in result): continue
        
        result.append({
            "industry": t.industry_key,
            "label": t.label,
            "description": t.description,
            "seasonality_profiles": list((t.seasonality_profiles or {}).keys()),
            "available_dimensions": t.available_dimensions or {},
            "available_accounts": [],
            "inflation_presets": list((t.inflation_presets or {}).keys()),
        })
        
    return result

@app.get("/api/templates/{industry}")
def get_template(industry: str, db: Session = Depends(get_db)) -> dict:
    db_template = db.query(models.Template).filter(models.Template.industry_key == industry).first()
    if db_template:
        return {
            "industry": db_template.industry_key,
            "label": db_template.label,
            "description": db_template.description,
            "seasonality_profiles": db_template.seasonality_profiles or {"flat": {}},
            "available_dimensions": db_template.available_dimensions or {"product": [], "region": []},
            "available_accounts": [],
            "inflation_presets": db_template.inflation_presets or {"medium": {}}
        }
        
    path = TEMPLATES_DIR / f"{industry}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Template '{industry}' not found")
    with open(path) as f:
        return json.load(f)

# --- PROJECT & DATASET ROUTES ---
@app.post("/api/projects", response_model=ProjectResponse, status_code=201)
def create_project(body: ProjectCreate, db: Session = Depends(get_db)):
    ind_name = body.industry.lower()
    db_ind = db.query(models.Industry).filter(models.Industry.name == ind_name).first()
    if not db_ind:
        db_ind = models.Industry(name=ind_name)
        db.add(db_ind)
        db.commit()
        db.refresh(db_ind)
    
    db_project = models.Project(name=body.name, industry_id=db_ind.id, description=body.description or "")
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    
    for key, value in body.template_overrides.items():
        db_param = models.ProjectParameter(project_id=db_project.id, param_key=key, param_value=json.dumps(value))
        db.add(db_param)
    db.commit()
    
    (DATA_ROOT / str(db_project.id)).mkdir(parents=True, exist_ok=True)
    return {"id": db_project.id, "name": db_project.name, "description": db_project.description, "created_at": db_project.created_at, "industry": {"name": db_ind.name}, "parameters": body.template_overrides}

@app.get("/api/projects", response_model=list[ProjectResponse])
def list_projects(db: Session = Depends(get_db)):
    db_projects = db.query(models.Project).options(selectinload(models.Project.industry), selectinload(models.Project.scenarios), selectinload(models.Project.datasets), selectinload(models.Project.parameters)).all()
    result = []
    for proj in db_projects:
        params_dict = {}
        for p in proj.parameters:
            try: params_dict[p.param_key] = json.loads(p.param_value)
            except: params_dict[p.param_key] = p.param_value
        result.append({ "id": proj.id, "name": proj.name, "description": proj.description, "created_at": proj.created_at, "parameters": params_dict, "industry": {"name": proj.industry.name} if proj.industry else None, "scenarios": [{"name": s.name} for s in proj.scenarios], "datasets": [{"id": d.id, "total_row_count": d.total_row_count, "status": d.status} for d in proj.datasets] })
    return result

@app.get("/api/projects/{project_id}", response_model=ProjectResponse)
def get_project(project_id: int, db: Session = Depends(get_db)):
    db_project = db.query(models.Project).options(selectinload(models.Project.industry), selectinload(models.Project.scenarios), selectinload(models.Project.datasets), selectinload(models.Project.parameters)).filter(models.Project.id == project_id).first()
    if not db_project: raise HTTPException(status_code=404, detail="Project not found")
    params_dict = {}
    for p in db_project.parameters:
        try: params_dict[p.param_key] = json.loads(p.param_value)
        except: params_dict[p.param_key] = p.param_value
    return { "id": db_project.id, "name": db_project.name, "description": db_project.description, "created_at": db_project.created_at, "parameters": params_dict, "industry": {"name": db_project.industry.name} if db_project.industry else None, "scenarios": [{"name": s.name} for s in db_project.scenarios], "datasets": [{"id": d.id, "total_row_count": d.total_row_count, "status": d.status} for d in db_project.datasets] }

@app.post("/api/projects/{project_id}/datasets", status_code=201)
def create_dataset(project_id: int, body: DatasetRequest, db: Session = Depends(get_db)):
    db_project = db.query(models.Project).options(selectinload(models.Project.industry)).filter(models.Project.id == project_id).first()
    if not db_project: raise HTTPException(status_code=404, detail="Project not found")

    industry_name = db_project.industry.name
    db_template = db.query(models.Template).filter(models.Template.industry_key == industry_name).first()
    
    template_dims = {}
    
    if db_template:
        _sync_template_to_file(db_template) 
        template_dims = db_template.available_dimensions or {}
    else:
        template_file_path = TEMPLATES_DIR / f"{industry_name}.json"
        if not template_file_path.exists():
            raise HTTPException(status_code=400, detail=f"Base template file {industry_name}.json is missing.")
        with open(template_file_path, "r") as f:
            template_dims = json.load(f).get("available_dimensions", {})

    # --- CRITICAL FIX: Inject missing dimensions ---
    # If the frontend sends empty arrays, force the generator to use your template's custom dimensions!
    if not body.products and "product" in template_dims:
        body.products = template_dims["product"]
    
    if not body.regions and "region" in template_dims:
        body.regions = template_dims["region"]
        
    if not body.channels and "channel" in template_dims:
        body.channels = template_dims["channel"]

    # Force the engine to include the columns
    if body.products and "product" not in body.dimensions:
        body.dimensions.append("product")
    if body.regions and "region" not in body.dimensions:
        body.dimensions.append("region")
    if body.channels and "channel" not in body.dimensions:
        body.dimensions.append("channel")

    # --- Proceed with creating the dataset in DB ---
    db_dataset = models.Dataset(project_id=project_id, name=body.name, status="Generating...")
    db.add(db_dataset)
    db.commit()
    db.refresh(db_dataset)

    output_dir = DATA_ROOT / str(project_id) / str(db_dataset.id)

    # The GeneratorRequest will now receive your custom products & regions!
    gen_request = GeneratorRequest(
        industry=db_project.industry.name, project_name=db_project.name,
        start_year=body.start_year, num_years=body.num_years,
        dimensions=body.dimensions, products=body.products, regions=body.regions, channels=body.channels,
        scenarios=body.scenarios, accounts=body.accounts, seasonality_profile=body.seasonality_profile,
        marketing_intensity=body.marketing_intensity, sentiment_volatility=body.sentiment_volatility,
        fx_volatility=body.fx_volatility, inflation_preset=body.inflation_preset,
        custom_inflation_rate=body.custom_inflation_rate, random_seed=body.random_seed,
        custom_dimensions=body.custom_dimensions, output_dir=str(output_dir),
    )
    
    # ... (Keep the rest of your create_dataset try/except block the exact same below this) ...

    try:
        generator = FPnAGenerator(gen_request, templates_dir=str(TEMPLATES_DIR))
        files_written = generator.generate()
    except Exception as exc:
        db_dataset.status = "Failed"
        db.commit()
        raise HTTPException(status_code=500, detail=f"Generator error: {exc}") from exc
# --- EXECUTE CUSTOM USER FORMULAS ---
    # Look for custom code saved to this project
    custom_logic_param = db.query(models.ProjectParameter).filter_by(project_id=project_id, param_key="custom_python_logic").first()
    if custom_logic_param and custom_logic_param.param_value.strip():
        custom_code = custom_logic_param.param_value
        
        # Apply it to the generated fact tables
        for key, path_str in (files_written or {}).items():
            if path_str and ("fact_" in str(path_str).lower() or "fact_" in str(key).lower()):
                try:
                    df = pd.read_csv(path_str)
                    
                    # Create a safe local environment with pandas and numpy
                    import numpy as np
                    local_vars = {"df": df, "pd": pd, "np": np}
                    
                    # Execute the user's custom python script!
                    exec(custom_code, {}, local_vars)
                    
                    # Save the modified DataFrame back to the CSV
                    local_vars["df"].to_csv(path_str, index=False)
                    print(f"Successfully applied custom formulas to {path_str}")
                except Exception as e:
                    print(f"Error executing custom user code: {e}")
                    # We print the error but don't crash the generation, 
                    # so they still get their base dataset!
    row_count = 0
    fact_paths: list[Path] = []

    for key, path_str in (files_written or {}).items():
        if not path_str:
            continue
        p = Path(path_str)
        name = p.name.lower()
        key_l = str(key).lower()
        if (key_l.startswith("fact_") or name.startswith("fact_")) and name.endswith(".csv"):
            fact_paths.append(p)

    if not fact_paths and output_dir.exists():
        fact_paths = list(output_dir.glob("fact_*.csv"))

    for fp in fact_paths:
        if fp.exists():
            try:
                with open(fp) as f:
                    lines = sum(1 for _ in f)
                if lines > 0:
                    row_count += max(0, lines - 1) 
            except Exception as e:
                print(f"Warning: could not count rows in {fp}: {e}")

    if body.custom_dimensions:
        for dim_name, members in body.custom_dimensions.items():
            db_dim = db.query(models.Dimension).filter_by(project_id=project_id, name=dim_name).first()
            if not db_dim:
                db_dim = models.Dimension(project_id=project_id, name=dim_name)
                db.add(db_dim)
                db.commit()
                db.refresh(db_dim)
            for member_val in members:
                db_mem = db.query(models.DimensionMember).filter_by(dimension_id=db_dim.id, value=member_val).first()
                if not db_mem:
                    db_mem = models.DimensionMember(dimension_id=db_dim.id, value=member_val)
                    db.add(db_mem)
        db.commit() 

    if body.accounts:
        for acc_name in body.accounts:
            db_acc = db.query(models.Account).filter_by(project_id=project_id, name=acc_name).first()
            if not db_acc:
                db_acc = models.Account(project_id=project_id, name=acc_name)
                db.add(db_acc)
        db.commit()

    macro_params = { "seasonality_profile": body.seasonality_profile, "inflation_preset": body.inflation_preset, "marketing_intensity": body.marketing_intensity, "sentiment_volatility": body.sentiment_volatility, "fx_volatility": body.fx_volatility }
    for k, v in macro_params.items():
        db_param = db.query(models.ProjectParameter).filter_by(project_id=project_id, param_key=k).first()
        if db_param: db_param.param_value = str(v)
        else:
            db_param = models.ProjectParameter(project_id=project_id, param_key=k, param_value=str(v))
            db.add(db_param)
            
    db.commit() 
    db_dataset.status = "Completed"
    db_dataset.total_row_count = row_count
    
    for scen in body.scenarios:
        db_scen = db.query(models.Scenario).filter_by(project_id=project_id, name=scen).first()
        if not db_scen:
            db_scen = models.Scenario(project_id=project_id, name=scen)
            db.add(db_scen)
            db.commit()
            db.refresh(db_scen)

    for key, path_str in files_written.items():
        file_path = Path(path_str)
        db_file = models.DatasetFile(dataset_id=db_dataset.id, file_path=file_path.name, file_size_kb=round(file_path.stat().st_size / 1024, 2) if file_path.exists() else 0)
        db.add(db_file)

    db.commit()
    return {"id": db_dataset.id, "status": "Completed", "row_count": row_count}

@app.get("/api/projects/{project_id}/datasets")
def list_datasets(project_id: int, db: Session = Depends(get_db)):
    db_project = db.query(models.Project).options(selectinload(models.Project.parameters), selectinload(models.Project.dimensions).selectinload(models.Dimension.members), selectinload(models.Project.accounts)).filter(models.Project.id == project_id).first()
    if not db_project: raise HTTPException(status_code=404, detail="Project not found")

    db_datasets = db.query(models.Dataset).options(selectinload(models.Dataset.files)).filter(models.Dataset.project_id == project_id).all()
    params_dict = {"start_year": 2023, "num_years": 2, "random_seed": 42}
    for p in db_project.parameters: params_dict[p.param_key] = p.param_value

    for key in ["start_year", "num_years", "random_seed"]:
        if key in params_dict: params_dict[key] = int(params_dict[key])
    for key in ["marketing_intensity", "sentiment_volatility", "fx_volatility"]:
        if key in params_dict: params_dict[key] = float(params_dict[key])

    active_dims = []
    custom_dims = {}
    for d in db_project.dimensions:
        active_dims.append(d.name)
        custom_dims[d.name] = [m.value for m in d.members]
    
    params_dict["dimensions"] = active_dims
    params_dict["custom_dimensions"] = custom_dims
    params_dict["accounts"] = [a.name for a in db_project.accounts]

    result = []
    for ds in db_datasets:
        result.append({ "id": ds.id, "name": ds.name, "status": ds.status, "total_row_count": ds.total_row_count, "created_at": ds.created_at, "files": [f.file_path for f in ds.files], "params": params_dict })
    return result

@app.get("/api/projects/{project_id}/datasets/{dataset_id}/download-all")
def download_all_files(project_id: int, dataset_id: int, db: Session = Depends(get_db)):
    ds_dir = DATA_ROOT / str(project_id) / str(dataset_id)
    if not ds_dir.exists():
        raise HTTPException(status_code=404, detail="Dataset folder not found")
    
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for file_path in ds_dir.glob("*.csv"):
            zip_file.write(file_path, file_path.name)
    
    zip_buffer.seek(0)
    return StreamingResponse(
        iter([zip_buffer.getvalue()]),
        media_type="application/x-zip-compressed",
        headers={"Content-Disposition": f"attachment; filename=dataset_{dataset_id}_files.zip"}
    )

@app.get("/api/projects/{project_id}/datasets/{dataset_id}/download")
def download_file(project_id: int, dataset_id: int, file: str, db: Session = Depends(get_db)):
    safe_file = Path(file).name
    file_path = DATA_ROOT / str(project_id) / str(dataset_id) / safe_file
    if not file_path.exists(): raise HTTPException(status_code=404, detail=f"File '{safe_file}' not found")
    return FileResponse(path=str(file_path), media_type="text/csv", filename=safe_file)

@app.get("/api/projects/{project_id}/datasets/{dataset_id}/files/{file_name}/advanced-schema")
def get_advanced_schema(project_id: int, dataset_id: int, file_name: str):
    file_path = DATA_ROOT / str(project_id) / str(dataset_id) / file_name
    if not file_path.exists() or not file_name.endswith('.csv'):
        raise HTTPException(status_code=400, detail=f"Physical file missing on hard drive. Please generate a fresh dataset.")
    try:
        df = pd.read_csv(file_path)
        schema = []
        for col in df.columns:
            unique_vals = []
            if df[col].nunique() <= 100:
                unique_vals = sorted([str(x) for x in df[col].dropna().unique()])
            schema.append({"column": col, "members": unique_vals})
        return {"schema": schema}
    except pd.errors.EmptyDataError:
        raise HTTPException(status_code=400, detail="The file exists but is empty (0 rows).")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/projects/{project_id}/datasets/{dataset_id}/files/{file_name}/advanced-download")
def advanced_download(project_id: int, dataset_id: int, file_name: str, body: AdvancedSliceRequest):
    file_path = DATA_ROOT / str(project_id) / str(dataset_id) / file_name
    if not file_path.exists(): raise HTTPException(status_code=404, detail="File not found")
    try:
        df = pd.read_csv(file_path)
        for col, members in body.filters.items():
            if col in df.columns and len(members) > 0:
                df = df[df[col].astype(str).isin(members)]
        if df.empty: raise HTTPException(status_code=400, detail="This slice resulted in 0 rows. Broaden your filters.")
        if body.selected_columns:
            valid_cols = [c for c in body.selected_columns if c in df.columns]
            df = df[valid_cols]

        stream = io.StringIO()
        df.to_csv(stream, index=False)
        response = StreamingResponse(iter([stream.getvalue()]), media_type="text/csv")
        response.headers["Content-Disposition"] = f"attachment; filename=custom_{file_name}"
        return response
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/projects/{project_id}/datasets/{dataset_id}/files/{file_name}/advanced-save")
def advanced_save(project_id: int, dataset_id: int, file_name: str, body: AdvancedSliceRequest, db: Session = Depends(get_db)):
    file_path = DATA_ROOT / str(project_id) / str(dataset_id) / file_name
    if not file_path.exists(): raise HTTPException(status_code=404, detail="Source file not found")
    if not body.custom_file_name: raise HTTPException(status_code=400, detail="Custom file name is required.")

    safe_name = body.custom_file_name.strip()
    safe_name = "".join([c for c in safe_name if c.isalnum() or c in (' ', '-', '_')]).rstrip()
    safe_name = safe_name.replace(" ", "_")
    if not safe_name.endswith(".csv"): safe_name += ".csv"

    try:
        df = pd.read_csv(file_path)
        for col, members in body.filters.items():
            if col in df.columns and len(members) > 0:
                df = df[df[col].astype(str).isin(members)]
        if df.empty: raise HTTPException(status_code=400, detail="This slice resulted in 0 rows. Broaden your filters.")
        if body.selected_columns:
            valid_cols = [c for c in body.selected_columns if c in df.columns]
            df = df[valid_cols]

        output_path = DATA_ROOT / str(project_id) / str(dataset_id) / safe_name
        df.to_csv(output_path, index=False)

        db_dataset = db.query(models.Dataset).filter_by(id=dataset_id).first()
        if db_dataset:
            existing_file = db.query(models.DatasetFile).filter_by(dataset_id=dataset_id, file_path=safe_name).first()
            if not existing_file:
                new_file = models.DatasetFile(dataset_id=dataset_id, file_path=safe_name, file_size_kb=round(output_path.stat().st_size / 1024, 2))
                db.add(new_file)
                db.commit()

        return {"message": "Saved successfully", "file_name": safe_name}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/api/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    db_project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not db_project: raise HTTPException(status_code=404, detail="Project not found")
    db.delete(db_project)
    db.commit()
    project_dir = DATA_ROOT / str(project_id)
    if project_dir.exists(): shutil.rmtree(project_dir)
    return {"deleted": project_id}

@app.delete("/api/projects/{project_id}/datasets/{dataset_id}")
def delete_dataset(project_id: int, dataset_id: int, db: Session = Depends(get_db)):
    db_dataset = db.query(models.Dataset).filter(models.Dataset.id == dataset_id, models.Dataset.project_id == project_id).first()
    if not db_dataset: raise HTTPException(status_code=404, detail="Dataset not found in database.")
    try:
        db.query(models.DatasetFile).filter(models.DatasetFile.dataset_id == dataset_id).delete()
        db.delete(db_dataset)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    ds_dir = DATA_ROOT / str(project_id) / str(dataset_id)
    if ds_dir.exists():
        try: shutil.rmtree(ds_dir)
        except Exception: pass 
    return {"deleted": dataset_id}

@app.get("/api/projects/{project_id}/datasets/{dataset_id}/dashboard-stats")
def get_dashboard_stats(project_id: int, dataset_id: int, db: Session = Depends(get_db)):
    ds_dir = DATA_ROOT / str(project_id) / str(dataset_id)
    if not ds_dir.exists():
        raise HTTPException(status_code=404, detail="Dataset not found")
        
    # Find the main fact table (usually starts with fact_ and ends with .csv)
    fact_files = list(ds_dir.glob("fact_*.csv"))
    if not fact_files:
        raise HTTPException(status_code=404, detail="No fact tables generated to analyze.")
        
    try:
        # Read the first fact table
        df = pd.read_csv(fact_files[0])
        
        # Ensure we have a date column to group by
        date_col = 'date' if 'date' in df.columns else 'Date' if 'Date' in df.columns else None
        
        if not date_col:
            return {"error": "No date column found for time-series analysis."}

        # Convert to datetime and sort
        df[date_col] = pd.to_datetime(df[date_col])
        df = df.sort_values(date_col)
        
        # 1. TIME SERIES: Group by Month for the main chart
        # We group by YYYY-MM and sum the financial metrics
        monthly_df = df.groupby(df[date_col].dt.strftime('%Y-%m')).agg({
            'revenue': 'sum',
            'cogs': 'sum',
            'ebitda': 'sum',
            'units': 'sum'
        }).reset_index()
        
        # Clean up column names for the frontend
        monthly_df = monthly_df.rename(columns={date_col: 'month'})
        
        # Fill any missing columns with 0s just in case the generator didn't make them
        for col in ['revenue', 'cogs', 'ebitda', 'units']:
            if col not in monthly_df.columns:
                monthly_df[col] = 0

        # 2. DIMENSION MIX: Revenue by Product (if product column exists)
        product_mix = []
        prod_col = 'product' if 'product' in df.columns else 'Product' if 'Product' in df.columns else None
        if prod_col and 'revenue' in df.columns:
            prod_df = df.groupby(prod_col)['revenue'].sum().reset_index()
            product_mix = prod_df.rename(columns={prod_col: 'name', 'revenue': 'value'}).to_dict(orient='records')

        # 3. HIGH-LEVEL KPIs
        kpis = {
            "total_revenue": float(df['revenue'].sum()) if 'revenue' in df.columns else 0,
            "total_units": float(df['units'].sum()) if 'units' in df.columns else 0,
            "avg_margin_pct": float(((df['revenue'].sum() - df['cogs'].sum()) / df['revenue'].sum()) * 100) if 'revenue' in df.columns and 'cogs' in df.columns and df['revenue'].sum() > 0 else 0,
        }

        # Return the aggregated payload
        return {
            "kpis": kpis,
            "monthly_trend": monthly_df.to_dict(orient='records'),
            "product_mix": product_mix
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to analyze dataset: {str(e)}")
    
# --- CUSTOM CODE INJECTION ROUTES ---
# --- CUSTOM CODE INJECTION ROUTES ---
@app.get("/api/projects/{project_id}/custom-logic")
def get_custom_logic(project_id: int, db: Session = Depends(get_db)):
    db_param = db.query(models.ProjectParameter).filter_by(project_id=project_id, param_key="custom_python_logic").first()
    
    # ---------------------------------------------------------
    # THE TRANSPARENT WHITE-BOX FORMULA ENGINE
    # This exposes the exact math to the frontend user so they can edit it!
    # ---------------------------------------------------------
    default_code = """# --- CORE FP&A CALCULATION ENGINE ---
# Modify these formulas to change how your dataset is mathematically generated.
# The raw dataset is loaded as 'df'.

# 1. Calculate Base Metrics
# Assuming base_price and base_units are in your JSON template defaults
df['units'] = df['base_units_per_month'] * df['seasonality_index'] * (1 + df['sentiment_index'])
df['price'] = df['base_price'] * (1 + df['inflation_index'])

# 2. Calculate Top Line Revenue
df['revenue'] = df['units'] * df['price']

# 3. Calculate Expenses (Using standard JSON template percentages)
df['cogs'] = df['revenue'] * 0.18  # Cost of Goods Sold
df['marketing_expense'] = df['revenue'] * 0.22
df['other_opex'] = df['revenue'] * 0.35

# 4. Calculate Bottom Line & Margins
df['gross_profit'] = df['revenue'] - df['cogs']
df['ebitda'] = df['gross_profit'] - df['marketing_expense'] - df['other_opex']

# 5. Advanced Financials
df['depreciation'] = 95000  # Hardcoded monthly depreciation
df['ebit'] = df['ebitda'] - df['depreciation']
df['interest'] = 42000
df['taxes'] = (df['ebit'] - df['interest']) * 0.21

# Final Net Income
df['net_income'] = df['ebit'] - df['interest'] - df['taxes']
"""
    
    # If the user has saved custom logic, return that. Otherwise, return the core formula template.
    return {"code": db_param.param_value if db_param and db_param.param_value.strip() else default_code}

@app.post("/api/projects/{project_id}/custom-logic")
def save_custom_logic(project_id: int, body: dict, db: Session = Depends(get_db)):
    db_param = db.query(models.ProjectParameter).filter_by(project_id=project_id, param_key="custom_python_logic").first()
    if db_param:
        db_param.param_value = body.get("code", "")
    else:
        db_param = models.ProjectParameter(project_id=project_id, param_key="custom_python_logic", param_value=body.get("code", ""))
        db.add(db_param)
    db.commit()
    return {"status": "success"}
# --- NEW DYNAMIC CHART BUILDER ROUTE ---
@app.post("/api/projects/{project_id}/datasets/{dataset_id}/custom-chart")
def get_custom_chart_data(project_id: int, dataset_id: int, body: CustomChartRequest):
    ds_dir = DATA_ROOT / str(project_id) / str(dataset_id)
    fact_files = list(ds_dir.glob("fact_*.csv"))
    
    if not fact_files:
        raise HTTPException(status_code=404, detail="No fact tables found.")

    try:
        df = pd.read_csv(fact_files[0])
        dim = body.dimension.lower()
        
        # Format dates nicely if they choose month/year
        if dim == 'month' and 'date' in df.columns:
            df['date'] = pd.to_datetime(df['date'])
            df[dim] = df['date'].dt.strftime('%Y-%m')
        elif dim not in df.columns:
            return {"data": []} # Dimension doesn't exist in this dataset

        # Only aggregate metrics that actually exist in the CSV
        valid_metrics = [m for m in body.metrics if m in df.columns]
        if not valid_metrics:
            return {"data": []}

        # Group by the selected dimension and sum the selected metrics
        grouped = df.groupby(dim)[valid_metrics].sum().reset_index()
        grouped = grouped.sort_values(dim)

        return {"data": grouped.to_dict(orient='records')}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Dynamic chart error: {str(e)}")