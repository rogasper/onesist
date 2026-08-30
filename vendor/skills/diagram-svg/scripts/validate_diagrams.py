#!/usr/bin/env python3
"""Validate diagram-svg fences in markdown files (JSON + raw SVG)."""
import json, re, sys, pathlib
from pathlib import Path

RE_DIAGRAM = re.compile(r"```diagram-svg\s*\n([\s\S]*?)\n```", re.I)
RE_SVG = re.compile(r"```svg\s*\n([\s\S]*?)\n```", re.I)

def validate_file(p: Path):
    text = p.read_text(encoding="utf-8", errors="ignore")
    errs = []
    for m in RE_DIAGRAM.finditer(text):
        raw = m.group(1).strip()
        if raw.startswith("<svg"):
            continue
        try:
            j = json.loads(raw)
            t = j.get("type")
            if t not in ("pipeline", "sidecar"):
                errs.append(f"{p}: unknown type {t!r} (expected pipeline/sidecar)")
        except Exception as e:
            errs.append(f"{p}: invalid JSON — {e}")
    for m in RE_SVG.finditer(text):
        raw = m.group(1).strip()
        if "<svg" not in raw:
            errs.append(f"{p}: svg fence must contain <svg>")
        if 'viewBox=' not in raw:
            errs.append(f"{p}: svg missing viewBox (rasterization needs it)")
    return errs

def main():
    if len(sys.argv) < 2:
        print("Usage: validate_diagrams.py <md> [md...]", file=sys.stderr)
        sys.exit(2)
    all_errs = []
    for arg in sys.argv[1:]:
        p = Path(arg)
        if p.is_file():
            all_errs.extend(validate_file(p))
        elif p.is_dir():
            for f in p.rglob("*.md"):
                all_errs.extend(validate_file(f))
    if all_errs:
        for e in all_errs:
            print(e)
        sys.exit(1)
    print(f"OK — validated {len(sys.argv)-1} path(s)")
if __name__ == "__main__":
    main()
