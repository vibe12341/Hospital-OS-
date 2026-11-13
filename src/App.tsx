import React, { useState, useEffect } from 'react';
import {
  Activity,
  BedDouble,
  Bot,
  Database,
  FileCode2,
  Play,
  RotateCcw,
  Terminal,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  Copy,
  Check,
  Sparkles,
  LogIn,
  LogOut,
  Cloud,
  Send,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
  createInitialHospitalState,
  HospitalDatabaseState,
  MCP_SERVERS_CATALOG,
  McpServerId,
  PROJECT_FILES_GUIDE,
  Appointment,
  LabTest,
} from './data/hospitalSeed';
import {
  auth,
  db as firestoreDb,
  signInWithGoogle,
  signOutUser,
  seedFirestoreHospitalData,
  checkIfUserHasSeededFirestore,
  syncBedAndPatientToFirestore,
  syncNewAppointmentToFirestore,
  syncAppointmentStatusToFirestore,
  syncMedicineStockToFirestore,
  syncNewLabTestToFirestore,
  syncBillPaidToFirestore,
  handleFirestoreError,
  OperationType,
} from './firebase';

type NavSection = 'agent' | 'beds' | 'mcp' | 'api' | 'code';
type TableName =
  | 'patients'
  | 'doctors'
  | 'appointments'
  | 'wards'
  | 'beds'
  | 'medicines'
  | 'lab_tests'
  | 'bills';

type GeminiFlashModel =
  | 'gemini-3-flash-preview'
  | 'gemini-flash-latest'
  | 'gemini-3.1-flash-lite-preview';

interface McpCallLog {
  id: string;
  timestamp: string;
  server: McpServerId;
  tool: string;
  mode: 'READ' | 'WRITE';
  args: string;
  result: string;
  isError: boolean;
}

interface PendingWriteItem {
  id: string;
  tool: string;
  mode: 'WRITE';
  args: Record<string, any>;
  summary: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  executionResult?: string;
}

interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  model?: string;
  timestamp: string;
  toolCalls?: {
    tool: string;
    mode?: 'READ' | 'WRITE';
    args: Record<string, any>;
    result: string;
  }[];
  pendingConfirmations?: PendingWriteItem[];
}

interface ServerMutation {
  type:
    | 'admit'
    | 'discharge'
    | 'book_appointment'
    | 'cancel_appointment'
    | 'restock_medicine'
    | 'order_test'
    | 'mark_bill_paid';
  bedId?: number;
  patientId?: number;
  admittedAt?: string | null;
  dischargedAt?: string | null;
  appointment?: Appointment;
  appointmentId?: number;
  medicineId?: number;
  newStockQuantity?: number;
  labTest?: LabTest;
  billId?: number;
}

