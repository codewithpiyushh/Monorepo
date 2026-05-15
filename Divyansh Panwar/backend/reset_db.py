from app.database import engine
from app import models

print("Dropping old database tables...")
models.Base.metadata.drop_all(bind=engine)

print("Creating new relational database tables...")
models.Base.metadata.create_all(bind=engine)

print("Database reset complete! You can now start FastAPI.")