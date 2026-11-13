export interface Ward {
  id: number;
  name: string;
  floor: number;
  capacity: number;
}

export interface Bed {
  id: number;
  bed_number: string;
  ward_id: number;
  is_occupied: boolean;
  patient_id: number | null;
  admitted_at: string | null;
  discharged_at: string | null;
}

export interface Patient {
  id: number;
  full_name: string;
  age: number;
  gender: string;
  phone: string;
  blood_group: string;
  diagnosis: string | null;
  is_admitted: boolean;
  created_at: string;
}

export interface Doctor {
  id: number;
  full_name: string;
  specialization: string;
  phone: string;
  ward_id: number | null;
  is_available: boolean;
}

export interface Appointment {
  id: number;
  patient_id: number;
  doctor_id: number;
  appointment_time: string;
  status: 'Scheduled' | 'Completed' | 'Cancelled';
  notes: string | null;
}

export interface Medicine {
  id: number;
  name: string;
  category: string;
  stock_quantity: number;
  unit_price: number;
  expiry_date: string;
}

export interface LabTest {
  id: number;
  patient_id: number;
  doctor_id: number;
  test_name: string;
  status: 'Pending' | 'Completed';
  result: string | null;
  ordered_at: string;
}

export interface Bill {
  id: number;
  patient_id: number;
  total_amount: number;
  paid_status: 'Unpaid' | 'Paid' | 'Partial';
  description: string;
  created_at: string;
}

export interface HospitalDatabaseState {
  wards: Ward[];
  beds: Bed[];
  patients: Patient[];
  doctors: Doctor[];
  appointments: Appointment[];
  medicines: Medicine[];
  lab_tests: LabTest[];
  bills: Bill[];
}

