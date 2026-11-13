"""
mcp_servers/patients/server.py — Patients MCP Server for HospitalOS.

Uses `mcp_servers/common/db.py` for shared SQLite/PostgreSQL access.
Exposes 3 read-only tools with input validation and friendly text output:
  1. search_patients(name)           -> [OPERATION: READ]
  2. get_patient(patient_id)         -> [OPERATION: READ]
  3. get_patient_history(patient_id) -> [OPERATION: READ]
"""

import json
import sys
from pathlib import Path
from mcp.server.fastmcp import FastMCP
from sqlalchemy import func

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from mcp_servers.common.db import get_db_session, models  # noqa: E402

mcp = FastMCP("HospitalOS-Patients")


@mcp.tool()
def search_patients(name: str) -> str:
    """
    [OPERATION: READ]
    Search registered hospital patients by partial or full name (case-insensitive).
    Safe read-only lookup; does not modify the database.

    Use this tool when hospital staff ask questions like:
    - "Find patient Rohan Verma."
    - "Search for patients named Sharma or Meera."
    - "What is the patient_id for Ananya Iyer?"

    Args:
        name: Partial or full patient name to search for (pass "all" to list all patients).

    Returns:
        Formatted JSON text with matching patients (id, full_name, age, gender, phone,
        blood_group, diagnosis, is_admitted, and current bed_number if admitted).
    """
    try:
        if name is None or not str(name).strip():
            return "Friendly Error: Please provide a patient name to search for (or 'all' to list all patients)."

        query_str = str(name).strip()
        with get_db_session() as db:
            q = db.query(models.Patient)
            if query_str.lower() != "all":
                q = q.filter(func.lower(models.Patient.full_name).contains(query_str.lower()))
            matches = q.order_by(models.Patient.id).all()

            if not matches:
                return f"Friendly Notice: No patients found matching '{query_str}'."

            results = []
            for p in matches:
                occupied_bed = (
                    db.query(models.Bed)
                    .filter(models.Bed.patient_id == p.id, models.Bed.is_occupied == True)  # noqa: E712
                    .first()
                )
                results.append(
                    {
                        "id": p.id,
                        "full_name": p.full_name,
                        "age": p.age,
                        "gender": p.gender,
                        "phone": p.phone,
                        "blood_group": p.blood_group,
                        "diagnosis": p.diagnosis,
                        "is_admitted": p.is_admitted,
                        "current_bed": occupied_bed.bed_number if occupied_bed else None,
                    }
                )

            return json.dumps(
                {
                    "operation": "READ",
                    "query": query_str,
                    "count": len(results),
                    "patients": results,
                },
                indent=2,
            )
    except Exception as exc:
        return f"Friendly Error in search_patients: Could not search patients ({exc})."


@mcp.tool()
def get_patient(patient_id: int) -> str:
    """
    [OPERATION: READ]
    Get full demographic and admission details for a single patient by their numeric ID.
    Safe read-only lookup; does not modify the database.

    Use this tool when hospital staff ask:
    - "Show me the details for patient #1."
    - "What is the blood group and diagnosis of patient ID 4?"

    Args:
        patient_id: Numeric database ID of the patient (must be > 0).

    Returns:
        Formatted JSON text with the patient's profile and current bed assignment,
        or a friendly error message if the ID does not exist.
    """
    try:
        if not isinstance(patient_id, int) or patient_id <= 0:
            return "Friendly Error: patient_id must be a positive integer (e.g., 1)."

        with get_db_session() as db:
            p = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
            if not p:
                return f"Friendly Error: Patient with ID {patient_id} was not found."

            occupied_bed = (
                db.query(models.Bed)
                .filter(models.Bed.patient_id == p.id, models.Bed.is_occupied == True)  # noqa: E712
                .first()
            )
            ward_name = occupied_bed.ward.name if (occupied_bed and occupied_bed.ward) else None

            return json.dumps(
                {
                    "operation": "READ",
                    "patient": {
                        "id": p.id,
                        "full_name": p.full_name,
                        "age": p.age,
                        "gender": p.gender,
                        "phone": p.phone,
                        "blood_group": p.blood_group,
                        "diagnosis": p.diagnosis,
                        "is_admitted": p.is_admitted,
                        "current_bed": occupied_bed.bed_number if occupied_bed else None,
                        "current_ward": ward_name,
                        "created_at": p.created_at.isoformat() if p.created_at else None,
                    },
                },
                indent=2,
            )
    except Exception as exc:
        return f"Friendly Error in get_patient: Could not retrieve patient ({exc})."


