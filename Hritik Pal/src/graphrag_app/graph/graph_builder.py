"""
Graph builder module to create knowledge graph in Neo4j
"""

from neo4j import GraphDatabase
from neo4j.exceptions import AuthError, ServiceUnavailable
import pandas as pd
from typing import List, Dict, Any, Optional
import re
import socket
from urllib.parse import urlparse


class GraphBuilder:
    """Build and manage knowledge graphs in Neo4j"""
    
    def __init__(self, uri: str, username: str, password: str, database: str = "neo4j"):
        """
        Initialize Neo4j connection
        
        Args:
            uri: Neo4j connection URI
            username: Neo4j username
            password: Neo4j password
            database: Database name
        """
        self.uri = uri
        self.driver = GraphDatabase.driver(
            uri,
            auth=(username, password),
            connection_timeout=10
        )
        self.database = database
        self.session = None
        self._test_connection()
        print("[OK] Connected to Neo4j successfully")
    
    def _test_connection(self):
        """Test the Neo4j connection"""
        try:
            with self.driver.session(database=self.database) as session:
                session.run("RETURN 1")
        except AuthError as e:
            raise Exception(
                "Failed to authenticate with Neo4j. The server was reached, "
                "but the username/password was rejected."
            ) from e
        except ServiceUnavailable as e:
            detail = self._diagnose_tcp_connectivity()
            raise Exception(
                "Failed to connect to Neo4j. The driver could not retrieve "
                f"routing information for database '{self.database}'. {detail}"
            ) from e
        except Exception as e:
            raise Exception(f"Failed to connect to Neo4j: {str(e)}")

    def _diagnose_tcp_connectivity(self) -> str:
        """Return a short network diagnostic for the configured Neo4j URI."""
        parsed = urlparse(self.uri)
        host = parsed.hostname
        port = parsed.port or 7687

        if not host:
            return "The Neo4j URI is missing a hostname."

        try:
            with socket.create_connection((host, port), timeout=10):
                return (
                    f"TCP connectivity to {host}:{port} works, so check that "
                    "the Aura instance is running and that the configured "
                    "database name is valid."
                )
        except TimeoutError:
            return (
                f"TCP connection to {host}:{port} timed out. This usually "
                "means a firewall/VPN/proxy/network policy is blocking Neo4j "
                "Bolt traffic, or the Aura instance is paused/unreachable."
            )
        except OSError as e:
            return f"TCP connection to {host}:{port} failed: {e}"
    
    def close(self):
        """Close the Neo4j connection"""
        if self.driver:
            self.driver.close()
    
    def clear_graph(self):
        """Clear all nodes and relationships from the graph"""
        with self.driver.session(database=self.database) as session:
            session.run("MATCH (n) DETACH DELETE n")
        print("[OK] Graph cleared")
    
    def _infer_primary_key_column(self, data: pd.DataFrame) -> Any:
        """Pick the best primary key column from the dataset."""
        if data.empty or len(data.columns) == 0:
            raise ValueError("Cannot build a graph from an empty DataFrame")

        non_null_unique_columns = [
            col for col in data.columns
            if data[col].notna().all() and data[col].astype(str).is_unique
        ]

        if non_null_unique_columns:
            id_like_columns = [
                col for col in non_null_unique_columns
                if self._looks_like_identifier(str(col))
            ]
            return id_like_columns[0] if id_like_columns else non_null_unique_columns[0]

        return data.columns[0]

    def _looks_like_identifier(self, column_name: str) -> bool:
        """Return whether a column name appears to be an identifier."""
        normalized = re.sub(r"[^a-z0-9]+", "_", column_name.lower()).strip("_")
        return (
            normalized in {"id", "key", "pk", "primary_key", "identifier"}
            or normalized.endswith("_id")
            or normalized.endswith("_key")
        )

    def _cell_value(self, value: Any) -> Optional[str]:
        """Normalize a DataFrame cell value for graph storage."""
        if pd.isna(value):
            return None
        return str(value)

    def _node_id(self, row_index: int, column: str, value: str, is_primary: bool) -> str:
        """Create a stable, row-scoped node id."""
        if is_primary:
            return f"pk::{column}::{value}::row::{row_index}"
        return f"cell::row::{row_index}::column::{column}"

    def _create_constraints(self):
        """Create uniqueness constraints used by the graph model."""
        with self.driver.session(database=self.database) as session:
            session.run(
                "CREATE CONSTRAINT cell_id IF NOT EXISTS "
                "FOR (n:Cell) REQUIRE n.id IS UNIQUE"
            )
            session.run(
                "CREATE CONSTRAINT data_row_id IF NOT EXISTS "
                "FOR (n:DataRow) REQUIRE n.id IS UNIQUE"
            )
            session.run(
                "CREATE CONSTRAINT row_group_id IF NOT EXISTS "
                "FOR (n:RowGroup) REQUIRE n.id IS UNIQUE"
            )

    def create_nodes_and_relationships(
        self,
        data: pd.DataFrame,
        primary_key_column: Optional[str] = None
    ):
        """
        Create row-centric, bidirectional nodes and relationships from DataFrame.

        Each row is represented by a RowGroup community node and a PrimaryEntity
        node chosen from the dataset's primary key column. Every cell in that row
        belongs to the RowGroup, connects to the primary node, and is pairwise
        connected to every other cell in that row in both directions.
        
        Args:
            data: pandas DataFrame to convert to graph
            primary_key_column: Optional explicit primary key column. If omitted,
                the builder chooses an identifier-looking unique column, then the
                first unique column, then the first column as a fallback.
        """
        if data.empty:
            print("[WARN] DataFrame is empty; no graph nodes were created")
            return

        primary_key_column = primary_key_column or self._infer_primary_key_column(data)
        if primary_key_column not in data.columns:
            raise ValueError(f"Primary key column not found: {primary_key_column}")

        self._create_constraints()

        with self.driver.session(database=self.database) as session:
            for row_index, (_, row) in enumerate(data.iterrows()):
                row_id = f"row_{row_index}"
                primary_value = self._cell_value(row[primary_key_column])
                if primary_value is None:
                    primary_value = row_id

                primary_node_id = self._node_id(
                    row_index,
                    primary_key_column,
                    primary_value,
                    is_primary=True
                )

                session.run(
                    """
                    MERGE (r:DataRow:RowGroup:Community {id: $row_id})
                    SET r.row_index = $row_index,
                        r.group_id = $row_id,
                        r.primary_key_column = $primary_key_column,
                        r.primary_key_value = $primary_key_value,
                        r.name = $primary_key_value
                    MERGE (p:Cell:PrimaryEntity {id: $primary_node_id})
                    SET p.value = $primary_key_value,
                        p.column = $primary_key_column,
                        p.row_index = $row_index,
                        p.is_primary_key = true,
                        p.group_id = $row_id,
                        p.primary_key_column = $primary_key_column,
                        p.primary_key_value = $primary_key_value
                    MERGE (r)-[:HAS_PRIMARY_KEY]->(p)
                    MERGE (p)-[:PRIMARY_KEY_OF]->(r)
                    MERGE (r)-[:GROUP_HAS_CELL {column: $primary_key_column}]->(p)
                    MERGE (p)-[:CELL_IN_GROUP {column: $primary_key_column}]->(r)
                    """,
                    row_id=row_id,
                    row_index=row_index,
                    primary_key_column=primary_key_column,
                    primary_key_value=primary_value,
                    primary_node_id=primary_node_id
                )

                cell_nodes = []
                for col, value in row.items():
                    normalized_value = self._cell_value(value)
                    if normalized_value is None:
                        continue

                    if col == primary_key_column:
                        cell_nodes.append({
                            "id": primary_node_id,
                            "column": str(col),
                            "value": normalized_value,
                            "is_primary": True
                        })
                        continue

                    cell_id = self._node_id(row_index, str(col), normalized_value, is_primary=False)
                    cell_nodes.append({
                        "id": cell_id,
                        "column": str(col),
                        "value": normalized_value,
                        "is_primary": False
                    })

                    session.run(
                        """
                        MATCH (p:PrimaryEntity {id: $primary_node_id})
                        MERGE (c:Cell:ColumnValue {id: $cell_id})
                        SET c.value = $value,
                            c.column = $column,
                            c.row_index = $row_index,
                            c.is_primary_key = false,
                            c.group_id = $row_id,
                            c.primary_key_column = $primary_key_column,
                            c.primary_key_value = $primary_key_value
                        MERGE (p)-[:HAS_FIELD {column: $column, row_index: $row_index}]->(c)
                        MERGE (c)-[:FIELD_OF {column: $column, row_index: $row_index}]->(p)
                        WITH p, c
                        MATCH (r:RowGroup {id: $row_id})
                        MERGE (r)-[:GROUP_HAS_CELL {column: $column}]->(c)
                        MERGE (c)-[:CELL_IN_GROUP {column: $column}]->(r)
                        """,
                        primary_node_id=primary_node_id,
                        cell_id=cell_id,
                        value=normalized_value,
                        column=str(col),
                        row_id=row_id,
                        row_index=row_index,
                        primary_key_column=primary_key_column,
                        primary_key_value=primary_value
                    )

                related_pairs = []
                for left_index, left_cell in enumerate(cell_nodes):
                    for right_cell in cell_nodes[left_index + 1:]:
                        related_pairs.append({
                            "left_id": left_cell["id"],
                            "right_id": right_cell["id"],
                            "left_column": left_cell["column"],
                            "right_column": right_cell["column"],
                            "row_id": row_id,
                            "row_index": row_index,
                            "primary_key_value": primary_value
                        })

                if related_pairs:
                    session.run(
                        """
                        UNWIND $pairs AS pair
                        MATCH (left:Cell {id: pair.left_id})
                        MATCH (right:Cell {id: pair.right_id})
                        MERGE (left)-[:RELATED_IN_ROW {
                            row_id: pair.row_id,
                            from_column: pair.left_column,
                            to_column: pair.right_column
                        }]->(right)
                        MERGE (right)-[:RELATED_IN_ROW {
                            row_id: pair.row_id,
                            from_column: pair.right_column,
                            to_column: pair.left_column
                        }]->(left)
                        """,
                        pairs=related_pairs
                    )
        
        print(
            f"[OK] Created {len(data)} row communities "
            f"using primary key column '{primary_key_column}'"
        )

    
    def build_from_dataframe(
        self,
        data: pd.DataFrame,
        clear_existing: bool = True,
        primary_key_column: Optional[str] = None
    ):
        """
        Build knowledge graph from DataFrame
        
        Args:
            data: pandas DataFrame
            clear_existing: Whether to clear existing graph before building
            primary_key_column: Optional explicit primary key column
        """
        if clear_existing:
            self.clear_graph()
        
        print(f"Building graph from DataFrame with shape {data.shape}...")
        resolved_primary_key = primary_key_column or self._infer_primary_key_column(data)
        self.create_nodes_and_relationships(data, resolved_primary_key)
        self._create_summary_statistics(data, resolved_primary_key)
    
    def _create_summary_statistics(self, data: pd.DataFrame, primary_key_column: str):
        """Create summary statistic nodes"""
        with self.driver.session(database=self.database) as session:
            # Create dataset metadata node
            session.run(
                """
                MERGE (ds:Dataset {name: 'DataSource'})
                SET ds.total_rows = $total_rows,
                    ds.total_columns = $total_columns,
                    ds.columns = $columns,
                    ds.primary_key_column = $primary_key_column
                """,
                total_rows=len(data),
                total_columns=len(data.columns),
                columns=",".join(map(str, data.columns)),
                primary_key_column=primary_key_column
            )
            session.run(
                """
                MATCH (ds:Dataset {name: 'DataSource'})
                MATCH (group:RowGroup)
                MERGE (ds)-[:HAS_GROUP]->(group)
                MERGE (group)-[:GROUP_IN_DATASET]->(ds)
                """
            )
    
    def query_graph(self, query: str) -> List[Dict]:
        """
        Execute a Cypher query on the graph
        
        Args:
            query: Cypher query string
            
        Returns:
            List of results
        """
        with self.driver.session(database=self.database) as session:
            results = session.run(query).data()
        return results
    
    def get_graph_stats(self) -> Dict[str, Any]:
        """Get statistics about the current graph"""
        with self.driver.session(database=self.database) as session:
            node_count = session.run("MATCH (n) RETURN count(n) as count").single()
            rel_count = session.run("MATCH ()-[r]->() RETURN count(r) as count").single()
            labels = session.run("MATCH (n) RETURN distinct labels(n) as labels LIMIT 10").data()
        
        return {
            "total_nodes": node_count['count'] if node_count else 0,
            "total_relationships": rel_count['count'] if rel_count else 0,
            "node_labels": labels
        }
    
    def search_entity(self, entity_value: str, limit: int = 10000) -> List[Dict]:
        """
        Search for an entity in the graph
        
        Args:
            entity_value: Value to search for
            
        Returns:
            List of matching nodes
        """
        entity_value = str(entity_value).strip()
        if not entity_value:
            return []

        limit = max(1, int(limit))
        with self.driver.session(database=self.database) as session:
            allow_contains = len(entity_value.strip()) > 2
            return session.run(
                """
                CALL {
                    MATCH (n:Cell)
                    WHERE toLower(toString(n.value)) = toLower($entity_value)
                       OR toLower(toString(n.id)) = toLower($entity_value)
                       OR (
                            $allow_contains
                            AND (
                                toLower(toString(n.value)) CONTAINS toLower($entity_value)
                                OR toLower(toString(n.id)) CONTAINS toLower($entity_value)
                            )
                       )
                    OPTIONAL MATCH (n)-[:CELL_IN_GROUP]->(group:RowGroup)
                    RETURN distinct
                        n.value AS value,
                        labels(n) AS labels,
                        n.column AS column,
                        n.row_index AS row_index,
                        group.id AS group_id,
                        group.primary_key_column AS primary_key_column,
                        group.primary_key_value AS primary_key_value
                    UNION
                    MATCH (group:RowGroup)
                    WHERE toLower(toString(group.id)) = toLower($entity_value)
                       OR toLower(toString(group.primary_key_value)) = toLower($entity_value)
                       OR (
                            $allow_contains
                            AND (
                                toLower(toString(group.id)) CONTAINS toLower($entity_value)
                                OR toLower(toString(group.primary_key_value)) CONTAINS toLower($entity_value)
                            )
                       )
                    RETURN distinct
                        group.primary_key_value AS value,
                        labels(group) AS labels,
                        group.primary_key_column AS column,
                        group.row_index AS row_index,
                        group.id AS group_id,
                        group.primary_key_column AS primary_key_column,
                        group.primary_key_value AS primary_key_value
                }
                RETURN distinct
                    value,
                    labels,
                    column,
                    row_index,
                    group_id,
                    primary_key_column,
                    primary_key_value
                LIMIT $limit
                """,
                entity_value=entity_value,
                allow_contains=allow_contains,
                limit=limit
            ).data()
    
    def search_rows_matching_all_criteria(self, search_values: List[str], limit: int = 10000) -> List[Dict]:
        """
        Find all row groups that contain ALL of the given search values.
        
        This is used for multi-criteria queries to ensure we get complete rows
        matching all filter conditions, not just any single condition.
        
        Args:
            search_values: List of values to search for (ALL must be present in same row)
            limit: Maximum number of row contexts to return
            
        Returns:
            List of complete row contexts matching ALL criteria
        """
        search_values = [str(v).strip() for v in search_values if str(v).strip()]
        if not search_values:
            return []

        limit = max(1, int(limit))
        
        with self.driver.session(database=self.database) as session:
            # Build search conditions for each value
            search_conditions = []
            for idx, value in enumerate(search_values):
                allow_contains = len(value.strip()) > 2
                search_conditions.append({
                    "value": value,
                    "allow_contains": allow_contains,
                    "param_name": f"search_value_{idx}"
                })
            
            # Create a query that finds rows containing ALL search values
            # Each value must be found in a cell within the same row group
            where_clauses = []
            for idx, condition in enumerate(search_conditions):
                param = condition["param_name"]
                where_clauses.append(
                    f"""
                    EXISTS(
                        (group)-[:GROUP_HAS_CELL]->(cell_{idx}:Cell)
                        WHERE toLower(toString(cell_{idx}.value)) = toLower(${param})
                           OR toLower(toString(cell_{idx}.id)) = toLower(${param})
                           OR (
                                $allow_contains_{idx}
                                AND (
                                    toLower(toString(cell_{idx}.value)) CONTAINS toLower(${param})
                                    OR toLower(toString(cell_{idx}.id)) CONTAINS toLower(${param})
                                )
                           )
                    )
                    """
                )
            
            where_clause = " AND ".join(where_clauses)
            
            # Build parameters dict
            params = {}
            for condition in search_conditions:
                params[condition["param_name"]] = condition["value"]
                params[f"allow_contains_{search_conditions.index(condition)}"] = condition["allow_contains"]
            params["limit"] = limit
            
            query = f"""
                MATCH (group:RowGroup)
                WHERE {where_clause}
                OPTIONAL MATCH (group)-[:GROUP_HAS_CELL]->(cell:Cell)
                WITH group, cell
                ORDER BY group.row_index, cell.column
                WITH group,
                     [field IN collect(
                        CASE
                            WHEN cell IS NULL THEN NULL
                            ELSE {{column: cell.column, value: cell.value}}
                        END
                     ) WHERE field IS NOT NULL] AS fields
                RETURN {{
                    group_id: group.id,
                    primary_key_column: group.primary_key_column,
                    primary_key_value: group.primary_key_value,
                    row_index: group.row_index,
                    row_fields: fields
                }} AS row_context
                ORDER BY group.row_index
                LIMIT $limit
            """
            
            return session.run(query, **params).data()
    
    def get_entity_context(
        self,
        entity_value: str,
        depth: int = 1,
        limit: int = 10000
    ) -> List[Dict]:
        """
        Get context around an entity
        
        Args:
            entity_value: Entity to explore
            depth: How many hops to traverse
            
        Returns:
            Context graph
        """
        entity_value = str(entity_value).strip()
        if not entity_value:
            return []

        depth = max(1, min(int(depth), 3))
        limit = max(1, int(limit))
        with self.driver.session(database=self.database) as session:
            allow_contains = len(entity_value.strip()) > 2
            return session.run(
                """
                MATCH (seed)
                WHERE (
                    seed:Cell
                    AND (
                        toLower(toString(seed.value)) = toLower($entity_value)
                        OR toLower(toString(seed.id)) = toLower($entity_value)
                        OR (
                            $allow_contains
                            AND (
                                toLower(toString(seed.value)) CONTAINS toLower($entity_value)
                                OR toLower(toString(seed.id)) CONTAINS toLower($entity_value)
                            )
                        )
                    )
                )
                OR (
                    seed:RowGroup
                    AND (
                        toLower(toString(seed.id)) = toLower($entity_value)
                        OR toLower(toString(seed.primary_key_value)) = toLower($entity_value)
                        OR (
                            $allow_contains
                            AND (
                                toLower(toString(seed.id)) CONTAINS toLower($entity_value)
                                OR toLower(toString(seed.primary_key_value)) CONTAINS toLower($entity_value)
                            )
                        )
                    )
                )
                WITH seed
                OPTIONAL MATCH (seed)-[:CELL_IN_GROUP]->(cell_group:RowGroup)
                WITH seed, coalesce(cell_group, seed) AS group
                OPTIONAL MATCH (group)-[:HAS_PRIMARY_KEY]->(primary_cell:Cell)
                WITH
                    CASE
                        WHEN "Cell" IN labels(seed) THEN seed
                        ELSE primary_cell
                    END AS matched,
                    group
                OPTIONAL MATCH (group)-[:GROUP_HAS_CELL]->(cell:Cell)
                WITH matched, group, cell
                ORDER BY cell.column
                WITH matched, group,
                     [field IN collect(
                        CASE
                            WHEN cell IS NULL THEN NULL
                            ELSE {column: cell.column, value: cell.value}
                        END
                     ) WHERE field IS NOT NULL] AS fields
                OPTIONAL MATCH path = (matched)-[*1..%s]-(neighbor:Cell)
                WITH matched, group, fields,
                     [nearby IN collect(distinct
                        CASE
                            WHEN neighbor IS NULL THEN NULL
                            ELSE {
                                column: neighbor.column,
                                value: neighbor.value,
                                distance: length(path)
                            }
                        END
                     ) WHERE nearby IS NOT NULL][..25] AS nearby_values
                RETURN distinct {
                    matched_column: matched.column,
                    matched_value: matched.value,
                    group_id: group.id,
                    primary_key_column: group.primary_key_column,
                    primary_key_value: group.primary_key_value,
                    row_index: group.row_index,
                    row_fields: fields,
                    nearby_values: nearby_values
                } AS row_context
                LIMIT $limit
                """ % depth,
                entity_value=entity_value,
                allow_contains=allow_contains,
                limit=limit
            ).data()

    def get_all_row_contexts(self, limit: int = 50000) -> List[Dict]:
        """
        Return row context for every row group in the graph.

        This is used for dataset-wide questions where limiting to the first few
        entity matches would produce incomplete answers.
        """
        limit = max(1, int(limit))
        with self.driver.session(database=self.database) as session:
            return session.run(
                """
                MATCH (group:RowGroup)
                OPTIONAL MATCH (group)-[:GROUP_HAS_CELL]->(cell:Cell)
                WITH group, cell
                ORDER BY group.row_index, cell.column
                WITH group,
                     [field IN collect(
                        CASE
                            WHEN cell IS NULL THEN NULL
                            ELSE {column: cell.column, value: cell.value}
                        END
                     ) WHERE field IS NOT NULL] AS fields
                RETURN {
                    group_id: group.id,
                    primary_key_column: group.primary_key_column,
                    primary_key_value: group.primary_key_value,
                    row_index: group.row_index,
                    row_fields: fields
                } AS row_context
                ORDER BY group.row_index
                LIMIT $limit
                """,
                limit=limit
            ).data()
