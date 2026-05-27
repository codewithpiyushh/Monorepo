import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from dotenv import load_dotenv

load_dotenv()

USE_POSTGRES = os.getenv("USE_POSTGRES", "").strip().lower() in {"1", "true", "yes", "on"}
DATABASE_URL = os.getenv("DATABASE_URL")
POSTGRES_URL = os.getenv("POSTGRES")

if USE_POSTGRES and (DATABASE_URL or POSTGRES_URL):
    SQLALCHEMY_DATABASE_URL = DATABASE_URL or POSTGRES_URL
else:
    SQLALCHEMY_DATABASE_URL = "sqlite:///./fpna_studio.db"

connect_args = {"check_same_thread": False} if SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args=connect_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

