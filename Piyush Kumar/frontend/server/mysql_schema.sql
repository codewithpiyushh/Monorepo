CREATE DATABASE IF NOT EXISTS ml_workspace;
USE ml_workspace;

CREATE TABLE IF NOT EXISTS Data (
  data_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  file_name VARCHAR(255) NOT NULL,
  file_type ENUM('csv', 'xls', 'xlsx') NOT NULL,
  file_path VARCHAR(500) NULL,
  file_size_bytes BIGINT UNSIGNED NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (data_id),
  UNIQUE KEY uq_data_file_name (file_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS Prediction (
  prediction_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  data_id BIGINT UNSIGNED NOT NULL,
  model_name VARCHAR(100) NOT NULL,
  rmse DECIMAL(18, 6) NULL,
  r2_score DECIMAL(18, 6) NULL,
  output_file_path VARCHAR(500) NULL,
  result_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (prediction_id),
  KEY idx_prediction_data_id (data_id),
  CONSTRAINT fk_prediction_data
    FOREIGN KEY (data_id)
    REFERENCES Data (data_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS Analysis (
  analysis_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  data_id BIGINT UNSIGNED NOT NULL,
  summary_json JSON NULL,
  graph_config_json JSON NULL,
  insight_text TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (analysis_id),
  KEY idx_analysis_data_id (data_id),
  CONSTRAINT fk_analysis_data
    FOREIGN KEY (data_id)
    REFERENCES Data (data_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS anomaly (
  anomaly_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  data_id BIGINT UNSIGNED NOT NULL,
  algorithm_name VARCHAR(100) NOT NULL DEFAULT 'IsolationForest',
  anomaly_count INT UNSIGNED NULL,
  normal_count INT UNSIGNED NULL,
  output_file_path VARCHAR(500) NULL,
  result_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (anomaly_id),
  KEY idx_anomaly_data_id (data_id),
  CONSTRAINT fk_anomaly_data
    FOREIGN KEY (data_id)
    REFERENCES Data (data_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
