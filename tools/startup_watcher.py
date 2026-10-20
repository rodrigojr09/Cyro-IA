"""Frozen, explicitly registered current-user watcher; contains no personal data."""

import sys
from pathlib import Path

if not getattr(sys, "frozen", False):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from authorized_startup import watch

if __name__ == "__main__" and sys.argv[1:] == ["--watch"]:
    watch()
