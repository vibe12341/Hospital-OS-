"""
seed.py — Synthetic Database Seeder for HospitalOS (Phase 1).

Populates all 8 database tables with realistic, 100% fake (synthetic) hospital data:
- 4 Wards (ICU, General, Pediatrics, Emergency)
- 16 Beds (with initial occupied beds and admitted_at/discharged_at timestamps)
- 10 Synthetic Patients
- 6 Doctors
- 6 Appointments
- 8 Medicines (with stock quantities and unit prices)
- 6 Lab Tests
- 6 Bills

Run this script from inside the hospitalos/ folder:
  python -m data.seed
"""

from datetime import datetime, timedelta, timezone
from backend.database import Base, SessionLocal, engine
from backend import models


def seed_database():
    """Drop existing tables, recreate all 8 tables, and insert synthetic data."""
    print("Resetting and creating HospitalOS database tables...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    now = datetime.now(timezone.utc)

    try:
        # 1. Seed Wards
        wards = [
            models.Ward(name="ICU", floor=3, capacity=4),
            models.Ward(name="General", floor=1, capacity=4),
            models.Ward(name="Pediatrics", floor=2, capacity=4),
            models.Ward(name="Emergency", floor=0, capacity=4),
        ]
        db.add_all(wards)
        db.commit()
        for w in wards:
            db.refresh(w)

        # 2. Seed Patients (100% synthetic names and phone numbers)
        patients = [
            models.Patient(
                full_name="Aarav Sharma",
                age=58,
                gender="Male",
                phone="555-0101",
                blood_group="O+",
                diagnosis="Acute Myocardial Infarction",
                is_admitted=True,
                created_at=now - timedelta(days=3),
            ),
            models.Patient(
                full_name="Meera Nair",
                age=34,
                gender="Female",
                phone="555-0102",
                blood_group="A+",
                diagnosis="Community-Acquired Pneumonia",
                is_admitted=True,
                created_at=now - timedelta(days=2),
            ),
            models.Patient(
                full_name="Rohan Verma",
                age=27,
                gender="Male",
                phone="555-0103",
                blood_group="B+",
                diagnosis="Viral Fever & Dehydration",
                is_admitted=False,
                created_at=now - timedelta(days=5),
            ),
            models.Patient(
                full_name="Ananya Iyer",
                age=8,
                gender="Female",
                phone="555-0104",
                blood_group="AB+",
                diagnosis="Pediatric Asthma Exacerbation",
                is_admitted=True,
                created_at=now - timedelta(days=1),
            ),
            models.Patient(
                full_name="Kabir Patel",
                age=45,
                gender="Male",
                phone="555-0105",
                blood_group="O-",
                diagnosis="Type 2 Diabetes Follow-up",
                is_admitted=False,
                created_at=now - timedelta(days=7),
            ),
            models.Patient(
                full_name="Priya Deshmukh",
                age=62,
                gender="Female",
                phone="555-0106",
                blood_group="A-",
                diagnosis="Hypertensive Crisis",
                is_admitted=True,
                created_at=now - timedelta(hours=18),
            ),
            models.Patient(
                full_name="Vikram Rao",
                age=41,
                gender="Male",
                phone="555-0107",
                blood_group="B-",
                diagnosis="Distal Radius Fracture",
                is_admitted=True,
                created_at=now - timedelta(hours=8),
            ),
            models.Patient(
                full_name="Sanya Kapoor",
                age=29,
                gender="Female",
                phone="555-0108",
                blood_group="O+",
                diagnosis="Migraine with Aura",
                is_admitted=False,
                created_at=now - timedelta(days=4),
            ),
            models.Patient(
                full_name="Devansh Joshi",
                age=11,
                gender="Male",
                phone="555-0109",
                blood_group="A+",
                diagnosis="Acute Gastroenteritis",
                is_admitted=False,
                created_at=now - timedelta(days=2),
            ),
            models.Patient(
                full_name="Neha Kulkarni",
                age=51,
                gender="Female",
                phone="555-0110",
                blood_group="AB-",
                diagnosis="Post-Op Cholecystectomy",
                is_admitted=True,
                created_at=now - timedelta(days=2),
            ),
        ]
        db.add_all(patients)
        db.commit()
        for p in patients:
            db.refresh(p)

        # 3. Seed 16 Beds (4 per ward) with admitted_at and discharged_at timestamps
        beds = [
            # ICU Ward (ward_id = 1)
            models.Bed(
                bed_number="ICU-01",
                ward_id=wards[0].id,
                is_occupied=True,
                patient_id=patients[0].id,
                admitted_at=now - timedelta(days=2, hours=14),
                discharged_at=None,
            ),
            models.Bed(
                bed_number="ICU-02",
                ward_id=wards[0].id,
                is_occupied=True,
                patient_id=patients[5].id,
                admitted_at=now - timedelta(hours=16),
                discharged_at=None,
            ),
            models.Bed(
                bed_number="ICU-03",
                ward_id=wards[0].id,
                is_occupied=False,
                patient_id=None,
                admitted_at=now - timedelta(days=6),
                discharged_at=now - timedelta(days=1, hours=4),
            ),
            models.Bed(
                bed_number="ICU-04",
                ward_id=wards[0].id,
                is_occupied=False,
                patient_id=None,
                admitted_at=None,
                discharged_at=None,
            ),
            # General Ward (ward_id = 2)
            models.Bed(
                bed_number="GEN-01",
                ward_id=wards[1].id,
                is_occupied=True,
                patient_id=patients[1].id,
                admitted_at=now - timedelta(days=2, hours=3),
                discharged_at=None,
            ),
            models.Bed(
                bed_number="GEN-02",
                ward_id=wards[1].id,
                is_occupied=True,
                patient_id=patients[9].id,
                admitted_at=now - timedelta(days=1, hours=20),
                discharged_at=None,
            ),
            models.Bed(
                bed_number="GEN-03",
                ward_id=wards[1].id,
                is_occupied=False,
                patient_id=None,
                admitted_at=now - timedelta(days=5),
                discharged_at=now - timedelta(days=2, hours=6),
            ),
            models.Bed(
                bed_number="GEN-04",
                ward_id=wards[1].id,
                is_occupied=False,
                patient_id=None,
                admitted_at=None,
                discharged_at=None,
            ),
            # Pediatrics Ward (ward_id = 3)
            models.Bed(
                bed_number="PED-01",
                ward_id=wards[2].id,
                is_occupied=True,
                patient_id=patients[3].id,
                admitted_at=now - timedelta(hours=22),
                discharged_at=None,
            ),
            models.Bed(
                bed_number="PED-02",
                ward_id=wards[2].id,
                is_occupied=False,
                patient_id=None,
                admitted_at=now - timedelta(days=3),
                discharged_at=now - timedelta(hours=12),
            ),
            models.Bed(
                bed_number="PED-03",
                ward_id=wards[2].id,
                is_occupied=False,
                patient_id=None,
                admitted_at=None,
                discharged_at=None,
            ),
            models.Bed(
                bed_number="PED-04",
                ward_id=wards[2].id,
                is_occupied=False,
                patient_id=None,
                admitted_at=None,
                discharged_at=None,
            ),
            # Emergency Ward (ward_id = 4)
            models.Bed(
                bed_number="ER-01",
                ward_id=wards[3].id,
                is_occupied=True,
                patient_id=patients[6].id,
                admitted_at=now - timedelta(hours=7),
                discharged_at=None,
            ),
            models.Bed(
                bed_number="ER-02",
                ward_id=wards[3].id,
                is_occupied=False,
                patient_id=None,
                admitted_at=None,
                discharged_at=None,
            ),
            models.Bed(
                bed_number="ER-03",
                ward_id=wards[3].id,
                is_occupied=False,
                patient_id=None,
                admitted_at=None,
                discharged_at=None,
            ),
            models.Bed(
                bed_number="ER-04",
                ward_id=wards[3].id,
                is_occupied=False,
                patient_id=None,
                admitted_at=None,
                discharged_at=None,
            ),
        ]
        db.add_all(beds)
        db.commit()

        # 4. Seed Doctors
        doctors = [
            models.Doctor(
                full_name="Dr. Rajesh Menon",
                specialization="Cardiology",
                phone="555-0201",
                ward_id=wards[0].id,
                is_available=True,
            ),
            models.Doctor(
                full_name="Dr. Sunita Reddy",
                specialization="Internal Medicine",
                phone="555-0202",
                ward_id=wards[1].id,
                is_available=True,
            ),
            models.Doctor(
                full_name="Dr. Farhan Ali",
                specialization="Pediatrics",
                phone="555-0203",
                ward_id=wards[2].id,
                is_available=True,
            ),
            models.Doctor(
                full_name="Dr. Kavita Bose",
                specialization="Emergency & Trauma",
                phone="555-0204",
                ward_id=wards[3].id,
                is_available=True,
            ),
            models.Doctor(
                full_name="Dr. Siddharth Chatterjee",
                specialization="Neurology",
                phone="555-0205",
                ward_id=wards[1].id,
                is_available=False,
            ),
            models.Doctor(
                full_name="Dr. Pooja Malhotra",
                specialization="General Surgery",
                phone="555-0206",
                ward_id=wards[1].id,
                is_available=True,
            ),
        ]
        db.add_all(doctors)
        db.commit()
        for d in doctors:
            db.refresh(d)

        # 5. Seed Appointments
        appointments = [
            models.Appointment(
                patient_id=patients[0].id,
                doctor_id=doctors[0].id,
                appointment_time=now + timedelta(hours=2),
                status="Scheduled",
                notes="Post-angioplasty ICU cardiac evaluation",
            ),
            models.Appointment(
                patient_id=patients[2].id,
                doctor_id=doctors[1].id,
                appointment_time=now - timedelta(days=1),
                status="Completed",
                notes="Outpatient recovery checkup",
            ),
            models.Appointment(
                patient_id=patients[3].id,
                doctor_id=doctors[2].id,
                appointment_time=now + timedelta(hours=4),
                status="Scheduled",
                notes="Nebulization response review",
            ),
            models.Appointment(
                patient_id=patients[4].id,
                doctor_id=doctors[1].id,
                appointment_time=now + timedelta(days=1),
                status="Scheduled",
                notes="Quarterly HbA1c review",
            ),
            models.Appointment(
                patient_id=patients[7].id,
                doctor_id=doctors[4].id,
                appointment_time=now - timedelta(days=2),
                status="Cancelled",
                notes="Rescheduled at patient request",
            ),
            models.Appointment(
                patient_id=patients[9].id,
                doctor_id=doctors[5].id,
                appointment_time=now + timedelta(hours=6),
                status="Scheduled",
                notes="Surgical dressing inspection",
            ),
        ]
        db.add_all(appointments)
        db.commit()

        # 6. Seed Medicines (with stock quantities)
        medicines = [
            models.Medicine(
                name="Amoxicillin 500mg",
                category="Antibiotic",
                stock_quantity=240,
                unit_price=1.50,
                expiry_date="2027-08-15",
            ),
            models.Medicine(
                name="Paracetamol 650mg",
                category="Analgesic / Antipyretic",
                stock_quantity=520,
                unit_price=0.40,
                expiry_date="2027-11-30",
            ),
            models.Medicine(
                name="Atorvastatin 20mg",
                category="Cardiovascular",
                stock_quantity=180,
                unit_price=2.20,
                expiry_date="2027-05-20",
            ),
            models.Medicine(
                name="Salbutamol Inhaler",
                category="Bronchodilator",
                stock_quantity=45,
                unit_price=8.75,
                expiry_date="2027-04-10",
            ),
            models.Medicine(
                name="Metformin 500mg",
                category="Antidiabetic",
                stock_quantity=310,
                unit_price=0.85,
                expiry_date="2028-01-15",
            ),
            models.Medicine(
                name="Amlodipine 5mg",
                category="Antihypertensive",
                stock_quantity=195,
                unit_price=1.10,
                expiry_date="2027-09-01",
            ),
            models.Medicine(
                name="Ceftriaxone 1g IV",
                category="Antibiotic (IV)",
                stock_quantity=18,
                unit_price=6.50,
                expiry_date="2027-02-28",
            ),
            models.Medicine(
                name="Ondansetron 4mg",
                category="Antiemetic",
                stock_quantity=140,
                unit_price=1.25,
                expiry_date="2027-10-12",
            ),
        ]
        db.add_all(medicines)
        db.commit()

        # 7. Seed Lab Tests
        lab_tests = [
            models.LabTest(
                patient_id=patients[0].id,
                doctor_id=doctors[0].id,
                test_name="Troponin-I & Lipid Profile",
                status="Completed",
                result="Troponin-I elevated (1.8 ng/mL); LDL 148 mg/dL",
                ordered_at=now - timedelta(days=2),
            ),
            models.LabTest(
                patient_id=patients[1].id,
                doctor_id=doctors[1].id,
                test_name="Chest X-Ray & Complete Blood Count",
                status="Completed",
                result="Right lower lobe consolidation; WBC 13,400 /uL",
                ordered_at=now - timedelta(days=1, hours=12),
            ),
            models.LabTest(
                patient_id=patients[3].id,
                doctor_id=doctors[2].id,
                test_name="Pulse Oximetry & Spirometry",
                status="Completed",
                result="SpO2 96% on room air after bronchodilator",
                ordered_at=now - timedelta(hours=18),
            ),
            models.LabTest(
                patient_id=patients[4].id,
                doctor_id=doctors[1].id,
                test_name="HbA1c & Fasting Blood Glucose",
                status="Pending",
                result=None,
                ordered_at=now - timedelta(hours=5),
            ),
            models.LabTest(
                patient_id=patients[5].id,
                doctor_id=doctors[0].id,
                test_name="Renal Function Panel & ECG",
                status="Pending",
                result=None,
                ordered_at=now - timedelta(hours=3),
            ),
            models.LabTest(
                patient_id=patients[6].id,
                doctor_id=doctors[3].id,
                test_name="Right Wrist AP/Lateral Radiograph",
                status="Completed",
                result="Non-displaced distal radius fracture confirmed",
                ordered_at=now - timedelta(hours=6),
            ),
        ]
        db.add_all(lab_tests)
        db.commit()

        # 8. Seed Bills
        bills = [
            models.Bill(
                patient_id=patients[0].id,
                total_amount=1450.00,
                paid_status="Partial",
                description="ICU Bed (3 days), Cardiac Monitoring, Troponin-I Lab",
                created_at=now - timedelta(days=1),
            ),
            models.Bill(
                patient_id=patients[1].id,
                total_amount=420.00,
                paid_status="Unpaid",
                description="General Ward Bed (2 days), IV Antibiotics, Chest X-Ray",
                created_at=now - timedelta(hours=20),
            ),
            models.Bill(
                patient_id=patients[2].id,
                total_amount=85.00,
                paid_status="Paid",
                description="Outpatient Consultation & Oral Rehydration Pack",
                created_at=now - timedelta(days=2),
            ),
            models.Bill(
                patient_id=patients[3].id,
                total_amount=310.00,
                paid_status="Unpaid",
                description="Pediatrics Bed (1 day), Nebulization Therapy",
                created_at=now - timedelta(hours=10),
            ),
            models.Bill(
                patient_id=patients[6].id,
                total_amount=275.00,
                paid_status="Paid",
                description="Emergency Cast Application & Wrist X-Ray",
                created_at=now - timedelta(hours=4),
            ),
            models.Bill(
                patient_id=patients[9].id,
                total_amount=980.00,
                paid_status="Unpaid",
                description="Laparoscopic Cholecystectomy & General Ward Recovery",
                created_at=now - timedelta(days=1),
            ),
        ]
        db.add_all(bills)
        db.commit()

        print("Successfully seeded HospitalOS database with synthetic records!")
        print("  - 4 Wards, 16 Beds (6 Occupied, 10 Free)")
        print("  - 10 Patients, 6 Doctors, 6 Appointments")
        print("  - 8 Medicines, 6 Lab Tests, 6 Bills")

    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
