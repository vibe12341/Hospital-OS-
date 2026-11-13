import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { FunctionDeclaration, GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getGenAIClient() {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// ============================================================================
// Set of WRITE Tools that require confirmation before execution
// ============================================================================
const WRITE_TOOLS_SET = new Set<string>([
  'admit_patient',
  'discharge_patient',
  'book_appointment',
  'cancel_appointment',
  'restock_medicine',
  'order_test',
  'mark_bill_paid',
]);

// ============================================================================
// All 19 MCP Tool Declarations Across the 6 HospitalOS MCP Servers
// ============================================================================
const hospitalMcpToolDeclarations: FunctionDeclaration[] = [
  // 1. BEDS MCP SERVER (3 tools)
  {
    name: 'get_free_beds',
    description:
      '[OPERATION: READ] Find all free (unoccupied) hospital beds in a specific ward (ICU, General, Pediatrics, Emergency).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        ward: {
          type: Type.STRING,
          description: 'Name of the hospital ward (ICU, General, Pediatrics, Emergency).',
        },
      },
      required: ['ward'],
    },
  },
  {
    name: 'admit_patient',
    description:
      '[OPERATION: WRITE - REQUIRES CONFIRMATION] Admit a registered patient by patient_id into the first available free bed in the specified ward.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        patient_id: {
          type: Type.INTEGER,
          description: 'Numeric ID of the patient to admit (e.g., 3).',
        },
        ward: {
          type: Type.STRING,
          description: 'Target hospital ward name (ICU, General, Pediatrics, Emergency).',
        },
      },
      required: ['patient_id', 'ward'],
    },
  },
  {
    name: 'discharge_patient',
    description:
      '[OPERATION: WRITE - REQUIRES CONFIRMATION] Discharge a currently admitted patient by patient_id from their hospital bed.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        patient_id: {
          type: Type.INTEGER,
          description: 'Numeric ID of the currently admitted patient to discharge.',
        },
      },
      required: ['patient_id'],
    },
  },

  // 2. PATIENTS MCP SERVER (3 tools)
  {
    name: 'search_patients',
    description:
      '[OPERATION: READ] Search registered hospital patients by partial or full name (pass "all" to list all patients).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: {
          type: Type.STRING,
          description: 'Partial or full patient name to search for (or "all").',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_patient',
    description:
      '[OPERATION: READ] Get full demographic and admission details for a single patient by numeric patient_id.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        patient_id: {
          type: Type.INTEGER,
          description: 'Numeric database ID of the patient.',
        },
      },
      required: ['patient_id'],
    },
  },
  {
    name: 'get_patient_history',
    description:
      '[OPERATION: READ] Retrieve complete clinical history for a patient (profile, bed assignment, appointments, lab tests, and bills).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        patient_id: {
          type: Type.INTEGER,
          description: 'Numeric database ID of the patient.',
        },
      },
      required: ['patient_id'],
    },
  },

  // 3. APPOINTMENTS MCP SERVER (4 tools)
  {
    name: 'list_doctor_availability',
    description:
      '[OPERATION: READ] Check a doctor availability and open vs. booked time slots on a specific date (YYYY-MM-DD).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        doctor_id: {
          type: Type.INTEGER,
          description: 'Numeric database ID of the doctor (1 to 6).',
        },
        date: {
          type: Type.STRING,
          description: 'Date in YYYY-MM-DD format (e.g., "2026-11-10").',
        },
      },
      required: ['doctor_id', 'date'],
    },
  },
  {
    name: 'list_appointments',
    description:
      '[OPERATION: READ] List all appointments (Scheduled, Completed, Cancelled) for a specific patient_id.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        patient_id: {
          type: Type.INTEGER,
          description: 'Numeric database ID of the patient.',
        },
      },
      required: ['patient_id'],
    },
  },
  {
    name: 'book_appointment',
    description:
      '[OPERATION: WRITE - REQUIRES CONFIRMATION] Book a new appointment between a patient_id and doctor_id at an ISO datetime.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        patient_id: {
          type: Type.INTEGER,
          description: 'Numeric database ID of the patient.',
        },
        doctor_id: {
          type: Type.INTEGER,
          description: 'Numeric database ID of the doctor.',
        },
        datetime: {
          type: Type.STRING,
          description: 'Appointment date and time in YYYY-MM-DDTHH:MM format (e.g., "2026-11-12T10:00").',
        },
      },
      required: ['patient_id', 'doctor_id', 'datetime'],
    },
  },
  {
    name: 'cancel_appointment',
    description:
      '[OPERATION: WRITE - REQUIRES CONFIRMATION] Cancel an existing appointment by appointment_id.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        appointment_id: {
          type: Type.INTEGER,
          description: 'Numeric database ID of the appointment to cancel.',
        },
      },
      required: ['appointment_id'],
    },
  },

  // 4. PHARMACY MCP SERVER (3 tools)
  {
    name: 'check_stock',
    description:
      '[OPERATION: READ] Check pharmacy stock quantity, category, unit price, and expiry date for a medicine name (or "all").',
    parameters: {
      type: Type.OBJECT,
      properties: {
        medicine_name: {
          type: Type.STRING,
          description: 'Medicine name or partial name (or "all").',
        },
      },
      required: ['medicine_name'],
    },
  },
  {
    name: 'list_low_stock',
    description:
      '[OPERATION: READ] List all pharmacy medicines with stock_quantity less than or equal to threshold.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        threshold: {
          type: Type.INTEGER,
          description: 'Stock cutoff integer (e.g., 50).',
        },
      },
      required: ['threshold'],
    },
  },
  {
    name: 'restock_medicine',
    description:
      '[OPERATION: WRITE - REQUIRES CONFIRMATION] Restock a pharmacy medicine by adding quantity units to its stock_quantity.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        medicine_name: {
          type: Type.STRING,
          description: 'Name of the medicine to restock (e.g., "Ceftriaxone 1g IV").',
        },
        quantity: {
          type: Type.INTEGER,
          description: 'Positive integer units to add (e.g., 50).',
        },
      },
      required: ['medicine_name', 'quantity'],
    },
  },

  // 5. LAB MCP SERVER (3 tools)
  {
    name: 'list_pending_tests',
    description:
      '[OPERATION: READ] List all diagnostic lab tests that currently have status == "Pending".',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'get_results',
    description:
      '[OPERATION: READ] Retrieve all diagnostic lab test orders and results for a given patient_id.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        patient_id: {
          type: Type.INTEGER,
          description: 'Numeric database ID of the patient.',
        },
      },
      required: ['patient_id'],
    },
  },
  {
    name: 'order_test',
    description:
      '[OPERATION: WRITE - REQUIRES CONFIRMATION] Order a new diagnostic lab test for a patient_id.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        patient_id: {
          type: Type.INTEGER,
          description: 'Numeric database ID of the patient.',
        },
        test_name: {
          type: Type.STRING,
          description: 'Name of the diagnostic lab test to order (e.g., "Complete Blood Count").',
        },
      },
      required: ['patient_id', 'test_name'],
    },
  },

  // 6. BILLING MCP SERVER (3 tools)
  {
    name: 'get_bill',
    description:
      '[OPERATION: READ] Retrieve all billing invoices and unpaid balance for a specific patient_id.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        patient_id: {
          type: Type.INTEGER,
          description: 'Numeric database ID of the patient.',
        },
      },
      required: ['patient_id'],
    },
  },
  {
    name: 'list_unpaid_bills',
    description:
      '[OPERATION: READ] List all patient billing invoices where paid_status is "Unpaid" or "Partial".',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'mark_bill_paid',
    description:
      '[OPERATION: WRITE - REQUIRES CONFIRMATION] Mark an unpaid or partially paid billing invoice as "Paid" by bill_id.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        bill_id: {
          type: Type.INTEGER,
          description: 'Numeric database ID of the bill to mark as Paid.',
        },
      },
      required: ['bill_id'],
    },
  },
];

