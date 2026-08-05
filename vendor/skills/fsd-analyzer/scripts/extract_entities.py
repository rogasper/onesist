#!/usr/bin/env python3
"""
Extract likely entity/table names and API-ish phrases from FSD markdown (heuristic).
Useful for gap analysis prep or quick inventory.
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path


TABLE_LINE_RE = re.compile(
    r"(?:^|\n)\s*(?:###?\s*)?(?:\d+\.\d+\s*)?(?P<name>[\w]+)\s+table\b",
    re.IGNORECASE,
)
def extract(text: str) -> dict[str, list[str]]:
    tables = sorted(set(TABLE_LINE_RE.findall(text)))
    # Bullets that explicitly name a snake_case or single-token table
    bullet_tables: list[str] = []
    for line in text.splitlines():
        m = re.match(
            r"^\s*[-*]\s+([a-z][a-z0-9_]*)\s+table\b",
            line,
            re.IGNORECASE,
        )
        if m:
            bullet_tables.append(m.group(1).lower())

    endpoints_hint = re.findall(
        r"\b(GET|POST|PUT|PATCH|DELETE)\s+[`']?(/[\w\-/{}\.:]+)[`']?",
        text,
        re.IGNORECASE,
    )

    merged_tables = sorted(set(tables) | set(bullet_tables))

    return {
        "tables_explicit": merged_tables,
        "http_hints": [f"{m} {p}" for m, p in endpoints_hint],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract entity/table hints from FSD markdown.")
    parser.add_argument("path", type=Path, help="Path to FSD .md")
    args = parser.parse_args()
    text = args.path.read_text(encoding="utf-8", errors="replace")
    data = extract(text)

    print("## Extracted hints (heuristic)\n")
    print("### Explicit '* table' mentions")
    for t in data["tables_explicit"]:
        print(f"- {t}")
    if not data["tables_explicit"]:
        print("- (none detected)")

    print("\n### HTTP path hints in text")
    for h in data["http_hints"][:40]:
        print(f"- {h}")
    if not data["http_hints"]:
        print("- (none detected)")


if __name__ == "__main__":
    main()
