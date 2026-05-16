import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from dotenv import load_dotenv
# The standard format is: postgresql://username:password@host:port/database_name
# In a real app, you would load this from an .env file like this:
# SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/fpna_db")
load_dotenv()  
SQLALCHEMY_DATABASE_URL =os.getenv("POSTGRES")

engine = create_engine(SQLALCHEMY_DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

