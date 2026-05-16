from fastapi import FastAPI, HTTPException, UploadFile, File
from typing import List, Optional
from fastapi.responses import JSONResponse
from pathlib import Path
import main
import visual
import data
from dotenv import load_dotenv
import os
import numpy as np 
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.model_selection import train_test_split

load_dotenv()
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Refined Prediction API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

WORKSPACE_DIR = Path(__file__).resolve().parent

# ─── In-memory store for the trained preprocessor + pipelines ────────────────
# This lets /api/detect-anomalies reuse what /api/run-pipeline already trained.
_trained_state: dict = {
    "preprocessor": None,   # fitted ColumnTransformer
    "pipelines": None,      # dict of fitted model pipelines
    "train_file": None,     # name of the file used for training
}

# Initialize database
try:
    data.init_upload_store()
except Exception as e:
    print(f"Warning: Database initialization failed: {e}")
    print("Please ensure MySQL is running and credentials are correct.")


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def get_file_path_from_db(file_name: str) -> Path:
    with data._connect(include_database=True) as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT file_path FROM Data WHERE file_name = %s", (file_name,)
            )
            result = cursor.fetchone()
    if not result:
        raise HTTPException(status_code=404, detail=f"File '{file_name}' not found in DB")
    return Path(result["file_path"])


def _resolve_path(file_name: str) -> Path:
    """Return an absolute path for a file that lives in the workspace dir."""
    p = Path(file_name)
    if not p.is_absolute():
        p = WORKSPACE_DIR / p
    if not p.exists():
        raise FileNotFoundError(f"File not found on disk: {p}")
    return p


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"message": "API Server is running", "status": "ok"}


@app.get("/api/files")
async def get_files():
    try:
        with data._connect(include_database=True) as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT data_id, file_name, file_type, file_size_bytes, uploaded_at "
                    "FROM Data ORDER BY uploaded_at DESC"
                )
                files = cursor.fetchall()
        return {"files": files, "count": len(files)}
    except Exception as e:
        print(f"Database error: {e}")
        return {
            "files": [], "count": 0,
            "error": "Database connection failed. Ensure MySQL is running with correct credentials.",
        }


@app.get("/api/database/summary")
async def get_database_summary():
    try:
        with data._connect(include_database=True) as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT COUNT(*) as total_files FROM Data")
                result = cursor.fetchone()
                total_files = result["total_files"] if result else 0

                cursor.execute(
                    "SELECT file_type, COUNT(*) as count, SUM(file_size_bytes) as total_size "
                    "FROM Data GROUP BY file_type"
                )
                file_types = cursor.fetchall()

                cursor.execute("SELECT SUM(file_size_bytes) as total_size FROM Data")
                result = cursor.fetchone()
                total_size = result["total_size"] if result and result["total_size"] else 0

        return {
            "total_files": total_files,
            "total_size_bytes": total_size,
            "file_types": file_types,
        }
    except Exception as e:
        print(f"Database error: {e}")
        return {
            "total_files": 0, "total_size_bytes": 0, "file_types": [],
            "error": "Database connection failed.",
        }


# ── /api/run-pipeline ─────────────────────────────────────────────────────────
# FIX: Actually trains the models and stores the fitted preprocessor + pipelines
# in _trained_state so /api/detect-anomalies can reuse them without re-fitting.

