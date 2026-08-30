"""
Vercel serverless entrypoint for the SwiftDrop API.

Vercel's Python runtime looks for an ASGI application named `app` in this file
and routes every request to it via the rewrite in vercel.json.
"""
import sys
from pathlib import Path

# main.py imports its siblings absolutely (`from config import settings`), so the
# backend directory itself must be on sys.path — putting the repo root there
# instead would make every one of those imports fail.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from main import app  # noqa: E402,F401  (re-exported for the runtime to find)