interface ServerHospitalState {
  wards: Array<{ id: number; name: string; floor: number; capacity: number }>;
  beds: Array<{
    id: number;
    bed_number: string;
    ward_id: number;
    is_occupied: boolean;
    patient_id: number | null;
    admitted_at: string | null;
    discharged_at: string | null;
  }>;
  patients: Array<{
    id: number;
    full_name: string;
    age: number;
    gender: string;
    phone: string;
    blood_group: string;
    diagnosis: string | null;
    is_admitted: boolean;
    created_at?: string;
  }>;
  doctors: Array<{
    id: number;
    full_name: string;
    specialization: string;
    phone: string;
    ward_id: number | null;
    is_available: boolean;
  }>;
  appointments: Array<{
    id: number;
    patient_id: number;
    doctor_id: number;
    appointment_time: string;
    status: 'Scheduled' | 'Completed' | 'Cancelled';
    notes: string | null;
  }>;
  medicines: Array<{
    id: number;
    name: string;
    category: string;
    stock_quantity: number;
    unit_price: number;
    expiry_date: string;
  }>;
  lab_tests: Array<{
    id: number;
    patient_id: number;
    doctor_id: number;
    test_name: string;
    status: 'Pending' | 'Completed';
    result: string | null;
    ordered_at: string;
  }>;
  bills: Array<{
    id: number;
    patient_id: number;
    total_amount: number;
    paid_status: 'Unpaid' | 'Paid' | 'Partial';
    description: string;
    created_at?: string;
  }>;
}

