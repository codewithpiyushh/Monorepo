"""
LLM Interface module for Gemini API integration
"""

import google.generativeai as genai
from typing import List, Dict, Any, Optional
import json


class GeminiLLMInterface:
    """Interface to Google Gemini API for LLM operations"""
    
    def __init__(self, api_key: str, model: str = "gemini-pro"):
        """
        Initialize Gemini LLM interface
        
        Args:
            api_key: Google Gemini API key
            model: Model to use (default: gemini-pro)
        """
        self.api_key = api_key
        self.model_name = model
        
        # Configure the API
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model)
        
        print(f"[OK] Initialized Gemini LLM ({model})")
    
    def generate_text(self, prompt: str, temperature: float = 0.7, max_tokens: int = 2048) -> str:
        """
        Generate text using Gemini
        
        Args:
            prompt: Input prompt
            temperature: Temperature for generation (0-1)
            max_tokens: Maximum tokens in response
            
        Returns:
            Generated text
        """
        try:
            response = self.model.generate_content(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    temperature=temperature,
                    max_output_tokens=max_tokens,
                )
            )
            return response.text
        except Exception as e:
            return f"Error generating text: {str(e)}"
    
    def extract_entities(self, text: str) -> List[Dict[str, str]]:
        """
        Extract entities from text using Gemini
        
        Args:
            text: Input text
            
        Returns:
            List of extracted entities with types
        """
        prompt = f"""Extract entities from the following text. Return as JSON list with 'entity' and 'type' keys.
        
Text: {text}

Return ONLY valid JSON, no other text."""
        
        try:
            response = self.generate_text(prompt)
            entities = json.loads(response)
            return entities
        except:
            return []
    
    def generate_graph_insights(self, graph_data: str) -> str:
        """
        Generate insights from graph data
        
        Args:
            graph_data: String representation of graph data
            
        Returns:
            Insights about the data
        """
        prompt = f"""Analyze the following knowledge graph data and provide key insights, patterns, and relationships.

Graph Data:
{graph_data}

Provide a comprehensive analysis with:
1. Key entities and their importance
2. Main relationships and patterns
3. Potential insights from the connections
4. Anomalies or interesting findings"""
        
        return self.generate_text(prompt)
    
    def generate_query_response(self, question: str, context: str) -> str:
        """
        Generate response to a question using graph context
        
        Args:
            question: User's question
            context: Context from the graph
            
        Returns:
            Generated response
        """
        prompt = f"""You are a helpful assistant analyzing tabular data from a Neo4j knowledge graph.

User Question: {question}

Relevant Graph Context:
{context}

Each "Matched Row Context" is one row group/community from the original dataset.
Use the row_fields inside the matched row group as the authoritative values for
that row. Use related_row_groups only when the question asks about connected or
similar rows.

Based on the provided graph context, answer the user's question accurately.
If the answer cannot be determined from the context, say so clearly.
Cite specific entities and relationships from the graph when relevant."""
        
        return self.generate_text(prompt)
    
    def summarize_data(self, data: str, max_length: int = 500) -> str:
        """
        Summarize data
        
        Args:
            data: Data to summarize
            max_length: Maximum length of summary
            
        Returns:
            Summary
        """
        prompt = f"""Provide a concise summary of the following data in {max_length} characters or less:

{data}"""
        
        return self.generate_text(prompt)
    
    def rephrase_question(self, question: str) -> str:
        """
        Rephrase question for better graph matching
        
        Args:
            question: Original question
            
        Returns:
            Rephrased question
        """
        prompt = f"""Rephrase the following question to be more specific and structured for querying a knowledge graph:

Question: {question}

Return ONLY the rephrased question, no other text."""
        
        response = self.generate_text(prompt, temperature=0.3)
        return response.strip()
    
    def generate_cypher_suggestion(self, question: str, graph_schema: str) -> str:
        """
        Generate a Cypher query suggestion for a question
        
        Args:
            question: User's question
            graph_schema: Graph schema/structure description
            
        Returns:
            Suggested Cypher query
        """
        prompt = f"""Given the following graph schema and question, suggest a Cypher query.

Graph Schema:
{graph_schema}

Question: {question}

Return ONLY the Cypher query, no other text. The query should be valid Neo4j Cypher syntax."""
        
        response = self.generate_text(prompt, temperature=0.3)
        return response.strip()
