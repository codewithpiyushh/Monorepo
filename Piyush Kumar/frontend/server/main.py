import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.ensemble import GradientBoostingRegressor, IsolationForest, RandomForestRegressor
from sklearn.svm import SVR
from sklearn.metrics import mean_squared_error, r2_score
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import io
from sklearn.ensemble import IsolationForest
from fastapi.responses import StreamingResponse
import matplotlib.dates as mdates

# Config
TARGET = "net_income"
TEST_SIZE = 0.2
RANDOM_STATE = 42

def load_data(file_path: Path) -> pd.DataFrame:
    if file_path.suffix.lower() == ".csv":
        return pd.read_csv(file_path)
    if file_path.suffix.lower() in {".xls", ".xlsx"}:
        return pd.read_excel(file_path)
    raise ValueError(f"Unsupported file format: {file_path.suffix}")

def split_features(df: pd.DataFrame, drop_extra_cols: list = None):
    drop_cols = [TARGET]
    if "date" in df.columns: drop_cols.append("date")
    if drop_extra_cols:
        drop_cols.extend([col for col in drop_extra_cols if col in df.columns])
    
    X = df.drop(columns=drop_cols)
    y = df[TARGET]
    num_cols = X.select_dtypes(include=["int64", "float64"]).columns
    cat_cols = X.select_dtypes(include=["object"]).columns
    return X, y, num_cols, cat_cols

def build_preprocessor(num_cols, cat_cols):
    return ColumnTransformer([
        ("num", StandardScaler(), num_cols),
        ("cat", OneHotEncoder(handle_unknown="ignore"), cat_cols),
    ])

def train_models(preprocessor, X_train, y_train):
    models = {
        "RandomForest": RandomForestRegressor(n_estimators=100, random_state=RANDOM_STATE),
        "GradientBoosting": GradientBoostingRegressor(random_state=RANDOM_STATE),
        "SVR": SVR(),
    }
    trained_pipelines = {}
    for name, model in models.items():
        pipeline = Pipeline([("preprocessor", preprocessor), ("model", model)])
        pipeline.fit(X_train, y_train)
        trained_pipelines[name] = pipeline
    return trained_pipelines

def detect_anomalies(df, preprocessor):
    X = df.drop(columns=[TARGET], errors='ignore')
    X_processed = preprocessor.transform(X)
    iso = IsolationForest(contamination=0.05, random_state=RANDOM_STATE)
    df["anomaly_pred"] = iso.fit_predict(X_processed)
    return df

# Function to add to your Python app.py
import matplotlib.pyplot as plt
from io import BytesIO
from fastapi.responses import Response

def get_predictions_graph(pipelines, X_test, y_test, date_series):
    """Generates a sorted, clean prediction comparison chart."""
    pred_dict = {"Actual": y_test.copy()}
    for name, pipeline in pipelines.items():
        pred_dict[name] = pd.Series(pipeline.predict(X_test), index=y_test.index)

    plot_df = pd.DataFrame(pred_dict)
    
    # Attach dates and SORT to fix the zigzag mess[cite: 13]
    plot_df['Date'] = date_series.reindex(y_test.index).values
    plot_df['Date'] = pd.to_datetime(plot_df['Date'], errors='coerce')
    plot_df = plot_df.dropna(subset=['Date']).sort_values('Date').reset_index(drop=True)

    fig, ax = plt.subplots(figsize=(12, 6))
    ax.plot(plot_df['Date'], plot_df['Actual'], color='black', label='Actual', linewidth=2)
    
    colors = {'RandomForest': 'cyan', 'GradientBoosting': 'magenta', 'SVR': 'orange'}
    for col in [c for c in plot_df.columns if c not in ('Actual', 'Date')]:
        ax.plot(plot_df['Date'], plot_df[col], label=f'{col} Pred', 
                color=colors.get(col, 'blue'), linestyle='--')

    ax.legend()
    ax.set_title("Net Income Prediction Comparison")
    plt.xticks(rotation=45)
    
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight')
    plt.close(fig)
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")

def get_date_series(df: pd.DataFrame):
    """Combines year and month into a datetime series for plotting."""
    # Ensure year and month are integers
    years = df['year'].round().astype(int)
    months = df['month'].round().clip(1, 12).astype(int)
    return pd.to_datetime(years.astype(str) + '-' + months.astype(str) + '-01')

def generate_predictions_df(trained_pipelines, X_test, y_test):
    """Calculates predictions for all three algorithms."""
    predictions = {"Actual": y_test.values}
    for name, pipeline in trained_pipelines.items():
        predictions[name] = pipeline.predict(X_test)
    
    # Return a DataFrame sorted by index to keep the timeline straight
    return pd.DataFrame(predictions, index=y_test.index).sort_index()

def run_anomaly_service(df, contamination=0.05):
    """Detects anomalies and returns both original and a median-corrected dataframe."""
    cols_to_test = df.select_dtypes(include=[np.number]).columns
    cols_to_test = [c for c in cols_to_test if c not in ['year', 'month']]
    
    # 1. Detect
    iso = IsolationForest(contamination=contamination, random_state=42)
    df['anomaly_pred'] = iso.fit_predict(df[cols_to_test])
    
    # 2. Correct (Median Imputation)
    df_corrected = df.copy()
    for col in cols_to_test:
        median_val = df[col].median()
        df_corrected.loc[df['anomaly_pred'] == -1, col] = median_val
        
    return df, df_corrected

