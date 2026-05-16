@echo off
REM Set MySQL connection credentials
REM Change the password below if your MySQL root user has a different password
set DB_HOST=127.0.0.1
set DB_PORT=3306
set DB_USER=root
set DB_PASSWORD=123456

REM Uncomment and modify the line below with your actual MySQL root password if needed:
REM set DB_PASSWORD=your_password_here

REM Set database name
set DB_NAME=ml_workspace

REM Start the FastAPI server with uvicorn
uvicorn app:app --reload --host 127.0.0.1 --port 8000
