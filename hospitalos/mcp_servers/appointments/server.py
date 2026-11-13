"""
mcp_servers/appointments/server.py — Appointments MCP Server for HospitalOS.

Uses `mcp_servers/common/db.py` for shared SQLite/PostgreSQL access.
Exposes 4 tools (2 READ tools and 2 WRITE tools requiring confirmation):
  1. list_doctor_availability(doctor_id, date)         -> [OPERATION: READ]
  2. list_appointments(patient_id)                     -> [OPERATION: READ]
  3. book_appointment(patient_id, doctor_id, datetime) -> [OPERATION: WRITE - REQUIRES CONFIRMATION]
  4. cancel_appointment(appointment_id)                -> [OPERATION: WRITE - REQUIRES CONFIRMATION]
"""

import json
import sys
from datetime import datetime as dt, timezone
from pathlib import Path
from mcp.server.fastmcp import FastMCP

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from mcp_servers.common.db import get_db_session, models  # noqa: E402

mcp = FastMCP("HospitalOS-Appointments")

STANDARD_DAILY_SLOTS = ["09:00", "10:00", "11:00", "13:30", "14:30", "16:00"]


@mcp.tool()
def list_doctor_availability(doctor_id: int, date: str) -> str:
    """
    [OPERATION: READ]
    Check a doctor's availability and open vs. booked consultation slots on a specific date.
    Safe read-only lookup; does not modify the database.

    Use this tool when hospital staff ask:
    - "When is Dr. Rajesh Menon (doctor_id=1) free on 2026-11-10?"
    - "Check doctor #2's schedule for tomorrow."

    Args:
        doctor_id: Numeric database ID of the doctor (must be > 0).
        date: Date string in YYYY-MM-DD format (e.g., "2026-11-10").

    Returns:
        Formatted JSON text with the doctor's name, specialization, on-duty status,
        booked slots on that date, and open slots available for booking.
    """
    try:
        if not isinstance(doctor_id, int) or doctor_id <= 0:
            return "Friendly Error: doctor_id must be a positive integer (e.g., 1)."
        if not date or not str(date).strip():
            return "Friendly Error: Please provide a date in YYYY-MM-DD format (e.g., '2026-11-10')."

        clean_date = str(date).strip()[:10]
        try:
            dt.strptime(clean_date, "%Y-%m-%d")
        except ValueError:
            return f"Friendly Error: Invalid date '{date}'. Please use YYYY-MM-DD format (e.g., '2026-11-10')."

        with get_db_session() as db:
            doctor = db.query(models.Doctor).filter(models.Doctor.id == doctor_id).first()
            if not doctor:
                return f"Friendly Error: Doctor with ID {doctor_id} was not found."

            appts = (
                db.query(models.Appointment)
                .filter(
                    models.Appointment.doctor_id == doctor.id,
                    models.Appointment.status == "Scheduled",
                )
                .all()
            )

            booked_slots = []
            for a in appts:
                if a.appointment_time and a.appointment_time.strftime("%Y-%m-%d") == clean_date:
                    booked_slots.append(a.appointment_time.strftime("%H:%M"))

            open_slots = (
                [s for s in STANDARD_DAILY_SLOTS if s not in booked_slots]
                if doctor.is_available
                else []
            )

            return json.dumps(
                {
                    "operation": "READ",
                    "doctor_id": doctor.id,
                    "doctor_name": doctor.full_name,
                    "specialization": doctor.specialization,
                    "is_available_on_duty": doctor.is_available,
                    "date": clean_date,
                    "booked_slots": booked_slots,
                    "open_slots": open_slots,
                },
                indent=2,
            )
    except Exception as exc:
        return f"Friendly Error in list_doctor_availability: Could not check schedule ({exc})."


@mcp.tool()
def list_appointments(patient_id: int) -> str:
    """
    [OPERATION: READ]
    List all appointments (Scheduled, Completed, or Cancelled) for a given patient.
    Safe read-only lookup; does not modify the database.

    Use this tool when hospital staff ask:
    - "What appointments does patient #1 have?"
    - "Show all scheduled visits for patient ID 4."

    Args:
        patient_id: Numeric database ID of the patient (must be > 0).

    Returns:
        Formatted JSON text listing all appointments for the patient with doctor names
        and timestamps, or a friendly error message.
    """
    try:
        if not isinstance(patient_id, int) or patient_id <= 0:
            return "Friendly Error: patient_id must be a positive integer (e.g., 1)."

        with get_db_session() as db:
            patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
            if not patient:
                return f"Friendly Error: Patient with ID {patient_id} was not found."

            appts = (
                db.query(models.Appointment)
                .filter(models.Appointment.patient_id == patient.id)
                .order_by(models.Appointment.appointment_time.desc())
                .all()
            )

            return json.dumps(
                {
                    "operation": "READ",
                    "patient_id": patient.id,
                    "patient_name": patient.full_name,
                    "count": len(appts),
                    "appointments": [
                        {
                            "id": a.id,
                            "doctor_id": a.doctor_id,
                            "doctor_name": a.doctor.full_name if a.doctor else None,
                            "specialization": a.doctor.specialization if a.doctor else None,
                            "appointment_time": a.appointment_time.isoformat()
                            if a.appointment_time
                            else None,
                            "status": a.status,
                            "notes": a.notes,
                        }
                        for a in appts
                    ],
                },
                indent=2,
            )
    except Exception as exc:
        return f"Friendly Error in list_appointments: Could not list appointments ({exc})."


