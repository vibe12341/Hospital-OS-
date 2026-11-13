"""
models.py — SQLAlchemy Database Tables (8 Tables) for HospitalOS.

Each Python class below represents one table in our database:
1. Ward        -> wards
2. Bed         -> beds (includes admitted_at and discharged_at timestamps)
3. Patient     -> patients
4. Doctor      -> doctors
5. Appointment -> appointments
6. Medicine    -> medicines
7. LabTest     -> lab_tests
8. Bill        -> bills
"""

from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from .database import Base


def utc_now():
    """Helper to return the current UTC timestamp."""
    return datetime.now(timezone.utc)


class Ward(Base):
    """Table 1: Hospital departments/wards (e.g., ICU, General, Pediatrics, Emergency)."""
    __tablename__ = "wards"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False, index=True)
    floor = Column(Integer, nullable=False)
    capacity = Column(Integer, nullable=False)

    # Relationships to beds and doctors in this ward
    beds = relationship("Bed", back_populates="ward")
    doctors = relationship("Doctor", back_populates="ward")


class Patient(Base):
    """Table 2: Registered hospital patients (synthetic data only)."""
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False, index=True)
    age = Column(Integer, nullable=False)
    gender = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    blood_group = Column(String, nullable=False)
    diagnosis = Column(String, nullable=True)
    is_admitted = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    # Relationships
    bed = relationship("Bed", back_populates="patient", uselist=False)
    appointments = relationship("Appointment", back_populates="patient")
    lab_tests = relationship("LabTest", back_populates="patient")
    bills = relationship("Bill", back_populates="patient")


class Bed(Base):
    """
    Table 3: Individual hospital beds inside a ward.
    Tracks occupancy, assigned patient, and exact admission/discharge timestamps.
    """
    __tablename__ = "beds"

    id = Column(Integer, primary_key=True, index=True)
    bed_number = Column(String, unique=True, nullable=False, index=True)
    ward_id = Column(Integer, ForeignKey("wards.id"), nullable=False)
    is_occupied = Column(Boolean, default=False, nullable=False)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=True)
    admitted_at = Column(DateTime, nullable=True)
    discharged_at = Column(DateTime, nullable=True)

    # Relationships
    ward = relationship("Ward", back_populates="beds")
    patient = relationship("Patient", back_populates="bed")


class Doctor(Base):
    """Table 4: Hospital doctors and their medical specialization."""
    __tablename__ = "doctors"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False, index=True)
    specialization = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    ward_id = Column(Integer, ForeignKey("wards.id"), nullable=True)
    is_available = Column(Boolean, default=True, nullable=False)

    # Relationships
    ward = relationship("Ward", back_populates="doctors")
    appointments = relationship("Appointment", back_populates="doctor")
    lab_tests = relationship("LabTest", back_populates="doctor")


class Appointment(Base):
    """Table 5: Scheduled consultations between a patient and a doctor."""
    __tablename__ = "appointments"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("doctors.id"), nullable=False)
    appointment_time = Column(DateTime, nullable=False)
    status = Column(String, default="Scheduled", nullable=False)  # Scheduled, Completed, Cancelled
    notes = Column(String, nullable=True)

    # Relationships
    patient = relationship("Patient", back_populates="appointments")
    doctor = relationship("Doctor", back_populates="appointments")


class Medicine(Base):
    """Table 6: Pharmacy medicines inventory with stock quantity and unit price."""
    __tablename__ = "medicines"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False, index=True)
    category = Column(String, nullable=False)
    stock_quantity = Column(Integer, default=0, nullable=False)
    unit_price = Column(Float, nullable=False)
    expiry_date = Column(String, nullable=False)  # ISO date string YYYY-MM-DD


class LabTest(Base):
    """Table 7: Diagnostic laboratory tests ordered for a patient by a doctor."""
    __tablename__ = "lab_tests"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("doctors.id"), nullable=False)
    test_name = Column(String, nullable=False)
    status = Column(String, default="Pending", nullable=False)  # Pending, Completed
    result = Column(String, nullable=True)
    ordered_at = Column(DateTime, default=utc_now, nullable=False)

    # Relationships
    patient = relationship("Patient", back_populates="lab_tests")
    doctor = relationship("Doctor", back_populates="lab_tests")


class Bill(Base):
    """Table 8: Patient billing invoices and payment status."""
    __tablename__ = "bills"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    total_amount = Column(Float, nullable=False)
    paid_status = Column(String, default="Unpaid", nullable=False)  # Unpaid, Paid, Partial
    description = Column(String, nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    # Relationships
    patient = relationship("Patient", back_populates="bills")
