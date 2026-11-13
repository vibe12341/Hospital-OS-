"""
mcp_servers/billing/server.py — Billing & Invoices MCP Server for HospitalOS.

Uses `mcp_servers/common/db.py` for shared SQLite/PostgreSQL access.
Exposes 3 tools (2 READ tools and 1 WRITE tool requiring confirmation):
  1. get_bill(patient_id)       -> [OPERATION: READ]
  2. list_unpaid_bills()        -> [OPERATION: READ]
  3. mark_bill_paid(bill_id)    -> [OPERATION: WRITE - REQUIRES CONFIRMATION]
"""

import json
import sys
from pathlib import Path
from mcp.server.fastmcp import FastMCP

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from mcp_servers.common.db import get_db_session, models  # noqa: E402

mcp = FastMCP("HospitalOS-Billing")


@mcp.tool()
def get_bill(patient_id: int) -> str:
    """
    [OPERATION: READ]
    Retrieve all billing invoices and total balance for a specific patient.
    Safe read-only lookup; does not modify the database.

    Use this tool when hospital staff ask:
    - "What is the bill for patient #1?"
    - "Show all invoices and payment status for patient ID 2."

    Args:
        patient_id: Numeric database ID of the patient (must be > 0).

    Returns:
        Formatted JSON text containing the patient's invoices, total billed amount,
        and unpaid balance, or a friendly error message.
    """
    try:
        if not isinstance(patient_id, int) or patient_id <= 0:
            return "Friendly Error: patient_id must be a positive integer (e.g., 1)."

        with get_db_session() as db:
            patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
            if not patient:
                return f"Friendly Error: Patient with ID {patient_id} was not found."

            bills = (
                db.query(models.Bill)
                .filter(models.Bill.patient_id == patient.id)
                .order_by(models.Bill.created_at.desc())
                .all()
            )

            total_billed = sum(b.total_amount for b in bills)
            unpaid_total = sum(b.total_amount for b in bills if b.paid_status != "Paid")

            return json.dumps(
                {
                    "operation": "READ",
                    "patient_id": patient.id,
                    "patient_name": patient.full_name,
                    "invoice_count": len(bills),
                    "total_billed_usd": round(total_billed, 2),
                    "unpaid_balance_usd": round(unpaid_total, 2),
                    "bills": [
                        {
                            "id": b.id,
                            "total_amount": b.total_amount,
                            "paid_status": b.paid_status,
                            "description": b.description,
                            "created_at": b.created_at.isoformat() if b.created_at else None,
                        }
                        for b in bills
                    ],
                },
                indent=2,
            )
    except Exception as exc:
        return f"Friendly Error in get_bill: Could not retrieve patient bill ({exc})."


@mcp.tool()
def list_unpaid_bills() -> str:
    """
    [OPERATION: READ]
    List all patient bills where `paid_status` is "Unpaid" or "Partial".
    Safe read-only lookup; does not modify the database.

    Use this tool when hospital staff ask:
    - "Which bills are unpaid right now?"
    - "Show all open or partially paid hospital invoices."

    Returns:
        Formatted JSON text listing all unpaid/partial invoices and the total outstanding amount.
    """
    try:
        with get_db_session() as db:
            unpaid = (
                db.query(models.Bill)
                .filter(models.Bill.paid_status != "Paid")
                .order_by(models.Bill.id.asc())
                .all()
            )
            outstanding = sum(b.total_amount for b in unpaid)

            return json.dumps(
                {
                    "operation": "READ",
                    "unpaid_count": len(unpaid),
                    "total_outstanding_usd": round(outstanding, 2),
                    "unpaid_bills": [
                        {
                            "id": b.id,
                            "patient_id": b.patient_id,
                            "patient_name": b.patient.full_name if b.patient else None,
                            "total_amount": b.total_amount,
                            "paid_status": b.paid_status,
                            "description": b.description,
                        }
                        for b in unpaid
                    ],
                },
                indent=2,
            )
    except Exception as exc:
        return f"Friendly Error in list_unpaid_bills: Could not list unpaid bills ({exc})."


@mcp.tool()
def mark_bill_paid(bill_id: int) -> str:
    """
    [OPERATION: WRITE - REQUIRES CONFIRMATION]
    Mark an unpaid or partially paid invoice as "Paid".
    WARNING: This tool WRITES data to the database (sets `paid_status = "Paid"`).
    The AI agent MUST ask the user for confirmation before calling this tool.

    Args:
        bill_id: Numeric database ID of the bill to mark as paid (must be > 0).

    Returns:
        Formatted JSON text confirming the updated bill status, or a friendly error message.
    """
    try:
        if not isinstance(bill_id, int) or bill_id <= 0:
            return "Friendly Error: bill_id must be a positive integer (e.g., 2)."

        with get_db_session() as db:
            bill = db.query(models.Bill).filter(models.Bill.id == bill_id).first()
            if not bill:
                return f"Friendly Error: Bill with ID {bill_id} was not found."

            if bill.paid_status == "Paid":
                return f"Friendly Notice: Bill #{bill_id} is already marked as Paid."

            previous_status = bill.paid_status
            bill.paid_status = "Paid"
            db.commit()
            db.refresh(bill)

            patient_name = bill.patient.full_name if bill.patient else f"Patient #{bill.patient_id}"
            return json.dumps(
                {
                    "operation": "WRITE",
                    "status": "success",
                    "message": (
                        f"Marked Bill #{bill.id} for {patient_name} (${bill.total_amount:.2f}) "
                        f"as Paid (was {previous_status})."
                    ),
                    "bill": {
                        "id": bill.id,
                        "patient_id": bill.patient_id,
                        "patient_name": patient_name,
                        "total_amount": bill.total_amount,
                        "previous_status": previous_status,
                        "paid_status": bill.paid_status,
                        "description": bill.description,
                    },
                },
                indent=2,
            )
    except Exception as exc:
        return f"Friendly Error in mark_bill_paid: Could not update bill ({exc})."


if __name__ == "__main__":
    mcp.run()
