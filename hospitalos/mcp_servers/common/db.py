"""
mcp_servers/common/db.py — Shared Database Access Helper for All 6 MCP Servers.

Why do we need this file?
Instead of copy-pasting SQLAlchemy database connection code into every single MCP
server (beds, patients, appointments, pharmacy, lab, billing), all 6 MCP servers
import `get_db_session` and `models` from this single helper module!

Key features for beginners:
1. Automatically adds the `hospitalos/` root folder to `sys.path` so you can run
   any MCP server from anywhere without getting "ModuleNotFoundError: No module named backend".
2. Resolves the default SQLite file (`hospitalos.db`) inside `hospitalos/` so all
   servers always read and write the exact same database file.
3. Provides a `@contextmanager` (`get_db_session()`) that opens a database session,
   automatically closes it when finished, and rolls back safely if an error occurs.
"""

import os
import sys
from contextlib import contextmanager
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# 1. Locate the hospitalos/ project root folder automatically
HOSPITALOS_ROOT = Path(__file__).resolve().parents[2]
if str(HOSPITALOS_ROOT) not in sys.path:
    sys.path.insert(0, str(HOSPITALOS_ROOT))

# 2. Load .env from hospitalos/.env (if present)
load_dotenv(HOSPITALOS_ROOT / ".env")

# 3. Reuse the 8 SQLAlchemy table models from backend/models.py
from backend import models  # noqa: E402
from backend.database import Base  # noqa: E402

# 4. Resolve DATABASE_URL (defaults to hospitalos/hospitalos.db)
DEFAULT_SQLITE_PATH = HOSPITALOS_ROOT / "hospitalos.db"
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_SQLITE_PATH}")

# If DATABASE_URL is a relative sqlite path like "sqlite:///./hospitalos.db",
# anchor it to HOSPITALOS_ROOT so running from any folder uses the same file.
if DATABASE_URL == "sqlite:///./hospitalos.db":
    DATABASE_URL = f"sqlite:///{DEFAULT_SQLITE_PATH}"

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Ensure all 8 tables exist
Base.metadata.create_all(bind=engine)


@contextmanager
def get_db_session():
    """
    Context manager that yields a SQLAlchemy database session.

    Example usage inside any MCP tool:
        with get_db_session() as db:
            patient = db.query(models.Patient).filter_by(id=1).first()
    """
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


__all__ = ["get_db_session", "models", "engine", "HOSPITALOS_ROOT"]
