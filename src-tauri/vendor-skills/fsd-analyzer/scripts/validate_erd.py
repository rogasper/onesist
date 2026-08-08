#!/usr/bin/env python3
"""
Lightweight DBML / ERD validation (no external deps).
- Parses Table blocks: Table name { ... }
- Parses Ref lines: Ref: a.b > c.d  or Ref: a.b - c.d
Reports missing table references and empty tables.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


TABLE_RE = re.compile(
    r"^\s*Table\s+([\w.\"`]+)\s*\{",
    re.IGNORECASE | re.MULTILINE,
)
# Column line: name type [modifiers] or name type
COL_LINE_RE = re.compile(
    r"^\s*([\w\"`]+)\s+[\w()[\].,\"\s]+",
    re.MULTILINE,
)
REF_RE = re.compile(
    r"^\s*Ref\s*:\s*([\w.\"`]+)\s*([-><\-]+)\s*([\w.\"`]+)\s*$",
    re.IGNORECASE | re.MULTILINE,
)


def strip_quotes(name: str) -> str:
    return name.strip().strip('"').strip("`")


def parse_tables(content: str) -> dict[str, list[str]]:
    """Return table_name -> list of column names (best-effort)."""
    tables: dict[str, list[str]] = {}
    lines = content.splitlines()
    i = 0
    while i < len(lines):
        m = TABLE_RE.match(lines[i])
        if not m:
            i += 1
            continue
        tname = strip_quotes(m.group(1))
        cols: list[str] = []
        i += 1
        while i < len(lines):
            if re.match(r"^\s*}\s*$", lines[i]):
                break
            cm = COL_LINE_RE.match(lines[i])
            if cm and not lines[i].strip().startswith("//"):
                c0 = strip_quotes(cm.group(1))
                if c0.lower() not in ("table", "enum", "ref", "indexes", "index"):
                    cols.append(c0)
            i += 1
        tables[tname] = cols
        i += 1
    return tables


def parse_refs(content: str) -> list[tuple[str, str, str, str]]:
    """Return list of (from_table, from_col, to_table, to_col)."""
    refs: list[tuple[str, str, str, str]] = []
    for m in REF_RE.finditer(content):
        left, _, right = m.group(1), m.group(2), m.group(3)
        if "." not in left or "." not in right:
            continue
        ft, fc = left.rsplit(".", 1)
        tt, tc = right.rsplit(".", 1)
        refs.append(
            (strip_quotes(ft), strip_quotes(fc), strip_quotes(tt), strip_quotes(tc))
        )
    return refs


def validate_dbml(content: str) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    tables = parse_tables(content)
    if not tables:
        warnings.append("No Table { ... } blocks found (is this DBML?).")

    for name, cols in tables.items():
        if not cols:
            warnings.append(f"Table '{name}' has no parsed columns (check syntax or use Note).")

    refs = parse_refs(content)
    table_names = set(tables.keys())
    for ft, fc, tt, tc in refs:
        if ft not in table_names:
            errors.append(f"Ref FK: source table '{ft}' not defined.")
        if tt not in table_names:
            errors.append(f"Ref FK: target table '{tt}' not defined.")
        if ft in table_names and fc not in tables[ft]:
            warnings.append(f"Ref: column '{fc}' not seen in table '{ft}' (verify manually).")
        if tt in table_names and tc not in tables[tt]:
            warnings.append(f"Ref: column '{tc}' not seen in table '{tt}' (verify manually).")

    return errors, warnings


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate DBML structure (tables + refs).")
    parser.add_argument("path", type=Path, help="Path to .dbml file or markdown containing dbml fence")
    args = parser.parse_args()
    raw = args.path.read_text(encoding="utf-8", errors="replace")

    # Extract ```dbml ... ``` if present
    fence = re.search(r"```dbml\s*([\s\S]*?)```", raw, re.IGNORECASE)
    content = fence.group(1) if fence else raw

    errors, warnings = validate_dbml(content)
    for w in warnings:
        print(f"WARN: {w}", file=sys.stderr)
    for e in errors:
        print(f"ERROR: {e}", file=sys.stderr)

    if errors:
        return 1
    print("OK: DBML structure check passed (see warnings above if any).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