export function createInitialHospitalState(): HospitalDatabaseState {
  return {
    wards: [
      { id: 1, name: 'ICU', floor: 3, capacity: 4 },
      { id: 2, name: 'General', floor: 1, capacity: 4 },
      { id: 3, name: 'Pediatrics', floor: 2, capacity: 4 },
      { id: 4, name: 'Emergency', floor: 0, capacity: 4 },
    ],
    patients: [
      {
        id: 1,
        full_name: 'Aarav Sharma',
        age: 58,
        gender: 'Male',
        phone: '555-0101',
        blood_group: 'O+',
        diagnosis: 'Acute Myocardial Infarction',
        is_admitted: true,
        created_at: '2026-11-07T08:30:00Z',
      },
      {
        id: 2,
        full_name: 'Meera Nair',
        age: 34,
        gender: 'Female',
        phone: '555-0102',
        blood_group: 'A+',
        diagnosis: 'Community-Acquired Pneumonia',
        is_admitted: true,
        created_at: '2026-11-08T10:15:00Z',
      },
      {
        id: 3,
        full_name: 'Rohan Verma',
        age: 27,
        gender: 'Male',
        phone: '555-0103',
        blood_group: 'B+',
        diagnosis: 'Viral Fever & Dehydration',
        is_admitted: false,
        created_at: '2026-11-05T14:20:00Z',
      },
      {
        id: 4,
        full_name: 'Ananya Iyer',
        age: 8,
        gender: 'Female',
        phone: '555-0104',
        blood_group: 'AB+',
        diagnosis: 'Pediatric Asthma Exacerbation',
        is_admitted: true,
        created_at: '2026-11-09T09:00:00Z',
      },
      {
        id: 5,
        full_name: 'Kabir Patel',
        age: 45,
        gender: 'Male',
        phone: '555-0105',
        blood_group: 'O-',
        diagnosis: 'Type 2 Diabetes Follow-up',
        is_admitted: false,
        created_at: '2026-11-03T11:45:00Z',
      },
      {
        id: 6,
        full_name: 'Priya Deshmukh',
        age: 62,
        gender: 'Female',
        phone: '555-0106',
        blood_group: 'A-',
        diagnosis: 'Hypertensive Crisis',
        is_admitted: true,
        created_at: '2026-11-09T13:10:00Z',
      },
      {
        id: 7,
        full_name: 'Vikram Rao',
        age: 41,
        gender: 'Male',
        phone: '555-0107',
        blood_group: 'B-',
        diagnosis: 'Distal Radius Fracture',
        is_admitted: true,
        created_at: '2026-11-10T01:00:00Z',
      },
      {
        id: 8,
        full_name: 'Sanya Kapoor',
        age: 29,
        gender: 'Female',
        phone: '555-0108',
        blood_group: 'O+',
        diagnosis: 'Migraine with Aura',
        is_admitted: false,
        created_at: '2026-11-06T16:00:00Z',
      },
      {
        id: 9,
        full_name: 'Devansh Joshi',
        age: 11,
        gender: 'Male',
        phone: '555-0109',
        blood_group: 'A+',
        diagnosis: 'Acute Gastroenteritis',
        is_admitted: false,
        created_at: '2026-11-08T12:30:00Z',
      },
      {
        id: 10,
        full_name: 'Neha Kulkarni',
        age: 51,
        gender: 'Female',
        phone: '555-0110',
        blood_group: 'AB-',
        diagnosis: 'Post-Op Cholecystectomy',
        is_admitted: true,
        created_at: '2026-11-08T07:50:00Z',
      },
    ],
    beds: [
      {
        id: 1,
        bed_number: 'ICU-01',
        ward_id: 1,
        is_occupied: true,
        patient_id: 1,
        admitted_at: '2026-11-07T11:00:00Z',
        discharged_at: null,
      },
      {
        id: 2,
        bed_number: 'ICU-02',
        ward_id: 1,
        is_occupied: true,
        patient_id: 6,
        admitted_at: '2026-11-09T15:00:00Z',
        discharged_at: null,
      },
      {
        id: 3,
        bed_number: 'ICU-03',
        ward_id: 1,
        is_occupied: false,
        patient_id: null,
        admitted_at: '2026-11-04T09:00:00Z',
        discharged_at: '2026-11-08T21:00:00Z',
      },
      {
        id: 4,
        bed_number: 'ICU-04',
        ward_id: 1,
        is_occupied: false,
        patient_id: null,
        admitted_at: null,
        discharged_at: null,
      },
      {
        id: 5,
        bed_number: 'GEN-01',
        ward_id: 2,
        is_occupied: true,
        patient_id: 2,
        admitted_at: '2026-11-08T06:00:00Z',
        discharged_at: null,
      },
      {
        id: 6,
        bed_number: 'GEN-02',
        ward_id: 2,
        is_occupied: true,
        patient_id: 10,
        admitted_at: '2026-11-08T13:00:00Z',
        discharged_at: null,
      },
      {
        id: 7,
        bed_number: 'GEN-03',
        ward_id: 2,
        is_occupied: false,
        patient_id: null,
        admitted_at: '2026-11-05T10:00:00Z',
        discharged_at: '2026-11-07T19:00:00Z',
      },
      {
        id: 8,
        bed_number: 'GEN-04',
        ward_id: 2,
        is_occupied: false,
        patient_id: null,
        admitted_at: null,
        discharged_at: null,
      },
      {
        id: 9,
        bed_number: 'PED-01',
        ward_id: 3,
        is_occupied: true,
        patient_id: 4,
        admitted_at: '2026-11-09T09:30:00Z',
        discharged_at: null,
      },
      {
        id: 10,
        bed_number: 'PED-02',
        ward_id: 3,
        is_occupied: false,
        patient_id: null,
        admitted_at: '2026-11-07T08:00:00Z',
        discharged_at: '2026-11-09T18:00:00Z',
      },
      {
        id: 11,
        bed_number: 'PED-03',
        ward_id: 3,
        is_occupied: false,
        patient_id: null,
        admitted_at: null,
        discharged_at: null,
      },
      {
        id: 12,
        bed_number: 'PED-04',
        ward_id: 3,
        is_occupied: false,
        patient_id: null,
        admitted_at: null,
        discharged_at: null,
      },
      {
        id: 13,
        bed_number: 'ER-01',
        ward_id: 4,
        is_occupied: true,
        patient_id: 7,
        admitted_at: '2026-11-10T01:30:00Z',
        discharged_at: null,
      },
      {
        id: 14,
        bed_number: 'ER-02',
        ward_id: 4,
        is_occupied: false,
        patient_id: null,
        admitted_at: null,
        discharged_at: null,
      },
      {
        id: 15,
        bed_number: 'ER-03',
        ward_id: 4,
        is_occupied: false,
        patient_id: null,
        admitted_at: null,
        discharged_at: null,
      },
      {
        id: 16,
        bed_number: 'ER-04',
        ward_id: 4,
        is_occupied: false,
        patient_id: null,
        admitted_at: null,
        discharged_at: null,
      },
    ],
    doctors: [
      {
        id: 1,
        full_name: 'Dr. Rajesh Menon',
        specialization: 'Cardiology',
        phone: '555-0201',
        ward_id: 1,
        is_available: true,
      },
      {
        id: 2,
        full_name: 'Dr. Sunita Reddy',
        specialization: 'Internal Medicine',
        phone: '555-0202',
        ward_id: 2,
        is_available: true,
      },
      {
        id: 3,
        full_name: 'Dr. Farhan Ali',
        specialization: 'Pediatrics',
        phone: '555-0203',
        ward_id: 3,
        is_available: true,
      },
      {
        id: 4,
        full_name: 'Dr. Kavita Bose',
        specialization: 'Emergency & Trauma',
        phone: '555-0204',
        ward_id: 4,
        is_available: true,
      },
      {
        id: 5,
        full_name: 'Dr. Siddharth Chatterjee',
        specialization: 'Neurology',
        phone: '555-0205',
        ward_id: 2,
        is_available: false,
      },
      {
        id: 6,
        full_name: 'Dr. Pooja Malhotra',
        specialization: 'General Surgery',
        phone: '555-0206',
        ward_id: 2,
        is_available: true,
      },
    ],
    appointments: [
      {
        id: 1,
        patient_id: 1,
        doctor_id: 1,
        appointment_time: '2026-11-10T11:00:00Z',
        status: 'Scheduled',
        notes: 'Post-angioplasty ICU cardiac evaluation',
      },
      {
        id: 2,
        patient_id: 3,
        doctor_id: 2,
        appointment_time: '2026-11-09T14:00:00Z',
        status: 'Completed',
        notes: 'Outpatient recovery checkup',
      },
      {
        id: 3,
        patient_id: 4,
        doctor_id: 3,
        appointment_time: '2026-11-10T13:30:00Z',
        status: 'Scheduled',
        notes: 'Nebulization response review',
      },
      {
        id: 4,
        patient_id: 5,
        doctor_id: 2,
        appointment_time: '2026-11-11T10:00:00Z',
        status: 'Scheduled',
        notes: 'Quarterly HbA1c review',
      },
      {
        id: 5,
        patient_id: 8,
        doctor_id: 5,
        appointment_time: '2026-11-08T15:00:00Z',
        status: 'Cancelled',
        notes: 'Rescheduled at patient request',
      },
      {
        id: 6,
        patient_id: 10,
        doctor_id: 6,
        appointment_time: '2026-11-10T16:00:00Z',
        status: 'Scheduled',
        notes: 'Surgical dressing inspection',
      },
    ],
    medicines: [
      {
        id: 1,
        name: 'Amoxicillin 500mg',
        category: 'Antibiotic',
        stock_quantity: 240,
        unit_price: 1.5,
        expiry_date: '2027-08-15',
      },
      {
        id: 2,
        name: 'Paracetamol 650mg',
        category: 'Analgesic / Antipyretic',
        stock_quantity: 520,
        unit_price: 0.4,
        expiry_date: '2027-11-30',
      },
      {
        id: 3,
        name: 'Atorvastatin 20mg',
        category: 'Cardiovascular',
        stock_quantity: 180,
        unit_price: 2.2,
        expiry_date: '2027-05-20',
      },
      {
        id: 4,
        name: 'Salbutamol Inhaler',
        category: 'Bronchodilator',
        stock_quantity: 45,
        unit_price: 8.75,
        expiry_date: '2027-04-10',
      },
      {
        id: 5,
        name: 'Metformin 500mg',
        category: 'Antidiabetic',
        stock_quantity: 310,
        unit_price: 0.85,
        expiry_date: '2028-01-15',
      },
      {
        id: 6,
        name: 'Amlodipine 5mg',
        category: 'Antihypertensive',
        stock_quantity: 195,
        unit_price: 1.1,
        expiry_date: '2027-09-01',
      },
      {
        id: 7,
        name: 'Ceftriaxone 1g IV',
        category: 'Antibiotic (IV)',
        stock_quantity: 18,
        unit_price: 6.5,
        expiry_date: '2027-02-28',
      },
      {
        id: 8,
        name: 'Ondansetron 4mg',
        category: 'Antiemetic',
        stock_quantity: 140,
        unit_price: 1.25,
        expiry_date: '2027-10-12',
      },
    ],
    lab_tests: [
      {
        id: 1,
        patient_id: 1,
        doctor_id: 1,
        test_name: 'Troponin-I & Lipid Profile',
        status: 'Completed',
        result: 'Troponin-I elevated (1.8 ng/mL); LDL 148 mg/dL',
        ordered_at: '2026-11-08T09:00:00Z',
      },
      {
        id: 2,
        patient_id: 2,
        doctor_id: 2,
        test_name: 'Chest X-Ray & Complete Blood Count',
        status: 'Completed',
        result: 'Right lower lobe consolidation; WBC 13,400 /uL',
        ordered_at: '2026-11-08T18:00:00Z',
      },
      {
        id: 3,
        patient_id: 4,
        doctor_id: 3,
        test_name: 'Pulse Oximetry & Spirometry',
        status: 'Completed',
        result: 'SpO2 96% on room air after bronchodilator',
        ordered_at: '2026-11-09T12:00:00Z',
      },
      {
        id: 4,
        patient_id: 5,
        doctor_id: 2,
        test_name: 'HbA1c & Fasting Blood Glucose',
        status: 'Pending',
        result: null,
        ordered_at: '2026-11-10T03:00:00Z',
      },
      {
        id: 5,
        patient_id: 6,
        doctor_id: 1,
        test_name: 'Renal Function Panel & ECG',
        status: 'Pending',
        result: null,
        ordered_at: '2026-11-10T05:00:00Z',
      },
      {
        id: 6,
        patient_id: 7,
        doctor_id: 4,
        test_name: 'Right Wrist AP/Lateral Radiograph',
        status: 'Completed',
        result: 'Non-displaced distal radius fracture confirmed',
        ordered_at: '2026-11-10T02:00:00Z',
      },
    ],
    bills: [
      {
        id: 1,
        patient_id: 1,
        total_amount: 1450.0,
        paid_status: 'Partial',
        description: 'ICU Bed (3 days), Cardiac Monitoring, Troponin-I Lab',
        created_at: '2026-11-09T10:00:00Z',
      },
      {
        id: 2,
        patient_id: 2,
        total_amount: 420.0,
        paid_status: 'Unpaid',
        description: 'General Ward Bed (2 days), IV Antibiotics, Chest X-Ray',
        created_at: '2026-11-09T14:00:00Z',
      },
      {
        id: 3,
        patient_id: 3,
        total_amount: 85.0,
        paid_status: 'Paid',
        description: 'Outpatient Consultation & Oral Rehydration Pack',
        created_at: '2026-11-08T11:00:00Z',
      },
      {
        id: 4,
        patient_id: 4,
        total_amount: 310.0,
        paid_status: 'Unpaid',
        description: 'Pediatrics Bed (1 day), Nebulization Therapy',
        created_at: '2026-11-09T20:00:00Z',
      },
      {
        id: 5,
        patient_id: 7,
        total_amount: 275.0,
        paid_status: 'Paid',
        description: 'Emergency Cast Application & Wrist X-Ray',
        created_at: '2026-11-10T04:00:00Z',
      },
      {
        id: 6,
        patient_id: 10,
        total_amount: 980.0,
        paid_status: 'Unpaid',
        description: 'Laparoscopic Cholecystectomy & General Ward Recovery',
        created_at: '2026-11-09T09:00:00Z',
      },
    ],
  };
}

