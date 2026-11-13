import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  collection,
  setDoc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  HospitalDatabaseState,
  createInitialHospitalState,
  Appointment,
  LabTest,
} from './data/hospitalSeed';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Validate connection to Firestore on boot as required
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export async function signOutUser() {
  return firebaseSignOut(auth);
}

export async function seedFirestoreHospitalData(uid: string): Promise<void> {
  const initial = createInitialHospitalState();

  for (const w of initial.wards) {
    const docId = `${uid}_ward_${w.id}`;
    try {
      await setDoc(doc(db, 'wards', docId), {
        id: w.id,
        name: w.name.slice(0, 80),
        floor: w.floor,
        capacity: w.capacity,
        ownerId: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `wards/${docId}`);
    }
  }

  for (const b of initial.beds) {
    const docId = `${uid}_bed_${b.id}`;
    try {
      await setDoc(doc(db, 'beds', docId), {
        id: b.id,
        bed_number: b.bed_number.slice(0, 40),
        ward_id: b.ward_id,
        is_occupied: b.is_occupied,
        patient_id: b.patient_id ?? 0,
        admitted_at: (b.admitted_at ?? '').slice(0, 40),
        discharged_at: (b.discharged_at ?? '').slice(0, 40),
        ownerId: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `beds/${docId}`);
    }
  }

  for (const p of initial.patients) {
    const docId = `${uid}_patient_${p.id}`;
    try {
      await setDoc(doc(db, 'patients', docId), {
        id: p.id,
        full_name: p.full_name.slice(0, 100),
        age: p.age,
        gender: p.gender.slice(0, 30),
        phone: p.phone.slice(0, 30),
        blood_group: p.blood_group.slice(0, 10),
        diagnosis: (p.diagnosis ?? '').slice(0, 200),
        is_admitted: p.is_admitted,
        ownerId: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `patients/${docId}`);
    }
  }

  for (const d of initial.doctors) {
    const docId = `${uid}_doctor_${d.id}`;
    try {
      await setDoc(doc(db, 'doctors', docId), {
        id: d.id,
        full_name: d.full_name.slice(0, 100),
        specialization: d.specialization.slice(0, 100),
        phone: d.phone.slice(0, 30),
        ward_id: d.ward_id ?? 1,
        is_available: d.is_available,
        ownerId: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `doctors/${docId}`);
    }
  }

  for (const a of initial.appointments) {
    const docId = `${uid}_appointment_${a.id}`;
    try {
      await setDoc(doc(db, 'appointments', docId), {
        id: a.id,
        patient_id: a.patient_id,
        doctor_id: a.doctor_id,
        appointment_time: a.appointment_time.slice(0, 40),
        status: a.status,
        notes: (a.notes ?? '').slice(0, 300),
        ownerId: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `appointments/${docId}`);
    }
  }

  for (const m of initial.medicines) {
    const docId = `${uid}_medicine_${m.id}`;
    try {
      await setDoc(doc(db, 'medicines', docId), {
        id: m.id,
        name: m.name.slice(0, 100),
        category: m.category.slice(0, 80),
        stock_quantity: m.stock_quantity,
        unit_price: m.unit_price,
        expiry_date: m.expiry_date.slice(0, 20),
        ownerId: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `medicines/${docId}`);
    }
  }

  for (const l of initial.lab_tests) {
    const docId = `${uid}_labtest_${l.id}`;
    try {
      await setDoc(doc(db, 'lab_tests', docId), {
        id: l.id,
        patient_id: l.patient_id,
        doctor_id: l.doctor_id,
        test_name: l.test_name.slice(0, 120),
        status: l.status,
        result: (l.result ?? '').slice(0, 300),
        ordered_at: l.ordered_at.slice(0, 40),
        ownerId: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `lab_tests/${docId}`);
    }
  }

  for (const b of initial.bills) {
    const docId = `${uid}_bill_${b.id}`;
    try {
      await setDoc(doc(db, 'bills', docId), {
        id: b.id,
        patient_id: b.patient_id,
        total_amount: b.total_amount,
        paid_status: b.paid_status,
        description: b.description.slice(0, 300),
        ownerId: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `bills/${docId}`);
    }
  }
}

export async function checkIfUserHasSeededFirestore(uid: string): Promise<boolean> {
  const path = 'wards';
  try {
    const q = query(collection(db, path), where('ownerId', '==', uid));
    const snap = await getDocs(q);
    return !snap.empty;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function syncBedAndPatientToFirestore(
  uid: string,
  bedId: number,
  bedUpdate: {
    is_occupied: boolean;
    patient_id: number | null;
    admitted_at: string | null;
    discharged_at: string | null;
  },
  patientId: number,
  isAdmitted: boolean
) {
  const bedDocId = `${uid}_bed_${bedId}`;
  try {
    await updateDoc(doc(db, 'beds', bedDocId), {
      is_occupied: bedUpdate.is_occupied,
      patient_id: bedUpdate.patient_id ?? 0,
      admitted_at: (bedUpdate.admitted_at ?? '').slice(0, 40),
      discharged_at: (bedUpdate.discharged_at ?? '').slice(0, 40),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `beds/${bedDocId}`);
  }

  const patDocId = `${uid}_patient_${patientId}`;
  try {
    await updateDoc(doc(db, 'patients', patDocId), {
      is_admitted: isAdmitted,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `patients/${patDocId}`);
  }
}

export async function syncNewAppointmentToFirestore(uid: string, appt: Appointment) {
  const docId = `${uid}_appointment_${appt.id}`;
  try {
    await setDoc(doc(db, 'appointments', docId), {
      id: appt.id,
      patient_id: appt.patient_id,
      doctor_id: appt.doctor_id,
      appointment_time: appt.appointment_time.slice(0, 40),
      status: appt.status,
      notes: (appt.notes ?? '').slice(0, 300),
      ownerId: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `appointments/${docId}`);
  }
}

export async function syncAppointmentStatusToFirestore(
  uid: string,
  appointmentId: number,
  status: 'Scheduled' | 'Completed' | 'Cancelled'
) {
  const docId = `${uid}_appointment_${appointmentId}`;
  try {
    await updateDoc(doc(db, 'appointments', docId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `appointments/${docId}`);
  }
}

export async function syncMedicineStockToFirestore(
  uid: string,
  medicineId: number,
  stockQuantity: number
) {
  const docId = `${uid}_medicine_${medicineId}`;
  try {
    await updateDoc(doc(db, 'medicines', docId), {
      stock_quantity: stockQuantity,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `medicines/${docId}`);
  }
}

export async function syncNewLabTestToFirestore(uid: string, test: LabTest) {
  const docId = `${uid}_labtest_${test.id}`;
  try {
    await setDoc(doc(db, 'lab_tests', docId), {
      id: test.id,
      patient_id: test.patient_id,
      doctor_id: test.doctor_id,
      test_name: test.test_name.slice(0, 120),
      status: test.status,
      result: (test.result ?? '').slice(0, 300),
      ordered_at: test.ordered_at.slice(0, 40),
      ownerId: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `lab_tests/${docId}`);
  }
}

export async function syncBillPaidToFirestore(uid: string, billId: number) {
  const docId = `${uid}_bill_${billId}`;
  try {
    await updateDoc(doc(db, 'bills', docId), {
      paid_status: 'Paid',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `bills/${docId}`);
  }
}

export type { HospitalDatabaseState };
