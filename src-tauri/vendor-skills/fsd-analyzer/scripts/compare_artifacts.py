#!/usr/bin/env python3
"""
Compare FSD-derived table hints vs ERD/DBML table names (very heuristic).
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


def tables_from_dbml_or_md(text: str) -> set[str]:
    names: set[str] = set()
    fence = re.search(r"```dbml\s*([\s\S]*?)```", text, re.IGNORECASE)
    content = fence.group(1) if fence else text
    for m in re.finditer(r"^\s*Table\s+([\w.\"`]+)\s*\{", content, re.MULTILINE | re.IGNORECASE):
        names.add(m.group(1).strip().strip('"').strip("`"))
    for m in re.finditer(
        r"^\s*(?:##\s*)?Table:\s*[`']?([\w]+)[`']?",
        text,
        re.MULTILINE | re.IGNORECASE,
    ):
        names.add(m.group(1))
    return names


def tables_from_fsd(text: str) -> set[str]:
    names: set[str] = set()
    for m in re.finditer(
        r"(?:^|\n)\s*(?:###?\s*)?(?:\d+\.\d+\s*)?([\w]+)\s+table\b",
        text,
        re.IGNORECASE,
    ):
        names.add(m.group(1).lower())
    return {n for n in names}


def main() -> int:
    parser = argparse.ArgumentParser(description="Compare FSD table mentions vs ERD/DBML tables.")
    parser.add_argument("--fsd", type=Path, required=True)
    parser.add_argument("--erd", type=Path, required=True)
    args = parser.parse_args()

    fsd = args.fsd.read_text(encoding="utf-8", errors="replace")
    erd = args.erd.read_text(encoding="utf-8", errors="replace")

    fsd_tables = tables_from_fsd(fsd)
    erd_tables = tables_from_dbml_or_md(erd)
    erd_lower = {t.lower() for t in erd_tables}

    missing_in_erd = sorted(t for t in fsd_tables if t not in erd_lower)
    extra_in_erd = sorted(
        t for t in erd_tables if t.lower() not in fsd_tables and not t.startswith("_")
    )

    print("## compare_artifacts (heuristic)\n")
    print(f"FSD path: {args.fsd}")
    print(f"ERD path: {args.erd}\n")
    print("### Tables mentioned in FSD (pattern: 'xyz table')")
    for t in sorted(fsd_tables):
        print(f"- {t}")
    print("\n### Tables found in ERD/DBML")
    for t in sorted(erd_tables):
        print(f"- {t}")

    print("\n### Possibly missing in ERD (mentioned in FSD, not in ERD list)")
    if missing_in_erd:
        for t in missing_in_erd:
            print(f"- {t}")
    else:
        print("- (none by this crude match)")

    print("\n### ERD tables not matched from FSD mentions (may be OK)")
    if extra_in_erd:
        for t in extra_in_erd[:50]:
            print(f"- {t}")
    else:
        print("- (none)")

    print(
        "\nNote: FSD often omits the literal 'foo table' phrase; use extract_entities.py and manual gap analysis.",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