export type McpServerId =
  | 'beds'
  | 'patients'
  | 'appointments'
  | 'pharmacy'
  | 'lab'
  | 'billing';

export interface McpToolSpec {
  name: string;
  server: McpServerId;
  mode: 'READ' | 'WRITE';
  signature: string;
  docstring: string;
}

export interface McpServerCatalogItem {
  id: McpServerId;
  title: string;
  filePath: string;
  testScriptPath: string;
  summary: string;
  tools: McpToolSpec[];
}

export const MCP_SERVERS_CATALOG: McpServerCatalogItem[] = [
  {
    id: 'beds',
    title: '1. Beds MCP Server',
    filePath: 'hospitalos/mcp_servers/beds/server.py',
    testScriptPath: 'python mcp_servers/beds/test_beds_mcp.py',
    summary: 'Finds unoccupied beds by ward and admits or discharges patients with UTC timestamps.',
    tools: [
      {
        name: 'get_free_beds',
        server: 'beds',
        mode: 'READ',
        signature: 'def get_free_beds(ward: str) -> str:',
        docstring: `"""
[OPERATION: READ]
Find all free (unoccupied) hospital beds in a specific ward.
Safe read-only lookup; does not modify the database.
"""`,
      },
      {
        name: 'admit_patient',
        server: 'beds',
        mode: 'WRITE',
        signature: 'def admit_patient(patient_id: int, ward: str) -> str:',
        docstring: `"""
[OPERATION: WRITE - REQUIRES CONFIRMATION]
Admit a registered patient into the first available free bed in the specified ward.
WARNING: Marks bed occupied, stamps admitted_at, and sets patient.is_admitted = True.
"""`,
      },
      {
        name: 'discharge_patient',
        server: 'beds',
        mode: 'WRITE',
        signature: 'def discharge_patient(patient_id: int) -> str:',
        docstring: `"""
[OPERATION: WRITE - REQUIRES CONFIRMATION]
Discharge an admitted patient from their hospital bed and mark the bed as free.
WARNING: Frees bed, stamps discharged_at, and sets patient.is_admitted = False.
"""`,
      },
    ],
  },
  {
    id: 'patients',
    title: '2. Patients MCP Server',
    filePath: 'hospitalos/mcp_servers/patients/server.py',
    testScriptPath: 'python mcp_servers/patients/test_patients_mcp.py',
    summary: 'Searches patients by name, fetches demographic profiles, and aggregates full clinical history.',
    tools: [
      {
        name: 'search_patients',
        server: 'patients',
        mode: 'READ',
        signature: 'def search_patients(name: str) -> str:',
        docstring: `"""
[OPERATION: READ]
Search registered hospital patients by partial or full name (case-insensitive).
Safe read-only lookup; does not modify the database.
"""`,
      },
      {
        name: 'get_patient',
        server: 'patients',
        mode: 'READ',
        signature: 'def get_patient(patient_id: int) -> str:',
        docstring: `"""
[OPERATION: READ]
Get full demographic and admission details for a single patient by their numeric ID.
Safe read-only lookup; does not modify the database.
"""`,
      },
      {
        name: 'get_patient_history',
        server: 'patients',
        mode: 'READ',
        signature: 'def get_patient_history(patient_id: int) -> str:',
        docstring: `"""
[OPERATION: READ]
Retrieve the complete clinical history for a patient (profile, bed assignment,
appointments, lab tests, and bills).
"""`,
      },
    ],
  },
  {
    id: 'appointments',
    title: '3. Appointments MCP Server',
    filePath: 'hospitalos/mcp_servers/appointments/server.py',
    testScriptPath: 'python mcp_servers/appointments/test_appointments_mcp.py',
    summary: 'Checks doctor schedule slots, lists patient visits, and books or cancels appointments.',
    tools: [
      {
        name: 'list_doctor_availability',
        server: 'appointments',
        mode: 'READ',
        signature: 'def list_doctor_availability(doctor_id: int, date: str) -> str:',
        docstring: `"""
[OPERATION: READ]
Check a doctor's availability and open vs. booked consultation slots on a specific date (YYYY-MM-DD).
Safe read-only lookup; does not modify the database.
"""`,
      },
      {
        name: 'list_appointments',
        server: 'appointments',
        mode: 'READ',
        signature: 'def list_appointments(patient_id: int) -> str:',
        docstring: `"""
[OPERATION: READ]
List all appointments (Scheduled, Completed, or Cancelled) for a given patient_id.
Safe read-only lookup; does not modify the database.
"""`,
      },
      {
        name: 'book_appointment',
        server: 'appointments',
        mode: 'WRITE',
        signature: 'def book_appointment(patient_id: int, doctor_id: int, datetime: str) -> str:',
        docstring: `"""
[OPERATION: WRITE - REQUIRES CONFIRMATION]
Book a new medical appointment between a patient and a doctor at a given ISO datetime.
WARNING: Creates a new Scheduled appointment in the database.
"""`,
      },
      {
        name: 'cancel_appointment',
        server: 'appointments',
        mode: 'WRITE',
        signature: 'def cancel_appointment(appointment_id: int) -> str:',
        docstring: `"""
[OPERATION: WRITE - REQUIRES CONFIRMATION]
Cancel an existing appointment by setting its status to "Cancelled".
WARNING: Modifies appointment status in the database.
"""`,
      },
    ],
  },
  {
    id: 'pharmacy',
    title: '4. Pharmacy MCP Server',
    filePath: 'hospitalos/mcp_servers/pharmacy/server.py',
    testScriptPath: 'python mcp_servers/pharmacy/test_pharmacy_mcp.py',
    summary: 'Checks medicine stock levels, alerts on low-inventory items, and restocks medicines.',
    tools: [
      {
        name: 'check_stock',
        server: 'pharmacy',
        mode: 'READ',
        signature: 'def check_stock(medicine_name: str) -> str:',
        docstring: `"""
[OPERATION: READ]
Check pharmacy stock quantity, category, unit price, and expiry date for a medicine.
Safe read-only lookup; does not modify the database.
"""`,
      },
      {
        name: 'list_low_stock',
        server: 'pharmacy',
        mode: 'READ',
        signature: 'def list_low_stock(threshold: int = 50) -> str:',
        docstring: `"""
[OPERATION: READ]
List all pharmacy medicines whose current stock_quantity is less than or equal to threshold.
Safe read-only lookup; does not modify the database.
"""`,
      },
      {
        name: 'restock_medicine',
        server: 'pharmacy',
        mode: 'WRITE',
        signature: 'def restock_medicine(medicine_name: str, quantity: int) -> str:',
        docstring: `"""
[OPERATION: WRITE - REQUIRES CONFIRMATION]
Add quantity new units to a medicine's stock_quantity in the pharmacy inventory.
WARNING: Modifies medicine inventory in the database.
"""`,
      },
    ],
  },
  {
    id: 'lab',
    title: '5. Lab MCP Server',
    filePath: 'hospitalos/mcp_servers/lab/server.py',
    testScriptPath: 'python mcp_servers/lab/test_lab_mcp.py',
    summary: 'Lists pending diagnostic tests, fetches patient lab results, and orders new lab tests.',
    tools: [
      {
        name: 'list_pending_tests',
        server: 'lab',
        mode: 'READ',
        signature: 'def list_pending_tests() -> str:',
        docstring: `"""
[OPERATION: READ]
List all diagnostic laboratory tests that currently have status == "Pending".
Safe read-only lookup; does not modify the database.
"""`,
      },
      {
        name: 'get_results',
        server: 'lab',
        mode: 'READ',
        signature: 'def get_results(patient_id: int) -> str:',
        docstring: `"""
[OPERATION: READ]
Retrieve all diagnostic lab test orders and results (Completed and Pending) for a patient.
Safe read-only lookup; does not modify the database.
"""`,
      },
      {
        name: 'order_test',
        server: 'lab',
        mode: 'WRITE',
        signature: 'def order_test(patient_id: int, test_name: str) -> str:',
        docstring: `"""
[OPERATION: WRITE - REQUIRES CONFIRMATION]
Order a new diagnostic laboratory test for a patient (creates a "Pending" lab test record).
WARNING: Writes a new lab test order to the database.
"""`,
      },
    ],
  },
  {
    id: 'billing',
    title: '6. Billing MCP Server',
    filePath: 'hospitalos/mcp_servers/billing/server.py',
    testScriptPath: 'python mcp_servers/billing/test_billing_mcp.py',
    summary: 'Retrieves patient billing invoices, lists unpaid bills, and marks bills as paid.',
    tools: [
      {
        name: 'get_bill',
        server: 'billing',
        mode: 'READ',
        signature: 'def get_bill(patient_id: int) -> str:',
        docstring: `"""
[OPERATION: READ]
Retrieve all billing invoices and total unpaid balance for a specific patient.
Safe read-only lookup; does not modify the database.
"""`,
      },
      {
        name: 'list_unpaid_bills',
        server: 'billing',
        mode: 'READ',
        signature: 'def list_unpaid_bills() -> str:',
        docstring: `"""
[OPERATION: READ]
List all patient bills where paid_status is "Unpaid" or "Partial".
Safe read-only lookup; does not modify the database.
"""`,
      },
      {
        name: 'mark_bill_paid',
        server: 'billing',
        mode: 'WRITE',
        signature: 'def mark_bill_paid(bill_id: int) -> str:',
        docstring: `"""
[OPERATION: WRITE - REQUIRES CONFIRMATION]
Mark an unpaid or partially paid invoice as "Paid".
WARNING: Updates bill payment status in the database.
"""`,
      },
    ],
  },
];