@mcp.tool()
def book_appointment(patient_id: int, doctor_id: int, datetime: str) -> str:
    """
    [OPERATION: WRITE - REQUIRES CONFIRMATION]
    Book a new medical appointment between a patient and a doctor at a given date and time.
    WARNING: This tool WRITES data to the database (creates a new row in `appointments`).
    The AI agent MUST ask the user for confirmation before calling this tool.

    Args:
        patient_id: Numeric database ID of the patient (must be > 0).
        doctor_id: Numeric database ID of the doctor (must be > 0).
        datetime: Appointment date and time in ISO format, e.g., "2026-11-12T10:00:00" or "2026-11-12 10:00".

    Returns:
        Formatted JSON text confirming the newly created appointment ID, patient, doctor,
        and scheduled time, or a friendly error message.
    """
    try:
        if not isinstance(patient_id, int) or patient_id <= 0:
            return "Friendly Error: patient_id must be a positive integer."
        if not isinstance(doctor_id, int) or doctor_id <= 0:
            return "Friendly Error: doctor_id must be a positive integer."
        if not datetime or not str(datetime).strip():
            return "Friendly Error: Please provide an appointment datetime (e.g., '2026-11-12T10:00:00')."

        clean_dt_str = str(datetime).strip().replace("Z", "")
        parsed_dt = None
        for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
            try:
                parsed_dt = dt.strptime(clean_dt_str, fmt).replace(tzinfo=timezone.utc)
                break
            except ValueError:
                continue

        if parsed_dt is None:
            return (
                f"Friendly Error: Could not parse datetime '{datetime}'. "
                f"Please use format 'YYYY-MM-DDTHH:MM' (for example: '2026-11-12T10:00')."
            )

        with get_db_session() as db:
            patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
            if not patient:
                return f"Friendly Error: Patient with ID {patient_id} was not found."

            doctor = db.query(models.Doctor).filter(models.Doctor.id == doctor_id).first()
            if not doctor:
                return f"Friendly Error: Doctor with ID {doctor_id} was not found."

            if not doctor.is_available:
                return (
                    f"Friendly Notice: {doctor.full_name} ({doctor.specialization}) is currently "
                    f"marked unavailable. Please choose an available doctor."
                )

            new_appt = models.Appointment(
                patient_id=patient.id,
                doctor_id=doctor.id,
                appointment_time=parsed_dt,
                status="Scheduled",
                notes=f"Booked via HospitalOS Appointments MCP Server with {doctor.full_name}",
            )
            db.add(new_appt)
            db.commit()
            db.refresh(new_appt)

            return json.dumps(
                {
                    "operation": "WRITE",
                    "status": "success",
                    "message": (
                        f"Booked appointment #{new_appt.id} for {patient.full_name} "
                        f"with {doctor.full_name} on {parsed_dt.isoformat()}."
                    ),
                    "appointment": {
                        "id": new_appt.id,
                        "patient_id": patient.id,
                        "patient_name": patient.full_name,
                        "doctor_id": doctor.id,
                        "doctor_name": doctor.full_name,
                        "appointment_time": parsed_dt.isoformat(),
                        "status": new_appt.status,
                    },
                },
                indent=2,
            )
    except Exception as exc:
        return f"Friendly Error in book_appointment: Could not book appointment ({exc})."


@mcp.tool()
def cancel_appointment(appointment_id: int) -> str:
    """
    [OPERATION: WRITE - REQUIRES CONFIRMATION]
    Cancel an existing appointment by setting its status to "Cancelled".
    WARNING: This tool WRITES data to the database. The AI agent MUST ask the user
    for confirmation before calling this tool.

    Args:
        appointment_id: Numeric database ID of the appointment to cancel (must be > 0).

    Returns:
        Formatted JSON text confirming the cancelled appointment, or a friendly error message.
    """
    try:
        if not isinstance(appointment_id, int) or appointment_id <= 0:
            return "Friendly Error: appointment_id must be a positive integer (e.g., 1)."

        with get_db_session() as db:
            appt = (
                db.query(models.Appointment)
                .filter(models.Appointment.id == appointment_id)
                .first()
            )
            if not appt:
                return f"Friendly Error: Appointment with ID {appointment_id} was not found."

            if appt.status == "Cancelled":
                return f"Friendly Notice: Appointment #{appointment_id} is already cancelled."

            appt.status = "Cancelled"
            db.commit()
            db.refresh(appt)

            return json.dumps(
                {
                    "operation": "WRITE",
                    "status": "success",
                    "message": f"Appointment #{appt.id} has been cancelled.",
                    "appointment": {
                        "id": appt.id,
                        "patient_id": appt.patient_id,
                        "doctor_id": appt.doctor_id,
                        "appointment_time": appt.appointment_time.isoformat()
                        if appt.appointment_time
                        else None,
                        "status": appt.status,
                    },
                },
                indent=2,
            )
    except Exception as exc:
        return f"Friendly Error in cancel_appointment: Could not cancel appointment ({exc})."


if __name__ == "__main__":
    mcp.run()
