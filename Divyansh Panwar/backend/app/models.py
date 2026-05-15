from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Float, JSON
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

# --- 1. REFERENCE DATA ---
class Industry(Base):
    __tablename__ = "industries"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True) 
    description = Column(Text, nullable=True)
    
    templates = relationship("Template", back_populates="industry")
    projects = relationship("Project", back_populates="industry")

class Template(Base):
    __tablename__ = "templates"
    id = Column(Integer, primary_key=True, index=True)
    industry_id = Column(Integer, ForeignKey("industries.id"), nullable=True)
    
    # New Columns for custom templates
    industry_key = Column(String, unique=True, index=True)
    label = Column(String)
    description = Column(Text, nullable=True)
    version = Column(String, default="1.0")
    
    available_dimensions = Column(JSON)
    seasonality_profiles = Column(JSON)
    inflation_presets = Column(JSON)
    
    industry = relationship("Industry", back_populates="templates")
    projects = relationship("Project", back_populates="template")

# --- 2. WORKSPACE & CONFIGURATION ---
class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True, index=True)
    industry_id = Column(Integer, ForeignKey("industries.id"))
    template_id = Column(Integer, ForeignKey("templates.id"), nullable=True)
    name = Column(String, index=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    industry = relationship("Industry", back_populates="projects")
    template = relationship("Template", back_populates="projects")
    parameters = relationship("ProjectParameter", back_populates="project", cascade="all, delete-orphan")
    dimensions = relationship("Dimension", back_populates="project", cascade="all, delete-orphan")
    scenarios = relationship("Scenario", back_populates="project", cascade="all, delete-orphan")
    datasets = relationship("Dataset", back_populates="project", cascade="all, delete-orphan")
    accounts = relationship("Account", back_populates="project", cascade="all, delete-orphan")

class ProjectParameter(Base):
    __tablename__ = "project_parameters"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    param_key = Column(String, index=True) 
    param_value = Column(String)
    data_type = Column(String, default="string")

    project = relationship("Project", back_populates="parameters")

# --- 3. DIMENSIONAL MODELING ---
class Dimension(Base):
    __tablename__ = "dimensions"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    name = Column(String) 

    project = relationship("Project", back_populates="dimensions")
    members = relationship("DimensionMember", back_populates="dimension", cascade="all, delete-orphan")

class DimensionMember(Base):
    __tablename__ = "dimension_members"
    id = Column(Integer, primary_key=True, index=True)
    dimension_id = Column(Integer, ForeignKey("dimensions.id"))
    value = Column(String) 

    dimension = relationship("Dimension", back_populates="members")

class Account(Base):
    __tablename__ = "accounts"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    name = Column(String, index=True) 

    project = relationship("Project", back_populates="accounts")

# --- 4. SCENARIOS ---
class Scenario(Base):
    __tablename__ = "scenarios"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    name = Column(String) 

    project = relationship("Project", back_populates="scenarios")
    parameters = relationship("ScenarioParameter", back_populates="scenario", cascade="all, delete-orphan")
    files = relationship("DatasetFile", back_populates="scenario")

class ScenarioParameter(Base):
    __tablename__ = "scenario_parameters"
    id = Column(Integer, primary_key=True, index=True)
    scenario_id = Column(Integer, ForeignKey("scenarios.id"))
    param_key = Column(String) 
    param_value = Column(String)

    scenario = relationship("Scenario", back_populates="parameters")

# --- 5. EXECUTION & OUTPUTS ---
class Dataset(Base):
    __tablename__ = "datasets"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    name = Column(String)
    status = Column(String, default="Completed") 
    total_row_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="datasets")
    files = relationship("DatasetFile", back_populates="dataset", cascade="all, delete-orphan")

class DatasetFile(Base):
    __tablename__ = "dataset_files"
    id = Column(Integer, primary_key=True, index=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id"))
    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=True)
    file_path = Column(String)
    file_size_kb = Column(Float, default=0.0)

    dataset = relationship("Dataset", back_populates="files")
    scenario = relationship("Scenario", back_populates="files")