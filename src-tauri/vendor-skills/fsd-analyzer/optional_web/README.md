# FSD Analyzer — optional web UI

Minimal **Streamlit** helper to paste FSD/spec/DBML and run local **scripts** (no cloud LLM required).

## Setup

```bash
cd fsd-analyzer/optional_web
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
```

Optional: copy `.env.example` to `.env` if you add API keys later.

## Run

```bash
streamlit run app.py
```

## What it does

- **Extract entities** — runs `scripts/extract_entities.py` on pasted FSD text.
- **Validate spec** — runs `validate_spec.py` on pasted spec markdown.
- **Validate DBML** — runs `validate_erd.py` on pasted DBML or markdown containing a ` ```dbml ` fence.

For full AI-driven gap analysis and consistency checks, use the skill in **Cursor / Claude Code / OpenCode** with `@` file context.
