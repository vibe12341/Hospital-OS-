"""
agent/agent.py — HospitalOS Gemini Flash MCP Agent.

Connects Google's Gemini Flash model (`gemini-3.8-flash` / `gemini-flash-latest`)
with the HospitalOS MCP servers so hospital staff can ask natural-language questions
and trigger real tool calls (`get_free_beds`, `admit_patient`, `discharge_patient`).
"""

import os
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

MODEL_NAME = os.getenv("LLM_MODEL", "gemini-3.8-flash")


def create_gemini_client() -> genai.Client:
    """Create the Google GenAI client using GEMINI_API_KEY from .env."""
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("LLM_API_KEY")
    return genai.Client(api_key=api_key)