@app.post("/api/run-pipeline")
async def run_pipeline(
    train_file: Optional[str] = None,
    anomaly_file: Optional[str] = None,
    upload_train: Optional[UploadFile] = File(None),
    upload_anomaly: Optional[UploadFile] = File(None),
):
    try:
        # ── Resolve training file path ────────────────────────────────────────
        if upload_train:
            train_path = WORKSPACE_DIR / upload_train.filename
            with open(train_path, "wb") as f:
                f.write(await upload_train.read())
        elif train_file:
            train_path = await get_file_path_from_db(train_file)
        else:
            raise HTTPException(status_code=400, detail="No training data provided")

        # ── Load data ─────────────────────────────────────────────────────────
        df = main.load_data(train_path)
        X, y, num_cols, cat_cols = main.split_features(df)

        # ── Build AND FIT the preprocessor on training data ───────────────────
        preprocessor = main.build_preprocessor(num_cols, cat_cols)
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )
        # fit_transform on train; this makes preprocessor fitted
        preprocessor.fit(X_train)

        # ── Train models ──────────────────────────────────────────────────────
        pipelines = main.train_models(preprocessor, X_train, y_train)

        # ── Evaluate to find best model ───────────────────────────────────────
        best_model = "RandomForest"
        best_rmse = float("inf")
        try:
            from sklearn.metrics import mean_squared_error
            import numpy as np
            for name, pipe in pipelines.items():
                preds = pipe.predict(X_test)
                rmse = float(np.sqrt(mean_squared_error(y_test, preds)))
                if rmse < best_rmse:
                    best_rmse = rmse
                    best_model = name
        except Exception:
            pass  # If evaluation fails, default to RandomForest

        # ── Store trained state for /api/detect-anomalies to reuse ───────────
        _trained_state["preprocessor"] = preprocessor
        _trained_state["pipelines"] = pipelines
        _trained_state["train_file"] = str(train_path)

        return {
            "status": "success",
            "best_model": best_model,
            "trained_on": train_path.name,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── /api/detect-anomalies ─────────────────────────────────────────────────────
# FIX: Uses the already-fitted preprocessor from _trained_state.
# If the pipeline was never run first, returns a clear 400 error.

@app.post("/api/detect-anomalies")
async def detect_anomalies(
    anomaly_file: Optional[str] = None,
    upload_anomaly: Optional[UploadFile] = File(None),
):
    try:
        # ── Guard: must have trained first ────────────────────────────────────
        fitted_preprocessor = _trained_state.get("preprocessor")
        if fitted_preprocessor is None:
            raise HTTPException(
                status_code=400,
                detail=(
                    "No trained model found. "
                    "Please call /api/run-pipeline first to train the model, "
                    "then run anomaly detection."
                ),
            )

        # ── Resolve anomaly file path ─────────────────────────────────────────
        if upload_anomaly:
            path = WORKSPACE_DIR / upload_anomaly.filename
            with open(path, "wb") as f:
                f.write(await upload_anomaly.read())
        elif anomaly_file:
            path = await get_file_path_from_db(anomaly_file)
        else:
            raise HTTPException(status_code=400, detail="No anomaly data provided")

        # ── Load anomaly data ─────────────────────────────────────────────────
        df = main.load_data(path)
        X, y, num_cols, cat_cols = main.split_features(df)

        # ── FIX: use the already-fitted preprocessor — do NOT build a new one ─
        results = main.detect_anomalies(df, fitted_preprocessor)

        anomaly_counts = results["anomaly_pred"].value_counts().to_dict()
        # Convert keys to strings for JSON serialisation (they may be ints like -1, 1)
        anomaly_counts = {str(k): int(v) for k, v in anomaly_counts.items()}

        return {
            "status": "success",
            "anomaly_counts": anomaly_counts,
            "total_records": len(results),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── /api/upload ───────────────────────────────────────────────────────────────

@app.post("/api/upload")
async def upload_files(files: List[UploadFile] = File(...)):
    saved_paths = []
    try:
        for file in files:
            file_path = WORKSPACE_DIR / file.filename
            with open(file_path, "wb") as buffer:
                content = await file.read()
                buffer.write(content)
            saved_paths.append(file_path)

        count = data.persist_uploaded_files(saved_paths)

        return {
            "message": f"Successfully uploaded {count} files",
            "saved": [f.name for f in saved_paths],
        }
    except Exception as e:
        print(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── /api/files/{file_name} DELETE ─────────────────────────────────────────────

@app.delete("/api/files/{file_name}")
async def delete_file(file_name: str):
    try:
        with data._connect(include_database=True) as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT file_path FROM Data WHERE file_name = %s", (file_name,)
                )
                result = cursor.fetchone()

        if result and result["file_path"]:
            physical_path = Path(result["file_path"])
            if physical_path.exists():
                os.remove(physical_path)

        success = data.delete_file_record(file_name)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to delete database record")

        return {"message": f"Successfully deleted {file_name}"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── /api/predict ──────────────────────────────────────────────────────────────
# FIX: Fits the preprocessor before passing to train_models.

# app.py
@app.post("/api/predict")
async def run_prediction(train_file: str):
    try:
        path = await get_file_path_from_db(train_file)
        df = main.load_data(path)
        
        # 1. SORT FIRST: Ensure time flows correctly
        df = df.sort_values(['year', 'month']).reset_index(drop=True)
        
        # 2. AGGREGATION: Group by every 100 rows to smooth out the "zig-zag"
        # Using // 100 creates groups: rows 0-99 = group 0, 100-199 = group 1, etc.
        df['group'] = np.arange(len(df)) // 20
        
        agg_df = df.groupby('group').agg({
            'year': 'first',
            'month': 'first',
            'net_income': 'mean'
        }).reset_index(drop=True)

        # 3. FEATURES: Split features from the aggregated data
        # Note: Ensure your main.split_features handles 'year' and 'month' correctly
        X, y, num_cols, cat_cols = main.split_features(agg_df)
        
        # 4. PREPROCESSOR: Build and fit on the current data
        preprocessor = main.build_preprocessor(num_cols, cat_cols)
        # We fit here to ensure scaling matches the aggregated data range
        X_processed = preprocessor.fit_transform(X)
        
        # 5. TRAIN & PREDICT
        # Note: Using your existing main.train_models helper
        pipelines = main.train_models(preprocessor, X, y)

        # 6. PREPARE RESULTS
        results_df = pd.DataFrame({"Actual": y.values}, index=y.index)
        
        for name, pipe in pipelines.items():
            results_df[name] = pipe.predict(X)
            
        results_df['year'] = agg_df['year']
        results_df['month'] = agg_df['month']
        
        # Convert to JSON-friendly format
        final_data = results_df.to_dict(orient="records")

        return {
            "status": "success",
            "prediction_data": final_data,
            "points_data": final_data # This feeds the black dots on your graph
        }
    except Exception as e:
        # Better error logging
        print(f"Prediction Error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
@app.get("/api/visualize-predictions")
async def visualize_predictions(file_name: str):
    try:
        file_path = WORKSPACE_DIR / file_name
        df = main.load_data(file_path)
        X, y, num_cols, cat_cols = main.split_features(df)
        date_series = main.get_date_series(df)

        # FIX: build AND fit preprocessor before train_models
        preprocessor = main.build_preprocessor(num_cols, cat_cols)
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )
        preprocessor.fit(X_train)

        pipelines = main.train_models(preprocessor, X_train, y_train)

        return main.get_predictions_graph(pipelines, X_test, y_test, date_series)

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
@app.post("/api/fix-anomalies")
async def fix_anomalies(file_name: str, contamination: float = 0.05):
    try:
        path = await get_file_path_from_db(file_name)
        df = main.load_data(path)
        
        # Run service from main.py
        original, corrected = main.run_anomaly_service(df, contamination)
        
        fixed_filename = f"fixed_{file_name}"
        fixed_path = WORKSPACE_DIR / fixed_filename
        corrected.to_csv(fixed_path, index=False)
        
        # Add to DB so it shows in sidebar
        data.persist_uploaded_files([fixed_path])
        
        return {
            "status": "success",
            "anomalies_fixed": int((original['anomaly_pred'] == -1).sum()),
            "fixed_file": fixed_filename
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
# app.py

@app.get("/api/preview")
async def get_file_preview(file_name: str):
    try:
        path = WORKSPACE_DIR / file_name
        if not path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        df = main.load_data(path)
        # Convert first 10 rows to JSON-friendly format
        data = df.head(10).replace({np.nan: None}).to_dict(orient="records")
        return {"status": "success", "preview": data}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))