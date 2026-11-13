"""
database.py — Database Connection & Session Setup for HospitalOS.

This file connects Python (SQLAlchemy) to our database.
Right now it uses SQLite (a simple file on disk called hospitalos.db).
Later, if you change DATABASE_URL in .env to a PostgreSQL link,
this exact same code will work with PostgreSQL without changing any code!
"""

import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Load environment variables from the .env file (if present)
load_dotenv()

# Read DATABASE_URL from .env, or fall back to a local SQLite file
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./hospitalos.db")

# SQLite needs a special argument (check_same_thread=False) so FastAPI can
# handle multiple requests safely. PostgreSQL does not use this argument.
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

# Create the SQLAlchemy engine (the core connection to the database)
engine = create_engine(DATABASE_URL, connect_args=connect_args)

# SessionLocal creates a new database "conversation" for each API request
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base is the parent class that all 8 database table models will inherit from
Base = declarative_base()


def get_db():
    """
    FastAPI Dependency: Opens a database session when an API request starts,
    hands it to the endpoint, and always closes it when the request finishes.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
