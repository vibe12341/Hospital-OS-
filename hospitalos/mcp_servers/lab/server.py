"""
mcp_servers/lab/server.py — Diagnostic Lab Tests MCP Server for HospitalOS.

Uses `mcp_servers/common/db.py` for shared SQLite/PostgreSQL access.
Exposes 3 tools (2 READ tools and 1 WRITE tool requiring confirmation):
  1. list_pending_tests()              -> [OPERATION: READ]
  2. get_results(patient_id)           -> [OPERATION: READ]
  3. order_test(patient_id, test_name) -> [OPERATION: WRITE - REQUIRES CONFIRMATION]
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from mcp.server.fastmcp import FastMCP

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from mcp_servers.common.db import get_db_session, models  # noqa: E402

mcp = FastMCP("HospitalOS-Lab")


@mcp.tool()
def list_pending_tests() -> str:
    """
    [OPERATION: READ]
    List all diagnostic laboratory tests that currently have `status == "Pending"`.
    Safe read-only lookup; does not modify the database.

    Use this tool when hospital staff ask:
    - "Which lab tests are still pending?"
    - "Show the lab queue waiting for results."

    Returns:
        Formatted JSON text listing all pending lab tests with patient and doctor names.
    """
    try:
        with get_db_session() as db:
            pending = (
                db.query(models.LabTest)
                .filter(models.LabTest.status == "Pending")
                .order_by(models.LabTest.ordered_at.asc())
                .all()
            )

            return json.dumps(
                {
                    "operation": "READ",
                    "pending_count": len(pending),
                    "pending_tests": [
                        {
                            "id": t.id,
                            "patient_id": t.patient_id,
                            "patient_name": t.patient.full_name if t.patient else None,
                            "doctor_id": t.doctor_id,
                            "doctor_name": t.doctor.full_name if t.doctor else None,
                            "test_name": t.test_name,
                            "status": t.status,
                            "ordered_at": t.ordered_at.isoformat() if t.ordered_at else None,
                        }
                        for t in pending
                    ],
                },
                indent=2,
            )
    except Exception as exc:
        return f"Friendly Error in list_pending_tests: Could not list pending tests ({exc})."


@mcp.tool()
def get_results(patient_id: int) -> str:
    """
    [OPERATION: READ]
    Retrieve all diagnostic lab test orders and results (both Completed and Pending)
    for a specific patient.
    Safe read-only lookup; does not modify the database.

    Use this tool when hospital staff ask:
    - "What are the lab results for patient #1?"
    - "Has the HbA1c test for patient ID 5 come back yet?"

    Args:
        patient_id: Numeric database ID of the patient (must be > 0).

    Returns:
        Formatted JSON text containing all lab tests and findings for the patient,
        or a friendly error message.
    """
    try:
        if not isinstance(patient_id, int) or patient_id <= 0:
            return "Friendly Error: patient_id must be a positive integer (e.g., 1)."

        with get_db_session() as db:
            patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
            if not patient:
                return f"Friendly Error: Patient with ID {patient_id} was not found."

            tests = (
                db.query(models.LabTest)
                .filter(models.LabTest.patient_id == patient.id)
                .order_by(models.LabTest.ordered_at.desc())
                .all()
            )

            return json.dumps(
                {
                    "operation": "READ",
                    "patient_id": patient.id,
                    "patient_name": patient.full_name,
                    "count": len(tests),
                    "lab_tests": [
                        {
                            "id": t.id,
                            "test_name": t.test_name,
                            "status": t.status,
                            "result": t.result or "Pending analysis",
                            "ordered_by": t.doctor.full_name if t.doctor else None,
                            "ordered_at": t.ordered_at.isoformat() if t.ordered_at else None,
                        }
                        for t in tests
                    ],
                },
                indent=2,
            )
    except Exception as exc:
        return f"Friendly Error in get_results: Could not retrieve lab results ({exc})."


@mcp.tool()
def order_test(patient_id: int, test_name: str) -> str:
    """
    [OPERATION: WRITE - REQUIRES CONFIRMATION]
    Order a new diagnostic laboratory test for a patient (creates a "Pending" lab test record).
    WARNING: This tool WRITES data to the database. The AI agent MUST ask the user
    for confirmation before calling this tool.

    Args:
        patient_id: Numeric database ID of the patient (must be > 0).
        test_name: Name of the diagnostic test to order (e.g., "Complete Blood Count", "Chest X-Ray").

    Returns:
        Formatted JSON text confirming the new lab test ID, patient name, test name,
        and ordering timestamp, or a friendly error message.
    """
    try:
        if not isinstance(patient_id, int) or patient_id <= 0:
            return "Friendly Error: patient_id must be a positive integer (e.g., 1)."
        if not test_name or not str(test_name).strip():
            return "Friendly Error: Please provide a non-empty test_name (e.g., 'Complete Blood Count')."

        clean_test = str(test_name).strip()
        with get_db_session() as db:
            patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
            if not patient:
                return f"Friendly Error: Patient with ID {patient_id} was not found."

            # Assign the first available doctor on duty (or doctor #1 as fallback)
            doctor = (
                db.query(models.Doctor)
                .filter(models.Doctor.is_available == True)  # noqa: E712
                .order_by(models.Doctor.id)
                .first()
                or db.query(models.Doctor).order_by(models.Doctor.id).first()
            )
            doctor_id = doctor.id if doctor else 1

            now = datetime.now(timezone.utc)
            new_test = models.LabTest(
                patient_id=patient.id,
                doctor_id=doctor_id,
                test_name=clean_test,
                status="Pending",
                result=None,
                ordered_at=now,
            )
            db.add(new_test)
            db.commit()
            db.refresh(new_test)

            return json.dumps(
                {
                    "operation": "WRITE",
                    "status": "success",
                    "message": f"Ordered '{clean_test}' (Lab Test #{new_test.id}) for {patient.full_name}.",
                    "lab_test": {
                        "id": new_test.id,
                        "patient_id": patient.id,
                        "patient_name": patient.full_name,
                        "doctor_id": doctor_id,
                        "doctor_name": doctor.full_name if doctor else None,
                        "test_name": new_test.test_name,
                        "status": new_test.status,
                        "ordered_at": now.isoformat(),
                    },
                },
                indent=2,
            )
    except Exception as exc:
        return f"Friendly Error in order_test: Could not order lab test ({exc})."


if __name__ == "__main__":
    mcp.run()
