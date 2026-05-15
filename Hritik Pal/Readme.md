# GraphRAG

GraphRAG ingests CSV or Excel files, stores them in Neo4j as row communities, and answers questions with Gemini using graph context.

## What The Graph Looks Like

For a dataset with 1000 rows, the builder creates 1000 row groups.

Each row group contains:

- one `RowGroup` / `Community` node
- one primary-key `PrimaryEntity` cell
- one `Cell` node for each non-empty column value
- bidirectional group membership links between the row group and every cell
- bidirectional `RELATED_IN_ROW` links between every pair of cells in that row

Rows that share the same exact column/value also get bidirectional cross-row links:

- `Cell -> SAME_VALUE_AS -> Cell`
- `RowGroup -> SHARES_VALUE_WITH -> RowGroup`

This lets a query find one value, recover the full row group, and also traverse to related row groups when values overlap.

## Project Layout

```text
.
|-- cli.py                         # Small runner for python cli.py
|-- README.md                      # Project documentation
|-- requirements.txt               # Python dependencies
|-- actual_vs_target_data.csv      # Sample/local data
|-- scripts/
|   |-- examples.py                # Optional example workflows
|   `-- utils.py                   # Optional helper scripts
`-- src/
    `-- graphrag_app/
        |-- app.py                 # Application orchestrator
        |-- cli.py                 # Interactive menu
        |-- config.py              # Neo4j/Gemini configuration
        |-- ingestion/
        |   `-- data_ingestion.py
        |-- graph/
        |   `-- graph_builder.py
        |-- llm/
        |   `-- gemini.py
        `-- query/
            `-- query_engine.py
```

## Setup

### 1. Install Dependencies

```powershell
pip install -r requirements.txt
```

### 2. Configure Credentials

The application requires two services: Neo4j and Google Gemini API.

**Step 1:** Copy the example environment file:

```powershell
cp .env.example .env
```

**Step 2:** Edit `.env` and add your actual credentials:

```env
# Neo4j Aura Credentials
NEO4J_URI=neo4j+s://your-instance-id.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_neo4j_password
NEO4J_DATABASE=neo4j
AURA_INSTANCEID=your_instance_id
AURA_INSTANCENAME=Your Instance Name

# Gemini API Key
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.1-flash-lite-preview
```

**Important Security Notes:**
- ✅ The `.env` file is **gitignored** and will NOT be committed to GitHub
- ✅ Never share or commit `.env` with real credentials
- ✅ Only commit `.env.example` with placeholder values
- ✅ Each developer/deployment should have their own `.env` file

### Getting Credentials

**Neo4j Aura:**
1. Go to https://console.neo4j.io/
2. Create or select an instance
3. Copy the connection URI, username, and password

**Google Gemini API:**
1. Go to https://ai.google.dev/
2. Create a new API key
3. Copy it to your `.env` file

## Run

```powershell
streamlit run cli.py
```

This launches the Streamlit interface in a separate browser window. Use the
Data tab to load a CSV/Excel file, the Graph tab to build or refresh the Neo4j
graph, and the Ask tab to view answers and metadata outside the terminal.

You can also launch the UI directly:

```powershell
streamlit run src/graphrag_app/streamlit_app.py
```

After changing graph logic, build with `clear_existing=True` so Neo4j does not keep the older graph shape.

## Python Usage

```python
from src.graphrag_app import GraphRAGApplication

app = GraphRAGApplication()
app.ingest_file("actual_vs_target_data.csv")
app.build_graph(clear_existing=True)
result = app.answer_question("Show details for row A")
print(result["answer"])
app.close()
```

## Useful Neo4j Checks

Confirm one row group per dataset row:

```cypher
MATCH (g:RowGroup)
RETURN count(g);
```

Inspect one row group:

```cypher
MATCH (g:RowGroup)-[:GROUP_HAS_CELL]->(c:Cell)
RETURN g.id, g.primary_key_value, c.column, c.value
LIMIT 50;
```

Inspect cross-row links:

```cypher
MATCH (a:RowGroup)-[r:SHARES_VALUE_WITH]->(b:RowGroup)
RETURN a.primary_key_value, r.column, r.value, b.primary_key_value
LIMIT 50;
```

## Notes

- CSV and Excel files are supported.
- Primary key selection prefers identifier-like unique columns, then any unique column, then the first column.
- Short search terms are matched exactly to avoid noisy row retrieval.
- Dataset-wide questions such as totals, averages, lists, comparisons, trends, or "all rows" retrieve all row groups, not just the first few matches.
- The `graphrag/` directory in this workspace is a virtual environment, not the source package.
