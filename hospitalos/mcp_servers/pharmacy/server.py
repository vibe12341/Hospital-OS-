"""
mcp_servers/pharmacy/server.py — Pharmacy Inventory MCP Server for HospitalOS.

Uses `mcp_servers/common/db.py` for shared SQLite/PostgreSQL access.
Exposes 3 tools (2 READ tools and 1 WRITE tool requiring confirmation):
  1. check_stock(medicine_name)             -> [OPERATION: READ]
  2. list_low_stock(threshold)              -> [OPERATION: READ]
  3. restock_medicine(medicine_name, quantity) -> [OPERATION: WRITE - REQUIRES CONFIRMATION]
"""

import json
import sys
from pathlib import Path
from mcp.server.fastmcp import FastMCP
from sqlalchemy import func

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from mcp_servers.common.db import get_db_session, models  # noqa: E402

mcp = FastMCP("HospitalOS-Pharmacy")


@mcp.tool()
def check_stock(medicine_name: str) -> str:
    """
    [OPERATION: READ]
    Check pharmacy stock quantity, category, unit price, and expiry date for a medicine.
    Safe read-only lookup; does not modify the database.

    Use this tool when hospital staff ask:
    - "How many units of Amoxicillin or Ceftriaxone do we have in stock?"
    - "Check pharmacy inventory for Paracetamol."

    Args:
        medicine_name: Full or partial name of the medicine (or "all" to list all medicines).

    Returns:
        Formatted JSON text with matching medicines and their stock quantities,
        or a friendly error message with available medicine names.
    """
    try:
        if not medicine_name or not str(medicine_name).strip():
            return "Friendly Error: Please provide a medicine_name (or 'all' to view all medicines)."

        clean_name = str(medicine_name).strip()
        with get_db_session() as db:
            q = db.query(models.Medicine)
            if clean_name.lower() != "all":
                q = q.filter(func.lower(models.Medicine.name).contains(clean_name.lower()))
            matches = q.order_by(models.Medicine.id).all()

            if not matches:
                all_names = [m.name for m in db.query(models.Medicine).order_by(models.Medicine.id).all()]
                return (
                    f"Friendly Notice: No medicine matching '{clean_name}' was found. "
                    f"Available medicines: {', '.join(all_names)}."
                )

            return json.dumps(
                {
                    "operation": "READ",
                    "query": clean_name,
                    "count": len(matches),
                    "medicines": [
                        {
                            "id": m.id,
                            "name": m.name,
                            "category": m.category,
                            "stock_quantity": m.stock_quantity,
                            "unit_price": m.unit_price,
                            "expiry_date": m.expiry_date,
                        }
                        for m in matches
                    ],
                },
                indent=2,
            )
    except Exception as exc:
        return f"Friendly Error in check_stock: Could not check stock ({exc})."


@mcp.tool()
def list_low_stock(threshold: int = 50) -> str:
    """
    [OPERATION: READ]
    List all pharmacy medicines whose current stock_quantity is less than or equal to `threshold`.
    Safe read-only lookup; does not modify the database.

    Use this tool when hospital staff ask:
    - "Which medicines are running low in stock?"
    - "List all medicines with stock below 50 units."

    Args:
        threshold: Stock quantity cutoff (must be >= 0; defaults to 50).

    Returns:
        Formatted JSON text with all medicines at or below the threshold.
    """
    try:
        if not isinstance(threshold, int) or threshold < 0:
            return "Friendly Error: threshold must be a non-negative integer (e.g., 50)."

        with get_db_session() as db:
            low_meds = (
                db.query(models.Medicine)
                .filter(models.Medicine.stock_quantity <= threshold)
                .order_by(models.Medicine.stock_quantity.asc())
                .all()
            )

            return json.dumps(
                {
                    "operation": "READ",
                    "threshold": threshold,
                    "low_stock_count": len(low_meds),
                    "medicines": [
                        {
                            "id": m.id,
                            "name": m.name,
                            "category": m.category,
                            "stock_quantity": m.stock_quantity,
                            "unit_price": m.unit_price,
                            "expiry_date": m.expiry_date,
                        }
                        for m in low_meds
                    ],
                },
                indent=2,
            )
    except Exception as exc:
        return f"Friendly Error in list_low_stock: Could not list low stock ({exc})."


@mcp.tool()
def restock_medicine(medicine_name: str, quantity: int) -> str:
    """
    [OPERATION: WRITE - REQUIRES CONFIRMATION]
    Add `quantity` new units to a medicine's `stock_quantity` in the pharmacy inventory.
    WARNING: This tool WRITES data to the database (increments `stock_quantity`).
    The AI agent MUST ask the user for confirmation before calling this tool.

    Args:
        medicine_name: Full or partial name of the medicine to restock (e.g., "Ceftriaxone 1g IV").
        quantity: Number of units to add (must be a positive integer > 0).

    Returns:
        Formatted JSON text confirming the previous stock, added quantity, and new stock count,
        or a friendly error message.
    """
    try:
        if not medicine_name or not str(medicine_name).strip():
            return "Friendly Error: Please provide a non-empty medicine_name."
        if not isinstance(quantity, int) or quantity <= 0:
            return "Friendly Error: quantity to restock must be a positive integer greater than 0."

        clean_name = str(medicine_name).strip()
        with get_db_session() as db:
            med = (
                db.query(models.Medicine)
                .filter(func.lower(models.Medicine.name).contains(clean_name.lower()))
                .first()
            )
            if not med:
                all_names = [m.name for m in db.query(models.Medicine).order_by(models.Medicine.id).all()]
                return (
                    f"Friendly Error: Medicine '{clean_name}' was not found. "
                    f"Available medicines: {', '.join(all_names)}."
                )

            previous_stock = med.stock_quantity
            med.stock_quantity = previous_stock + quantity
            db.commit()
            db.refresh(med)

            return json.dumps(
                {
                    "operation": "WRITE",
                    "status": "success",
                    "message": (
                        f"Restocked '{med.name}' by +{quantity} units "
                        f"(from {previous_stock} to {med.stock_quantity})."
                    ),
                    "medicine": {
                        "id": med.id,
                        "name": med.name,
                        "previous_stock": previous_stock,
                        "added_quantity": quantity,
                        "new_stock_quantity": med.stock_quantity,
                    },
                },
                indent=2,
            )
    except Exception as exc:
        return f"Friendly Error in restock_medicine: Could not restock medicine ({exc})."


if __name__ == "__main__":
    mcp.run()
