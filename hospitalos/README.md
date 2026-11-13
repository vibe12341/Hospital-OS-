# HospitalOS — AI Hospital Management Platform (Phases 1 & 2)

HospitalOS is an open-source, beginner-friendly hospital management platform built for a college Project-Based Learning (PBL) course. It uses **FastAPI**, **SQLAlchemy + SQLite** (switchable to PostgreSQL via a single `.env` setting), and 6 specialized **Model Context Protocol (MCP)** servers built with the official Python MCP SDK (`FastMCP`).

---

## 1. Project Folder Structure

```text
hospitalos/
├── backend/
│   ├── __init__.py
│   ├── database.py                     # SQLite / PostgreSQL connection & session helper
│   ├── models.py                       # 8 SQLAlchemy tables (with bed timestamps)
│   ├── schemas.py                      # Pydantic request/response schemas
│   └── main.py                         # FastAPI CRUD routes + /docs
├── data/
│   └── seed.py                         # Populates all 8 tables with synthetic hospital data
├── mcp_servers/
│   ├── common/
│   │   └── db.py                       # Shared SQLAlchemy session helper for all 6 MCP servers
│   ├── beds/
│   │   ├── server.py                   # get_free_beds [READ], admit_patient [WRITE], discharge_patient [WRITE]
│   │   └── test_beds_mcp.py            # Automated MCP test script
│   ├── patients/
│   │   ├── server.py                   # search_patients [READ], get_patient [READ], get_patient_history [READ]
│   │   └── test_patients_mcp.py        # Automated MCP test script
│   ├── appointments/
│   │   ├── server.py                   # list_doctor_availability [READ], list_appointments [READ], book_appointment [WRITE], cancel_appointment [WRITE]
│   │   └── test_appointments_mcp.py    # Automated MCP test script
│   ├── pharmacy/
│   │   ├── server.py                   # check_stock [READ], list_low_stock [READ], restock_medicine [WRITE]
│   │   └── test_pharmacy_mcp.py        # Automated MCP test script
│   ├── lab/
│   │   ├── server.py                   # list_pending_tests [READ], get_results [READ], order_test [WRITE]
│   │   └── test_lab_mcp.py             # Automated MCP test script
│   └── billing/
│       ├── server.py                   # get_bill [READ], list_unpaid_bills [READ], mark_bill_paid [WRITE]
│       └── test_billing_mcp.py         # Automated MCP test script
├── agent/                              # AI Agent orchestrator
├── frontend/                           # Frontend directory
├── .env.example                        # Template for DATABASE_URL and swappable LLM settings
├── .gitignore                          # Ignores .env and *.db files
├── requirements.txt                    # Free, open-source Python dependencies
└── README.md                           # This guide
```

---

## 2. Exact Terminal Commands (Step-by-Step)

### Step 1: Create Virtual Environment & Install Dependencies

```bash
cd hospitalos
python3 -m venv venv
source venv/bin/activate        # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

### Step 2: Seed the SQLite Database with Synthetic Data

```bash
python -m data.seed
```

### Step 3: Run & Test Each of the 6 MCP Servers

Because all 6 MCP servers share `mcp_servers/common/db.py`, you can run and test them directly against `hospitalos.db`:

```bash
# 1. Test Beds MCP Server (get_free_beds, admit_patient, discharge_patient)
python mcp_servers/beds/test_beds_mcp.py

# 2. Test Patients MCP Server (search_patients, get_patient, get_patient_history)
python mcp_servers/patients/test_patients_mcp.py

# 3. Test Appointments MCP Server (list_doctor_availability, list_appointments, book_appointment, cancel_appointment)
python mcp_servers/appointments/test_appointments_mcp.py

# 4. Test Pharmacy MCP Server (check_stock, list_low_stock, restock_medicine)
python mcp_servers/pharmacy/test_pharmacy_mcp.py

# 5. Test Lab MCP Server (list_pending_tests, get_results, order_test)
python mcp_servers/lab/test_lab_mcp.py

# 6. Test Billing MCP Server (get_bill, list_unpaid_bills, mark_bill_paid)
python mcp_servers/billing/test_billing_mcp.py
```

### Step 4: Start Any MCP Server Directly (Stdio Mode)

```bash
python mcp_servers/beds/server.py
python mcp_servers/patients/server.py
python mcp_servers/appointments/server.py
python mcp_servers/pharmacy/server.py
python mcp_servers/lab/server.py
python mcp_servers/billing/server.py
```

### Step 5: Optional — Run the FastAPI REST Server (`/docs`)

```bash
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```
