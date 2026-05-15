import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
from pathlib import Path

def process_and_fix_dataset(input_path, output_path, contamination=0.05):
    """
    Takes an input file path, detects anomalies, fixes them, and saves to output_path.
    """
    try:
        # 1. Load the data
        file_path = Path(input_path)
        if file_path.suffix.lower() == ".csv":
            df = pd.read_csv(file_path)
        elif file_path.suffix.lower() in [".xls", ".xlsx"]:
            df = pd.read_excel(file_path)
        else:
            print(f"Error: Unsupported format {file_path.suffix}")
            return

        # 2. Identify numeric features (excluding time-based columns)[cite: 11, 12]
        cols_to_test = df.select_dtypes(include=[np.number]).columns.tolist()
        cols_to_test = [c for c in cols_to_test if c not in ['year', 'month']]

        if not cols_to_test:
            print("Error: No numeric data found to process.")
            return

        # 3. Detect Anomalies (Isolation Forest)[cite: 12]
        # contamination represents the expected percentage of outliers[cite: 12]
        iso = IsolationForest(contamination=contamination, random_state=42)
        # fit_predict marks outliers as -1[cite: 12]
        anomaly_labels = iso.fit_predict(df[cols_to_test])

        # 4. Correct Anomalies (Median Imputation)[cite: 12]
        df_corrected = df.copy()
        for col in cols_to_test:
            median_val = df[col].median()
            # Replace only the values at indices flagged as -1[cite: 12]
            df_corrected.loc[anomaly_labels == -1, col] = median_val

        # 5. Save the output[cite: 11]
        df_corrected.to_csv(output_path, index=False)
        print(f"Done! Cleaned dataset saved to: {output_path}")
        print(f"Number of anomalies fixed: {list(anomaly_labels).count(-1)}")

    except Exception as e:
        print(f"An unexpected error occurred: {e}")

# --- EXECUTION ---
# Change these paths to your actual filenames
INPUT_FILE = "augmented_dataset.csv" 
OUTPUT_FILE = "fixed_augmented_dataset.csv"

process_and_fix_dataset(INPUT_FILE, OUTPUT_FILE)