export type ServerMutation =
  | {
      type: 'admit' | 'discharge';
      bedId: number;
      patientId: number;
      wardName: string;
      bedNumber: string;
      admittedAt: string | null;
      dischargedAt: string | null;
    }
  | {
      type: 'book_appointment';
      appointment: ServerHospitalState['appointments'][0];
    }
  | {
      type: 'cancel_appointment';
      appointmentId: number;
    }
  | {
      type: 'restock_medicine';
      medicineId: number;
      newStockQuantity: number;
    }
  | {
      type: 'order_test';
      labTest: ServerHospitalState['lab_tests'][0];
    }
  | {
      type: 'mark_bill_paid';
      billId: number;
    };

export function executeServerMcpTool(
  toolName: string,
  args: Record<string, unknown>,
  state: ServerHospitalState,
  mutations: ServerMutation[]
): Record<string, unknown> {
  // 1. BEDS
  if (toolName === 'get_free_beds') {
    const wardName = String(args.ward || '').trim();
    if (!wardName) {
      return {
        error: true,
        detail: "Friendly Error: Please provide a non-empty ward name (e.g., 'ICU', 'General').",
      };
    }
    const wardObj = state.wards.find(
      (w) => w.name.toLowerCase() === wardName.toLowerCase()
    );
    if (!wardObj) {
      return {
        error: true,
        detail: `Friendly Error: Ward '${wardName}' not found. Available wards: ${state.wards
          .map((w) => w.name)
          .join(', ')}`,
      };
    }
    const freeBeds = state.beds.filter(
      (b) => b.ward_id === wardObj.id && !b.is_occupied
    );
    return {
      operation: 'READ',
      ward: wardObj.name,
      floor: wardObj.floor,
      capacity: wardObj.capacity,
      free_count: freeBeds.length,
      free_beds: freeBeds.map((b) => ({
        id: b.id,
        bed_number: b.bed_number,
        last_discharged_at: b.discharged_at,
      })),
    };
  }

  if (toolName === 'admit_patient') {
    const patientId = Number(args.patient_id);
    const wardName = String(args.ward || '').trim();
    if (!patientId || patientId <= 0) {
      return { error: true, detail: 'Friendly Error: patient_id must be a positive integer.' };
    }
    const patient = state.patients.find((p) => p.id === patientId);
    if (!patient) {
      return { error: true, detail: `Friendly Error: Patient with ID ${patientId} not found.` };
    }
    const existingBed = state.beds.find(
      (b) => b.patient_id === patient.id && b.is_occupied
    );
    if (existingBed || patient.is_admitted) {
      return {
        error: true,
        detail: `Friendly Notice: Patient '${patient.full_name}' (ID ${patient.id}) is already admitted in ${
          existingBed ? existingBed.bed_number : 'an assigned bed'
        }.`,
      };
    }
    const wardObj = state.wards.find(
      (w) => w.name.toLowerCase() === wardName.toLowerCase()
    );
    if (!wardObj) {
      return { error: true, detail: `Friendly Error: Ward '${wardName}' not found.` };
    }
    const freeBed = state.beds.find(
      (b) => b.ward_id === wardObj.id && !b.is_occupied
    );
    if (!freeBed) {
      return {
        error: true,
        detail: `Friendly Error: No free beds available in the '${wardObj.name}' ward.`,
      };
    }

    const nowIso = new Date().toISOString();
    freeBed.is_occupied = true;
    freeBed.patient_id = patient.id;
    freeBed.admitted_at = nowIso;
    freeBed.discharged_at = null;
    patient.is_admitted = true;

    mutations.push({
      type: 'admit',
      bedId: freeBed.id,
      patientId: patient.id,
      wardName: wardObj.name,
      bedNumber: freeBed.bed_number,
      admittedAt: nowIso,
      dischargedAt: null,
    });

    return {
      operation: 'WRITE',
      status: 'success',
      message: `Admitted ${patient.full_name} (ID ${patient.id}) to bed ${freeBed.bed_number} in ${wardObj.name} ward.`,
      bed_id: freeBed.id,
      bed_number: freeBed.bed_number,
      ward: wardObj.name,
      patient_id: patient.id,
      patient_name: patient.full_name,
      admitted_at: nowIso,
    };
  }

  if (toolName === 'discharge_patient') {
    const patientId = Number(args.patient_id);
    if (!patientId || patientId <= 0) {
      return { error: true, detail: 'Friendly Error: patient_id must be a positive integer.' };
    }
    const patient = state.patients.find((p) => p.id === patientId);
    if (!patient) {
      return { error: true, detail: `Friendly Error: Patient with ID ${patientId} not found.` };
    }
    const occupiedBed = state.beds.find(
      (b) => b.patient_id === patient.id && b.is_occupied
    );
    if (!occupiedBed) {
      return {
        error: true,
        detail: `Friendly Notice: Patient '${patient.full_name}' (ID ${patient.id}) is not currently occupying any bed.`,
      };
    }

    const wardObj = state.wards.find((w) => w.id === occupiedBed.ward_id);
    const nowIso = new Date().toISOString();
    const prevAdmitted = occupiedBed.admitted_at;

    occupiedBed.is_occupied = false;
    occupiedBed.patient_id = null;
    occupiedBed.discharged_at = nowIso;
    patient.is_admitted = false;

    mutations.push({
      type: 'discharge',
      bedId: occupiedBed.id,
      patientId: patient.id,
      wardName: wardObj?.name ?? 'Unknown',
      bedNumber: occupiedBed.bed_number,
      admittedAt: prevAdmitted,
      dischargedAt: nowIso,
    });

    return {
      operation: 'WRITE',
      status: 'success',
      message: `Discharged ${patient.full_name} (ID ${patient.id}) from bed ${occupiedBed.bed_number} (${
        wardObj?.name ?? 'Unknown'
      } ward).`,
      bed_id: occupiedBed.id,
      bed_number: occupiedBed.bed_number,
      ward: wardObj?.name ?? 'Unknown',
      patient_id: patient.id,
      patient_name: patient.full_name,
      admitted_at: prevAdmitted,
      discharged_at: nowIso,
    };
  }

  // 2. PATIENTS
  if (toolName === 'search_patients') {
    const q = String(args.name ?? args.query ?? 'all')
      .trim()
      .toLowerCase();
    if (!q) {
      return { error: true, detail: 'Friendly Error: Please provide a patient name to search.' };
    }
    const matches =
      q === 'all'
        ? state.patients
        : state.patients.filter(
            (p) =>
              p.full_name.toLowerCase().includes(q) ||
              (p.diagnosis ?? '').toLowerCase().includes(q)
          );
    return {
      operation: 'READ',
      query: q,
      count: matches.length,
      patients: matches.map((p) => {
        const bed = state.beds.find(
          (b) => b.patient_id === p.id && b.is_occupied
        );
        return {
          ...p,
          current_bed: bed ? bed.bed_number : null,
        };
      }),
    };
  }

  if (toolName === 'get_patient') {
    const pid = Number(args.patient_id);
    if (!pid || pid <= 0) {
      return { error: true, detail: 'Friendly Error: patient_id must be a positive integer.' };
    }
    const p = state.patients.find((item) => item.id === pid);
    if (!p) {
      return { error: true, detail: `Friendly Error: Patient with ID ${pid} was not found.` };
    }
    const bed = state.beds.find((b) => b.patient_id === p.id && b.is_occupied);
    const ward = bed ? state.wards.find((w) => w.id === bed.ward_id) : null;
    return {
      operation: 'READ',
      patient: {
        ...p,
        current_bed: bed ? bed.bed_number : null,
        current_ward: ward ? ward.name : null,
      },
    };
  }

  if (toolName === 'get_patient_history') {
    const pid = Number(args.patient_id);
    if (!pid || pid <= 0) {
      return { error: true, detail: 'Friendly Error: patient_id must be a positive integer.' };
    }
    const p = state.patients.find((item) => item.id === pid);
    if (!p) {
      return { error: true, detail: `Friendly Error: Patient with ID ${pid} was not found.` };
    }
    const bed = state.beds.find((b) => b.patient_id === p.id && b.is_occupied);
    const ward = bed ? state.wards.find((w) => w.id === bed.ward_id) : null;
    const appts = state.appointments
      .filter((a) => a.patient_id === p.id)
      .map((a) => ({
        ...a,
        doctor_name: state.doctors.find((d) => d.id === a.doctor_id)?.full_name ?? null,
      }));
    const labs = state.lab_tests.filter((l) => l.patient_id === p.id);
    const bills = state.bills.filter((b) => b.patient_id === p.id);

    return {
      operation: 'READ',
      patient: p,
      bed_assignment: bed
        ? {
            bed_number: bed.bed_number,
            ward: ward?.name ?? null,
            admitted_at: bed.admitted_at,
          }
        : null,
      appointments: appts,
      lab_tests: labs,
      bills,
    };
  }

  // 3. APPOINTMENTS
  if (toolName === 'list_doctor_availability') {
    const docId = Number(args.doctor_id);
    const dateStr = String(args.date || '2026-11-10').trim().slice(0, 10);
    if (!docId || docId <= 0) {
      return { error: true, detail: 'Friendly Error: doctor_id must be a positive integer.' };
    }
    const doctor = state.doctors.find((d) => d.id === docId);
    if (!doctor) {
      return { error: true, detail: `Friendly Error: Doctor with ID ${docId} was not found.` };
    }
    const standardSlots = ['09:00', '10:00', '11:00', '13:30', '14:30', '16:00'];
    const bookedSlots = state.appointments
      .filter(
        (a) =>
          a.doctor_id === doctor.id &&
          a.status === 'Scheduled' &&
          a.appointment_time.startsWith(dateStr)
      )
      .map((a) => a.appointment_time.slice(11, 16));
    const openSlots = doctor.is_available
      ? standardSlots.filter((s) => !bookedSlots.includes(s))
      : [];

    return {
      operation: 'READ',
      doctor_id: doctor.id,
      doctor_name: doctor.full_name,
      specialization: doctor.specialization,
      is_available_on_duty: doctor.is_available,
      date: dateStr,
      booked_slots: bookedSlots,
      open_slots: openSlots,
    };
  }

  if (toolName === 'list_appointments') {
    const pid = Number(args.patient_id);
    if (!pid || pid <= 0) {
      return { error: true, detail: 'Friendly Error: patient_id must be a positive integer.' };
    }
    const patient = state.patients.find((p) => p.id === pid);
    if (!patient) {
      return { error: true, detail: `Friendly Error: Patient with ID ${pid} was not found.` };
    }
    const appts = state.appointments
      .filter((a) => a.patient_id === pid)
      .map((a) => {
        const doc = state.doctors.find((d) => d.id === a.doctor_id);
        return {
          ...a,
          doctor_name: doc?.full_name ?? null,
          specialization: doc?.specialization ?? null,
        };
      });
    return {
      operation: 'READ',
      patient_id: patient.id,
      patient_name: patient.full_name,
      count: appts.length,
      appointments: appts,
    };
  }

  if (toolName === 'book_appointment') {
    const pid = Number(args.patient_id);
    const docId = Number(args.doctor_id);
    const dtRaw = String(args.datetime || '').trim();
    if (!pid || pid <= 0 || !docId || docId <= 0 || !dtRaw) {
      return {
        error: true,
        detail:
          "Friendly Error: Please provide valid patient_id, doctor_id, and datetime (e.g., '2026-11-12T10:00').",
      };
    }
    const patient = state.patients.find((p) => p.id === pid);
    if (!patient) {
      return { error: true, detail: `Friendly Error: Patient with ID ${pid} was not found.` };
    }
    const doctor = state.doctors.find((d) => d.id === docId);
    if (!doctor) {
      return { error: true, detail: `Friendly Error: Doctor with ID ${docId} was not found.` };
    }
    if (!doctor.is_available) {
      return {
        error: true,
        detail: `Friendly Notice: ${doctor.full_name} is currently marked unavailable. Please select an available doctor.`,
      };
    }

    const normalizedIso = dtRaw.includes('T')
      ? dtRaw.endsWith('Z')
        ? dtRaw
        : `${dtRaw}:00Z`.replace(':00:00Z', ':00Z')
      : `${dtRaw.replace(' ', 'T')}:00Z`;

    const nextId = Math.max(0, ...state.appointments.map((a) => a.id)) + 1;
    const newAppt: ServerHospitalState['appointments'][0] = {
      id: nextId,
      patient_id: patient.id,
      doctor_id: doctor.id,
      appointment_time: normalizedIso,
      status: 'Scheduled',
      notes: `Booked via HospitalOS Appointments MCP Server with ${doctor.full_name}`,
    };
    state.appointments.push(newAppt);
    mutations.push({
      type: 'book_appointment',
      appointment: newAppt,
    });

    return {
      operation: 'WRITE',
      status: 'success',
      message: `Booked appointment #${newAppt.id} for ${patient.full_name} with ${doctor.full_name} at ${normalizedIso}.`,
      appointment: {
        ...newAppt,
        patient_name: patient.full_name,
        doctor_name: doctor.full_name,
      },
    };
  }

  if (toolName === 'cancel_appointment') {
    const apptId = Number(args.appointment_id);
    if (!apptId || apptId <= 0) {
      return { error: true, detail: 'Friendly Error: appointment_id must be a positive integer.' };
    }
    const appt = state.appointments.find((a) => a.id === apptId);
    if (!appt) {
      return {
        error: true,
        detail: `Friendly Error: Appointment with ID ${apptId} was not found.`,
      };
    }
    if (appt.status === 'Cancelled') {
      return {
        error: true,
        detail: `Friendly Notice: Appointment #${apptId} is already cancelled.`,
      };
    }
    appt.status = 'Cancelled';
    mutations.push({
      type: 'cancel_appointment',
      appointmentId: appt.id,
    });

    return {
      operation: 'WRITE',
      status: 'success',
      message: `Appointment #${appt.id} has been cancelled.`,
      appointment: appt,
    };
  }

  // 4. PHARMACY
  if (toolName === 'check_stock') {
    const q = String(args.medicine_name || 'all')
      .trim()
      .toLowerCase();
    const matches =
      q === 'all' || q === ''
        ? state.medicines
        : state.medicines.filter(
            (m) =>
              m.name.toLowerCase().includes(q) ||
              m.category.toLowerCase().includes(q)
          );
    if (matches.length === 0) {
      return {
        error: true,
        detail: `Friendly Notice: No medicine matching '${args.medicine_name}' found. Available: ${state.medicines
          .map((m) => m.name)
          .join(', ')}`,
      };
    }
    return {
      operation: 'READ',
      query: args.medicine_name,
      count: matches.length,
      medicines: matches,
    };
  }

  if (toolName === 'list_low_stock') {
    const threshold = args.threshold !== undefined ? Number(args.threshold) : 50;
    if (Number.isNaN(threshold) || threshold < 0) {
      return {
        error: true,
        detail: 'Friendly Error: threshold must be a non-negative integer.',
      };
    }
    const low = state.medicines.filter((m) => m.stock_quantity <= threshold);
    return {
      operation: 'READ',
      threshold,
      low_stock_count: low.length,
      medicines: low,
    };
  }

  if (toolName === 'restock_medicine') {
    const medName = String(args.medicine_name || '').trim();
    const qty = Number(args.quantity);
    if (!medName) {
      return { error: true, detail: 'Friendly Error: Please provide a medicine_name.' };
    }
    if (!qty || qty <= 0) {
      return {
        error: true,
        detail: 'Friendly Error: quantity to restock must be a positive integer > 0.',
      };
    }
    const med = state.medicines.find((m) =>
      m.name.toLowerCase().includes(medName.toLowerCase())
    );
    if (!med) {
      return {
        error: true,
        detail: `Friendly Error: Medicine '${medName}' not found. Available: ${state.medicines
          .map((m) => m.name)
          .join(', ')}`,
      };
    }
    const prevStock = med.stock_quantity;
    med.stock_quantity = prevStock + qty;
    mutations.push({
      type: 'restock_medicine',
      medicineId: med.id,
      newStockQuantity: med.stock_quantity,
    });

    return {
      operation: 'WRITE',
      status: 'success',
      message: `Restocked '${med.name}' by +${qty} units (from ${prevStock} to ${med.stock_quantity}).`,
      medicine: {
        id: med.id,
        name: med.name,
        previous_stock: prevStock,
        added_quantity: qty,
        new_stock_quantity: med.stock_quantity,
      },
    };
  }

  // 5. LAB
  if (toolName === 'list_pending_tests') {
    const pending = state.lab_tests
      .filter((t) => t.status === 'Pending')
      .map((t) => ({
        ...t,
        patient_name: state.patients.find((p) => p.id === t.patient_id)?.full_name ?? null,
        doctor_name: state.doctors.find((d) => d.id === t.doctor_id)?.full_name ?? null,
      }));
    return {
      operation: 'READ',
      pending_count: pending.length,
      pending_tests: pending,
    };
  }

  if (toolName === 'get_results') {
    const pid = Number(args.patient_id);
    if (!pid || pid <= 0) {
      return { error: true, detail: 'Friendly Error: patient_id must be a positive integer.' };
    }
    const patient = state.patients.find((p) => p.id === pid);
    if (!patient) {
      return { error: true, detail: `Friendly Error: Patient with ID ${pid} was not found.` };
    }
    const tests = state.lab_tests
      .filter((t) => t.patient_id === pid)
      .map((t) => ({
        ...t,
        ordered_by: state.doctors.find((d) => d.id === t.doctor_id)?.full_name ?? null,
      }));
    return {
      operation: 'READ',
      patient_id: patient.id,
      patient_name: patient.full_name,
      count: tests.length,
      lab_tests: tests,
    };
  }

  if (toolName === 'order_test') {
    const pid = Number(args.patient_id);
    const testName = String(args.test_name || '').trim();
    if (!pid || pid <= 0 || !testName) {
      return {
        error: true,
        detail: 'Friendly Error: Please provide a valid patient_id and non-empty test_name.',
      };
    }
    const patient = state.patients.find((p) => p.id === pid);
    if (!patient) {
      return { error: true, detail: `Friendly Error: Patient with ID ${pid} was not found.` };
    }
    const doctor =
      state.doctors.find((d) => d.is_available) || state.doctors[0];
    const nextId = Math.max(0, ...state.lab_tests.map((t) => t.id)) + 1;
    const nowIso = new Date().toISOString();
    const newTest: ServerHospitalState['lab_tests'][0] = {
      id: nextId,
      patient_id: patient.id,
      doctor_id: doctor ? doctor.id : 1,
      test_name: testName,
      status: 'Pending',
      result: null,
      ordered_at: nowIso,
    };
    state.lab_tests.push(newTest);
    mutations.push({
      type: 'order_test',
      labTest: newTest,
    });

    return {
      operation: 'WRITE',
      status: 'success',
      message: `Ordered '${testName}' (Lab Test #${newTest.id}) for ${patient.full_name}.`,
      lab_test: {
        ...newTest,
        patient_name: patient.full_name,
        doctor_name: doctor?.full_name ?? null,
      },
    };
  }

  // 6. BILLING
  if (toolName === 'get_bill') {
    const pid = Number(args.patient_id);
    if (!pid || pid <= 0) {
      return { error: true, detail: 'Friendly Error: patient_id must be a positive integer.' };
    }
    const patient = state.patients.find((p) => p.id === pid);
    if (!patient) {
      return { error: true, detail: `Friendly Error: Patient with ID ${pid} was not found.` };
    }
    const bills = state.bills.filter((b) => b.patient_id === pid);
    const totalBilled = bills.reduce((acc, b) => acc + b.total_amount, 0);
    const unpaidBalance = bills
      .filter((b) => b.paid_status !== 'Paid')
      .reduce((acc, b) => acc + b.total_amount, 0);

    return {
      operation: 'READ',
      patient_id: patient.id,
      patient_name: patient.full_name,
      invoice_count: bills.length,
      total_billed_usd: Number(totalBilled.toFixed(2)),
      unpaid_balance_usd: Number(unpaidBalance.toFixed(2)),
      bills,
    };
  }

  if (toolName === 'list_unpaid_bills') {
    const unpaid = state.bills
      .filter((b) => b.paid_status !== 'Paid')
      .map((b) => ({
        ...b,
        patient_name: state.patients.find((p) => p.id === b.patient_id)?.full_name ?? null,
      }));
    const outstanding = unpaid.reduce((acc, b) => acc + b.total_amount, 0);
    return {
      operation: 'READ',
      unpaid_count: unpaid.length,
      total_outstanding_usd: Number(outstanding.toFixed(2)),
      unpaid_bills: unpaid,
    };
  }

  if (toolName === 'mark_bill_paid') {
    const billId = Number(args.bill_id);
    if (!billId || billId <= 0) {
      return { error: true, detail: 'Friendly Error: bill_id must be a positive integer.' };
    }
    const bill = state.bills.find((b) => b.id === billId);
    if (!bill) {
      return { error: true, detail: `Friendly Error: Bill with ID ${billId} was not found.` };
    }
    if (bill.paid_status === 'Paid') {
      return {
        error: true,
        detail: `Friendly Notice: Bill #${billId} is already marked as Paid.`,
      };
    }
    const prevStatus = bill.paid_status;
    bill.paid_status = 'Paid';
    mutations.push({
      type: 'mark_bill_paid',
      billId: bill.id,
    });
    const patName =
      state.patients.find((p) => p.id === bill.patient_id)?.full_name ??
      `Patient #${bill.patient_id}`;

    return {
      operation: 'WRITE',
      status: 'success',
      message: `Marked Bill #${bill.id} for ${patName} ($${bill.total_amount.toFixed(
        2
      )}) as Paid (was ${prevStatus}).`,
      bill: {
        ...bill,
        patient_name: patName,
        previous_status: prevStatus,
      },
    };
  }

  return { error: true, detail: `Unknown MCP tool: ${toolName}` };
}

