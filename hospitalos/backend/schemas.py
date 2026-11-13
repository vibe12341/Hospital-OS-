"""
schemas.py — Pydantic Data Validation Schemas for FastAPI.

While models.py defines how data is stored in the SQLite/PostgreSQL database,
schemas.py defines what JSON data FastAPI expects to receive from users (Create/Update)
and what JSON data FastAPI sends back (Response).
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


# ==============================================================================
# 1. WARD SCHEMAS
# ==============================================================================
class WardCreate(BaseModel):
    name: str
    floor: int
    capacity: int


class WardUpdate(BaseModel):
    name: Optional[str] = None
    floor: Optional[int] = None
    capacity: Optional[int] = None


class WardResponse(BaseModel):
    id: int
    name: str
    floor: int
    capacity: int

    model_config = ConfigDict(from_attributes=True)


# ==============================================================================
# 2. BED SCHEMAS (Includes admitted_at and discharged_at timestamps)
# ==============================================================================
class BedCreate(BaseModel):
    bed_number: str
    ward_id: int
    is_occupied: bool = False
    patient_id: Optional[int] = None


class BedUpdate(BaseModel):
    is_occupied: Optional[bool] = None
    patient_id: Optional[int] = None
    admitted_at: Optional[datetime] = None
    discharged_at: Optional[datetime] = None


class BedResponse(BaseModel):
    id: int
    bed_number: str
    ward_id: int
    is_occupied: bool
    patient_id: Optional[int] = None
    admitted_at: Optional[datetime] = None
    discharged_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class AdmitPatientRequest(BaseModel):
    patient_id: int
    ward: str


class DischargePatientRequest(BaseModel):
    patient_id: int


# ==============================================================================
# 3. PATIENT SCHEMAS
# ==============================================================================
class PatientCreate(BaseModel):
    full_name: str
    age: int
    gender: str
    phone: str
    blood_group: str
    diagnosis: Optional[str] = None
    is_admitted: bool = False


class PatientUpdate(BaseModel):
    full_name: Optional[str] = None
    age: Optional[int] = None
    phone: Optional[str] = None
    diagnosis: Optional[str] = None
    is_admitted: Optional[bool] = None


class PatientResponse(BaseModel):
    id: int
    full_name: str
    age: int
    gender: str
    phone: str
    blood_group: str
    diagnosis: Optional[str] = None
    is_admitted: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==============================================================================
# 4. DOCTOR SCHEMAS
# ==============================================================================
class DoctorCreate(BaseModel):
    full_name: str
    specialization: str
    phone: str
    ward_id: Optional[int] = None
    is_available: bool = True


class DoctorUpdate(BaseModel):
    specialization: Optional[str] = None
    phone: Optional[str] = None
    ward_id: Optional[int] = None
    is_available: Optional[bool] = None


class DoctorResponse(BaseModel):
    id: int
    full_name: str
    specialization: str
    phone: str
    ward_id: Optional[int] = None
    is_available: bool

    model_config = ConfigDict(from_attributes=True)


# ==============================================================================
# 5. APPOINTMENT SCHEMAS
# ==============================================================================
class AppointmentCreate(BaseModel):
    patient_id: int
    doctor_id: int
    appointment_time: datetime
    status: str = "Scheduled"
    notes: Optional[str] = None


class AppointmentUpdate(BaseModel):
    appointment_time: Optional[datetime] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class AppointmentResponse(BaseModel):
    id: int
    patient_id: int
    doctor_id: int
    appointment_time: datetime
    status: str
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ==============================================================================
# 6. MEDICINE SCHEMAS
# ==============================================================================
class MedicineCreate(BaseModel):
    name: str
    category: str
    stock_quantity: int
    unit_price: float
    expiry_date: str


class MedicineUpdate(BaseModel):
    stock_quantity: Optional[int] = None
    unit_price: Optional[float] = None
    expiry_date: Optional[str] = None


class MedicineResponse(BaseModel):
    id: int
    name: str
    category: str
    stock_quantity: int
    unit_price: float
    expiry_date: str

    model_config = ConfigDict(from_attributes=True)


# ==============================================================================
# 7. LAB TEST SCHEMAS
# ==============================================================================
class LabTestCreate(BaseModel):
    patient_id: int
    doctor_id: int
    test_name: str
    status: str = "Pending"
    result: Optional[str] = None


class LabTestUpdate(BaseModel):
    status: Optional[str] = None
    result: Optional[str] = None


class LabTestResponse(BaseModel):
    id: int
    patient_id: int
    doctor_id: int
    test_name: str
    status: str
    result: Optional[str] = None
    ordered_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==============================================================================
# 8. BILL SCHEMAS
# ==============================================================================
class BillCreate(BaseModel):
    patient_id: int
    total_amount: float
    paid_status: str = "Unpaid"
    description: str


class BillUpdate(BaseModel):
    total_amount: Optional[float] = None
    paid_status: Optional[str] = None
    description: Optional[str] = None


class BillResponse(BaseModel):
    id: int
    patient_id: int
    total_amount: float
    paid_status: str
    description: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
