"""
Optional Streamlit UI: paste text and run fsd-analyzer/scripts validators locally.
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

import streamlit as st

SCRIPTS = Path(__file__).resolve().parent.parent / "scripts"


def run_script(script_name: str, content: str, suffix: str) -> tuple[int, str, str]:
    """Write content to a temp file and run script. Returns (code, stdout, stderr)."""
    script_path = SCRIPTS / script_name
    if not script_path.is_file():
        return 1, "", f"Script not found: {script_path}"

    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        suffix=suffix,
        delete=False,
    ) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        proc = subprocess.run(
            [sys.executable, str(script_path), tmp_path],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        return proc.returncode, proc.stdout, proc.stderr
    finally:
        Path(tmp_path).unlink(missing_ok=True)


st.set_page_config(page_title="FSD Analyzer Helper", layout="wide")
st.title("FSD Analyzer — local helpers")
st.caption("Runs Python scripts from `fsd-analyzer/scripts/`. For AI gap/consistency analysis, use the skill in your IDE.")

tab_fsd, tab_spec, tab_dbml = st.tabs(["FSD → extract hints", "Validate spec.md", "Validate DBML"])

with tab_fsd:
    st.markdown("Heuristic **entity/table** hints from FSD markdown (`extract_entities.py`).")
    fsd_text = st.text_area("Paste FSD (Markdown)", height=280, key="fsd")
    if st.button("Run extract_entities", key="btn_fsd"):
        if not fsd_text.strip():
            st.warning("Paste FSD text first.")
        else:
            code, out, err = run_script("extract_entities.py", fsd_text, ".md")
            st.subheader("stdout")
            st.code(out or "(empty)", language="markdown")
            if err.strip():
                st.subheader("stderr")
                st.code(err, language="text")
            st.caption(f"Exit code: {code}")

with tab_spec:
    st.markdown("Structure check for **spec_api**-style markdown (`validate_spec.py`).")
    spec_text = st.text_area("Paste API spec (Markdown)", height=280, key="spec")
    if st.button("Run validate_spec", key="btn_spec"):
        if not spec_text.strip():
            st.warning("Paste spec text first.")
        else:
            code, out, err = run_script("validate_spec.py", spec_text, ".md")
            st.subheader("stdout")
            st.code(out or "(empty)", language="text")
            if err.strip():
                st.subheader("stderr")
                st.code(err, language="text")
            st.caption(f"Exit code: {code}")

with tab_dbml:
    st.markdown("**DBML** syntax check — paste raw DBML or markdown that contains a ` ```dbml ` fence (`validate_erd.py`).")
    dbml_text = st.text_area("Paste DBML or Markdown", height=280, key="dbml")
    if st.button("Run validate_erd", key="btn_dbml"):
        if not dbml_text.strip():
            st.warning("Paste DBML first.")
        else:
            code, out, err = run_script("validate_erd.py", dbml_text, ".md")
            st.subheader("stdout")
            st.code(out or "(empty)", language="text")
            if err.strip():
                st.subheader("stderr")
                st.code(err, language="text")
            st.caption(f"Exit code: {code}")

st.divider()
st.markdown(
    "**compare_artifacts** (CLI): `python scripts/compare_artifacts.py --fsd path/to/fsd.md --erd path/to/erd.md`"
)