function formatMcpResultToString(resObj: Record<string, unknown>): string {
  if (typeof resObj.detail === 'string') {
    return resObj.detail;
  }
  return JSON.stringify(resObj, null, 2);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'HospitalOS Phase 2 Cloud Backend + 6 MCP Servers (19 Tools)',
      database: 'Firebase Cloud Firestore + Shared SQLAlchemy DB Helper',
      models: ['gemini-3-flash-preview', 'gemini-flash-latest', 'gemini-3.1-flash-lite-preview'],
    });
  });

  // Direct MCP Tool Execution Endpoint (used when confirming a pending WRITE tool or running from the 6-Server Explorer)
  app.post('/api/mcp/execute', (req, res) => {
    try {
      const {
        tool,
        args = {},
        hospitalState,
      }: {
        tool: string;
        args: Record<string, unknown>;
        hospitalState: ServerHospitalState;
      } = req.body;

      if (!tool || !hospitalState) {
        res.status(400).json({ error: 'Missing tool or hospitalState.' });
        return;
      }

      const workingState: ServerHospitalState = JSON.parse(
        JSON.stringify(hospitalState)
      );
      const mutations: ServerMutation[] = [];
      const rawResult = executeServerMcpTool(tool, args, workingState, mutations);
      const resultText = formatMcpResultToString(rawResult);

      res.json({
        tool,
        mode: WRITE_TOOLS_SET.has(tool) ? 'WRITE' : 'READ',
        args,
        result: resultText,
        rawResult,
        mutations,
        updatedState: workingState,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Gemini Flash MCP Agent Endpoint (with Write-Tool Confirmation Guardrail)
  app.post('/api/agent/chat', async (req, res) => {
    try {
      const {
        prompt,
        model = 'gemini-3-flash-preview',
        hospitalState,
        requireWriteConfirmation = true,
      }: {
        prompt: string;
        model?: string;
        hospitalState: ServerHospitalState;
        requireWriteConfirmation?: boolean;
      } = req.body;

      if (!prompt || !hospitalState) {
        res.status(400).json({ error: 'Missing prompt or hospitalState payload.' });
        return;
      }

      const allowedModels = [
        'gemini-3-flash-preview',
        'gemini-flash-latest',
        'gemini-3.1-flash-lite-preview',
      ];
      const selectedModel = allowedModels.includes(model)
        ? model
        : 'gemini-3-flash-preview';

      const ai = getGenAIClient();
      const workingState: ServerHospitalState = JSON.parse(
        JSON.stringify(hospitalState)
      );
      const mutations: ServerMutation[] = [];
      const toolCallsExecuted: Array<{
        tool: string;
        mode: 'READ' | 'WRITE';
        args: Record<string, unknown>;
        result: string;
      }> = [];
      const pendingWriteConfirmations: Array<{
        id: string;
        tool: string;
        args: Record<string, unknown>;
        summary: string;
      }> = [];

      const systemInstruction = `You are the HospitalOS Clinical Operations AI Agent powered by Gemini Flash and connected to 6 HospitalOS MCP Servers (19 tools total):
1. Beds MCP Server: get_free_beds [READ], admit_patient [WRITE], discharge_patient [WRITE]
2. Patients MCP Server: search_patients [READ], get_patient [READ], get_patient_history [READ]
3. Appointments MCP Server: list_doctor_availability [READ], list_appointments [READ], book_appointment [WRITE], cancel_appointment [WRITE]
4. Pharmacy MCP Server: check_stock [READ], list_low_stock [READ], restock_medicine [WRITE]
5. Lab MCP Server: list_pending_tests [READ], get_results [READ], order_test [WRITE]
6. Billing MCP Server: get_bill [READ], list_unpaid_bills [READ], mark_bill_paid [WRITE]

Always call the appropriate MCP tool(s) to answer staff questions accurately. When a WRITE tool is staged for confirmation, explain clearly to the staff member that the action is ready and awaiting their click on "Confirm & Execute Write".`;

      const response1 = await ai.models.generateContent({
        model: selectedModel,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: hospitalMcpToolDeclarations }],
        },
      });

      const functionCalls = response1.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        const previousContent = response1.candidates?.[0]?.content;
        const functionResponseParts = [];

        for (const call of functionCalls) {
          const toolName = call.name || 'get_free_beds';
          const toolArgs = (call.args as Record<string, unknown>) || {};
          const isWrite = WRITE_TOOLS_SET.has(toolName);

          if (isWrite && requireWriteConfirmation) {
            const summaryStr = `${toolName}(${Object.entries(toolArgs)
              .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
              .join(', ')})`;
            pendingWriteConfirmations.push({
              id: `pw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              tool: toolName,
              args: toolArgs,
              summary: summaryStr,
            });
            const stagedResult = {
              operation: 'WRITE - REQUIRES CONFIRMATION',
              status: 'awaiting_user_confirmation',
              message: `Write tool '${summaryStr}' is staged and waiting for hospital staff confirmation before modifying the database.`,
            };
            toolCallsExecuted.push({
              tool: toolName,
              mode: 'WRITE',
              args: toolArgs,
              result: stagedResult.message,
            });
            functionResponseParts.push({
              functionResponse: {
                id: call.id,
                name: toolName,
                response: { result: stagedResult },
              },
            });
          } else {
            const rawResult = executeServerMcpTool(
              toolName,
              toolArgs,
              workingState,
              mutations
            );
            const resultText = formatMcpResultToString(rawResult);
            toolCallsExecuted.push({
              tool: toolName,
              mode: isWrite ? 'WRITE' : 'READ',
              args: toolArgs,
              result: resultText,
            });
            functionResponseParts.push({
              functionResponse: {
                id: call.id,
                name: toolName,
                response: { result: rawResult },
              },
            });
          }
        }

        if (previousContent) {
          const response2 = await ai.models.generateContent({
            model: selectedModel,
            contents: [
              { role: 'user', parts: [{ text: prompt }] },
              previousContent,
              {
                role: 'user',
                parts: functionResponseParts,
              },
            ],
            config: {
              systemInstruction,
              tools: [{ functionDeclarations: hospitalMcpToolDeclarations }],
            },
          });

          res.json({
            model: selectedModel,
            reply:
              response2.text ||
              'Processed your request using the HospitalOS MCP servers.',
            toolCalls: toolCallsExecuted,
            pendingWriteConfirmations,
            mutations,
            updatedState: workingState,
          });
          return;
        }
      }

      res.json({
        model: selectedModel,
        reply:
          response1.text ||
          'I am ready to help across all 6 MCP servers (Beds, Patients, Appointments, Pharmacy, Lab, Billing).',
        toolCalls: toolCallsExecuted,
        pendingWriteConfirmations: [],
        mutations,
        updatedState: workingState,
      });
    } catch (error) {
      console.error('Gemini Flash Agent Error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unexpected server error',
      });
    }
  });

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`HospitalOS Cloud Server listening on http://0.0.0.0:${PORT}`);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return server;
}

startServer();

