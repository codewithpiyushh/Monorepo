import os
from pathlib import Path

import pymysql
from pymysql.cursors import DictCursor
from dotenv import load_dotenv
import os

load_dotenv()

DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = int(os.getenv("DB_PORT", "3306"))
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "machine")

import os
import pymysql

def _connect(include_database=False):
    return pymysql.connect(
        host=os.getenv("DB_HOST"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),  # must exist
        database=os.getenv("DB_NAME") if include_database else None,
        cursorclass=pymysql.cursors.DictCursor
    )


def init_upload_store() -> None:
	with _connect(include_database=False) as conn:
		with conn.cursor() as cursor:
			cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{DB_NAME}`")
		conn.commit()

	with _connect(include_database=True) as conn:
		with conn.cursor() as cursor:
			cursor.execute(
				"""
				CREATE TABLE IF NOT EXISTS Data (
				  data_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
				  file_name VARCHAR(255) NOT NULL,
				  file_type ENUM('csv', 'xls', 'xlsx', 'py') NOT NULL,
				  file_path VARCHAR(500) NULL,
				  file_size_bytes BIGINT UNSIGNED NULL,
				  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
				  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
				  PRIMARY KEY (data_id),
				  UNIQUE KEY uq_data_file_name (file_name)
				) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
				"""
			)
		conn.commit()


def persist_uploaded_files(files: list[Path]) -> int:
	if not files:
		return 0

	rows: list[tuple[str, str, str, int]] = []
	for file_path in files:
		ext = file_path.suffix.lower().lstrip(".")
		if ext not in {"csv", "xls", "xlsx"}:
			continue
		rows.append(
			(
				file_path.name,
				ext,
				str(file_path),
				int(file_path.stat().st_size),
			)
		)

	if not rows:
		return 0

	with _connect(include_database=True) as conn:
		with conn.cursor() as cursor:
			cursor.executemany(
				"""
				INSERT INTO Data (file_name, file_type, file_path, file_size_bytes)
				VALUES (%s, %s, %s, %s)
				ON DUPLICATE KEY UPDATE
					file_type = VALUES(file_type),
					file_path = VALUES(file_path),
					file_size_bytes = VALUES(file_size_bytes),
					updated_at = CURRENT_TIMESTAMP
				""",
				rows,
			)
		conn.commit()

	return len(rows)
def delete_file_record(file_name: str) -> bool:
    try:
        with _connect(include_database=True) as conn:
            with conn.cursor() as cursor:
                # Delete by file_name since it is a UNIQUE key[cite: 7]
                cursor.execute("DELETE FROM Data WHERE file_name = %s", (file_name,))
            conn.commit()
            return True
    except Exception as e:
        print(f"Database delete error: {e}")
        return False