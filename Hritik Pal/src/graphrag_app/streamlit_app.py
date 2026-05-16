"""Streamlit interface for GraphRAG."""

from __future__ import annotations

import contextlib
import io
import sys
import tempfile
from pathlib import Path
from typing import Any, Callable

import pandas as pd
import streamlit as st


PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.graphrag_app.app import GraphRAGApplication


def _capture_output(func: Callable[..., Any], *args: Any, **kwargs: Any) -> tuple[Any, str]:
    """Run a noisy application call and return its result plus console text."""
    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer), contextlib.redirect_stderr(buffer):
        result = func(*args, **kwargs)
    return result, buffer.getvalue().strip()


def _initialize_app() -> None:
    if st.session_state.get("app") is not None:
        return

    with st.spinner("Connecting to GraphRAG services..."):
        try:
            app, log = _capture_output(GraphRAGApplication)
            st.session_state.app = app
            st.session_state.init_log = log
            st.session_state.init_error = None
        except Exception as exc:
            st.session_state.app = None
            st.session_state.init_error = str(exc)
            st.session_state.init_log = None


def _save_uploaded_file(uploaded_file: Any) -> str:
    suffix = Path(uploaded_file.name).suffix
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(uploaded_file.getbuffer())
        return temp_file.name


def _show_operation_log(log: str) -> None:
    if log:
        with st.expander("Operation log"):
            st.code(log)


def _log_has_error(log: str) -> bool:
    return "[ERROR]" in log or "Error " in log or log.startswith("Error")


def _show_data_summary(app: GraphRAGApplication) -> None:
    if app.current_data is None:
        st.info("No dataset loaded.")
        return

    data = app.current_data
    rows, columns = data.shape
    metric_cols = st.columns(3)
    metric_cols[0].metric("Rows", f"{rows:,}")
    metric_cols[1].metric("Columns", f"{columns:,}")
    metric_cols[2].metric("Missing values", f"{int(data.isna().sum().sum()):,}")

    st.subheader("Preview")
    st.dataframe(data.head(50), use_container_width=True, hide_index=True)

    with st.expander("Column details"):
        stats = app.data_ingestion.get_statistics()
        details = pd.DataFrame(
            {
                "column": stats["columns"],
                "type": [str(stats["data_types"][column]) for column in stats["columns"]],
                "missing": [int(stats["missing_values"][column]) for column in stats["columns"]],
            }
        )
        st.dataframe(details, use_container_width=True, hide_index=True)


def _show_answer(result: dict[str, Any]) -> None:
    answer = result.get("answer") or "No answer generated."
    st.markdown(answer)

    metric_cols = st.columns(4)
    metric_cols[0].metric("Confidence", f"{result.get('confidence', 0):.0%}")
    metric_cols[1].metric("Sources", len(result.get("sources", [])))
    metric_cols[2].metric("Row groups", result.get("retrieved_row_groups", 0))
    metric_cols[3].metric("Mode", result.get("retrieval_mode", "unknown"))

    sources = result.get("sources") or []
    if sources:
        with st.expander("Sources"):
            st.dataframe(pd.DataFrame(sources), use_container_width=True, hide_index=True)


def _data_tab(app: GraphRAGApplication) -> None:
    uploaded_file = st.file_uploader("Data file", type=["csv", "xlsx", "xls"])
    file_path = st.text_input("Local path", value=st.session_state.get("file_path", "actual_vs_target_data_new.csv"))

    if st.button("Load Data", type="primary", use_container_width=True):
        selected_path = _save_uploaded_file(uploaded_file) if uploaded_file else file_path.strip()
        if not selected_path:
            st.error("Select a file first.")
            return

        with st.spinner("Loading dataset..."):
            success, log = _capture_output(app.ingest_file, selected_path)

        st.session_state.file_path = selected_path
        if success:
            st.success("Dataset loaded.")
        else:
            st.error("Dataset could not be loaded.")
        _show_operation_log(log)

    _show_data_summary(app)


def _graph_tab(app: GraphRAGApplication) -> None:
    if app.current_data is None:
        st.info("Load a dataset before building the graph.")
        return

    clear_existing = st.checkbox("Clear existing graph", value=True)
    if st.button("Build Graph", type="primary", use_container_width=True):
        with st.spinner("Building knowledge graph..."):
            _, log = _capture_output(app.build_graph, clear_existing=clear_existing)

        if _log_has_error(log):
            st.error("Graph build failed.")
        else:
            stats, stats_log = _capture_output(app.graph_builder.get_graph_stats)
            st.session_state.graph_stats = stats
            if stats_log:
                log = f"{log}\n{stats_log}".strip()
            st.success("Graph build finished.")
        _show_operation_log(log)

    if app.graph_builder is not None:
        if st.button("Refresh Graph Stats", use_container_width=True):
            stats, log = _capture_output(app.graph_builder.get_graph_stats)
            st.session_state.graph_stats = stats
            _show_operation_log(log)

        stats = st.session_state.get("graph_stats")
        if stats:
            metric_cols = st.columns(3)
            metric_cols[0].metric("Nodes", f"{stats.get('total_nodes', 0):,}")
            metric_cols[1].metric("Relationships", f"{stats.get('total_relationships', 0):,}")
            metric_cols[2].metric("Label groups", len(stats.get("node_labels", [])))


def _ask_tab(app: GraphRAGApplication) -> None:
    question = st.text_area("Question", height=100)
    if st.button("Ask", type="primary", use_container_width=True):
        if not question.strip():
            st.error("Enter a question first.")
            return

        with st.spinner("Generating answer..."):
            result, log = _capture_output(app.answer_question, question.strip())

        st.session_state.latest_answer = result
        _show_operation_log(log)

    if st.session_state.get("latest_answer"):
        _show_answer(st.session_state.latest_answer)

    st.divider()
    questions_text = st.text_area("Multiple questions", height=160)
    if st.button("Ask Multiple", use_container_width=True):
        questions = [line.strip() for line in questions_text.splitlines() if line.strip()]
        if not questions:
            st.error("Enter at least one question.")
            return

        with st.spinner("Generating answers..."):
            results, log = _capture_output(app.answer_multiple_questions, questions)

        st.session_state.batch_answers = results or []
        _show_operation_log(log)

    if st.session_state.get("batch_answers"):
        for index, result in enumerate(st.session_state.batch_answers, start=1):
            with st.expander(f"{index}. {result.get('question', 'Question')}", expanded=index == 1):
                _show_answer(result)


def main() -> None:
    st.set_page_config(page_title="GraphRAG", layout="wide")
    st.title("GraphRAG")

    _initialize_app()

    if st.session_state.get("init_error"):
        st.error(st.session_state.init_error)
        if st.button("Retry connection"):
            st.session_state.app = None
            st.session_state.init_error = None
            st.rerun()
        return

    app = st.session_state.app
    if app is None:
        return

    with st.sidebar:
        st.success("Connected")
        if st.session_state.get("init_log"):
            _show_operation_log(st.session_state.init_log)

    data_tab, graph_tab, ask_tab = st.tabs(["Data", "Graph", "Ask"])
    with data_tab:
        _data_tab(app)
    with graph_tab:
        _graph_tab(app)
    with ask_tab:
        _ask_tab(app)


if __name__ == "__main__":
    main()
