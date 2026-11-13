"""
main.py — FastAPI Application & REST Endpoints for HospitalOS.

Provides CRUD routes (List, Get by ID, Create, Update) for all 8 hospital tables,
plus specialized bed admission/discharge routes called by the Beds MCP server.
Interactive Swagger documentation is automatically available at:
  http://127.0.0.1:8000/docs
"""

from datetime import datetime, timezone
from typing import List, Optional
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func
from sqlalchemy.orm import Session

from . import models, schemas
from .database import Base, engine, get_db

# Create database tables automatically if they don't exist yet
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="HospitalOS API",
    description="Open-source AI Hospital Management Platform REST API (Phase 1)",
    version="1.0.0",
)

# Enable CORS so the React frontend can talk to FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["Health"])
def root():
    """Simple health check endpoint."""
    return {
        "service": "HospitalOS FastAPI Backend",
        "status": "running",
        "docs_url": "/docs",
    }


# ==============================================================================
# 1. WARDS ENDPOINTS
# ==============================================================================
@app.get("/wards", response_model=List[schemas.WardResponse], tags=["Wards"])
def list_wards(db: Session = Depends(get_db)):
    """Return all hospital wards."""
    return db.query(models.Ward).order_by(models.Ward.id).all()


@app.get("/wards/{ward_id}", response_model=schemas.WardResponse, tags=["Wards"])
def get_ward(ward_id: int, db: Session = Depends(get_db)):
    """Get a single ward by its ID."""
    ward = db.query(models.Ward).filter(models.Ward.id == ward_id).first()
    if not ward:
        raise HTTPException(status_code=404, detail=f"Ward with ID {ward_id} not found")
    return ward


@app.post("/wards", response_model=schemas.WardResponse, status_code=201, tags=["Wards"])
def create_ward(payload: schemas.WardCreate, db: Session = Depends(get_db)):
    """Create a new hospital ward."""
    ward = models.Ward(**payload.model_dump())
    db.add(ward)
    db.commit()
    db.refresh(ward)
    return ward