export interface ProjectFileItem {
  path: string;
  title: string;
  simpleExplanation: string;
  keyTakeaways: string[];
  code: string;
}

export const PROJECT_FILES_GUIDE: ProjectFileItem[] = [
  {
    path: 'hospitalos/mcp_servers/common/db.py',
    title: 'Shared Database Helper for All 6 MCP Servers (Phase 2)',
    simpleExplanation:
      'Instead of copy-pasting SQLAlchemy setup into all 6 MCP servers, common/db.py puts the database connection in one place. It automatically finds hospitalos/hospitalos.db, imports the 8 ORM models from backend/models.py, and gives every MCP server a clean get_db_session() helper.',
    keyTakeaways: [
      'Eliminates duplicate database connection code across all 6 MCP servers.',
      'Uses @contextmanager def get_db_session() so sessions always close and roll back on error.',
      'Allows all 6 MCP servers and test scripts to run standalone without FastAPI running.',
    ],
    code: `@contextmanager
def get_db_session():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()`,
  },
  {
    path: 'hospitalos/mcp_servers/beds/server.py',
    title: '1. Beds MCP Server (get_free_beds, admit_patient, discharge_patient)',
    simpleExplanation:
      'Manages hospital ward beds using common/db.py. get_free_beds is marked [OPERATION: READ], while admit_patient and discharge_patient are marked [OPERATION: WRITE - REQUIRES CONFIRMATION] so the AI agent knows to ask before mutating bed state.',
    keyTakeaways: [
      'get_free_beds(ward) -> [OPERATION: READ]',
      'admit_patient(patient_id, ward) -> [OPERATION: WRITE - REQUIRES CONFIRMATION]',
      'discharge_patient(patient_id) -> [OPERATION: WRITE - REQUIRES CONFIRMATION]',
    ],
    code: `@mcp.tool()
def admit_patient(patient_id: int, ward: str) -> str:
    """
    [OPERATION: WRITE - REQUIRES CONFIRMATION]
    Admit a registered patient into the first available free bed in the specified ward.
    """`,
  },
  {
    path: 'hospitalos/mcp_servers/patients/server.py',
    title: '2. Patients MCP Server (search_patients, get_patient, get_patient_history)',
    simpleExplanation:
      'Provides 3 read-only tools for looking up patients by name, fetching a single patient by ID, or pulling a complete clinical history (profile + bed assignment + appointments + lab tests + bills) in one call.',
    keyTakeaways: [
      'search_patients(name) -> [OPERATION: READ] (case-insensitive partial match)',
      'get_patient(patient_id) -> [OPERATION: READ]',
      'get_patient_history(patient_id) -> [OPERATION: READ] (joins beds, appointments, labs, bills)',
    ],
    code: `@mcp.tool()
def get_patient_history(patient_id: int) -> str:
    """
    [OPERATION: READ]
    Retrieve the complete clinical history for a patient, combining their profile,
    current bed occupancy, appointments, lab test orders & results, and bills.
    """`,
  },
  {
    path: 'hospitalos/mcp_servers/appointments/server.py',
    title: '3. Appointments MCP Server (availability, list, book, cancel)',
    simpleExplanation:
      'Handles doctor schedules and patient appointments. Includes 2 READ tools (list_doctor_availability and list_appointments) and 2 WRITE tools (book_appointment and cancel_appointment) with date/time validation.',
    keyTakeaways: [
      'list_doctor_availability(doctor_id, date) & list_appointments(patient_id) -> [OPERATION: READ]',
      'book_appointment(patient_id, doctor_id, datetime) -> [OPERATION: WRITE - REQUIRES CONFIRMATION]',
      'cancel_appointment(appointment_id) -> [OPERATION: WRITE - REQUIRES CONFIRMATION]',
    ],
    code: `@mcp.tool()
def book_appointment(patient_id: int, doctor_id: int, datetime: str) -> str:
    """
    [OPERATION: WRITE - REQUIRES CONFIRMATION]
    Book a new medical appointment between a patient and a doctor at a given date and time.
    """`,
  },
  {
    path: 'hospitalos/mcp_servers/pharmacy/server.py',
    title: '4. Pharmacy MCP Server (check_stock, list_low_stock, restock_medicine)',
    simpleExplanation:
      'Manages medicine inventory in the hospital pharmacy. Staff can check stock by medicine name, list all medicines at or below a low-stock threshold, and restock medicines (with confirmation).',
    keyTakeaways: [
      'check_stock(medicine_name) & list_low_stock(threshold) -> [OPERATION: READ]',
      'restock_medicine(medicine_name, quantity) -> [OPERATION: WRITE - REQUIRES CONFIRMATION]',
      'Validates quantity > 0 and returns helpful available medicine names if a name is misspelled.',
    ],
    code: `@mcp.tool()
def restock_medicine(medicine_name: str, quantity: int) -> str:
    """
    [OPERATION: WRITE - REQUIRES CONFIRMATION]
    Add quantity new units to a medicine's stock_quantity in the pharmacy inventory.
    """`,
  },
  {
    path: 'hospitalos/mcp_servers/lab/server.py',
    title: '5. Lab MCP Server (list_pending_tests, get_results, order_test)',
    simpleExplanation:
      'Manages diagnostic lab orders and results. Staff can list all pending tests across the hospital, check lab results for a specific patient, or order a new diagnostic test.',
    keyTakeaways: [
      'list_pending_tests() & get_results(patient_id) -> [OPERATION: READ]',
      'order_test(patient_id, test_name) -> [OPERATION: WRITE - REQUIRES CONFIRMATION]',
    ],
    code: `@mcp.tool()
def order_test(patient_id: int, test_name: str) -> str:
    """
    [OPERATION: WRITE - REQUIRES CONFIRMATION]
    Order a new diagnostic laboratory test for a patient (creates a "Pending" lab test record).
    """`,
  },
  {
    path: 'hospitalos/mcp_servers/billing/server.py',
    title: '6. Billing MCP Server (get_bill, list_unpaid_bills, mark_bill_paid)',
    simpleExplanation:
      'Manages patient invoices and payments. Staff can inspect all bills and unpaid balance for a patient, list all unpaid/partial bills across the hospital, or mark a bill as Paid.',
    keyTakeaways: [
      'get_bill(patient_id) & list_unpaid_bills() -> [OPERATION: READ]',
      'mark_bill_paid(bill_id) -> [OPERATION: WRITE - REQUIRES CONFIRMATION]',
    ],
    code: `@mcp.tool()
def mark_bill_paid(bill_id: int) -> str:
    """
    [OPERATION: WRITE - REQUIRES CONFIRMATION]
    Mark an unpaid or partially paid invoice as "Paid".
    """`,
  },
  {
    path: 'hospitalos/mcp_servers/*/test_*_mcp.py',
    title: '6 Automated MCP Client Test Scripts',
    simpleExplanation:
      'Every MCP server folder includes its own test_<name>_mcp.py script that launches the server over official MCP stdio, lists the tools, and calls each tool once to verify everything works end-to-end.',
    keyTakeaways: [
      'test_beds_mcp.py, test_patients_mcp.py, test_appointments_mcp.py',
      'test_pharmacy_mcp.py, test_lab_mcp.py, test_billing_mcp.py',
    ],
    code: `python mcp_servers/beds/test_beds_mcp.py
python mcp_servers/patients/test_patients_mcp.py
python mcp_servers/appointments/test_appointments_mcp.py
python mcp_servers/pharmacy/test_pharmacy_mcp.py
python mcp_servers/lab/test_lab_mcp.py
python mcp_servers/billing/test_billing_mcp.py`,
  },
];
