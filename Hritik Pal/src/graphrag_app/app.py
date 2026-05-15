"""
GraphRAG Main Application
Ingests CSV/Excel files, builds a knowledge graph in Neo4j, and answers questions using Gemini API
"""

import os
from pathlib import Path

from . import config
from .graph import GraphBuilder
from .ingestion import DataIngestion
from .llm import GeminiLLMInterface
from .query import GraphRAGQueryEngine


class GraphRAGApplication:
    """Main GraphRAG application"""
    
    def __init__(self):
        """Initialize the GraphRAG application"""
        self.data_ingestion = DataIngestion()
        self.graph_builder = None
        self.llm = None
        self.query_engine = None
        self.current_data = None
        
        # Initialize Neo4j connection
        self._init_neo4j()
        
        # Initialize Gemini LLM
        self._init_gemini()
    
    def _init_neo4j(self):
        """Initialize Neo4j connection"""
        print("Initializing Neo4j connection...")
        try:
            self.graph_builder = GraphBuilder(
                uri=config.NEO4J_URI,
                username=config.NEO4J_USERNAME,
                password=config.NEO4J_PASSWORD,
                database=config.NEO4J_DATABASE
            )
        except Exception as e:
            print(f"[ERROR] Error connecting to Neo4j: {str(e)}")
            raise
    
    def _init_gemini(self):
        """Initialize Gemini API"""
        print("Initializing Gemini API...")
        
        try:
            self.llm = GeminiLLMInterface(
                api_key=config.GEMINI_API_KEY,
                model=config.GEMINI_MODEL
            )
            # Initialize query engine
            self.query_engine = GraphRAGQueryEngine(self.graph_builder, self.llm)
        except Exception as e:
            print(f"[ERROR] Error initializing Gemini: {str(e)}")
            raise
    
    def ingest_file(self, file_path: str) -> bool:
        """
        Ingest a CSV or Excel file
        
        Args:
            file_path: Path to the file
            
        Returns:
            True if successful
        """
        try:
            print(f"\n{'='*60}")
            print(f"INGESTING FILE: {file_path}")
            print(f"{'='*60}\n")
            
            # Load the file
            data = self.data_ingestion.load_file(file_path)
            self.current_data = data
            
            # Show preview
            print("\nData Preview:")
            print(self.data_ingestion.get_preview(3))
            print()
            
            return True
        except Exception as e:
            print(f"[ERROR] Error ingesting file: {str(e)}")
            return False
    
    def build_graph(self, clear_existing: bool = True):
        """
        Build knowledge graph from ingested data
        
        Args:
            clear_existing: Whether to clear existing graph
        """
        if self.current_data is None:
            print("[ERROR] No data ingested yet. Please ingest a file first.")
            return
        
        try:
            print(f"\n{'='*60}")
            print("BUILDING KNOWLEDGE GRAPH")
            print(f"{'='*60}\n")
            
            self.graph_builder.build_from_dataframe(self.current_data, clear_existing=clear_existing)
            
            # Display graph statistics
            stats = self.graph_builder.get_graph_stats()
            print(f"\nGraph Statistics:")
            print(f"  Total Nodes: {stats['total_nodes']}")
            print(f"  Total Relationships: {stats['total_relationships']}")
            print()
            
        except Exception as e:
            print(f"[ERROR] Error building graph: {str(e)}")
    
    def answer_question(self, question: str) -> dict:
        """
        Answer a question using the knowledge graph and LLM
        
        Args:
            question: The question to answer
            
        Returns:
            Answer result dictionary
        """
        if self.query_engine is None:
            print("[ERROR] Query engine not initialized")
            return {}
        
        try:
            print(f"\n{'='*60}")
            print(f"QUESTION: {question}")
            print(f"{'='*60}\n")
            
            result = self.query_engine.answer_question(question)
            
            print(f"ANSWER:")
            print(f"{result['answer']}\n")
            print(f"Confidence: {result['confidence']:.2%}")
            print(f"Sources Used: {len(result['sources'])}")
            print(f"Row Groups Used: {result.get('retrieved_row_groups', 0)}")
            print(f"Retrieval Mode: {result.get('retrieval_mode', 'unknown')}")
            
            return result
        except Exception as e:
            print(f"[ERROR] Error answering question: {str(e)}")
            return {}
    
    def answer_multiple_questions(self, questions: list):
        """
        Answer multiple questions
        
        Args:
            questions: List of questions
        """
        if self.query_engine is None:
            print("[ERROR] Query engine not initialized")
            return
        
        print(f"\n{'='*60}")
        print("ANSWERING MULTIPLE QUESTIONS")
        print(f"{'='*60}\n")
        
        results = self.query_engine.batch_answer_questions(questions)
        
        return results
    
    def get_graph_summary(self) -> str:
        """Get a summary of the knowledge graph"""
        if self.query_engine is None:
            print("[ERROR] Query engine not initialized")
            return ""
        
        print(f"\n{'='*60}")
        print("GRAPH SUMMARY")
        print(f"{'='*60}\n")
        
        summary = self.query_engine.get_graph_summary()
        print(summary)
        
        return summary
    
    def explore_entity(self, entity: str, depth: int = 2):
        """
        Explore relationships around an entity
        
        Args:
            entity: Entity to explore
            depth: Depth of exploration
        """
        if self.query_engine is None:
            print("[ERROR] Query engine not initialized")
            return
        
        print(f"\n{'='*60}")
        print(f"EXPLORING ENTITY: {entity}")
        print(f"{'='*60}\n")
        
        result = self.query_engine.explore_relationships(entity, depth=depth)
        print(f"Found {result['count']} relationships")
        print(f"Relationships: {result['relationships']}")
        
        return result
    
    def get_data_statistics(self):
        """Get statistics about the current data"""
        if self.current_data is None:
            print("[ERROR] No data loaded")
            return {}
        
        stats = self.data_ingestion.get_statistics()
        
        print(f"\n{'='*60}")
        print("DATA STATISTICS")
        print(f"{'='*60}\n")
        print(f"Total Rows: {stats['total_rows']}")
        print(f"Total Columns: {stats['total_columns']}")
        print(f"Columns: {', '.join(stats['columns'])}\n")
        print("Missing Values:")
        for col, count in stats['missing_values'].items():
            print(f"  {col}: {count}")
        
        return stats
    
    def close(self):
        """Close all connections"""
        if self.graph_builder:
            self.graph_builder.close()
        print("\n[OK] Application closed")


# Example usage
def main():
    """Main execution example"""
    
    # Initialize application
    app = GraphRAGApplication()
    
    # Example: Ingest a file
    # Change this path to your CSV/Excel file
    sample_file = "data.csv"  # You can also use .xlsx
    
    if Path(sample_file).exists():
        # Ingest the file
        if app.ingest_file(sample_file):
            # Build the knowledge graph
            app.build_graph()
            
            # Answer questions
            questions = [
                "What are the main entities in this dataset?",
                "Can you summarize the relationships between entries?",
                "What patterns do you notice in the data?"
            ]
            
            for question in questions:
                app.answer_question(question)
    else:
        print(f"\n[ERROR] Sample file not found: {sample_file}")
        print("Please provide a CSV or Excel file to ingest.")
        print("\nExample usage:")
        print("  app = GraphRAGApplication()")
        print("  app.ingest_file('your_data.csv')")
        print("  app.build_graph()")
        print("  app.answer_question('Your question here?')")
    
    # Close the application
    app.close()


if __name__ == "__main__":
    main()