const TOOL_TO_SERVER_MAP: Record<string, McpServerId> = {
  get_free_beds: 'beds',
  admit_patient: 'beds',
  discharge_patient: 'beds',
  search_patients: 'patients',
  get_patient: 'patients',
  get_patient_history: 'patients',
  list_doctor_availability: 'appointments',
  list_appointments: 'appointments',
  book_appointment: 'appointments',
  cancel_appointment: 'appointments',
  check_stock: 'pharmacy',
  list_low_stock: 'pharmacy',
  restock_medicine: 'pharmacy',
  list_pending_tests: 'lab',
  get_results: 'lab',
  order_test: 'lab',
  get_bill: 'billing',
  list_unpaid_bills: 'billing',
  mark_bill_paid: 'billing',
};

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('agent');
  const [db, setDb] = useState<HospitalDatabaseState>(() => createInitialHospitalState());
  const [selectedWardFilter, setSelectedWardFilter] = useState<string>('ALL');

  // Firebase Auth & Firestore Live Sync State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSeedingCloud, setIsSeedingCloud] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);

  // Gemini Flash AI Agent State
  const [selectedModel, setSelectedModel] = useState<GeminiFlashModel>('gemini-3-flash-preview');
  const [requireWriteConfirmation, setRequireWriteConfirmation] = useState<boolean>(true);
  const [agentPrompt, setAgentPrompt] = useState<string>('');
  const [isAgentThinking, setIsAgentThinking] = useState<boolean>(false);
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([
    {
      id: 'welcome-1',
      role: 'assistant',
      model: 'gemini-3-flash-preview',
      timestamp: new Date().toLocaleTimeString(),
      text: 'Hello! I am the HospitalOS Phase 2 Clinical Agent powered by Google Gemini Flash on the backend server. I am connected to all 6 MCP servers (19 tools across beds, patients, appointments, pharmacy, lab, and billing). Read tools run immediately, while Write tools ask for your confirmation before modifying the hospital database.',
    },
  ]);

  // Phase 2 Multi-Server MCP Tester State
  const [selectedMcpServer, setSelectedMcpServer] = useState<McpServerId>('beds');
  const [selectedMcpTool, setSelectedMcpTool] = useState<string>('get_free_beds');
  const [mcpArgsState, setMcpArgsState] = useState<{
    ward: string;
    patient_id: number;
    name: string;
    doctor_id: number;
    date: string;
    datetime: string;
    appointment_id: number;
    medicine_name: string;
    threshold: number;
    quantity: number;
    test_name: string;
    bill_id: number;
  }>({
    ward: 'ICU',
    patient_id: 3,
    name: 'Sharma',
    doctor_id: 1,
    date: '2026-11-10',
    datetime: '2026-11-12T10:00:00Z',
    appointment_id: 4,
    medicine_name: 'Salbutamol',
    threshold: 50,
    quantity: 30,
    test_name: 'Arterial Blood Gas (ABG)',
    bill_id: 2,
  });
  const [stagedDirectWrite, setStagedDirectWrite] = useState<{
    tool: string;
    args: Record<string, any>;
    summary: string;
  } | null>(null);
  const [isExecutingMcp, setIsExecutingMcp] = useState<boolean>(false);

  const [mcpLogs, setMcpLogs] = useState<McpCallLog[]>([
    {
      id: 'init-1',
      timestamp: new Date().toISOString().slice(11, 19),
      server: 'beds',
      tool: 'get_free_beds',
      mode: 'READ',
      args: 'ward="ICU"',
      result: 'Free beds in ICU (2 available): ICU-03, ICU-04',
      isError: false,
    },
  ]);

  // FastAPI Explorer State
  const [selectedTable, setSelectedTable] = useState<TableName>('beds');
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  // Code Walkthrough State
  const [selectedFileIndex, setSelectedFileIndex] = useState<number>(0);

  // 1. Listen for Firebase Auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setIsAuthReady(true);
      setCloudError(null);

      if (user) {
        try {
          const hasSeeded = await checkIfUserHasSeededFirestore(user.uid);
          if (!hasSeeded) {
            setIsSeedingCloud(true);
            await seedFirestoreHospitalData(user.uid);
            setIsSeedingCloud(false);
          }
        } catch (err) {
          setIsSeedingCloud(false);
          setCloudError(err instanceof Error ? err.message : String(err));
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Real-time Firestore listeners when authenticated
  useEffect(() => {
    if (!isAuthReady || !currentUser) return;

    const uid = currentUser.uid;
    const unsubscribes: (() => void)[] = [];

    const listenCollection = <K extends keyof HospitalDatabaseState>(
      colName: K,
      transform?: (raw: any) => any
    ) => {
      const q = query(collection(firestoreDb, colName), where('ownerId', '==', uid));
      const unsub = onSnapshot(
        q,
        (snapshot) => {
          if (snapshot.empty) return;
          const items = snapshot.docs
            .map((d) => {
              const raw = d.data();
              return transform ? transform(raw) : raw;
            })
            .sort((a, b) => a.id - b.id);

          setDb((prev) => ({
            ...prev,
            [colName]: items,
          }));
        },
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, colName);
          } catch (e) {
            setCloudError(e instanceof Error ? e.message : String(e));
          }
        }
      );
      unsubscribes.push(unsub);
    };

    listenCollection('wards');
    listenCollection('beds', (raw) => ({
      ...raw,
      patient_id: raw.patient_id === 0 ? null : raw.patient_id,
      admitted_at: raw.admitted_at === '' ? null : raw.admitted_at,
      discharged_at: raw.discharged_at === '' ? null : raw.discharged_at,
    }));
    listenCollection('patients', (raw) => ({
      ...raw,
      created_at:
        typeof raw.createdAt?.toDate === 'function'
          ? raw.createdAt.toDate().toISOString()
          : '2026-11-08T09:00:00Z',
    }));
    listenCollection('doctors');
    listenCollection('appointments');
    listenCollection('medicines');
    listenCollection('lab_tests', (raw) => ({
      ...raw,
      result: raw.result === '' ? null : raw.result,
    }));
    listenCollection('bills', (raw) => ({
      ...raw,
      created_at:
        typeof raw.createdAt?.toDate === 'function'
          ? raw.createdAt.toDate().toISOString()
          : '2026-11-09T10:00:00Z',
    }));

    return () => {
      unsubscribes.forEach((u) => u());
    };
  }, [isAuthReady, currentUser]);

  // Apply backend mutations to Cloud Firestore if user is logged in
  const applyServerMutationsToFirestore = async (mutations: ServerMutation[] | undefined) => {
    if (!currentUser || !mutations || mutations.length === 0) return;
    try {
      for (const m of mutations) {
        if (m.type === 'admit' && m.bedId && m.patientId) {
          await syncBedAndPatientToFirestore(
            currentUser.uid,
            m.bedId,
            {
              is_occupied: true,
              patient_id: m.patientId,
              admitted_at: m.admittedAt ?? null,
              discharged_at: null,
            },
            m.patientId,
            true
          );
        } else if (m.type === 'discharge' && m.bedId && m.patientId) {
          await syncBedAndPatientToFirestore(
            currentUser.uid,
            m.bedId,
            {
              is_occupied: false,
              patient_id: null,
              admitted_at: m.admittedAt ?? null,
              discharged_at: m.dischargedAt ?? null,
            },
            m.patientId,
            false
          );
        } else if (m.type === 'book_appointment' && m.appointment) {
          await syncNewAppointmentToFirestore(currentUser.uid, m.appointment);
        } else if (m.type === 'cancel_appointment' && m.appointmentId) {
          await syncAppointmentStatusToFirestore(currentUser.uid, m.appointmentId, 'Cancelled');
        } else if (
          m.type === 'restock_medicine' &&
          m.medicineId !== undefined &&
          m.newStockQuantity !== undefined
        ) {
          await syncMedicineStockToFirestore(
            currentUser.uid,
            m.medicineId,
            m.newStockQuantity
          );
        } else if (m.type === 'order_test' && m.labTest) {
          await syncNewLabTestToFirestore(currentUser.uid, m.labTest);
        } else if (m.type === 'mark_bill_paid' && m.billId) {
          await syncBillPaidToFirestore(currentUser.uid, m.billId);
        }
      }
    } catch (err) {
      setCloudError(err instanceof Error ? err.message : String(err));
    }
  };

  // KPI computations
  const totalBeds = db.beds.length;
  const occupiedBeds = db.beds.filter((b) => b.is_occupied).length;
  const freeBeds = totalBeds - occupiedBeds;
  const occupancyPercent = Math.round((occupiedBeds / totalBeds) * 100);
  const pendingLabCount = db.lab_tests.filter((t) => t.status === 'Pending').length;
  const unpaidBillsCount = db.bills.filter(
    (b) => b.paid_status === 'Unpaid' || b.paid_status === 'Partial'
  ).length;

  const getWardName = (wardId: number | null) => {
    if (!wardId) return 'Unassigned';
    return db.wards.find((w) => w.id === wardId)?.name ?? `Ward #${wardId}`;
  };

  const getPatientName = (patientId: number | null) => {
    if (!patientId) return null;
    return db.patients.find((p) => p.id === patientId)?.full_name ?? `Patient #${patientId}`;
  };

  const getDoctorName = (doctorId: number) => {
    return db.doctors.find((d) => d.id === doctorId)?.full_name ?? `Doctor #${doctorId}`;
  };

  const formatResultText = (val: unknown): string => {
    if (typeof val === 'string') return val;
    if (val === null || val === undefined) return '';
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  };

  const logMcpCall = (
    tool: string,
    mode: 'READ' | 'WRITE',
    args: string,
    result: unknown,
    isError: boolean
  ) => {
    const server = TOOL_TO_SERVER_MAP[tool] ?? 'beds';
    const resultStr = formatResultText(result);
    setMcpLogs((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString().slice(11, 19),
        server,
        tool,
        mode,
        args,
        result: resultStr,
        isError,
      },
      ...prev.slice(0, 29),
    ]);
  };

  // Execute a single MCP tool via backend /api/mcp/execute
  const executeMcpToolOnServer = async (toolName: string, args: Record<string, any>) => {
    setIsExecutingMcp(true);
    try {
      const response = await fetch('/api/mcp/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: toolName,
          args,
          hospitalState: db,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to execute MCP tool');
      }

      if (data.updatedState) {
        setDb(data.updatedState);
      }
      await applyServerMutationsToFirestore(data.mutations);

      const argsFormatted = Object.entries(args)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(', ');
      const resultStr = formatResultText(data.result);
      const isErr =
        resultStr.startsWith('Cannot ') ||
        resultStr.startsWith('Friendly Error') ||
        resultStr.includes('"error": true');
      logMcpCall(
        toolName,
        data.mode ?? 'READ',
        argsFormatted || '(no args)',
        resultStr,
        isErr
      );
      return resultStr;
    } finally {
      setIsExecutingMcp(false);
    }
  };

  // Confirm or Cancel a pending write tool inside the AI Agent Chat
  const handleDecisionOnPendingWrite = async (
    messageId: string,
    pendingId: string,
    decision: 'confirmed' | 'cancelled'
  ) => {
    const targetMsg = agentMessages.find((m) => m.id === messageId);
    const pendingItem = targetMsg?.pendingConfirmations?.find((p) => p.id === pendingId);
    if (!pendingItem || pendingItem.status !== 'pending') return;

    if (decision === 'cancelled') {
      setAgentMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                pendingConfirmations: m.pendingConfirmations?.map((p) =>
                  p.id === pendingId
                    ? {
                        ...p,
                        status: 'cancelled',
                        executionResult: 'Cancelled by staff member. Database was not modified.',
                      }
                    : p
                ),
              }
            : m
        )
      );
      return;
    }

    // Execute confirmed write tool
    try {
      const resultText = await executeMcpToolOnServer(pendingItem.tool, pendingItem.args);
      setAgentMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                pendingConfirmations: m.pendingConfirmations?.map((p) =>
                  p.id === pendingId
                    ? {
                        ...p,
                        status: 'confirmed',
                        executionResult: resultText,
                      }
                    : p
                ),
              }
            : m
        )
      );
    } catch (err) {
      setAgentMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                pendingConfirmations: m.pendingConfirmations?.map((p) =>
                  p.id === pendingId
                    ? {
                        ...p,
                        status: 'cancelled',
                        executionResult: `Error: ${err instanceof Error ? err.message : String(err)}`,
                      }
                    : p
                ),
              }
            : m
        )
      );
    }
  };

  // Build args object for the currently selected MCP tool in the 6-Server Runner
  const buildArgsForSelectedTool = (toolName: string): Record<string, any> => {
    switch (toolName) {
      case 'get_free_beds':
        return { ward: mcpArgsState.ward };
      case 'admit_patient':
        return { patient_id: mcpArgsState.patient_id, ward: mcpArgsState.ward };
      case 'discharge_patient':
        return { patient_id: mcpArgsState.patient_id };
      case 'search_patients':
        return { name: mcpArgsState.name };
      case 'get_patient':
      case 'get_patient_history':
        return { patient_id: mcpArgsState.patient_id };
      case 'list_doctor_availability':
        return { doctor_id: mcpArgsState.doctor_id, date: mcpArgsState.date };
      case 'list_appointments':
        return { patient_id: mcpArgsState.patient_id };
      case 'book_appointment':
        return {
          patient_id: mcpArgsState.patient_id,
          doctor_id: mcpArgsState.doctor_id,
          datetime: mcpArgsState.datetime,
        };
      case 'cancel_appointment':
        return { appointment_id: mcpArgsState.appointment_id };
      case 'check_stock':
        return { medicine_name: mcpArgsState.medicine_name };
      case 'list_low_stock':
        return { threshold: mcpArgsState.threshold };
      case 'restock_medicine':
        return {
          medicine_name: mcpArgsState.medicine_name,
          quantity: mcpArgsState.quantity,
        };
      case 'list_pending_tests':
        return {};
      case 'get_results':
        return { patient_id: mcpArgsState.patient_id };
      case 'order_test':
        return {
          patient_id: mcpArgsState.patient_id,
          test_name: mcpArgsState.test_name,
        };
      case 'get_bill':
        return { patient_id: mcpArgsState.patient_id };
      case 'list_unpaid_bills':
        return {};
      case 'mark_bill_paid':
        return { bill_id: mcpArgsState.bill_id };
      default:
        return {};
    }
  };

  const activeServerObj =
    MCP_SERVERS_CATALOG.find((s) => s.id === selectedMcpServer) ?? MCP_SERVERS_CATALOG[0];
  const activeToolObj =
    activeServerObj.tools.find((t) => t.name === selectedMcpTool) ?? activeServerObj.tools[0];

  const handleRunMcpToolFromForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const args = buildArgsForSelectedTool(activeToolObj.name);
    if (activeToolObj.mode === 'WRITE' && requireWriteConfirmation) {
      setStagedDirectWrite({
        tool: activeToolObj.name,
        args,
        summary: `${activeToolObj.name}(${Object.entries(args)
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(', ')})`,
      });
      return;
    }
    setStagedDirectWrite(null);
    await executeMcpToolOnServer(activeToolObj.name, args);
  };

  // Run the automated test_<server>_mcp.py sequence for the selected server
  const handleRunServerTestSuite = async () => {
    setStagedDirectWrite(null);
    if (selectedMcpServer === 'beds') {
      await executeMcpToolOnServer('get_free_beds', { ward: 'ICU' });
      await executeMcpToolOnServer('admit_patient', { patient_id: 3, ward: 'ICU' });
      await executeMcpToolOnServer('discharge_patient', { patient_id: 3 });
    } else if (selectedMcpServer === 'patients') {
      await executeMcpToolOnServer('search_patients', { name: 'Sharma' });
      await executeMcpToolOnServer('get_patient', { patient_id: 1 });
      await executeMcpToolOnServer('get_patient_history', { patient_id: 1 });
    } else if (selectedMcpServer === 'appointments') {
      await executeMcpToolOnServer('list_doctor_availability', {
        doctor_id: 1,
        date: '2026-11-10',
      });
      await executeMcpToolOnServer('list_appointments', { patient_id: 1 });
      await executeMcpToolOnServer('book_appointment', {
        patient_id: 3,
        doctor_id: 2,
        datetime: '2026-11-12T10:00:00Z',
      });
    } else if (selectedMcpServer === 'pharmacy') {
      await executeMcpToolOnServer('check_stock', { medicine_name: 'Amoxicillin' });
      await executeMcpToolOnServer('list_low_stock', { threshold: 50 });
      await executeMcpToolOnServer('restock_medicine', {
        medicine_name: 'Ceftriaxone 1g IV',
        quantity: 25,
      });
    } else if (selectedMcpServer === 'lab') {
      await executeMcpToolOnServer('list_pending_tests', {});
      await executeMcpToolOnServer('get_results', { patient_id: 1 });
      await executeMcpToolOnServer('order_test', {
        patient_id: 3,
        test_name: 'Complete Blood Count (CBC)',
      });
    } else if (selectedMcpServer === 'billing') {
      await executeMcpToolOnServer('get_bill', { patient_id: 1 });
      await executeMcpToolOnServer('list_unpaid_bills', {});
      await executeMcpToolOnServer('mark_bill_paid', { bill_id: 2 });
    }
  };

  // Call Server-Side Gemini Flash Agent (/api/agent/chat)
  const handleSendAgentPrompt = async (customPrompt?: string) => {
    const promptToSend = (customPrompt ?? agentPrompt).trim();
    if (!promptToSend || isAgentThinking) return;

    const userMessage: AgentMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: promptToSend,
      timestamp: new Date().toLocaleTimeString(),
    };

    setAgentMessages((prev) => [...prev, userMessage]);
    if (!customPrompt) setAgentPrompt('');
    setIsAgentThinking(true);

    try {
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptToSend,
          model: selectedModel,
          hospitalState: db,
          requireWriteConfirmation,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to communicate with Gemini Flash backend');
      }

      if (data.updatedState) {
        setDb(data.updatedState);
      }

      await applyServerMutationsToFirestore(data.mutations);

      const normalizedToolCalls = Array.isArray(data.toolCalls)
        ? data.toolCalls.map((tc: any) => {
            const resStr = formatResultText(tc.result);
            const argsStr = Object.entries(tc.args || {})
              .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
              .join(', ');
            logMcpCall(
              tc.tool,
              tc.mode ?? 'READ',
              argsStr || '(no args)',
              resStr,
              resStr.startsWith('Cannot') || resStr.startsWith('Friendly Error')
            );
            return {
              tool: tc.tool,
              mode: tc.mode ?? 'READ',
              args: tc.args || {},
              result: resStr,
            };
          })
        : [];

      const pendingItems: PendingWriteItem[] = Array.isArray(data.pendingWriteConfirmations)
        ? data.pendingWriteConfirmations.map((pw: any, idx: number) => ({
            id: pw.id || `pw-${Date.now()}-${idx}`,
            tool: pw.tool,
            mode: 'WRITE',
            args: pw.args || {},
            summary:
              pw.summary ||
              `${pw.tool}(${Object.entries(pw.args || {})
                .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                .join(', ')})`,
            status: 'pending',
          }))
        : [];

      const assistantMsg: AgentMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        model: data.model || selectedModel,
        timestamp: new Date().toLocaleTimeString(),
        text: formatResultText(data.reply),
        toolCalls: normalizedToolCalls,
        pendingConfirmations: pendingItems,
      };
      setAgentMessages((prev) => [...prev, assistantMsg]);
    } catch (error) {
      setAgentMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          model: selectedModel,
          timestamp: new Date().toLocaleTimeString(),
          text: `Agent Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ]);
    } finally {
      setIsAgentThinking(false);
    }
  };

  const resetSeedDatabase = async () => {
    const fresh = createInitialHospitalState();
    setDb(fresh);
    if (currentUser) {
      setIsSeedingCloud(true);
      try {
        await seedFirestoreHospitalData(currentUser.uid);
      } catch (err) {
        setCloudError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsSeedingCloud(false);
      }
    }
    logMcpCall(
      'get_free_beds',
      'READ',
      'seed_data.py',
      currentUser
        ? 'Reset and re-seeded all 8 collections in Firebase Cloud Firestore.'
        : 'Reset local hospital state to initial seed_data.py records.',
      false
    );
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCommand(id);
    setTimeout(() => setCopiedCommand(null), 1800);
  };

  const filteredBeds =
    selectedWardFilter === 'ALL'
      ? db.beds
      : db.beds.filter((b) => {
          const wName = getWardName(b.ward_id);
          return wName.toLowerCase() === selectedWardFilter.toLowerCase();
        });

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col">
      {/* Top Clinical Navigation Bar (Strict 3-Zone Contract) */}
      <header className="sticky top-0 z-30 h-16 bg-white border-b border-[#E2E8F0] px-6 flex items-center justify-between gap-4">
        {/* Zone 1: Brand & Phase Identity */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-[#0F766E] text-white flex items-center justify-center shadow-xs">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-base text-[#0F172A]">
                HospitalOS
              </span>
              <span className="text-xs font-mono uppercase tracking-wider text-[#0F766E] font-semibold">
                Phase 2 · 6 MCP Servers (19 Tools)
              </span>
            </div>
            <p className="text-xs text-[#475569] hidden sm:block">
              FastMCP · Shared SQLAlchemy Helper · Write Tool Confirmation
            </p>
          </div>
        </div>

        {/* Zone 2: Primary View Switcher */}
        <nav className="flex items-center gap-1 bg-[#F1F5F9] p-1 rounded-lg border border-[#E2E8F0] overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveSection('agent')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeSection === 'agent'
                ? 'bg-white text-[#0F172A] shadow-xs font-semibold'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-[#0F766E]" />
            AI Agent & MCP
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('mcp')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeSection === 'mcp'
                ? 'bg-white text-[#0F172A] shadow-xs font-semibold'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            <Bot className="w-3.5 h-3.5 text-[#0F766E]" />
            6 MCP Servers
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('beds')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeSection === 'beds'
                ? 'bg-white text-[#0F172A] shadow-xs font-semibold'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            <BedDouble className="w-3.5 h-3.5 text-[#0F766E]" />
            Ward & Bed Matrix
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('api')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeSection === 'api'
                ? 'bg-white text-[#0F172A] shadow-xs font-semibold'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            <Database className="w-3.5 h-3.5 text-[#0F766E]" />
            8-Table Explorer
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('code')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeSection === 'code'
                ? 'bg-white text-[#0F172A] shadow-xs font-semibold'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            <FileCode2 className="w-3.5 h-3.5 text-[#0F766E]" />
            Phase 2 Code & CLI
          </button>
        </nav>

        {/* Zone 3: Cloud Firestore Auth & Reset Action */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={resetSeedDatabase}
            disabled={isSeedingCloud}
            className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] bg-white hover:bg-[#F1F5F9] text-xs font-medium text-[#0F172A] flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer disabled:opacity-50"
            title="Reset all 8 tables back to initial synthetic data"
          >
            <RotateCcw className={`w-3.5 h-3.5 text-[#475569] ${isSeedingCloud ? 'animate-spin' : ''}`} />
            {isSeedingCloud ? 'Seeding Cloud...' : 'Reset Seed Data'}
          </button>

          {currentUser ? (
            <button
              type="button"
              onClick={() => signOutUser()}
              className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-[#F1F5F9] text-xs font-medium text-[#0F172A] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              title={`Signed in as ${currentUser.email} (Firestore Sync Active)`}
            >
              <Cloud className="w-3.5 h-3.5 text-[#15803D]" />
              <span className="hidden xl:inline">Firestore Live</span>
              <LogOut className="w-3.5 h-3.5 text-[#64748B]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => signInWithGoogle()}
              className="px-3 py-1.5 rounded-lg bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
            >
              <LogIn className="w-3.5 h-3.5" />
              Connect Firestore
            </button>
          )}
        </div>
      </header>

      {/* Main Workspace Container */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-6 py-6 space-y-6">
        {cloudError && (
          <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-xl p-4 flex items-center justify-between gap-4 text-xs text-[#B91C1C]">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="font-mono break-all">{cloudError}</span>
            </div>
            <button
              type="button"
              onClick={() => setCloudError(null)}
              className="underline font-semibold shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Top KPI Summary Row */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#475569]">
                Hospital Bed Census
              </span>
              <span className="text-xs font-mono text-[#0F766E] font-semibold">
                {occupancyPercent}% Occupied
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono tabular-nums text-[#0F172A]">
                {freeBeds} Free
              </span>
              <span className="text-xs text-[#64748B] font-mono tabular-nums">
                / {totalBeds} Total Beds
              </span>
            </div>
            <p className="mt-2 text-xs text-[#475569]">
              {occupiedBeds} occupied across ICU, General, Pediatrics & ER
            </p>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#475569]">
                Phase 2 MCP Servers
              </span>
              <span className="text-xs font-mono text-[#0284C7] font-semibold">
                common/db.py
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono tabular-nums text-[#0F172A]">
                6 Servers
              </span>
              <span className="text-xs text-[#64748B]">19 Tools (12 READ · 7 WRITE)</span>
            </div>
            <p className="mt-2 text-xs text-[#475569]">
              beds, patients, appointments, pharmacy, lab, billing
            </p>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#475569]">
                Clinical Queue Status
              </span>
              <span className="text-xs font-mono text-[#B45309] font-semibold">
                Live Telemetry
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-2xl font-bold font-mono tabular-nums text-[#0F172A]">
                {pendingLabCount} Labs
              </span>
              <span className="text-xs text-[#64748B] font-mono tabular-nums">
                · {unpaidBillsCount} Unpaid Bills
              </span>
            </div>
            <p className="mt-2 text-xs text-[#475569]">
              {db.appointments.filter((a) => a.status === 'Scheduled').length} scheduled
              appointments active
            </p>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#475569]">
                Write Safety Guard
              </span>
              <span
                className={`text-xs font-mono font-semibold ${
                  requireWriteConfirmation ? 'text-[#15803D]' : 'text-[#B45309]'
                }`}
              >
                {requireWriteConfirmation ? 'Human-in-the-Loop ON' : 'Auto-Execute ON'}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-lg font-bold text-[#0F172A]">
                {requireWriteConfirmation ? 'Confirm Before Write' : 'Direct Write Mode'}
              </span>
              <button
                type="button"
                onClick={() => setRequireWriteConfirmation((prev) => !prev)}
                className="px-2.5 py-1 rounded-md border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-[#F1F5F9] text-xs font-medium text-[#0F172A] cursor-pointer shrink-0"
              >
                Toggle
              </button>
            </div>
            <p className="mt-2 text-xs text-[#475569]">
              Enforces [OPERATION: WRITE - REQUIRES CONFIRMATION]
            </p>
          </div>
        </section>

        {/* SECTION 0: GEMINI FLASH AI AGENT & 6-SERVER MCP ORCHESTRATOR */}
        {activeSection === 'agent' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 7 Columns: Gemini Flash Clinical Assistant */}
            <div className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-xl shadow-xs flex flex-col h-[680px]">
              <div className="p-5 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#0F766E]" />
                    <h2 className="text-base font-bold text-[#0F172A]">
                      HospitalOS Gemini Flash Clinical Agent (19 MCP Tools)
                    </h2>
                  </div>
                  <p className="text-xs text-[#475569] mt-0.5">
                    Calls READ tools automatically and stages WRITE tools for staff confirmation
                  </p>
                </div>

                {/* Model Selector + Write Confirmation Switch */}
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-[#475569]">Model:</label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value as GeminiFlashModel)}
                    className="px-3 py-1.5 rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] text-xs font-mono text-[#0F172A] focus:outline-none focus:border-[#0F766E]"
                  >
                    <option value="gemini-3-flash-preview">gemini-3-flash-preview</option>
                    <option value="gemini-flash-latest">gemini-flash-latest</option>
                    <option value="gemini-3.1-flash-lite-preview">
                      gemini-3.1-flash-lite-preview
                    </option>
                  </select>
                </div>
              </div>

              {/* Quick Sample Prompts across all 6 MCP servers */}
              <div className="px-5 py-2.5 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center gap-2 overflow-x-auto">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] shrink-0">
                  Try MCP Prompts:
                </span>
                {[
                  'Search patients named Sharma and show patient #1 full clinical history',
                  'Which medicines are low on stock (threshold 50) and what lab tests are pending?',
                  'Check Dr. Sunita Reddy (doctor #2) availability on 2026-11-11 and list unpaid bills',
                  'Admit patient #3 (Rohan Verma) into the ICU ward',
                  'Restock Ceftriaxone 1g IV by 30 units and mark bill #2 as paid',
                ].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => handleSendAgentPrompt(sample)}
                    disabled={isAgentThinking}
                    className="px-2.5 py-1 rounded-md bg-white border border-[#E2E8F0] hover:border-[#0F766E] text-xs text-[#0F172A] whitespace-nowrap shrink-0 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {sample}
                  </button>
                ))}
              </div>

              {/* Conversation History */}
              <div className="flex-1 p-5 overflow-y-auto space-y-4">
                {agentMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.role === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-semibold text-[#475569]">
                        {msg.role === 'user' ? 'Hospital Staff' : 'HospitalOS Agent'}
                      </span>
                      {msg.model && (
                        <span className="text-[11px] font-mono text-[#0F766E]">
                          [{msg.model}]
                        </span>
                      )}
                      <span className="text-[11px] font-mono text-[#94A3B8]">
                        {msg.timestamp}
                      </span>
                    </div>

                    <div
                      className={`max-w-[90%] rounded-xl p-4 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-[#0F766E] text-white'
                          : 'bg-[#F8FAFC] border border-[#E2E8F0] text-[#0F172A]'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.text}</p>

                      {/* Executed MCP Tool Call Trace */}
                      {msg.toolCalls && msg.toolCalls.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-[#E2E8F0] space-y-2">
                          <span className="text-[11px] font-mono uppercase tracking-wider text-[#0F766E] font-semibold block">
                            Executed MCP Tool Calls ({msg.toolCalls.length}):
                          </span>
                          {msg.toolCalls.map((tc, idx) => (
                            <div
                              key={idx}
                              className="bg-[#0F172A] text-[#F8FAFC] rounded-lg p-2.5 font-mono text-xs"
                            >
                              <div className="flex items-center justify-between gap-2 text-[#5EEAD4]">
                                <span>
                                  {TOOL_TO_SERVER_MAP[tc.tool] ?? 'mcp'}.{tc.tool}(
                                  {JSON.stringify(tc.args)})
                                </span>
                                <span className="text-[10px] uppercase text-[#94A3B8]">
                                  [OPERATION: {tc.mode ?? 'READ'}]
                                </span>
                              </div>
                              <div className="text-[#CBD5E1] mt-1 whitespace-pre-wrap">
                                → {formatResultText(tc.result)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Pending Write Tool Confirmations */}
                      {msg.pendingConfirmations && msg.pendingConfirmations.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-[#FDE68A] space-y-2.5">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#B45309]">
                            <ShieldAlert className="w-4 h-4 shrink-0" />
                            <span>
                              [OPERATION: WRITE - REQUIRES CONFIRMATION] ({msg.pendingConfirmations.length})
                            </span>
                          </div>
                          {msg.pendingConfirmations.map((pw) => (
                            <div
                              key={pw.id}
                              className="rounded-lg border border-[#F59E0B]/40 bg-[#FFFBEB] p-3 text-xs space-y-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono font-semibold text-[#0F172A]">
                                  {TOOL_TO_SERVER_MAP[pw.tool] ?? 'mcp'}.{pw.summary}
                                </span>
                                <span className="font-mono text-[11px] uppercase font-semibold text-[#B45309]">
                                  {pw.status === 'pending'
                                    ? 'Awaiting Approval'
                                    : pw.status === 'confirmed'
                                    ? 'Confirmed & Executed'
                                    : 'Cancelled'}
                                </span>
                              </div>

                              {pw.status === 'pending' ? (
                                <div className="flex items-center gap-2 pt-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDecisionOnPendingWrite(msg.id, pw.id, 'confirmed')
                                    }
                                    disabled={isExecutingMcp}
                                    className="px-3 py-1.5 rounded-md bg-[#0F766E] hover:bg-[#115E59] text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                  >
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                    Confirm & Execute Write
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDecisionOnPendingWrite(msg.id, pw.id, 'cancelled')
                                    }
                                    disabled={isExecutingMcp}
                                    className="px-3 py-1.5 rounded-md border border-[#CBD5E1] bg-white hover:bg-[#F1F5F9] text-[#0F172A] font-medium text-xs cursor-pointer"
                                  >
                                    Cancel Write
                                  </button>
                                </div>
                              ) : (
                                <div className="bg-[#0F172A] text-[#F8FAFC] rounded-md p-2 font-mono text-xs whitespace-pre-wrap">
                                  → {formatResultText(pw.executionResult)}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isAgentThinking && (
                  <div className="text-xs font-mono text-[#0F766E] flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 animate-spin" />
                    Gemini Flash ({selectedModel}) is inspecting the 6 MCP servers...
                  </div>
                )}
              </div>

              {/* Input Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendAgentPrompt();
                }}
                className="p-4 border-t border-[#E2E8F0] flex items-center gap-2"
              >
                <input
                  type="text"
                  value={agentPrompt}
                  onChange={(e) => setAgentPrompt(e.target.value)}
                  placeholder="Ask about beds, patients, appointments, pharmacy stock, lab results, or bills..."
                  className="flex-1 px-3.5 py-2.5 rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] text-sm text-[#0F172A] focus:outline-none focus:border-[#0F766E] focus:bg-white"
                />
                <button
                  type="submit"
                  disabled={isAgentThinking || !agentPrompt.trim()}
                  className="px-4 py-2.5 rounded-lg bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  Send to Gemini
                </button>
              </form>
            </div>

            {/* Right 5 Columns: Live Hospital Snapshot + MCP Protocol Trace */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-[#0F172A]">
                    6 MCP Servers Architecture Overview
                  </h3>
                  <span className="text-xs font-mono text-[#0F766E]">
                    mcp_servers/common/db.py
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {MCP_SERVERS_CATALOG.map((srv) => {
                    const readCount = srv.tools.filter((t) => t.mode === 'READ').length;
                    const writeCount = srv.tools.filter((t) => t.mode === 'WRITE').length;
                    return (
                      <button
                        key={srv.id}
                        type="button"
                        onClick={() => {
                          setSelectedMcpServer(srv.id);
                          setSelectedMcpTool(srv.tools[0].name);
                          setActiveSection('mcp');
                        }}
                        className="p-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] hover:border-[#0F766E] text-left transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[#0F172A] uppercase font-mono">
                            {srv.id}
                          </span>
                          <span className="text-[11px] font-mono text-[#0F766E]">
                            {readCount}R / {writeCount}W
                          </span>
                        </div>
                        <p className="text-[11px] text-[#475569] mt-1 line-clamp-1">
                          {srv.tools.map((t) => t.name).join(', ')}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Recent MCP Stdio / Tool Call Logs */}
              <div className="bg-[#0F172A] text-[#F8FAFC] rounded-xl p-5 shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-[#5EEAD4]" />
                    <span className="text-xs font-mono uppercase tracking-wider text-[#5EEAD4] font-semibold">
                      Live Multi-Server MCP Trace
                    </span>
                  </div>
                  <span className="text-xs font-mono text-[#94A3B8]">
                    {mcpLogs.length} calls logged
                  </span>
                </div>
                <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1 font-mono text-xs">
                  {mcpLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 rounded-lg bg-[#1E293B] border border-[#334155]"
                    >
                      <div className="flex items-center justify-between text-[11px] text-[#94A3B8]">
                        <span>
                          [{log.server}] {log.tool}({log.args})
                        </span>
                        <span
                          className={
                            log.mode === 'WRITE' ? 'text-[#FBBF24]' : 'text-[#5EEAD4]'
                          }
                        >
                          [{log.mode}] · {log.timestamp}
                        </span>
                      </div>
                      <div
                        className={`mt-1.5 text-xs leading-relaxed whitespace-pre-wrap ${
                          log.isError ? 'text-[#FCA5A5]' : 'text-[#E2E8F0]'
                        }`}
                      >
                        → {formatResultText(log.result)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 1: WARD & BED MATRIX */}
        {activeSection === 'beds' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#E2E8F0]">
                <div>
                  <h2 className="text-base font-bold text-[#0F172A]">
                    Real-Time Ward & Bed Occupancy Matrix
                  </h2>
                  <p className="text-xs text-[#475569] mt-0.5">
                    Tracks <code className="font-mono text-[#0F766E]">admitted_at</code> and{' '}
                    <code className="font-mono text-[#0F766E]">discharged_at</code> timestamps
                  </p>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {['ALL', 'ICU', 'General', 'Pediatrics', 'Emergency'].map((ward) => (
                    <button
                      key={ward}
                      type="button"
                      onClick={() => setSelectedWardFilter(ward)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        selectedWardFilter === ward
                          ? 'bg-[#0F766E] text-white font-semibold'
                          : 'bg-[#F1F5F9] text-[#475569] hover:text-[#0F172A]'
                      }`}
                    >
                      {ward}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {filteredBeds.map((bed) => {
                  const patientName = getPatientName(bed.patient_id);
                  const wardName = getWardName(bed.ward_id);
                  return (
                    <div
                      key={bed.id}
                      className={`rounded-xl border p-4 transition-all ${
                        bed.is_occupied
                          ? 'bg-[#FFFBEB]/60 border-[#F59E0B]/40'
                          : 'bg-[#F0FDF4]/60 border-[#15803D]/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-sm text-[#0F172A]">
                          {bed.bed_number}
                        </span>
                        <span
                          className={`text-xs font-mono font-semibold ${
                            bed.is_occupied ? 'text-[#B45309]' : 'text-[#15803D]'
                          }`}
                        >
                          {bed.is_occupied ? 'OCCUPIED' : 'FREE'}
                        </span>
                      </div>

                      <div className="mt-1 text-xs text-[#475569] font-medium">
                        Ward: <span className="text-[#0F172A]">{wardName}</span>
                      </div>

                      <div className="mt-3 pt-3 border-t border-[#E2E8F0] space-y-1.5 text-xs">
                        {bed.is_occupied ? (
                          <>
                            <div className="font-semibold text-[#0F172A] truncate">
                              {patientName} (ID #{bed.patient_id})
                            </div>
                            <div className="text-[#475569] font-mono text-[11px] flex items-center gap-1">
                              <Clock className="w-3 h-3 text-[#B45309] shrink-0" />
                              <span>
                                In:{' '}
                                {bed.admitted_at
                                  ? bed.admitted_at.replace('T', ' ').slice(0, 16)
                                  : '—'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                if (bed.patient_id) {
                                  executeMcpToolOnServer('discharge_patient', {
                                    patient_id: bed.patient_id,
                                  });
                                }
                              }}
                              className="mt-2 w-full py-1.5 px-2.5 rounded-lg border border-[#E2E8F0] bg-white hover:bg-[#FEF2F2] hover:border-[#FECACA] text-[#B91C1C] font-medium text-xs transition-colors cursor-pointer"
                            >
                              Discharge via MCP
                            </button>
                          </>
                        ) : (
                          <>
                            <div className="text-[#15803D] font-medium">
                              Ready for admission
                            </div>
                            <div className="text-[#64748B] font-mono text-[11px]">
                              Last out:{' '}
                              {bed.discharged_at
                                ? bed.discharged_at.replace('T', ' ').slice(0, 16)
                                : 'Never'}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-4 bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs space-y-4">
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-[#0F766E] font-semibold">
                  mcp_servers/beds/server.py
                </span>
                <h3 className="text-base font-bold text-[#0F172A] mt-0.5">
                  Quick Admit / Discharge Tester
                </h3>
              </div>

              <div className="space-y-3 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Select Patient
                  </label>
                  <select
                    value={mcpArgsState.patient_id}
                    onChange={(e) =>
                      setMcpArgsState((prev) => ({
                        ...prev,
                        patient_id: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[#CBD5E1] bg-white text-sm text-[#0F172A]"
                  >
                    {db.patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        #{p.id} — {p.full_name} (
                        {p.is_admitted ? 'Admitted' : 'Outpatient'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Target Ward
                  </label>
                  <select
                    value={mcpArgsState.ward}
                    onChange={(e) =>
                      setMcpArgsState((prev) => ({ ...prev, ward: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[#CBD5E1] bg-white text-sm text-[#0F172A]"
                  >
                    {db.wards.map((w) => (
                      <option key={w.id} value={w.name}>
                        {w.name} (Floor {w.floor})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      executeMcpToolOnServer('admit_patient', {
                        patient_id: mcpArgsState.patient_id,
                        ward: mcpArgsState.ward,
                      })
                    }
                    className="py-2 px-3 rounded-lg bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold cursor-pointer"
                  >
                    admit_patient()
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      executeMcpToolOnServer('discharge_patient', {
                        patient_id: mcpArgsState.patient_id,
                      })
                    }
                    className="py-2 px-3 rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#0F172A] text-xs font-semibold cursor-pointer"
                  >
                    discharge_patient()
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 2: 6 MCP SERVERS INTERACTIVE SANDBOX (19 TOOLS) */}
        {activeSection === 'mcp' && (
          <div className="space-y-6">
            {/* Server Selector Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {MCP_SERVERS_CATALOG.map((srv) => {
                const isSelected = srv.id === selectedMcpServer;
                return (
                  <button
                    key={srv.id}
                    type="button"
                    onClick={() => {
                      setSelectedMcpServer(srv.id);
                      setSelectedMcpTool(srv.tools[0].name);
                      setStagedDirectWrite(null);
                    }}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#0F766E] text-white border-[#0F766E] shadow-xs'
                        : 'bg-white text-[#0F172A] border-[#E2E8F0] hover:border-[#0F766E]'
                    }`}
                  >
                    <div className="text-xs font-mono uppercase font-bold">
                      mcp_servers/{srv.id}
                    </div>
                    <div
                      className={`text-xs mt-1 font-medium ${
                        isSelected ? 'text-[#CCFBF1]' : 'text-[#475569]'
                      }`}
                    >
                      {srv.tools.length} Tools
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left 6 Columns: Tool Selector, Docstring Inspector & Parameter Runner */}
              <div className="lg:col-span-6 bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-xs space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-[#E2E8F0]">
                  <div>
                    <span className="text-xs font-mono text-[#0F766E] font-semibold">
                      {activeServerObj.filePath}
                    </span>
                    <h2 className="text-lg font-bold text-[#0F172A]">
                      {activeServerObj.title}
                    </h2>
                    <p className="text-xs text-[#475569] mt-0.5">
                      {activeServerObj.summary}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleRunServerTestSuite}
                    disabled={isExecutingMcp}
                    className="px-3 py-1.5 rounded-lg bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0F172A] text-xs font-mono font-semibold flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Play className="w-3.5 h-3.5 text-[#0F766E]" />
                    Run test_{activeServerObj.id}_mcp.py
                  </button>
                </div>

                {/* Tool Tabs inside Selected Server */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#475569]">
                    Select @mcp.tool() Function
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {activeServerObj.tools.map((toolSpec) => {
                      const isActive = toolSpec.name === activeToolObj.name;
                      return (
                        <button
                          key={toolSpec.name}
                          type="button"
                          onClick={() => {
                            setSelectedMcpTool(toolSpec.name);
                            setStagedDirectWrite(null);
                          }}
                          className={`px-3 py-2 rounded-lg border text-xs font-mono flex items-center gap-2 cursor-pointer transition-colors ${
                            isActive
                              ? 'border-[#0F766E] bg-[#F0FDFA] text-[#0F766E] font-bold'
                              : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#475569] hover:text-[#0F172A]'
                          }`}
                        >
                          <span>{toolSpec.name}()</span>
                          <span
                            className={`text-[10px] font-bold uppercase ${
                              toolSpec.mode === 'WRITE'
                                ? 'text-[#B45309]'
                                : 'text-[#15803D]'
                            }`}
                          >
                            [{toolSpec.mode}]
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Python Signature & Docstring */}
                <div className="p-4 rounded-xl bg-[#0F172A] text-[#F8FAFC] font-mono text-xs space-y-1.5 overflow-x-auto">
                  <div className="text-[#5EEAD4] font-semibold">@mcp.tool()</div>
                  <div className="text-[#F8FAFC] font-bold">{activeToolObj.signature}</div>
                  <pre className="text-[#FDE047] whitespace-pre-wrap text-[11px] leading-relaxed">
                    {activeToolObj.docstring}
                  </pre>
                </div>

                {/* Dynamic Arguments Form */}
                <form onSubmit={handleRunMcpToolFromForm} className="space-y-4">
                  {/* Ward input */}
                  {(activeToolObj.name === 'get_free_beds' ||
                    activeToolObj.name === 'admit_patient') && (
                    <div>
                      <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                        ward (str)
                      </label>
                      <select
                        value={mcpArgsState.ward}
                        onChange={(e) =>
                          setMcpArgsState((p) => ({ ...p, ward: e.target.value }))
                        }
                        className="w-full px-3 py-2 rounded-lg border border-[#CBD5E1] bg-white text-sm"
                      >
                        {db.wards.map((w) => (
                          <option key={w.id} value={w.name}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Patient ID input */}
                  {[
                    'admit_patient',
                    'discharge_patient',
                    'get_patient',
                    'get_patient_history',
                    'list_appointments',
                    'book_appointment',
                    'get_results',
                    'order_test',
                    'get_bill',
                  ].includes(activeToolObj.name) && (
                    <div>
                      <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                        patient_id (int)
                      </label>
                      <select
                        value={mcpArgsState.patient_id}
                        onChange={(e) =>
                          setMcpArgsState((p) => ({
                            ...p,
                            patient_id: Number(e.target.value),
                          }))
                        }
                        className="w-full px-3 py-2 rounded-lg border border-[#CBD5E1] bg-white text-sm"
                      >
                        {db.patients.map((pat) => (
                          <option key={pat.id} value={pat.id}>
                            #{pat.id} — {pat.full_name} ({pat.diagnosis})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Patient search name */}
                  {activeToolObj.name === 'search_patients' && (
                    <div>
                      <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                        name (str)
                      </label>
                      <input
                        type="text"
                        value={mcpArgsState.name}
                        onChange={(e) =>
                          setMcpArgsState((p) => ({ ...p, name: e.target.value }))
                        }
                        className="w-full px-3 py-2 rounded-lg border border-[#CBD5E1] bg-white text-sm"
                        placeholder="e.g., Sharma, Meera, Rohan"
                      />
                    </div>
                  )}

                  {/* Doctor ID */}
                  {(activeToolObj.name === 'list_doctor_availability' ||
                    activeToolObj.name === 'book_appointment') && (
                    <div>
                      <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                        doctor_id (int)
                      </label>
                      <select
                        value={mcpArgsState.doctor_id}
                        onChange={(e) =>
                          setMcpArgsState((p) => ({
                            ...p,
                            doctor_id: Number(e.target.value),
                          }))
                        }
                        className="w-full px-3 py-2 rounded-lg border border-[#CBD5E1] bg-white text-sm"
                      >
                        {db.doctors.map((docItem) => (
                          <option key={docItem.id} value={docItem.id}>
                            #{docItem.id} — {docItem.full_name} ({docItem.specialization})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Date (YYYY-MM-DD) */}
                  {activeToolObj.name === 'list_doctor_availability' && (
                    <div>
                      <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                        date (YYYY-MM-DD)
                      </label>
                      <input
                        type="text"
                        value={mcpArgsState.date}
                        onChange={(e) =>
                          setMcpArgsState((p) => ({ ...p, date: e.target.value }))
                        }
                        className="w-full px-3 py-2 rounded-lg border border-[#CBD5E1] bg-white text-sm font-mono"
                      />
                    </div>
                  )}

                  {/* Datetime (ISO) */}
                  {activeToolObj.name === 'book_appointment' && (
                    <div>
                      <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                        datetime (ISO format YYYY-MM-DDTHH:MM)
                      </label>
                      <input
                        type="text"
                        value={mcpArgsState.datetime}
                        onChange={(e) =>
                          setMcpArgsState((p) => ({ ...p, datetime: e.target.value }))
                        }
                        className="w-full px-3 py-2 rounded-lg border border-[#CBD5E1] bg-white text-sm font-mono"
                      />
                    </div>
                  )}

                  {/* Appointment ID */}
                  {activeToolObj.name === 'cancel_appointment' && (
                    <div>
                      <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                        appointment_id (int)
                      </label>
                      <select
                        value={mcpArgsState.appointment_id}
                        onChange={(e) =>
                          setMcpArgsState((p) => ({
                            ...p,
                            appointment_id: Number(e.target.value),
                          }))
                        }
                        className="w-full px-3 py-2 rounded-lg border border-[#CBD5E1] bg-white text-sm"
                      >
                        {db.appointments.map((a) => (
                          <option key={a.id} value={a.id}>
                            #{a.id} — Patient #{a.patient_id} with Doctor #{a.doctor_id} (
                            {a.status})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Medicine Name */}
                  {(activeToolObj.name === 'check_stock' ||
                    activeToolObj.name === 'restock_medicine') && (
                    <div>
                      <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                        medicine_name (str)
                      </label>
                      <select
                        value={mcpArgsState.medicine_name}
                        onChange={(e) =>
                          setMcpArgsState((p) => ({
                            ...p,
                            medicine_name: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 rounded-lg border border-[#CBD5E1] bg-white text-sm"
                      >
                        {db.medicines.map((m) => (
                          <option key={m.id} value={m.name}>
                            {m.name} (Stock: {m.stock_quantity})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Threshold */}
                  {activeToolObj.name === 'list_low_stock' && (
                    <div>
                      <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                        threshold (int)
                      </label>
                      <input
                        type="number"
                        value={mcpArgsState.threshold}
                        onChange={(e) =>
                          setMcpArgsState((p) => ({
                            ...p,
                            threshold: Number(e.target.value),
                          }))
                        }
                        className="w-full px-3 py-2 rounded-lg border border-[#CBD5E1] bg-white text-sm font-mono"
                      />
                    </div>
                  )}

                  {/* Quantity */}
                  {activeToolObj.name === 'restock_medicine' && (
                    <div>
                      <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                        quantity (int &gt; 0)
                      </label>
                      <input
                        type="number"
                        value={mcpArgsState.quantity}
                        onChange={(e) =>
                          setMcpArgsState((p) => ({
                            ...p,
                            quantity: Number(e.target.value),
                          }))
                        }
                        className="w-full px-3 py-2 rounded-lg border border-[#CBD5E1] bg-white text-sm font-mono"
                      />
                    </div>
                  )}

                  {/* Lab Test Name */}
                  {activeToolObj.name === 'order_test' && (
                    <div>
                      <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                        test_name (str)
                      </label>
                      <input
                        type="text"
                        value={mcpArgsState.test_name}
                        onChange={(e) =>
                          setMcpArgsState((p) => ({ ...p, test_name: e.target.value }))
                        }
                        className="w-full px-3 py-2 rounded-lg border border-[#CBD5E1] bg-white text-sm"
                      />
                    </div>
                  )}

                  {/* Bill ID */}
                  {activeToolObj.name === 'mark_bill_paid' && (
                    <div>
                      <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                        bill_id (int)
                      </label>
                      <select
                        value={mcpArgsState.bill_id}
                        onChange={(e) =>
                          setMcpArgsState((p) => ({
                            ...p,
                            bill_id: Number(e.target.value),
                          }))
                        }
                        className="w-full px-3 py-2 rounded-lg border border-[#CBD5E1] bg-white text-sm"
                      >
                        {db.bills.map((b) => (
                          <option key={b.id} value={b.id}>
                            Bill #{b.id} — Patient #{b.patient_id} (${b.total_amount} ·{' '}
                            {b.paid_status})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isExecutingMcp}
                    className="w-full py-2.5 px-4 rounded-lg bg-[#0F766E] hover:bg-[#115E59] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Play className="w-4 h-4" />
                    Call {activeToolObj.name}() [{activeToolObj.mode}]
                  </button>
                </form>

                {/* Inline Write Confirmation Modal for Direct Tool Runner */}
                {stagedDirectWrite && (
                  <div className="p-4 rounded-xl border border-[#F59E0B] bg-[#FFFBEB] space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#B45309]">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span>
                        [OPERATION: WRITE - REQUIRES CONFIRMATION]
                      </span>
                    </div>
                    <p className="text-xs text-[#0F172A] font-mono">
                      Are you sure you want to execute {stagedDirectWrite.summary}?
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const toRun = stagedDirectWrite;
                          setStagedDirectWrite(null);
                          await executeMcpToolOnServer(toRun.tool, toRun.args);
                        }}
                        className="px-3 py-1.5 rounded-md bg-[#0F766E] hover:bg-[#115E59] text-white text-xs font-semibold cursor-pointer"
                      >
                        Confirm & Execute Write
                      </button>
                      <button
                        type="button"
                        onClick={() => setStagedDirectWrite(null)}
                        className="px-3 py-1.5 rounded-md border border-[#CBD5E1] bg-white text-xs font-medium text-[#0F172A] cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Right 6 Columns: Live Terminal Output Log */}
              <div className="lg:col-span-6 bg-[#0F172A] text-[#F8FAFC] rounded-xl p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-[#334155] pb-3">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-[#5EEAD4]" />
                    <h3 className="text-sm font-bold font-mono text-[#F8FAFC]">
                      MCP Stdio Response Stream
                    </h3>
                  </div>
                  <span className="text-xs font-mono text-[#94A3B8]">
                    {activeServerObj.testScriptPath}
                  </span>
                </div>

                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 font-mono text-xs">
                  {mcpLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3.5 rounded-lg bg-[#1E293B] border border-[#334155]"
                    >
                      <div className="flex items-center justify-between text-[#94A3B8] text-[11px]">
                        <span className="text-[#5EEAD4] font-semibold">
                          [{log.server}] {log.tool}({log.args})
                        </span>
                        <div className="flex items-center gap-2">
                          <span
                            className={
                              log.mode === 'WRITE' ? 'text-[#FBBF24]' : 'text-[#38BDF8]'
                            }
                          >
                            [{log.mode}]
                          </span>
                          <span>{log.timestamp}</span>
                        </div>
                      </div>
                      <div
                        className={`mt-2 whitespace-pre-wrap leading-relaxed ${
                          log.isError ? 'text-[#FCA5A5]' : 'text-[#F8FAFC]'
                        }`}
                      >
                        {formatResultText(log.result)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 3: 8-TABLE DATABASE & FASTAPI EXPLORER */}
        {activeSection === 'api' && (
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-xs space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] pb-4">
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-[#0F766E] font-semibold">
                  Shared across FastAPI + mcp_servers/common/db.py
                </span>
                <h2 className="text-lg font-bold text-[#0F172A] mt-0.5">
                  8-Table Hospital Database Explorer
                </h2>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {(
                  [
                    'beds',
                    'wards',
                    'patients',
                    'doctors',
                    'appointments',
                    'medicines',
                    'lab_tests',
                    'bills',
                  ] as TableName[]
                ).map((tbl) => (
                  <button
                    key={tbl}
                    type="button"
                    onClick={() => setSelectedTable(tbl)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      selectedTable === tbl
                        ? 'bg-[#0F766E] text-white font-semibold'
                        : 'bg-[#F1F5F9] text-[#475569] hover:text-[#0F172A]'
                    }`}
                  >
                    /{tbl} ({db[tbl].length})
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              {selectedTable === 'beds' && (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] text-[#475569] font-mono uppercase">
                      <th className="py-2.5 px-3">id (PK)</th>
                      <th className="py-2.5 px-3">bed_number</th>
                      <th className="py-2.5 px-3">ward_id (FK)</th>
                      <th className="py-2.5 px-3">is_occupied</th>
                      <th className="py-2.5 px-3">patient_id (FK)</th>
                      <th className="py-2.5 px-3">admitted_at</th>
                      <th className="py-2.5 px-3">discharged_at</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] font-mono tabular-nums">
                    {db.beds.map((b) => (
                      <tr key={b.id} className="hover:bg-[#F8FAFC]">
                        <td className="py-2.5 px-3 font-bold">{b.id}</td>
                        <td className="py-2.5 px-3 text-[#0F172A] font-semibold">
                          {b.bed_number}
                        </td>
                        <td className="py-2.5 px-3">
                          {b.ward_id} ({getWardName(b.ward_id)})
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={
                              b.is_occupied
                                ? 'text-[#B45309] font-semibold'
                                : 'text-[#15803D] font-semibold'
                            }
                          >
                            {String(b.is_occupied)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          {b.patient_id
                            ? `${b.patient_id} (${getPatientName(b.patient_id)})`
                            : 'NULL'}
                        </td>
                        <td className="py-2.5 px-3 text-[#475569]">
                          {b.admitted_at ?? 'NULL'}
                        </td>
                        <td className="py-2.5 px-3 text-[#475569]">
                          {b.discharged_at ?? 'NULL'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {selectedTable === 'wards' && (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] text-[#475569] font-mono uppercase">
                      <th className="py-2.5 px-3">id (PK)</th>
                      <th className="py-2.5 px-3">name</th>
                      <th className="py-2.5 px-3">floor</th>
                      <th className="py-2.5 px-3">capacity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] font-mono tabular-nums">
                    {db.wards.map((w) => (
                      <tr key={w.id} className="hover:bg-[#F8FAFC]">
                        <td className="py-2.5 px-3 font-bold">{w.id}</td>
                        <td className="py-2.5 px-3 font-sans font-semibold">{w.name}</td>
                        <td className="py-2.5 px-3">Floor {w.floor}</td>
                        <td className="py-2.5 px-3">{w.capacity} beds</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {selectedTable === 'patients' && (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] text-[#475569] font-mono uppercase">
                      <th className="py-2.5 px-3">id (PK)</th>
                      <th className="py-2.5 px-3">full_name</th>
                      <th className="py-2.5 px-3">age / gender</th>
                      <th className="py-2.5 px-3">blood_group</th>
                      <th className="py-2.5 px-3">diagnosis</th>
                      <th className="py-2.5 px-3">is_admitted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {db.patients.map((p) => (
                      <tr key={p.id} className="hover:bg-[#F8FAFC]">
                        <td className="py-2.5 px-3 font-mono font-bold">{p.id}</td>
                        <td className="py-2.5 px-3 font-semibold">{p.full_name}</td>
                        <td className="py-2.5 px-3 font-mono">
                          {p.age}y · {p.gender}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-semibold text-[#0F766E]">
                          {p.blood_group}
                        </td>
                        <td className="py-2.5 px-3 text-[#475569]">{p.diagnosis}</td>
                        <td className="py-2.5 px-3 font-mono">
                          <span
                            className={
                              p.is_admitted
                                ? 'text-[#B45309] font-semibold'
                                : 'text-[#475569]'
                            }
                          >
                            {String(p.is_admitted)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {selectedTable === 'doctors' && (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] text-[#475569] font-mono uppercase">
                      <th className="py-2.5 px-3">id (PK)</th>
                      <th className="py-2.5 px-3">full_name</th>
                      <th className="py-2.5 px-3">specialization</th>
                      <th className="py-2.5 px-3">ward_id (FK)</th>
                      <th className="py-2.5 px-3">is_available</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {db.doctors.map((d) => (
                      <tr key={d.id} className="hover:bg-[#F8FAFC]">
                        <td className="py-2.5 px-3 font-mono font-bold">{d.id}</td>
                        <td className="py-2.5 px-3 font-semibold">{d.full_name}</td>
                        <td className="py-2.5 px-3 text-[#475569]">{d.specialization}</td>
                        <td className="py-2.5 px-3 font-mono">
                          {d.ward_id} ({getWardName(d.ward_id)})
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          <span
                            className={
                              d.is_available
                                ? 'text-[#15803D] font-semibold'
                                : 'text-[#B91C1C]'
                            }
                          >
                            {String(d.is_available)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {selectedTable === 'appointments' && (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] text-[#475569] font-mono uppercase">
                      <th className="py-2.5 px-3">id (PK)</th>
                      <th className="py-2.5 px-3">patient_id (FK)</th>
                      <th className="py-2.5 px-3">doctor_id (FK)</th>
                      <th className="py-2.5 px-3">appointment_time</th>
                      <th className="py-2.5 px-3">status</th>
                      <th className="py-2.5 px-3">notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {db.appointments.map((a) => (
                      <tr key={a.id} className="hover:bg-[#F8FAFC]">
                        <td className="py-2.5 px-3 font-mono font-bold">{a.id}</td>
                        <td className="py-2.5 px-3">
                          #{a.patient_id} ({getPatientName(a.patient_id)})
                        </td>
                        <td className="py-2.5 px-3">
                          #{a.doctor_id} ({getDoctorName(a.doctor_id)})
                        </td>
                        <td className="py-2.5 px-3 font-mono">{a.appointment_time}</td>
                        <td className="py-2.5 px-3 font-mono font-semibold">{a.status}</td>
                        <td className="py-2.5 px-3 text-[#475569]">{a.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {selectedTable === 'medicines' && (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] text-[#475569] font-mono uppercase">
                      <th className="py-2.5 px-3">id (PK)</th>
                      <th className="py-2.5 px-3">name</th>
                      <th className="py-2.5 px-3">category</th>
                      <th className="py-2.5 px-3">stock_quantity</th>
                      <th className="py-2.5 px-3">unit_price</th>
                      <th className="py-2.5 px-3">expiry_date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {db.medicines.map((m) => (
                      <tr key={m.id} className="hover:bg-[#F8FAFC]">
                        <td className="py-2.5 px-3 font-mono font-bold">{m.id}</td>
                        <td className="py-2.5 px-3 font-semibold">{m.name}</td>
                        <td className="py-2.5 px-3 text-[#475569]">{m.category}</td>
                        <td className="py-2.5 px-3 font-mono font-semibold">
                          <span
                            className={
                              m.stock_quantity < 50 ? 'text-[#B91C1C]' : 'text-[#15803D]'
                            }
                          >
                            {m.stock_quantity} units
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          ${m.unit_price.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 font-mono">{m.expiry_date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {selectedTable === 'lab_tests' && (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] text-[#475569] font-mono uppercase">
                      <th className="py-2.5 px-3">id (PK)</th>
                      <th className="py-2.5 px-3">patient_id (FK)</th>
                      <th className="py-2.5 px-3">test_name</th>
                      <th className="py-2.5 px-3">status</th>
                      <th className="py-2.5 px-3">result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {db.lab_tests.map((l) => (
                      <tr key={l.id} className="hover:bg-[#F8FAFC]">
                        <td className="py-2.5 px-3 font-mono font-bold">{l.id}</td>
                        <td className="py-2.5 px-3">
                          #{l.patient_id} ({getPatientName(l.patient_id)})
                        </td>
                        <td className="py-2.5 px-3 font-semibold">{l.test_name}</td>
                        <td className="py-2.5 px-3 font-mono">
                          <span
                            className={
                              l.status === 'Completed'
                                ? 'text-[#15803D] font-semibold'
                                : 'text-[#B45309] font-semibold'
                            }
                          >
                            {l.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-[#475569]">
                          {l.result ?? 'Pending lab analysis'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {selectedTable === 'bills' && (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] text-[#475569] font-mono uppercase">
                      <th className="py-2.5 px-3">id (PK)</th>
                      <th className="py-2.5 px-3">patient_id (FK)</th>
                      <th className="py-2.5 px-3">total_amount</th>
                      <th className="py-2.5 px-3">paid_status</th>
                      <th className="py-2.5 px-3">description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {db.bills.map((b) => (
                      <tr key={b.id} className="hover:bg-[#F8FAFC]">
                        <td className="py-2.5 px-3 font-mono font-bold">{b.id}</td>
                        <td className="py-2.5 px-3">
                          #{b.patient_id} ({getPatientName(b.patient_id)})
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold">
                          ${b.total_amount.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          <span
                            className={
                              b.paid_status === 'Paid'
                                ? 'text-[#15803D] font-semibold'
                                : b.paid_status === 'Partial'
                                ? 'text-[#B45309] font-semibold'
                                : 'text-[#B91C1C] font-semibold'
                            }
                          >
                            {b.paid_status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-[#475569]">{b.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* SECTION 4: BEGINNER FILE-BY-FILE CODE GUIDE & TERMINAL COMMANDS */}
        {activeSection === 'code' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-xs">
                <h2 className="text-sm font-bold text-[#0F172A] px-2 pb-2 border-b border-[#E2E8F0]">
                  Phase 2 Python Files (Explained Simply)
                </h2>
                <div className="mt-2 space-y-1">
                  {PROJECT_FILES_GUIDE.map((file, idx) => (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() => setSelectedFileIndex(idx)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-mono flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        selectedFileIndex === idx
                          ? 'bg-[#0F766E] text-white font-semibold'
                          : 'text-[#0F172A] hover:bg-[#F1F5F9]'
                      }`}
                    >
                      <span className="truncate">{file.path}</span>
                      <ArrowRight className="w-3.5 h-3.5 shrink-0 opacity-75" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Exact Terminal Commands Box */}
              <div className="bg-[#0F172A] text-[#F8FAFC] rounded-xl p-5 shadow-xs space-y-3">
                <span className="text-xs font-mono uppercase tracking-wider text-[#5EEAD4] font-semibold">
                  Exact Terminal Commands (Phase 2)
                </span>
                {[
                  {
                    id: 'cmd-seed',
                    label: '1. Seed SQLite Database (if not seeded yet)',
                    cmd: 'cd hospitalos && python -m data.seed_data',
                  },
                  {
                    id: 'cmd-beds',
                    label: '2. Test Beds MCP Server',
                    cmd: 'python mcp_servers/beds/test_beds_mcp.py',
                  },
                  {
                    id: 'cmd-patients',
                    label: '3. Test Patients MCP Server',
                    cmd: 'python mcp_servers/patients/test_patients_mcp.py',
                  },
                  {
                    id: 'cmd-appts',
                    label: '4. Test Appointments MCP Server',
                    cmd: 'python mcp_servers/appointments/test_appointments_mcp.py',
                  },
                  {
                    id: 'cmd-pharm',
                    label: '5. Test Pharmacy MCP Server',
                    cmd: 'python mcp_servers/pharmacy/test_pharmacy_mcp.py',
                  },
                  {
                    id: 'cmd-lab',
                    label: '6. Test Lab MCP Server',
                    cmd: 'python mcp_servers/lab/test_lab_mcp.py',
                  },
                  {
                    id: 'cmd-billing',
                    label: '7. Test Billing MCP Server',
                    cmd: 'python mcp_servers/billing/test_billing_mcp.py',
                  },
                ].map((item) => (
                  <div key={item.id} className="space-y-1">
                    <div className="text-[11px] text-[#94A3B8]">{item.label}</div>
                    <div className="flex items-center justify-between gap-2 bg-[#1E293B] border border-[#334155] rounded-lg px-3 py-2 font-mono text-xs">
                      <code className="text-[#E2E8F0] truncate">{item.cmd}</code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(item.cmd, item.id)}
                        className="text-[#94A3B8] hover:text-white shrink-0 cursor-pointer"
                        title="Copy command"
                      >
                        {copiedCommand === item.id ? (
                          <Check className="w-3.5 h-3.5 text-[#5EEAD4]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right 8 Columns: Simple Explanation + Code View */}
            <div className="lg:col-span-8 bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-xs space-y-5">
              {(() => {
                const activeFile = PROJECT_FILES_GUIDE[selectedFileIndex];
                return (
                  <>
                    <div className="border-b border-[#E2E8F0] pb-4">
                      <span className="text-xs font-mono text-[#0F766E] font-semibold">
                        {activeFile.path}
                      </span>
                      <h3 className="text-lg font-bold text-[#0F172A] mt-0.5">
                        {activeFile.title}
                      </h3>
                      <p className="mt-2 text-sm text-[#334155] leading-relaxed">
                        {activeFile.simpleExplanation}
                      </p>
                      <ul className="mt-3 space-y-1">
                        {activeFile.keyTakeaways.map((pt) => (
                          <li
                            key={pt}
                            className="text-xs text-[#475569] flex items-center gap-2"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#0F766E] shrink-0" />
                            <span>{pt}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="bg-[#0F172A] text-[#F8FAFC] rounded-xl p-4 font-mono text-xs overflow-x-auto">
                      <pre className="leading-relaxed">{activeFile.code}</pre>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