@mcp.tool()
def get_patient_history(patient_id: int) -> str:
    """
    [OPERATION: READ]
    Retrieve the complete clinical history for a patient, combining their profile,
    current bed occupancy, past/upcoming appointments, lab test orders & results,
    and billing invoices.
    Safe read-only lookup; does not modify the database.

    Use this tool when hospital staff ask:
    - "Give me the full medical history for patient #1."
    - "Summarize everything on file for patient ID 4 (appointments, labs, bills)."

    Args:
        patient_id: Numeric database ID of the patient (must be > 0).

    Returns:
        Formatted JSON text containing the patient's profile, bed status, appointments,
        lab_tests, and bills, or a friendly error message.
    """
    try:
        if not isinstance(patient_id, int) or patient_id <= 0:
            return "Friendly Error: patient_id must be a positive integer (e.g., 1)."

        with get_db_session() as db:
            p = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
            if not p:
                return f"Friendly Error: Patient with ID {patient_id} was not found."

            occupied_bed = (
                db.query(models.Bed)
                .filter(models.Bed.patient_id == p.id, models.Bed.is_occupied == True)  # noqa: E712
                .first()
            )
            appointments = (
                db.query(models.Appointment)
                .filter(models.Appointment.patient_id == p.id)
                .order_by(models.Appointment.appointment_time.desc())
                .all()
            )
            lab_tests = (
                db.query(models.LabTest)
                .filter(models.LabTest.patient_id == p.id)
                .order_by(models.LabTest.ordered_at.desc())
                .all()
            )
            bills = (
                db.query(models.Bill)
                .filter(models.Bill.patient_id == p.id)
                .order_by(models.Bill.created_at.desc())
                .all()
            )

            return json.dumps(
                {
                    "operation": "READ",
                    "patient": {
                        "id": p.id,
                        "full_name": p.full_name,
                        "age": p.age,
                        "gender": p.gender,
                        "blood_group": p.blood_group,
                        "diagnosis": p.diagnosis,
                        "is_admitted": p.is_admitted,
                    },
                    "bed_assignment": {
                        "bed_number": occupied_bed.bed_number,
                        "ward": occupied_bed.ward.name if occupied_bed.ward else None,
                        "admitted_at": occupied_bed.admitted_at.isoformat()
                        if occupied_bed.admitted_at
                        else None,
                    }
                    if occupied_bed
                    else None,
                    "appointments": [
                        {
                            "id": a.id,
                            "doctor_id": a.doctor_id,
                            "doctor_name": a.doctor.full_name if a.doctor else None,
                            "appointment_time": a.appointment_time.isoformat()
                            if a.appointment_time
                            else None,
                            "status": a.status,
                            "notes": a.notes,
                        }
                        for a in appointments
                    ],
                    "lab_tests": [
                        {
                            "id": t.id,
                            "test_name": t.test_name,
                            "status": t.status,
                            "result": t.result,
                            "ordered_at": t.ordered_at.isoformat() if t.ordered_at else None,
                        }
                        for t in lab_tests
                    ],
                    "bills": [
                        {
                            "id": b.id,
                            "total_amount": b.total_amount,
                            "paid_status": b.paid_status,
                            "description": b.description,
                        }
                        for b in bills
                    ],
                },
                indent=2,
            )
    except Exception as exc:
        return f"Friendly Error in get_patient_history: Could not load history ({exc})."


if __name__ == "__main__":
    mcp.run()
