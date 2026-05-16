"""
Configuration file for GraphRAG system
All credentials are loaded from .env file
"""
import os
from pathlib import Path

from dotenv import load_dotenv

# Load environment variables from .env file
env_path = Path(__file__).parent.parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

# Neo4j credentials
NEO4J_URI = os.getenv("NEO4J_URI")
NEO4J_USERNAME = os.getenv("NEO4J_USERNAME")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")
NEO4J_DATABASE = os.getenv("NEO4J_DATABASE", "neo4j")
AURA_INSTANCEID = os.getenv("AURA_INSTANCEID")
AURA_INSTANCENAME = os.getenv("AURA_INSTANCENAME", "Instance")

# Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite-preview")

# Validate that required credentials are present
_required_credentials = {
    "NEO4J_URI": NEO4J_URI,
    "NEO4J_USERNAME": NEO4J_USERNAME,
    "NEO4J_PASSWORD": NEO4J_PASSWORD,
    "GEMINI_API_KEY": GEMINI_API_KEY,
}

for credential_name, credential_value in _required_credentials.items():
    if not credential_value:
        raise ValueError(
            f"Missing required credential: {credential_name}\n"
            f"Please create a .env file with all required credentials.\n"
            f"You can use .env.example as a template."
        )


# Graph configuration
GRAPH_CONFIG = {
    "entity_types": ["Person", "Organization", "Location", "Date", "Event", "Concept"],
    "relationship_types": ["RELATED_TO", "LOCATED_IN", "WORKS_FOR", "CREATED", "MENTIONS", "CONNECTED_TO"]
}

