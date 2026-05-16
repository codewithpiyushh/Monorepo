"""
Query Engine for GraphRAG - Main query processing and retrieval
"""

import json
import re
from typing import Any, Dict, List

from ..graph import GraphBuilder
from ..llm import GeminiLLMInterface


class GraphRAGQueryEngine:
    """Main query engine combining graph search and LLM"""
    
    def __init__(self, graph_builder: GraphBuilder, llm_interface: GeminiLLMInterface):
        """
        Initialize query engine
        
        Args:
            graph_builder: GraphBuilder instance
            llm_interface: GeminiLLMInterface instance
        """
        self.graph = graph_builder
        self.llm = llm_interface
        self.query_history = []
    
    def search_and_retrieve(
        self,
        query: str,
        top_k: int = 1000,
        max_context_rows: int = 5000
    ) -> Dict[str, Any]:
        """
        Search graph for relevant information
        
        Args:
            query: Search query
            top_k: Number of search results to retrieve per search term
            max_context_rows: Maximum row communities to send to the LLM
            
        Returns:
            Retrieved information from graph
        """
        # Extract entities from query using LLM
        entities = self.llm.extract_entities(query)
        entities = self._normalize_entities(entities)
        search_terms = []
        for entity_info in entities:
            search_terms.append(entity_info["entity"])
        search_terms.extend(self._fallback_search_terms(query))
        search_terms = list(dict.fromkeys(search_terms))
        
        retrieved_data = {
            "entities": entities,
            "search_results": [],
            "context": [],
            "retrieval_mode": "entity"
        }

        if self._requires_full_dataset(query):
            retrieved_data["context"] = self.graph.get_all_row_contexts(limit=max_context_rows)
            retrieved_data["retrieval_mode"] = "full_dataset"
            return retrieved_data
        
        # If multiple search terms, try multi-criteria search first to find rows with ALL terms
        if len(search_terms) > 1:
            multi_criteria_results = self.graph.search_rows_matching_all_criteria(
                search_terms, 
                limit=max_context_rows
            )
            if multi_criteria_results:
                retrieved_data["context"] = multi_criteria_results
                retrieved_data["retrieval_mode"] = "multi_criteria"
                return retrieved_data
        
        # Fallback: Search for each entity individually
        for entity_value in search_terms:
            results = self.graph.search_entity(entity_value, limit=top_k)
            retrieved_data["search_results"].extend(results[:top_k])

            # Get context around the entity
            context = self.graph.get_entity_context(entity_value, limit=max_context_rows)
            retrieved_data["context"].extend(context)

        retrieved_data["context"] = self._deduplicate_context(retrieved_data["context"])

        if not retrieved_data["context"]:
            retrieved_data["context"] = self.graph.get_all_row_contexts(limit=max_context_rows)
            retrieved_data["retrieval_mode"] = "full_dataset_fallback"
        
        return retrieved_data

    def _requires_full_dataset(self, query: str) -> bool:
        """Return whether a question should be answered from all row groups."""
        normalized = query.lower()
        full_dataset_patterns = [
            r"\ball\b",
            r"\bevery\b",
            r"\beach\b",
            r"\bentire\b",
            r"\bwhole\b",
            r"\bdataset\b",
            r"\btable\b",
            r"\btotal\b",
            r"\bcount\b",
            r"\baverage\b",
            r"\bmean\b",
            r"\bsum\b",
            r"\bminimum\b",
            r"\bmaximum\b",
            r"\bmin\b",
            r"\bmax\b",
            r"\bhighest\b",
            r"\blowest\b",
            r"\btop\b",
            r"\bbottom\b",
            r"\blist\b",
            r"\bcompare\b",
            r"\boverall\b",
            r"\bsummary\b",
            r"\btrend\b",
            r"\bpattern\b",
            r"\bperformance\b",
        ]
        return any(re.search(pattern, normalized) for pattern in full_dataset_patterns)

    def _deduplicate_context(self, context_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Keep one row context per row group while preserving retrieval order."""
        deduplicated = []
        seen_group_ids = set()
        for item in context_items:
            row_context = item.get("row_context", item)
            group_id = row_context.get("group_id")
            if group_id and group_id in seen_group_ids:
                continue
            if group_id:
                seen_group_ids.add(group_id)
            deduplicated.append(item)
        return deduplicated

    def _normalize_entities(self, entities: Any) -> List[Dict[str, str]]:
        """Normalize LLM entity output into a predictable list of dictionaries."""
        if isinstance(entities, dict):
            entities = [entities]
        elif not isinstance(entities, list):
            entities = []

        normalized = []
        for entity_info in entities:
            if isinstance(entity_info, dict) and entity_info.get("entity"):
                normalized.append({
                    "entity": str(entity_info.get("entity")),
                    "type": str(entity_info.get("type", "unknown"))
                })
            elif isinstance(entity_info, str) and entity_info.strip():
                normalized.append({
                    "entity": entity_info.strip(),
                    "type": "unknown"
                })
        return normalized

    def _fallback_search_terms(self, query: str) -> List[str]:
        """Extract simple graph search terms when LLM entity extraction is empty."""
        stop_words = {
            "what", "when", "where", "which", "who", "whose", "tell", "show",
            "about", "from", "that", "this", "with", "the", "and", "for",
            "row", "data", "dataset", "column", "columns", "value", "values"
        }
        terms = []
        for row_term in re.findall(r"\brow\s+([A-Za-z0-9_.@/-]+)", query, flags=re.IGNORECASE):
            if row_term.lower() not in stop_words:
                terms.append(row_term)

        for term in re.findall(r"[A-Za-z0-9_.@/-]+", query):
            normalized = term.lower()
            if normalized in stop_words or term in terms:
                continue
            if len(term) > 2 or term.isupper() or term.isdigit():
                terms.append(term)
        return terms[:5]
    
    def format_context_for_llm(self, context: Dict[str, Any]) -> str:
        """
        Format retrieved context for LLM processing
        
        Args:
            context: Retrieved context
            
        Returns:
            Formatted context string
        """
        formatted = "Retrieved Context from Knowledge Graph:\n"
        formatted += "=" * 50 + "\n\n"
        
        # Add entities
        if context.get("entities"):
            formatted += "Entities Mentioned:\n"
            for entity in context["entities"]:
                formatted += f"  - {entity.get('entity')} ({entity.get('type', 'unknown')})\n"
            formatted += "\n"
        
        # Add search results
        if context.get("search_results"):
            formatted += "Search Results:\n"
            for result in context["search_results"]:
                formatted += f"  - {json.dumps(result, indent=2)}\n"
            formatted += "\n"

        # Add row context from graph traversal
        if context.get("context"):
            retrieval_mode = context.get("retrieval_mode", "entity")
            formatted += f"Matched Row Context ({retrieval_mode}):\n"
            formatted += f"Total row groups supplied: {len(context['context'])}\n"
            for item in context["context"]:
                row_context = item.get("row_context", item)
                formatted += f"  - {json.dumps(row_context, indent=2)}\n"
            formatted += "\n"
        
        return formatted
    
    def answer_question(self, question: str, use_graph_context: bool = True) -> Dict[str, Any]:
        """
        Answer a question using the knowledge graph and LLM
        
        Args:
            question: User's question
            use_graph_context: Whether to use graph context
            
        Returns:
            Answer and metadata
        """
        result = {
            "question": question,
            "answer": "",
            "confidence": 0.0,
            "sources": [],
            "reasoning": ""
        }
        
        try:
            # Search the graph for relevant information
            if use_graph_context:
                context = self.search_and_retrieve(question)
                formatted_context = self.format_context_for_llm(context)
                result["sources"] = context.get("search_results", [])
                result["retrieved_row_groups"] = len(context.get("context", []))
                result["retrieval_mode"] = context.get("retrieval_mode", "entity")
            else:
                formatted_context = ""
            
            # Generate answer using LLM with graph context
            answer = self.llm.generate_query_response(question, formatted_context)
            result["answer"] = answer
            result["confidence"] = 0.85  # Placeholder confidence
            result["reasoning"] = (
                f"Generated from {result.get('retrieved_row_groups', 0)} "
                f"retrieved row groups"
            )
            
        except Exception as e:
            result["answer"] = f"Error processing question: {str(e)}"
            result["confidence"] = 0.0
        
        # Store in history
        self.query_history.append(result)
        
        return result
    
    def batch_answer_questions(self, questions: List[str]) -> List[Dict[str, Any]]:
        """
        Answer multiple questions
        
        Args:
            questions: List of questions
            
        Returns:
            List of answers
        """
        results = []
        for question in questions:
            result = self.answer_question(question)
            results.append(result)
            print(f"[OK] Answered: {question[:50]}...")
        
        return results
    
    def get_graph_summary(self) -> str:
        """
        Get a summary of the knowledge graph
        
        Returns:
            Summary description
        """
        stats = self.graph.get_graph_stats()
        
        summary_text = f"""
Knowledge Graph Summary:
- Total Nodes: {stats.get('total_nodes', 0)}
- Total Relationships: {stats.get('total_relationships', 0)}
- Node Types: {len(stats.get('node_labels', []))}
"""
        
        # Generate insights using LLM
        insights = self.llm.generate_graph_insights(summary_text)
        
        return f"{summary_text}\n\nGenerated Insights:\n{insights}"
    
    def explore_relationships(self, entity: str, depth: int = 2) -> Dict[str, Any]:
        """
        Explore relationships around an entity
        
        Args:
            entity: Entity to explore
            depth: Depth of exploration
            
        Returns:
            Relationship information
        """
        context = self.graph.get_entity_context(entity, depth=depth)
        
        return {
            "entity": entity,
            "depth": depth,
            "relationships": context,
            "count": len(context)
        }
    
    def get_query_history(self) -> List[Dict[str, Any]]:
        """Get history of answered questions"""
        return self.query_history
    
    def clear_history(self):
        """Clear query history"""
        self.query_history = []
