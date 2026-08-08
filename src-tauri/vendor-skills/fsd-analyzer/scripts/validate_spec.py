#!/usr/bin/env python3
"""
Heuristic validation of Markdown API spec files (e.g. spec_api.md).
Checks presence of endpoint markers, methods, and example blocks.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


ENDPOINT_HEAD_RE = re.compile(
    r"(?:^###\s*NO:\s*\d+|^##\s*NO:\s*\d+|\*\*Service:\*\*|\-\s*NO:\s*\d+)",
    re.MULTILINE | re.IGNORECASE,
)
METHOD_RE = re.compile(
    r"\*\*Method:\*\*\s*(GET|POST|PUT|PATCH|DELETE)",
    re.IGNORECASE,
)
RESP_SUCCESS_RE = re.compile(
    r"Response Success|RESPONSE SUCCESS|\*\*Response Success",
    re.IGNORECASE,
)


def validate_spec(text: str) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    heads = ENDPOINT_HEAD_RE.findall(text)
    if len(heads) < 1:
        warnings.append("No endpoint headers found (expected ### NO: or **Service:** blocks).")

    methods = METHOD_RE.findall(text)
    if len(methods) < 1 and len(heads) >= 1:
        warnings.append("No **Method:** lines found; confirm each endpoint has HTTP method.")

    success_blocks = RESP_SUCCESS_RE.findall(text)
    if len(success_blocks) < 1:
        warnings.append("No 'Response Success' sections found.")

    if "```json" not in text.lower() and "```" in text:
        warnings.append("Few or no ```json fenced blocks; examples help developers.")

    if "flow logic" not in text.lower() and "Flow Logic" not in text:
        warnings.append("No 'Flow Logic' section detected (optional but recommended).")

    return errors, warnings


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate API spec markdown structure.")
    parser.add_argument("path", type=Path, help="Path to spec_api.md")
    args = parser.parse_args()
    text = args.path.read_text(encoding="utf-8", errors="replace")

    errors, warnings = validate_spec(text)
    for w in warnings:
        print(f"WARN: {w}", file=sys.stderr)
    for e in errors:
        print(f"ERROR: {e}", file=sys.stderr)

    if errors:
        return 1
    print("OK: Spec structure check finished (see warnings).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