@app.put("/wards/{ward_id}", response_model=schemas.WardResponse, tags=["Wards"])
def update_ward(ward_id: int, payload: schemas.WardUpdate, db: Session = Depends(get_db)):
    """Update ward details (name, floor, or capacity)."""
    ward = db.query(models.Ward).filter(models.Ward.id == ward_id).first()
    if not ward:
        raise HTTPException(status_code=404, detail=f"Ward with ID {ward_id} not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(ward, field, value)
    db.commit()
    db.refresh(ward)
    return ward


# ==============================================================================
# 2. BEDS ENDPOINTS (Including MCP-friendly free/admit/discharge routes)
# ==============================================================================
@app.get("/beds", response_model=List[schemas.BedResponse], tags=["Beds"])
def list_beds(
    ward: Optional[str] = None,
    is_occupied: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    """List all beds, with optional filtering by ward name or occupancy status."""
    query = db.query(models.Bed)
    if ward:
        query = query.join(models.Ward).filter(func.lower(models.Ward.name) == ward.strip().lower())
    if is_occupied is not None:
        query = query.filter(models.Bed.is_occupied == is_occupied)
    return query.order_by(models.Bed.id).all()


@app.get("/beds/free", tags=["Beds"])
def get_free_beds_by_ward(ward: str, db: Session = Depends(get_db)):
    """
    Find all free (unoccupied) beds in a given ward name (case-insensitive).
    Used directly by the Beds MCP Server tool `get_free_beds(ward)`.
    """
    ward_obj = (
        db.query(models.Ward)
        .filter(func.lower(models.Ward.name) == ward.strip().lower())
        .first()
    )
    if not ward_obj:
        available_wards = [w.name for w in db.query(models.Ward).all()]
        raise HTTPException(
            status_code=404,
            detail=f"Ward '{ward}' not found. Available wards: {', '.join(available_wards)}",
        )

    free_beds = (
        db.query(models.Bed)
        .filter(models.Bed.ward_id == ward_obj.id, models.Bed.is_occupied == False)  # noqa: E712
        .order_by(models.Bed.bed_number)
        .all()
    )

    return {
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


@app.post("/beds/admit", tags=["Beds"])
def admit_patient_to_bed(payload: schemas.AdmitPatientRequest, db: Session = Depends(get_db)):
    """
    Admit a patient into the first available bed in the specified ward.
    Records the exact `admitted_at` UTC timestamp on the bed and marks the patient as admitted.
    """
    patient = db.query(models.Patient).filter(models.Patient.id == payload.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail=f"Patient with ID {payload.patient_id} not found")

    existing_bed = (
        db.query(models.Bed)
        .filter(models.Bed.patient_id == patient.id, models.Bed.is_occupied == True)  # noqa: E712
        .first()
    )
    if existing_bed or patient.is_admitted:
        bed_label = existing_bed.bed_number if existing_bed else "an assigned bed"
        raise HTTPException(
            status_code=400,
            detail=f"Patient '{patient.full_name}' (ID {patient.id}) is already admitted in {bed_label}.",
        )

    ward_obj = (
        db.query(models.Ward)
        .filter(func.lower(models.Ward.name) == payload.ward.strip().lower())
        .first()
    )
    if not ward_obj:
        raise HTTPException(status_code=404, detail=f"Ward '{payload.ward}' not found")

    free_bed = (
        db.query(models.Bed)
        .filter(models.Bed.ward_id == ward_obj.id, models.Bed.is_occupied == False)  # noqa: E712
        .order_by(models.Bed.id)
        .first()
    )
    if not free_bed:
        raise HTTPException(
            status_code=400,
            detail=f"No free beds available in the '{ward_obj.name}' ward.",
        )

    now = datetime.now(timezone.utc)
    free_bed.is_occupied = True
    free_bed.patient_id = patient.id
    free_bed.admitted_at = now
    free_bed.discharged_at = None
    patient.is_admitted = True

    db.commit()
    db.refresh(free_bed)
    db.refresh(patient)

    return {
        "message": f"Admitted {patient.full_name} (ID {patient.id}) to bed {free_bed.bed_number} in {ward_obj.name} ward.",
        "bed_id": free_bed.id,
        "bed_number": free_bed.bed_number,
        "ward": ward_obj.name,
        "patient_id": patient.id,
        "patient_name": patient.full_name,
        "admitted_at": free_bed.admitted_at.isoformat(),
    }


@app.post("/beds/discharge", tags=["Beds"])
def discharge_patient_from_bed(
    payload: schemas.DischargePatientRequest, db: Session = Depends(get_db)
):
    """
    Discharge a patient from their currently occupied bed.
    Records the exact `discharged_at` UTC timestamp and frees the bed.
    """
    patient = db.query(models.Patient).filter(models.Patient.id == payload.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail=f"Patient with ID {payload.patient_id} not found")

    occupied_bed = (
        db.query(models.Bed)
        .filter(models.Bed.patient_id == patient.id, models.Bed.is_occupied == True)  # noqa: E712
        .first()
    )
    if not occupied_bed:
        raise HTTPException(
            status_code=400,
            detail=f"Patient '{patient.full_name}' (ID {patient.id}) is not currently occupying any bed.",
        )

    now = datetime.now(timezone.utc)
    bed_number = occupied_bed.bed_number
    ward_name = occupied_bed.ward.name if occupied_bed.ward else "Unknown"
    previous_admitted_at = occupied_bed.admitted_at

    occupied_bed.is_occupied = False
    occupied_bed.patient_id = None
    occupied_bed.discharged_at = now
    patient.is_admitted = False

    db.commit()
    db.refresh(occupied_bed)
    db.refresh(patient)

    return {
        "message": f"Discharged {patient.full_name} (ID {patient.id}) from bed {bed_number} ({ward_name} ward).",
        "bed_id": occupied_bed.id,
        "bed_number": bed_number,
        "ward": ward_name,
        "patient_id": patient.id,
        "patient_name": patient.full_name,
        "admitted_at": previous_admitted_at.isoformat() if previous_admitted_at else None,
        "discharged_at": occupied_bed.discharged_at.isoformat(),
    }


@app.get("/beds/{bed_id}", response_model=schemas.BedResponse, tags=["Beds"])
def get_bed(bed_id: int, db: Session = Depends(get_db)):
    """Get a single bed by its ID."""
    bed = db.query(models.Bed).filter(models.Bed.id == bed_id).first()
    if not bed:
        raise HTTPException(status_code=404, detail=f"Bed with ID {bed_id} not found")
    return bed


@app.post("/beds", response_model=schemas.BedResponse, status_code=201, tags=["Beds"])
def create_bed(payload: schemas.BedCreate, db: Session = Depends(get_db)):
    """Create a new bed inside a ward."""
    bed = models.Bed(**payload.model_dump())
    db.add(bed)
    db.commit()
    db.refresh(bed)
    return bed


@app.put("/beds/{bed_id}", response_model=schemas.BedResponse, tags=["Beds"])
def update_bed(bed_id: int, payload: schemas.BedUpdate, db: Session = Depends(get_db)):
    """Update bed occupancy, assigned patient, or timestamps."""
    bed = db.query(models.Bed).filter(models.Bed.id == bed_id).first()
    if not bed:
        raise HTTPException(status_code=404, detail=f"Bed with ID {bed_id} not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(bed, field, value)
    db.commit()
    db.refresh(bed)
    return bed


# ==============================================================================
# 3. PATIENTS ENDPOINTS
# ==============================================================================
@app.get("/patients", response_model=List[schemas.PatientResponse], tags=["Patients"])
def list_patients(db: Session = Depends(get_db)):
    """Return all registered patients."""
    return db.query(models.Patient).order_by(models.Patient.id).all()


@app.get("/patients/{patient_id}", response_model=schemas.PatientResponse, tags=["Patients"])
def get_patient(patient_id: int, db: Session = Depends(get_db)):
    """Get a single patient by ID."""
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail=f"Patient with ID {patient_id} not found")
    return patient


@app.post("/patients", response_model=schemas.PatientResponse, status_code=201, tags=["Patients"])
def create_patient(payload: schemas.PatientCreate, db: Session = Depends(get_db)):
    """Register a new patient."""
    patient = models.Patient(**payload.model_dump())
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient


@app.put("/patients/{patient_id}", response_model=schemas.PatientResponse, tags=["Patients"])
def update_patient(
    patient_id: int, payload: schemas.PatientUpdate, db: Session = Depends(get_db)
):
    """Update a patient's diagnosis, contact details, or admission status."""
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail=f"Patient with ID {patient_id} not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(patient, field, value)
    db.commit()
    db.refresh(patient)
    return patient


# ==============================================================================
# 4. DOCTORS ENDPOINTS
# ==============================================================================
@app.get("/doctors", response_model=List[schemas.DoctorResponse], tags=["Doctors"])
def list_doctors(db: Session = Depends(get_db)):
    """Return all hospital doctors."""
    return db.query(models.Doctor).order_by(models.Doctor.id).all()


@app.get("/doctors/{doctor_id}", response_model=schemas.DoctorResponse, tags=["Doctors"])
def get_doctor(doctor_id: int, db: Session = Depends(get_db)):
    """Get a single doctor by ID."""
    doctor = db.query(models.Doctor).filter(models.Doctor.id == doctor_id).first()
    if not doctor:
        raise HTTPException(status_code=404, detail=f"Doctor with ID {doctor_id} not found")
    return doctor


@app.post("/doctors", response_model=schemas.DoctorResponse, status_code=201, tags=["Doctors"])
def create_doctor(payload: schemas.DoctorCreate, db: Session = Depends(get_db)):
    """Add a new doctor."""
    doctor = models.Doctor(**payload.model_dump())
    db.add(doctor)
    db.commit()
    db.refresh(doctor)
    return doctor


@app.put("/doctors/{doctor_id}", response_model=schemas.DoctorResponse, tags=["Doctors"])
def update_doctor(
    doctor_id: int, payload: schemas.DoctorUpdate, db: Session = Depends(get_db)
):
    """Update a doctor's availability, ward assignment, or contact info."""
    doctor = db.query(models.Doctor).filter(models.Doctor.id == doctor_id).first()
    if not doctor:
        raise HTTPException(status_code=404, detail=f"Doctor with ID {doctor_id} not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(doctor, field, value)
    db.commit()
    db.refresh(doctor)
    return doctor


# ==============================================================================
# 5. APPOINTMENTS ENDPOINTS
# ==============================================================================
@app.get("/appointments", response_model=List[schemas.AppointmentResponse], tags=["Appointments"])
def list_appointments(db: Session = Depends(get_db)):
    """List all scheduled, completed, or cancelled appointments."""
    return db.query(models.Appointment).order_by(models.Appointment.id).all()


@app.get(
    "/appointments/{appointment_id}",
    response_model=schemas.AppointmentResponse,
    tags=["Appointments"],
)
def get_appointment(appointment_id: int, db: Session = Depends(get_db)):
    """Get a single appointment by ID."""
    appt = db.query(models.Appointment).filter(models.Appointment.id == appointment_id).first()
    if not appt:
        raise HTTPException(
            status_code=404, detail=f"Appointment with ID {appointment_id} not found"
        )
    return appt


@app.post(
    "/appointments",
    response_model=schemas.AppointmentResponse,
    status_code=201,
    tags=["Appointments"],
)
def create_appointment(payload: schemas.AppointmentCreate, db: Session = Depends(get_db)):
    """Book a new appointment between a patient and a doctor."""
    appt = models.Appointment(**payload.model_dump())
    db.add(appt)
    db.commit()
    db.refresh(appt)
    return appt


@app.put(
    "/appointments/{appointment_id}",
    response_model=schemas.AppointmentResponse,
    tags=["Appointments"],
)
def update_appointment(
    appointment_id: int, payload: schemas.AppointmentUpdate, db: Session = Depends(get_db)
):
    """Update appointment status (Scheduled, Completed, Cancelled) or notes."""
    appt = db.query(models.Appointment).filter(models.Appointment.id == appointment_id).first()
    if not appt:
        raise HTTPException(
            status_code=404, detail=f"Appointment with ID {appointment_id} not found"
        )
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(appt, field, value)
    db.commit()
    db.refresh(appt)
    return appt


# ==============================================================================
# 6. MEDICINES ENDPOINTS
# ==============================================================================
@app.get("/medicines", response_model=List[schemas.MedicineResponse], tags=["Medicines"])
def list_medicines(db: Session = Depends(get_db)):
    """List all pharmacy medicines and their current stock."""
    return db.query(models.Medicine).order_by(models.Medicine.id).all()


@app.get("/medicines/{medicine_id}", response_model=schemas.MedicineResponse, tags=["Medicines"])
def get_medicine(medicine_id: int, db: Session = Depends(get_db)):
    """Get a single medicine by ID."""
    med = db.query(models.Medicine).filter(models.Medicine.id == medicine_id).first()
    if not med:
        raise HTTPException(status_code=404, detail=f"Medicine with ID {medicine_id} not found")
    return med


@app.post(
    "/medicines", response_model=schemas.MedicineResponse, status_code=201, tags=["Medicines"]
)
def create_medicine(payload: schemas.MedicineCreate, db: Session = Depends(get_db)):
    """Add a new medicine to the pharmacy inventory."""
    med = models.Medicine(**payload.model_dump())
    db.add(med)
    db.commit()
    db.refresh(med)
    return med


@app.put("/medicines/{medicine_id}", response_model=schemas.MedicineResponse, tags=["Medicines"])
def update_medicine(
    medicine_id: int, payload: schemas.MedicineUpdate, db: Session = Depends(get_db)
):
    """Update medicine stock quantity, unit price, or expiry date."""
    med = db.query(models.Medicine).filter(models.Medicine.id == medicine_id).first()
    if not med:
        raise HTTPException(status_code=404, detail=f"Medicine with ID {medicine_id} not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(med, field, value)
    db.commit()
    db.refresh(med)
    return med


# ==============================================================================
# 7. LAB TESTS ENDPOINTS
# ==============================================================================
@app.get("/lab_tests", response_model=List[schemas.LabTestResponse], tags=["Lab Tests"])
def list_lab_tests(db: Session = Depends(get_db)):
    """List all laboratory diagnostic tests."""
    return db.query(models.LabTest).order_by(models.LabTest.id).all()


@app.get("/lab_tests/{test_id}", response_model=schemas.LabTestResponse, tags=["Lab Tests"])
def get_lab_test(test_id: int, db: Session = Depends(get_db)):
    """Get a single lab test by ID."""
    test = db.query(models.LabTest).filter(models.LabTest.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail=f"Lab test with ID {test_id} not found")
    return test


@app.post(
    "/lab_tests", response_model=schemas.LabTestResponse, status_code=201, tags=["Lab Tests"]
)
def create_lab_test(payload: schemas.LabTestCreate, db: Session = Depends(get_db)):
    """Order a new diagnostic lab test for a patient."""
    test = models.LabTest(**payload.model_dump())
    db.add(test)
    db.commit()
    db.refresh(test)
    return test


@app.put("/lab_tests/{test_id}", response_model=schemas.LabTestResponse, tags=["Lab Tests"])
def update_lab_test(
    test_id: int, payload: schemas.LabTestUpdate, db: Session = Depends(get_db)
):
    """Update lab test status (Pending -> Completed) and record test results."""
    test = db.query(models.LabTest).filter(models.LabTest.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail=f"Lab test with ID {test_id} not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(test, field, value)
    db.commit()
    db.refresh(test)
    return test


# ==============================================================================
# 8. BILLS ENDPOINTS
# ==============================================================================
@app.get("/bills", response_model=List[schemas.BillResponse], tags=["Bills"])
def list_bills(db: Session = Depends(get_db)):
    """List all patient bills."""
    return db.query(models.Bill).order_by(models.Bill.id).all()


@app.get("/bills/{bill_id}", response_model=schemas.BillResponse, tags=["Bills"])
def get_bill(bill_id: int, db: Session = Depends(get_db)):
    """Get a single bill by ID."""
    bill = db.query(models.Bill).filter(models.Bill.id == bill_id).first()
    if not bill:
        raise HTTPException(status_code=404, detail=f"Bill with ID {bill_id} not found")
    return bill


@app.post("/bills", response_model=schemas.BillResponse, status_code=201, tags=["Bills"])
def create_bill(payload: schemas.BillCreate, db: Session = Depends(get_db)):
    """Create a new billing invoice for a patient."""
    bill = models.Bill(**payload.model_dump())
    db.add(bill)
    db.commit()
    db.refresh(bill)
    return bill


@app.put("/bills/{bill_id}", response_model=schemas.BillResponse, tags=["Bills"])
def update_bill(bill_id: int, payload: schemas.BillUpdate, db: Session = Depends(get_db)):
    """Update bill payment status (Unpaid, Partial, Paid) or total amount."""
    bill = db.query(models.Bill).filter(models.Bill.id == bill_id).first()
    if not bill:
        raise HTTPException(status_code=404, detail=f"Bill with ID {bill_id} not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(bill, field, value)
    db.commit()
    db.refresh(bill)
    return bill
