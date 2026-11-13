"""
mcp_servers/beds/server.py — Beds Management MCP Server for HospitalOS.

Uses the shared database helper (`mcp_servers/common/db.py`) so logic is not
copy-pasted and the server works standalone without needing FastAPI running.

Exposes 3 MCP tools with explicit READ / WRITE docstrings and friendly text output:
  1. get_free_beds(ward)                 -> [OPERATION: READ]
  2. admit_patient(patient_id, ward)     -> [OPERATION: WRITE - REQUIRES CONFIRMATION]
  3. discharge_patient(patient_id)       -> [OPERATION: WRITE - REQUIRES CONFIRMATION]
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from mcp.server.fastmcp import FastMCP
from sqlalchemy import func

# Ensure hospitalos/ root is on sys.path before importing common.db
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from mcp_servers.common.db import get_db_session, models  # noqa: E402

mcp = FastMCP("HospitalOS-Beds")


@mcp.tool()
def get_free_beds(ward: str) -> str:
    """
    [OPERATION: READ]
    Find all free (unoccupied) hospital beds in a specific ward.
    Safe read-only lookup; does not modify the database.

    Use this tool when hospital staff ask questions like:
    - "How many free beds are in the ICU?"
    - "Which beds are available in Pediatrics or General ward?"
    - "Check bed availability in Emergency before admitting a patient."

    Args:
        ward: Name of the hospital ward (e.g., "ICU", "General", "Pediatrics", "Emergency").

    Returns:
        Formatted JSON text listing the ward name, floor, capacity, count of free beds,
        and available bed numbers, or a friendly error message if the ward name is invalid.
    """
    try:
        if not ward or not str(ward).strip():
            return "Error: Please provide a non-empty ward name (for example: 'ICU', 'General', 'Pediatrics', or 'Emergency')."

        clean_ward = str(ward).strip()
        with get_db_session() as db:
            ward_obj = (
                db.query(models.Ward)
                .filter(func.lower(models.Ward.name) == clean_ward.lower())
                .first()
            )
            if not ward_obj:
                all_wards = [w.name for w in db.query(models.Ward).order_by(models.Ward.id).all()]
                return (
                    f"Friendly Error: Ward '{clean_ward}' was not found. "
                    f"Available wards are: {', '.join(all_wards)}."
                )

            free_beds = (
                db.query(models.Bed)
                .filter(models.Bed.ward_id == ward_obj.id, models.Bed.is_occupied == False)  # noqa: E712
                .order_by(models.Bed.bed_number)
                .all()
            )

            payload = {
                "operation": "READ",
                "ward": ward_obj.name,
                "floor": ward_obj.floor,
                "capacity": ward_obj.capacity,
                "free_count": len(free_beds),
                "free_beds": [
                    {
                        "id": b.id,
                        "bed_number": b.bed_number,
                        "last_discharged_at": b.discharged_at.isoformat() if b.discharged_at else None,
                    }
                    for b in free_beds
                ],
            }
            return json.dumps(payload, indent=2)
    except Exception as exc:
        return f"Friendly Error in get_free_beds: Could not query beds ({exc})."


@mcp.tool()
def admit_patient(patient_id: int, ward: str) -> str:
    """
    [OPERATION: WRITE - REQUIRES CONFIRMATION]
    Admit a registered patient into the first available free bed in the specified ward.
    WARNING: This tool WRITES data to the database (marks a bed occupied, sets `admitted_at`,
    and updates `patient.is_admitted = True`). The AI agent MUST ask the user for confirmation
    before calling this tool.

    Args:
        patient_id: Numeric database ID of the patient to admit (must be > 0).
        ward: Target hospital ward name (e.g., "ICU", "General", "Pediatrics", "Emergency").

    Returns:
        Formatted JSON text confirming the assigned bed_number, ward, patient name,
        and UTC `admitted_at` timestamp, or a friendly error message.
    """
    try:
        if not isinstance(patient_id, int) or patient_id <= 0:
            return "Friendly Error: patient_id must be a positive integer (e.g., 3)."
        if not ward or not str(ward).strip():
            return "Friendly Error: Please provide a valid ward name (e.g., 'ICU', 'General')."

        clean_ward = str(ward).strip()
        with get_db_session() as db:
            patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
            if not patient:
                return f"Friendly Error: Patient with ID {patient_id} was not found in the database."

            existing_bed = (
                db.query(models.Bed)
                .filter(models.Bed.patient_id == patient.id, models.Bed.is_occupied == True)  # noqa: E712
                .first()
            )
            if existing_bed or patient.is_admitted:
                bed_code = existing_bed.bed_number if existing_bed else "an assigned bed"
                return (
                    f"Friendly Notice: Patient '{patient.full_name}' (ID {patient.id}) is already "
                    f"admitted in {bed_code}. Discharge them first before re-admitting."
                )

            ward_obj = (
                db.query(models.Ward)
                .filter(func.lower(models.Ward.name) == clean_ward.lower())
                .first()
            )
            if not ward_obj:
                all_wards = [w.name for w in db.query(models.Ward).order_by(models.Ward.id).all()]
                return (
                    f"Friendly Error: Ward '{clean_ward}' not found. "
                    f"Available wards: {', '.join(all_wards)}."
                )

            free_bed = (
                db.query(models.Bed)
                .filter(models.Bed.ward_id == ward_obj.id, models.Bed.is_occupied == False)  # noqa: E712
                .order_by(models.Bed.id)
                .first()
            )
            if not free_bed:
                return f"Friendly Error: No free beds are currently available in the '{ward_obj.name}' ward."

            now = datetime.now(timezone.utc)
            free_bed.is_occupied = True
            free_bed.patient_id = patient.id
            free_bed.admitted_at = now
            free_bed.discharged_at = None
            patient.is_admitted = True

            db.commit()
            db.refresh(free_bed)
            db.refresh(patient)

            return json.dumps(
                {
                    "operation": "WRITE",
                    "status": "success",
                    "message": f"Admitted {patient.full_name} (ID {patient.id}) to bed {free_bed.bed_number} in {ward_obj.name} ward.",
                    "bed_id": free_bed.id,
                    "bed_number": free_bed.bed_number,
                    "ward": ward_obj.name,
                    "patient_id": patient.id,
                    "patient_name": patient.full_name,
                    "admitted_at": free_bed.admitted_at.isoformat(),
                },
                indent=2,
            )
    except Exception as exc:
        return f"Friendly Error in admit_patient: Could not complete admission ({exc})."


@mcp.tool()
def discharge_patient(patient_id: int) -> str:
    """
    [OPERATION: WRITE - REQUIRES CONFIRMATION]
    Discharge an admitted patient from their hospital bed and mark the bed as free.
    WARNING: This tool WRITES data to the database (frees the bed, sets `discharged_at`,
    and sets `patient.is_admitted = False`). The AI agent MUST ask the user for confirmation
    before calling this tool.

    Args:
        patient_id: Numeric database ID of the currently admitted patient (must be > 0).

    Returns:
        Formatted JSON text confirming the freed bed_number, ward, patient name,
        and UTC `discharged_at` timestamp, or a friendly error message.
    """
    try:
        if not isinstance(patient_id, int) or patient_id <= 0:
            return "Friendly Error: patient_id must be a positive integer (e.g., 1)."

        with get_db_session() as db:
            patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
            if not patient:
                return f"Friendly Error: Patient with ID {patient_id} was not found in the database."

            occupied_bed = (
                db.query(models.Bed)
                .filter(models.Bed.patient_id == patient.id, models.Bed.is_occupied == True)  # noqa: E712
                .first()
            )
            if not occupied_bed:
                return (
                    f"Friendly Notice: Patient '{patient.full_name}' (ID {patient.id}) is not "
                    f"currently occupying any hospital bed."
                )

            now = datetime.now(timezone.utc)
            bed_number = occupied_bed.bed_number
            ward_name = occupied_bed.ward.name if occupied_bed.ward else "Unknown"
            prev_admitted = occupied_bed.admitted_at

            occupied_bed.is_occupied = False
            occupied_bed.patient_id = None
            occupied_bed.discharged_at = now
            patient.is_admitted = False

            db.commit()
            db.refresh(occupied_bed)
            db.refresh(patient)

            return json.dumps(
                {
                    "operation": "WRITE",
                    "status": "success",
                    "message": f"Discharged {patient.full_name} (ID {patient.id}) from bed {bed_number} ({ward_name} ward).",
                    "bed_id": occupied_bed.id,
                    "bed_number": bed_number,
                    "ward": ward_name,
                    "patient_id": patient.id,
                    "patient_name": patient.full_name,
                    "admitted_at": prev_admitted.isoformat() if prev_admitted else None,
                    "discharged_at": occupied_bed.discharged_at.isoformat(),
                },
                indent=2,
            )
    except Exception as exc:
        return f"Friendly Error in discharge_patient: Could not complete discharge ({exc})."


if __name__ == "__main__":
    mcp.run()
