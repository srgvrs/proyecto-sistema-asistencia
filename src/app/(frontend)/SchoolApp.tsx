"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import schoolLogo from "./school-logo.png";
import { createUserAction, loginAction, logoutAction, resetUserPasswordAction } from "./auth-actions";
import {
  assignTeacherToGroupAction,
  createAttendanceAction,
  createGroupAction,
  createStudentAction,
  createTeacherAttendanceAction,
  createTeacherJustificationAction,
  createVisitorAction,
  deleteStudentAction,
  deleteTeacherAction,
  deleteTeacherJustificationAction,
  deleteVisitorAction,
  loadSchoolStateAction,
  officializeAttendanceAction,
  updateStudentAction,
  updateTeacherAttendanceAction,
  updateTeacherEmploymentStatusAction,
  updateVisitorAction,
} from "./school-data-actions";
import type { AppUserSummary, Role } from "@/lib/app-user-types";
import { todayISO } from "@/lib/school-data-types";
import type { AttendanceRecord, GroupRef, OfficialAttendanceList, SchoolStateData, SchoolStateSection, Status, Student, TeacherAttendance, TeacherProfile, Visitor } from "@/lib/school-data-types";
import { compareStudentsAlphabetically, sortAndNumberGroupStudents, sortAndNumberStudents } from "@/lib/student-ordering";

type View = "inicio" | "visitantes" | "lista" | "listas-oficiales" | "alumnos" | "docentes" | "grupos" | "catalogo" | "personal" | "usuarios" | "reportes";
type NavigationItem = { view: View; icon: string; label: string; description: string; keywords: string };

const normalizeSearch = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const getStudentNameParts = (student: Student) => {
  if (student.paternalSurname && student.maternalSurname && student.givenNames) {
    return {
      paternalSurname: student.paternalSurname,
      maternalSurname: student.maternalSurname,
      givenNames: student.givenNames,
    };
  }

  const parts = student.name.trim().split(/\s+/);
  return {
    paternalSurname: parts.length >= 3 ? parts[parts.length - 2] : parts.at(-1) || "",
    maternalSurname: parts.length >= 3 ? parts.at(-1) || "" : "",
    givenNames: parts.length >= 3 ? parts.slice(0, -2).join(" ") : parts[0] || "",
  };
};

const compareStudentsByPaternalSurname = compareStudentsAlphabetically;

const compareStudentsByListNumber = (a: Student, b: Student) =>
  a.listNumber - b.listNumber || compareStudentsByPaternalSurname(a, b);

const isValidListNumber = (value: number) =>
  Number.isInteger(value) && value >= 1 && value <= 999;

const nextListNumber = (students: Student[], group: string) =>
  Math.max(0, ...students
    .filter((student) => student.group === group && isValidListNumber(student.listNumber))
    .map((student) => student.listNumber)) + 1;

const isListNumberAvailable = (students: Student[], group: string, listNumber: number, excludedId?: string) =>
  !students.some((student) =>
    student.group === group && student.listNumber === listNumber && student.id !== excludedId
  );

const formatStudentName = (paternalSurname: string, maternalSurname: string, givenNames: string) =>
  `${paternalSurname.trim()} ${maternalSurname.trim()} ${givenNames.trim()}`;

export type ReportTemplate = {
  id: string | number;
  title: string;
  filename?: string | null;
  mimeType?: string | null;
  url?: string | null;
  createdAt?: string;
};


const schoolGrades = ["1", "2", "3", "4", "5", "6"];
const groupLetters = ["A", "B", "C", "D", "E", "F"];

const getSchoolStateWithDefaults = (state?: Partial<SchoolStateData> | null): SchoolStateData => ({
  students: state?.students ?? [],
  groups: state?.groups ?? [],
  attendanceRecords: state?.attendanceRecords ?? [],
  officialAttendanceLists: state?.officialAttendanceLists ?? [],
  visitors: state?.visitors ?? [],
  teacherAttendance: state?.teacherAttendance ?? [],
  teacherGroups: state?.teacherGroups ?? {},
  teachers: state?.teachers ?? [],
});
const formatDate = (date: string) =>
  new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  const paths: Record<string, React.ReactNode> = {
    home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></>,
    scan: <><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" /><path d="M8 12h8" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.5a3 3 0 0 1 0 5.8M17 14c2.3.8 4 3 4 5.5" /></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
    badge: <><rect x="4" y="3" width="16" height="18" rx="2" /><circle cx="12" cy="9" r="2.5" /><path d="M8 16c.8-2.2 2.1-3.3 4-3.3s3.2 1.1 4 3.3M9 3v2h6V3" /></>,
    logout: <><path d="M10 5H4v14h6M14 8l4 4-4 4M18 12H8" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    alert: <><path d="M12 3 2.8 19h18.4L12 3Z" /><path d="M12 9v4M12 16.5v.1" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 20h16" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
    "eye-off": <><path d="m3 3 18 18M10.6 6.2A10.5 10.5 0 0 1 12 6c6 0 9.5 6 9.5 6a15 15 0 0 1-2.1 2.7M6.2 6.2C3.8 7.8 2.5 12 2.5 12s3.5 6 9.5 6a9.8 9.8 0 0 0 3.1-.5M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

type ConfirmationOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: "default" | "danger";
};

function ConfirmationDialog({
  options,
  onConfirm,
  onClose,
}: {
  options: ConfirmationOptions;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, pending]);

  const confirm = async () => {
    setPending(true);
    await onConfirm();
    onClose();
  };

  return (
    <div className="confirmation-backdrop" role="presentation" onMouseDown={() => !pending && onClose()}>
      <section className="confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-message" onMouseDown={(event) => event.stopPropagation()}>
        <div className={`confirmation-icon ${options.tone === "danger" ? "danger" : ""}`}><Icon name={options.tone === "danger" ? "alert" : "check"} /></div>
        <div className="confirmation-copy">
          <p className="eyebrow">CONFIRMAR ACCIÓN</p>
          <h2 id="confirmation-title">{options.title}</h2>
          <p id="confirmation-message">{options.message}</p>
        </div>
        <div className="confirmation-actions">
          <button ref={cancelRef} className="secondary-button" type="button" onClick={onClose} disabled={pending}>Cancelar</button>
          <button className={options.tone === "danger" ? "danger-confirm-button" : "primary-button"} type="button" onClick={confirm} disabled={pending}>{pending ? "Procesando…" : options.confirmLabel || "Aceptar"}</button>
        </div>
      </section>
    </div>
  );
}

function useConfirmation() {
  const [confirmation, setConfirmation] = useState<(ConfirmationOptions & { action: () => void | Promise<void> }) | null>(null);
  const requestConfirmation = useCallback((options: ConfirmationOptions, action: () => void | Promise<void>) => {
    setConfirmation({ ...options, action });
  }, []);
  const closeConfirmation = useCallback(() => setConfirmation(null), []);
  return {
    requestConfirmation,
    confirmationDialog: confirmation ? <ConfirmationDialog options={confirmation} onConfirm={confirmation.action} onClose={closeConfirmation} /> : null,
  };
}

function useSyncedSchoolSection<K extends SchoolStateSection>(
  _section: K,
  initialValue: SchoolStateData[K],
): [SchoolStateData[K], React.Dispatch<React.SetStateAction<SchoolStateData[K]>>, (value: SchoolStateData[K]) => void] {
  const [value, setValueRaw] = useState(initialValue);
  const valueRef = useRef(initialValue);
  const pendingSaves = useRef(0);

  const setValue = useCallback<React.Dispatch<React.SetStateAction<SchoolStateData[K]>>>((update) => {
    const nextValue = typeof update === "function"
      ? (update as (current: SchoolStateData[K]) => SchoolStateData[K])(valueRef.current)
      : update;
    valueRef.current = nextValue;
    setValueRaw(nextValue);
  }, []);

  const replaceValue = useCallback((nextValue: SchoolStateData[K]) => {
    if (pendingSaves.current > 0) return;
    valueRef.current = nextValue;
    setValueRaw(nextValue);
  }, []);

  return [value, setValue, replaceValue];
}

function App({
  initialTemplates = [],
  initialSession = null,
  initialUsers = [],
  initialSchoolState = null,
}: {
  initialTemplates?: ReportTemplate[];
  initialSession?: AppUserSummary | null;
  initialUsers?: AppUserSummary[];
  initialSchoolState?: SchoolStateData | null;
}) {
  const [session, setSession] = useState<AppUserSummary | null>(initialSession);
  const [users, setUsers] = useState<AppUserSummary[]>(initialUsers);
  const [view, setView] = useState<View>("inicio");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [navigationSearch, setNavigationSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const schoolState = getSchoolStateWithDefaults(initialSchoolState);
  const [records, setRecords, replaceRecords] = useSyncedSchoolSection("attendanceRecords", schoolState.attendanceRecords);
  const [officialLists, , replaceOfficialLists] = useSyncedSchoolSection("officialAttendanceLists", schoolState.officialAttendanceLists);
  const [students, setStudents, replaceStudents] = useSyncedSchoolSection("students", schoolState.students);
  const [groups, setGroups, replaceGroups] = useSyncedSchoolSection("groups", schoolState.groups);
  const [visitors, setVisitors, replaceVisitors] = useSyncedSchoolSection("visitors", schoolState.visitors);
  const [teacherAttendance, setTeacherAttendance, replaceTeacherAttendance] = useSyncedSchoolSection("teacherAttendance", schoolState.teacherAttendance);
  const [teacherGroups, setTeacherGroups, replaceTeacherGroups] = useSyncedSchoolSection("teacherGroups", schoolState.teacherGroups);
  const [teachers, setTeachers, replaceTeachers] = useSyncedSchoolSection("teachers", schoolState.teachers);
  const teacherIds = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const user of users) {
      if (user.role === "Docente") map[user.name] = user.id;
    }
    return map;
  }, [users]);

  const groupTeacherMap = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const group of groups) {
      const teacherName = Object.entries(teacherGroups).find(([, list]) => list.includes(group.name))?.[0];
      if (teacherName) map[group.id] = teacherName;
    }
    return map;
  }, [groups, teacherGroups]);

  const refreshSchoolState = useCallback(async () => {
    const result = await loadSchoolStateAction();
    if (!result.ok) return;
    const nextState = getSchoolStateWithDefaults(result.data);
    replaceRecords(nextState.attendanceRecords);
    replaceOfficialLists(nextState.officialAttendanceLists);
    replaceStudents(nextState.students);
    replaceGroups(nextState.groups);
    replaceVisitors(nextState.visitors);
    replaceTeacherAttendance(nextState.teacherAttendance);
    replaceTeacherGroups(nextState.teacherGroups);
    replaceTeachers(nextState.teachers);
  }, [replaceGroups, replaceOfficialLists, replaceRecords, replaceStudents, replaceTeacherAttendance, replaceTeacherGroups, replaceTeachers, replaceVisitors]);

  const handleAssignTeacher = useCallback(async (groupId: string, teacherId: string | null) => {
    try {
      const result = await assignTeacherToGroupAction(groupId, teacherId);
      if (result.ok) await refreshSchoolState();
      return result;
    } catch (error) {
      console.error("Error de red al asignar:", error);
      return { ok: false, error: "Error de conexión." };
    }
  }, [refreshSchoolState]);


  if (!session) {
    return <Login onLogin={(user, availableUsers) => { setSession(user); setUsers(availableUsers); setView("inicio"); }} />;
  }

  const navigationItems: NavigationItem[] = [
    { view: "inicio", icon: "home", label: "Resumen", description: "Panel principal y actividad reciente", keywords: "inicio dashboard principal" },
    ...(session.role !== "Docente" ? [{ view: "visitantes" as const, icon: "badge", label: session.role === "Directivo" ? "Personas ingresadas" : "Personas externas", description: "Consulta y control de accesos", keywords: "visitantes acceso entrada salida vigilancia" }] : []),
    ...(session.role === "Docente" ? [
      { view: "lista" as const, icon: "users", label: "Pase de lista", description: "Registrar asistencia del alumnado", keywords: "asistencia alumnos presentes faltas retardos" },
      { view: "alumnos" as const, icon: "plus", label: "Agregar alumno a la lista", description: "Administrar alumnos de tus grupos", keywords: "alta estudiante padrón grupo" },
      { view: "docentes" as const, icon: "clock", label: "Registrar entrada docente", description: "Marcar entrada o salida personal", keywords: "asistencia horario llegada salida" },
    ] : []),
    ...(session.role === "Directivo" ? [
      { view: "docentes" as const, icon: "clock", label: "Asistencia docentes", description: "Consultar presencia del personal", keywords: "maestros entrada salida horario" },
      { view: "listas-oficiales" as const, icon: "calendar", label: "Listas oficiales", description: "Consultar listas oficializadas por grupo", keywords: "asistencia mensual oficial grupo maestro" },
      { view: "grupos" as const, icon: "link", label: "Asignar grupos", description: "Relacionar grupos con docentes", keywords: "agregar grupo docente maestro asignacion" },
      { view: "catalogo" as const, icon: "layers", label: "Grupos y alumnos", description: "Crear grupos y gestionar alumnado", keywords: "catalogo estudiantes grados altas" },
      { view: "personal" as const, icon: "badge", label: "Gestión de docentes", description: "Registrar y administrar personal", keywords: "maestros altas bajas justificantes" },
      { view: "usuarios" as const, icon: "lock", label: "Usuarios y accesos", description: "Crear cuentas, roles y contraseñas", keywords: "usuario acceso cuenta seguridad roles password" },
    ] : []),
    ...(session.role !== "Vigilante de Acceso" ? [{ view: "reportes" as const, icon: "chart", label: "Reportes", description: "Consultar y exportar asistencia", keywords: "reporte informe estadisticas csv pdf" }] : []),
  ];
  const searchTokens = normalizeSearch(navigationSearch).split(/\s+/).filter((token) => token.length > 1);
  const searchResults = searchTokens.length
    ? navigationItems.filter((item) => {
      const haystack = normalizeSearch(`${item.label} ${item.description} ${item.keywords}`);
      return searchTokens.every((token) => haystack.includes(token));
    }).slice(0, 6)
    : [];

  const navigate = (next: View) => {
    setView(next);
    setMobileMenu(false);
    setNavigationSearch("");
    setSearchOpen(false);
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <button className="brand" type="button" onClick={() => navigate("inicio")} aria-label="Ir al resumen">
          <div className="brand-mark"><Image src={schoolLogo} alt="Escudo de la Escuela Primaria Vicente Suárez" priority unoptimized /></div>
          <div><strong>Vicente Suárez</strong><small>Control escolar</small></div>
        </button>
        <button className="mobile-close" onClick={() => setMobileMenu(false)} aria-label="Cerrar menú">
          <Icon name="close" />
        </button>
        <p className="sidebar-label">MENÚ PRINCIPAL</p>
        <nav>
          {navigationItems.map((item) => <NavItem key={`${item.view}-${item.label}`} active={view === item.view} icon={item.icon} label={item.label} onClick={() => navigate(item.view)} />)}
        </nav>
        <div className="sidebar-foot">
          <div className="network"><span></span><div><strong>Red local activa</strong><small>Servidor LAN · Sin internet</small></div></div>
          <button onClick={async () => { await logoutAction(); setSession(null); setUsers([]); setView("inicio"); }}><Icon name="logout" size={18} /> Cerrar sesión</button>
        </div>
      </aside>

      {mobileMenu && <button className="overlay" onClick={() => setMobileMenu(false)} aria-label="Cerrar menú" />}

      <main className="main">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMobileMenu(true)} aria-label="Abrir menú"><Icon name="menu" /></button>
          <button className="topbar-home" type="button" onClick={() => navigate("inicio")} aria-label="Ir al resumen">
            <Image className="topbar-logo" src={schoolLogo} alt="" priority unoptimized />
          </button>
          <div className="topbar-title">
            <span>Sistema de asistencia</span>
            <strong>{view === "inicio" ? "Resumen" : view === "visitantes" ? "Personas externas" : view === "lista" ? "Pase de lista" : view === "listas-oficiales" ? "Listas oficiales" : view === "alumnos" ? "Agregar alumno a la lista" : view === "grupos" ? "Agregar grupo a docente" : view === "catalogo" ? "Grupos y alumnos" : view === "personal" ? "Gestión de docentes" : view === "usuarios" ? "Usuarios y accesos" : view === "docentes" ? session.role === "Directivo" ? "Asistencia Docentes" : "Registrar entrada docente" : "Reportes"}</strong>
          </div>
          <div className="navigation-search" onFocus={() => setSearchOpen(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false); }}>
            <Icon name="search" size={18} />
            <input
              value={navigationSearch}
              onChange={(event) => { setNavigationSearch(event.target.value); setSearchOpen(true); }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && searchResults[0]) {
                  event.preventDefault();
                  navigate(searchResults[0].view);
                }
                if (event.key === "Escape") setSearchOpen(false);
              }}
              placeholder="Buscar usuarios, reportes, grupos…"
              aria-label="Buscar una sección"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={searchOpen && navigationSearch.trim().length > 0}
              aria-controls="navigation-search-results"
            />
            {navigationSearch && <button type="button" onClick={() => { setNavigationSearch(""); setSearchOpen(false); }} aria-label="Limpiar búsqueda"><Icon name="close" size={15} /></button>}
            {searchOpen && navigationSearch.trim() && (
              <div className="navigation-results" id="navigation-search-results" role="listbox">
                {searchResults.map((item) => (
                  <button type="button" role="option" aria-selected="false" key={`${item.view}-${item.label}`} onMouseDown={(event) => event.preventDefault()} onClick={() => navigate(item.view)}>
                    <span><Icon name={item.icon} size={17} /></span>
                    <div><strong>{item.label}</strong><small>{item.description}</small></div>
                    <Icon name="chevron" size={16} />
                  </button>
                ))}
                {searchResults.length === 0 && <div className="navigation-empty"><Icon name="search" size={17} /><span>No encontramos una sección con ese nombre.</span></div>}
              </div>
            )}
          </div>
          <div className="user-chip">
            <span>{session.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>
            <div><strong>{session.name}</strong><small>{session.role}</small></div>
          </div>
        </header>

        <section className="content">
          {view === "inicio" && <Dashboard userName={session.name} role={session.role} records={records} students={students} visitors={visitors} assignedGroups={teacherGroups[session.name] || []} onNavigate={navigate} />}
          {view === "visitantes" && session.role !== "Docente" && (
            <VisitorRegistry
              visitors={visitors}
              setVisitors={setVisitors}
              readOnly={session.role === "Directivo"}
              canDelete={session.role === "Directivo"}
            />
          )}
          {view === "lista" && session.role === "Docente" && (
            <RollCall
              records={records}
              setRecords={setRecords}
              replaceRecords={replaceRecords}
              officialLists={officialLists}
              replaceOfficialLists={replaceOfficialLists}
              students={students}
              groups={teacherGroups[session.name] || []}
            />
          )}
          {view === "listas-oficiales" && session.role === "Directivo" && (
            <OfficialListsArchive officialLists={officialLists} groups={groups.map((group) => group.name)} />
          )}
          {view === "alumnos" && session.role === "Docente" && (
            <StudentManagement
              students={students}
              groups={groups.filter((group) => (teacherGroups[session.name] || []).includes(group.name))}
              setStudents={setStudents}
              onDeleteRecords={(studentId) => setRecords((current) => current.filter((record) => record.studentId !== studentId))}
              canDelete={true}
            />
          )}
          {view === "docentes" && session.role === "Docente" && (
            <TeacherCheckIn
              teacher={session.name}
              teacherId={session.id}
              attendance={teacherAttendance}
              setAttendance={setTeacherAttendance}
            />
          )}
          {view === "docentes" && session.role === "Directivo" && (
            <TeacherAttendanceOverview attendance={teacherAttendance} teachers={teachers} />
          )}
          {view === "grupos" && session.role === "Directivo" && (
            <TeacherGroupManagement
              teachers={teachers}
              groups={groups}
              assignments={teacherGroups}
              setAssignments={setTeacherGroups}
              teacherIds={teacherIds}
              users={users}
              onAssignTeacher={handleAssignTeacher}
            />
          )}
          {view === "catalogo" && session.role === "Directivo" && (
            <GroupStudentManagement
              groups={groups}
              students={students}
              setGroups={setGroups}
              setStudents={setStudents}
              groupTeacherMap={groupTeacherMap}
              onDeleteRecords={(studentId) => setRecords((current) => current.filter((record) => record.studentId !== studentId))}
              canDelete={true}
            />
          )}
          {view === "personal" && session.role === "Directivo" && (
            <TeacherManagement
              teachers={teachers}
              setTeachers={setTeachers}
              groups={groups}
              assignments={teacherGroups}
              setAssignments={setTeacherGroups}
              teacherIds={teacherIds}
              users={users}
              onAssignTeacher={handleAssignTeacher}
              onDeleteTeacher={(teacher) => {
                setTeacherGroups((current) => {
                  const next = { ...current };
                  delete next[teacher];
                  return next;
                });
                setTeacherAttendance((current) => current.filter((record) => record.teacher !== teacher));
              }}
            />
          )}
          {view === "usuarios" && session.role === "Directivo" && (
            <UserManagement users={users} setUsers={setUsers} />
          )}
          {view === "reportes" && session.role !== "Vigilante de Acceso" && <Reports records={records} students={students} groups={groups.map((group) => group.name)} assignments={teacherGroups} allowedGroups={session.role === "Docente" ? teacherGroups[session.name] || [] : undefined} initialTemplates={initialTemplates} />}
        </section>
      </main>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (user: AppUserSummary, users: AppUserSummary[]) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError("");
    const result = await loginAction(username, password);
    setPending(false);
    if (result.ok) onLogin(result.user, result.users);
    else setError(result.error);
  };
  return (
    <div className="login-page">
      <div className="login-brand">
        <div className="school-seal"><Image src={schoolLogo} alt="Escudo de la Escuela Primaria Vicente Suárez" priority unoptimized /></div>
        <p>Escuela Primaria</p>
        <h1>Vicente Suárez</h1>
        <div className="brand-rule"></div>
        <p className="login-tagline">Control de acceso y asistencia escolar</p>
      </div>
      <div className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <div className="login-heading"><span><Icon name="lock" /></span><div><small>BIENVENIDO</small><h2>Iniciar sesión</h2></div></div>
          <p>Ingresa con las credenciales asignadas por la dirección escolar.</p>
          {error && <div className="form-alert"><Icon name="alert" size={18} /><span>{error}</span></div>}
          <label>Nombre de usuario<input value={username} onChange={(e) => { setUsername(e.target.value); setError(""); }} placeholder="Ej. docente" autoFocus /></label>
          <label>
            Contraseña
            <span className="password-input">
              <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} placeholder="Ingresa tu contraseña" autoComplete="current-password" />
              <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={showPassword} title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>
                <Icon name={showPassword ? "eye-off" : "eye"} size={18} />
              </button>
            </span>
          </label>
          <button className="primary-button" type="submit" disabled={pending}>{pending ? "Verificando…" : "Ingresar al sistema"} <Icon name="chevron" size={18} /></button>
          <small className="local-note"><span></span> Sistema disponible en la red local del plantel</small>
        </form>
      </div>
    </div>
  );
}

function NavItem({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick: () => void }) {
  return <button className={active ? "active" : ""} onClick={onClick}><span className="nav-icon"><Icon name={icon} /></span><span>{label}</span>{active && <i className="nav-active-dot"></i>}</button>;
}

function Dashboard({ userName, role, records, students, visitors, assignedGroups, onNavigate }: { userName: string; role: Role; records: AttendanceRecord[]; students: Student[]; visitors: Visitor[]; assignedGroups: string[]; onNavigate: (view: View) => void }) {
  if (role === "Vigilante de Acceso") {
    return <VisitorDashboard userName={userName} visitors={visitors} onNavigate={onNavigate} />;
  }
  const visibleStudents = role === "Docente" ? students.filter((student) => assignedGroups.includes(student.group)) : students;
  const visibleStudentIds = new Set(visibleStudents.map((student) => student.id));
  const visibleRecords = records.filter((record) => visibleStudentIds.has(record.studentId));
  const currentDate = todayISO();
  const today = visibleRecords.filter((r) => r.date === currentDate);
  const present = today.filter((r) => r.status === "Presente").length;
  const late = today.filter((r) => r.status === "Retardo").length;
  const absent = today.filter((r) => r.status === "Falta").length;
  const recent = visibleRecords.slice().sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)).slice(0, 5);
  return (
    <>
      <div className="page-intro">
        <div><p className="eyebrow">CICLO ESCOLAR 2026–2027</p><h1>Buenos días, {userName}</h1><p>{role === "Docente" ? `Este es el estado de asistencia de tus grupos al ${formatDate(currentDate)}.` : `Este es el estado de asistencia del plantel al ${formatDate(currentDate)}.`}</p></div>
        <div className="date-pill"><Icon name="calendar" size={18} /> {formatDate(currentDate)}</div>
      </div>
      <div className="metrics">
        <Metric label="Entradas puntuales" value={present} tone="green" detail="Registradas hoy" icon="check" />
        <Metric label="Retardos" value={late} tone="amber" detail="Después de las 08:00" icon="clock" />
        <Metric label="Inasistencias" value={absent} tone="red" detail="Marcadas en lista" icon="users" />
        <Metric label={role === "Docente" ? "Alumnos de mis grupos" : "Alumnos registrados"} value={visibleStudents.length} tone="neutral" detail={role === "Docente" ? `${assignedGroups.length} grupos asignados` : "Ciclo escolar activo"} icon="chart" />
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-head"><div><p className="eyebrow">ACTIVIDAD RECIENTE</p><h2>Últimos registros</h2></div><button className="text-button" onClick={() => onNavigate("reportes")}>Ver todos <Icon name="chevron" size={16} /></button></div>
          <div className="recent-list">
            {recent.map((record, i) => {
              const student = visibleStudents.find((s) => s.id === record.studentId)!;
              return <div className="recent-item" key={`${record.studentId}-${record.date}-${i}`}>
                <div className="avatar">{student.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}</div>
                <div className="recent-name"><strong>{student.name}</strong><small>N.º {student.listNumber} · {student.group} · {record.source}</small></div>
                <StatusBadge status={record.status} />
                <time>{record.time}</time>
              </div>;
            })}
          </div>
        </section>
        <section className="panel quick-panel">
          <div className="panel-head"><div><p className="eyebrow">ACCESOS RÁPIDOS</p><h2>¿Qué deseas hacer?</h2></div></div>
          {role !== "Docente" && <button onClick={() => onNavigate("visitantes")}><span className="quick-icon"><Icon name="badge" /></span><div><strong>{role === "Directivo" ? "Consultar personas ingresadas" : "Registrar persona externa"}</strong><small>{role === "Directivo" ? "Revisa la bitácora de accesos" : "Controla su entrada y salida"}</small></div><Icon name="chevron" size={18} /></button>}
          {role === "Docente" && <button onClick={() => onNavigate("lista")}><span className="quick-icon"><Icon name="users" /></span><div><strong>Pasar lista</strong><small>Gestiona la asistencia de tu grupo</small></div><Icon name="chevron" size={18} /></button>}
          {role === "Docente" && <button onClick={() => onNavigate("alumnos")}><span className="quick-icon"><Icon name="plus" /></span><div><strong>Agregar alumno a la lista</strong><small>Administra el padrón de tus grupos</small></div><Icon name="chevron" size={18} /></button>}
          {role === "Docente" && <button onClick={() => onNavigate("docentes")}><span className="quick-icon"><Icon name="clock" /></span><div><strong>Registrar entrada docente</strong><small>Marca tu llegada o salida del plantel</small></div><Icon name="chevron" size={18} /></button>}
          {role === "Directivo" && <button onClick={() => onNavigate("docentes")}><span className="quick-icon"><Icon name="users" /></span><div><strong>Asistencia Docentes</strong><small>Consulta quién se encuentra en el plantel</small></div><Icon name="chevron" size={18} /></button>}
          {role === "Directivo" && <button onClick={() => onNavigate("grupos")}><span className="quick-icon"><Icon name="plus" /></span><div><strong>Agregar grupo a docente</strong><small>Administra las asignaciones docentes</small></div><Icon name="chevron" size={18} /></button>}
          {role === "Directivo" && <button onClick={() => onNavigate("catalogo")}><span className="quick-icon"><Icon name="users" /></span><div><strong>Grupos y alumnos</strong><small>Crea grupos y administra su alumnado</small></div><Icon name="chevron" size={18} /></button>}
          {role === "Directivo" && <button onClick={() => onNavigate("personal")}><span className="quick-icon"><Icon name="badge" /></span><div><strong>Gestión de docentes</strong><small>Administra altas, bajas y justificantes</small></div><Icon name="chevron" size={18} /></button>}
          {role === "Directivo" && <button onClick={() => onNavigate("usuarios")}><span className="quick-icon"><Icon name="lock" /></span><div><strong>Usuarios y accesos</strong><small>Asigna cuentas, contraseñas y roles</small></div><Icon name="chevron" size={18} /></button>}
          <button onClick={() => onNavigate("reportes")}><span className="quick-icon"><Icon name="chart" /></span><div><strong>Consultar reportes</strong><small>Revisa faltas y puntualidad</small></div><Icon name="chevron" size={18} /></button>
        </section>
      </div>
    </>
  );
}

function Metric({ label, value, tone, detail, icon }: { label: string; value: number; tone: string; detail: string; icon: string }) {
  return <div className={`metric metric-${tone}`}><div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div><span><Icon name={icon} /></span></div>;
}

function VisitorDashboard({ userName, visitors, onNavigate }: { userName: string; visitors: Visitor[]; onNavigate: (view: View) => void }) {
  const today = todayISO();
  const todayVisitors = visitors.filter((visitor) => visitor.date === today);
  const active = visitors.filter((visitor) => !visitor.exitTime).length;
  const completedToday = todayVisitors.filter((visitor) => visitor.exitTime).length;
  const recent = visitors.slice().sort((a, b) => `${b.date}${b.entryTime}`.localeCompare(`${a.date}${a.entryTime}`)).slice(0, 6);

  return (
    <>
      <div className="page-intro">
        <div><p className="eyebrow">SEGURIDAD DEL PLANTEL</p><h1>Buenos días, {userName}</h1><p>Consulta los ingresos, salidas y visitas activas del plantel.</p></div>
        <div className="date-pill"><Icon name="calendar" size={18} /> {formatDate(today)}</div>
      </div>
      <div className="metrics visitor-metrics">
        <Metric label="Dentro del plantel" value={active} tone="green" detail="Sin salida registrada" icon="badge" />
        <Metric label="Ingresos de hoy" value={todayVisitors.length} tone="neutral" detail="Personas registradas" icon="users" />
        <Metric label="Salidas de hoy" value={completedToday} tone="amber" detail="Visitas finalizadas" icon="logout" />
      </div>
      <div className="dashboard-grid visitor-dashboard-grid">
        <section className="panel">
          <div className="panel-head"><div><p className="eyebrow">ACTIVIDAD RECIENTE</p><h2>Últimas personas registradas</h2></div><button className="text-button" onClick={() => onNavigate("visitantes")}>Ver bitácora <Icon name="chevron" size={16} /></button></div>
          <div className="recent-list">
            {recent.map((visitor) => <div className="recent-item visitor-recent-item" key={visitor.id}>
              <div className="avatar">{visitor.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>
              <div className="recent-name"><strong>{visitor.name}</strong><small>{visitor.host} · {visitor.reason}</small></div>
              <span className={visitor.exitTime ? "presence-badge completed" : "presence-badge"}>{visitor.exitTime ? "Salida registrada" : "En plantel"}</span>
              <time>{visitor.entryTime}</time>
            </div>)}
            {recent.length === 0 && <div className="empty-state"><Icon name="badge" /><strong>Sin visitas registradas</strong><p>Los nuevos ingresos aparecerán en este espacio.</p></div>}
          </div>
        </section>
        <section className="panel quick-panel">
          <div className="panel-head"><div><p className="eyebrow">ACCESO RÁPIDO</p><h2>Control de visitantes</h2></div></div>
          <button onClick={() => onNavigate("visitantes")}><span className="quick-icon"><Icon name="badge" /></span><div><strong>Registrar persona externa</strong><small>Controla su entrada y salida</small></div><Icon name="chevron" size={18} /></button>
        </section>
      </div>
    </>
  );
}

function TeacherCheckIn({
  teacher,
  teacherId,
  attendance,
  setAttendance,
}: {
  teacher: string;
  teacherId: string;
  attendance: TeacherAttendance[];
  setAttendance: React.Dispatch<React.SetStateAction<TeacherAttendance[]>>;
}) {
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const { requestConfirmation, confirmationDialog } = useConfirmation();
  const today = todayISO();
  const todayRecord = attendance.find((record) => record.teacher === teacher && record.date === today);
  const isInside = Boolean(todayRecord && !todayRecord.exitTime);
  const teacherHistory = attendance.filter((record) => record.teacher === teacher).sort((a, b) => b.date.localeCompare(a.date));

  const registerEntry = () => {
    if (todayRecord || isPending) return;
    requestConfirmation({
      title: "Registrar entrada",
      message: `Se registrará tu entrada al plantel con la hora actual. ¿Deseas continuar?`,
      confirmLabel: "Sí, registrar entrada",
    }, () => {
      setError("");
      startTransition(async () => {
        const result = await createTeacherAttendanceAction({
          teacherId,
          date: today,
          entryTime: new Date().toISOString(),
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setAttendance((current) => [{
          id: Date.now(),
          teacher: result.record.teacher || teacher,
          date: result.record.date,
          entryTime: result.record.entryTime,
          exitTime: result.record.exitTime,
        }, ...current]);
        setNotice("Tu entrada al plantel fue registrada correctamente.");
      });
    });
  };

  const registerExit = () => {
    if (!todayRecord || todayRecord.exitTime || isPending) return;
    requestConfirmation({
      title: "Registrar salida",
      message: `Se registrará tu salida del plantel con la hora actual. ¿Deseas continuar?`,
      confirmLabel: "Sí, registrar salida",
    }, () => {
      setError("");
      startTransition(async () => {
        const result = await updateTeacherAttendanceAction(todayRecord.id.toString(), {
          exitTime: new Date().toISOString(),
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setAttendance((current) => current.map((record) =>
          record.id === todayRecord.id
            ? { ...record, exitTime: result.record.exitTime }
            : record,
        ));
        setNotice("Tu salida del plantel fue registrada correctamente.");
      });
    });
  };

  return (
    <>
      {confirmationDialog}
      <div className="page-intro">
        <div><p className="eyebrow">CONTROL DE PERSONAL</p><h1>Registrar entrada docente</h1><p>Marca tu llegada y salida del plantel para mantener actualizada tu asistencia.</p></div>
        <div className={`teacher-presence ${isInside ? "teacher-present" : ""}`}><span></span><div><small>ESTADO ACTUAL</small><strong>{isInside ? "Dentro del plantel" : todayRecord ? "Salida registrada" : "Sin entrada registrada"}</strong></div></div>
      </div>
      <div className="teacher-check-layout">
        <section className="panel teacher-check-card">
          <div className="teacher-check-identity">
            <div className="large-avatar">{teacher.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>
            <div><p className="eyebrow">DOCENTE</p><h2>{teacher}</h2><span>Ciclo escolar 2026–2027</span></div>
          </div>
          <div className="teacher-time-block">
            <Icon name="clock" size={28} />
            <div><small>FECHA DE REGISTRO</small><strong>{formatDate(today)}</strong><p>La hora exacta se asignará automáticamente.</p></div>
          </div>
          {notice && <div className="notice notice-success"><Icon name="check" /><div><strong>Registro actualizado</strong><p>{notice}</p></div></div>}
          {error && <div className="notice notice-error"><Icon name="alert" /><div><strong>No se pudo registrar</strong><p>{error}</p></div></div>}
          {!todayRecord && <button className="primary-button teacher-action" onClick={registerEntry} disabled={isPending}><Icon name="check" size={18} /> {isPending ? "Registrando…" : "Registrar mi entrada"}</button>}
          {isInside && <button className="primary-button teacher-action teacher-exit-action" onClick={registerExit} disabled={isPending}><Icon name="logout" size={18} /> {isPending ? "Registrando…" : "Registrar mi salida"}</button>}
          {todayRecord?.exitTime && <div className="day-complete"><Icon name="check" /><div><strong>Jornada registrada</strong><p>Entrada {todayRecord.entryTime} h · Salida {todayRecord.exitTime} h</p></div></div>}
          <p className="teacher-help"><Icon name="alert" size={16} /> Solo se permite un registro de entrada y salida por día.</p>
        </section>

        <section className="panel teacher-history">
          <div className="panel-head"><div><p className="eyebrow">HISTORIAL PERSONAL</p><h2>Últimos registros</h2></div><Icon name="calendar" /></div>
          {teacherHistory.length > 0 ? <div className="teacher-history-list">
            {teacherHistory.slice(0, 7).map((record) => <div className="teacher-history-row" key={record.id}>
              <div><strong>{formatDate(record.date)}</strong><small>{record.date === today ? "Hoy" : "Registro diario"}</small></div>
              <span><small>ENTRADA</small><strong>{record.entryTime} h</strong></span>
              <span><small>SALIDA</small><strong>{record.exitTime ? `${record.exitTime} h` : "Pendiente"}</strong></span>
              <span className={`presence-badge ${record.exitTime ? "completed" : ""}`}>{record.exitTime ? "Completado" : "En plantel"}</span>
            </div>)}
          </div> : <div className="empty-state"><Icon name="clock" /><strong>Aún no hay registros</strong><p>Tu primera entrada aparecerá en este espacio.</p></div>}
        </section>
      </div>
    </>
  );
}

function TeacherAttendanceOverview({ attendance, teachers }: { attendance: TeacherAttendance[]; teachers: TeacherProfile[] }) {
  const [filter, setFilter] = useState<"Todos" | "En plantel" | "Fuera">("Todos");
  const today = todayISO();
  const rows = teachers.map((teacher) => {
    const record = attendance.find((item) => item.teacher === teacher.name && item.date === today);
    const status = teacher.status === "Baja temporal" ? "Baja temporal" : teacher.justifiedDates.includes(today) ? "Justificado" : record ? record.exitTime ? "Salida registrada" : "En plantel" : "Sin registro";
    return { teacher: teacher.name, record, status };
  }).filter((row) =>
    filter === "Todos" ||
    (filter === "En plantel" && row.status === "En plantel") ||
    (filter === "Fuera" && row.status !== "En plantel"),
  );
  const present = teachers.filter((teacher) =>
    attendance.some((record) => record.teacher === teacher.name && record.date === today && !record.exitTime),
  ).length;
  const registered = teachers.filter((teacher) =>
    attendance.some((record) => record.teacher === teacher.name && record.date === today),
  ).length;

  return (
    <>
      <div className="page-intro">
        <div><p className="eyebrow">CONSULTA DIRECTIVA</p><h1>Asistencia Docentes</h1><p>Visualiza el estado actual del personal docente registrado en el plantel.</p></div>
        <div className="date-pill"><Icon name="calendar" size={18} /> {formatDate(today)}</div>
      </div>
      <div className="teacher-summary">
        <Metric label="En el plantel" value={present} tone="green" detail="Sin salida registrada" icon="check" />
        <Metric label="Registros del día" value={registered} tone="neutral" detail="Entradas capturadas" icon="clock" />
        <Metric label="Sin registro" value={teachers.length - registered} tone="amber" detail="Pendientes de entrada" icon="users" />
      </div>
      <section className="panel teacher-overview">
        <div className="panel-head teacher-overview-head">
          <div><p className="eyebrow">PERSONAL DOCENTE</p><h2>Estado de asistencia actual</h2></div>
          <div className="teacher-filters">{(["Todos", "En plantel", "Fuera"] as const).map((option) => <button key={option} className={filter === option ? "active" : ""} onClick={() => setFilter(option)}>{option}</button>)}</div>
        </div>
        <div className="teacher-overview-table">
          <div className="teacher-overview-labels"><span>Docente</span><span>Entrada</span><span>Salida</span><span>Estado</span></div>
          {rows.map(({ teacher, record, status }) => <div className="teacher-overview-row" key={teacher}>
            <div><span className="avatar">{teacher.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><span><strong>{teacher}</strong><small>Personal docente</small></span></div>
            <span>{record ? `${record.entryTime} h` : "—"}</span>
            <span>{record?.exitTime ? `${record.exitTime} h` : "—"}</span>
            <span className={`teacher-status ${status === "En plantel" ? "present" : status === "Salida registrada" ? "left" : status === "Justificado" ? "justified" : status === "Baja temporal" ? "inactive" : "missing"}`}><i></i>{status}</span>
          </div>)}
        </div>
      </section>
    </>
  );
}

function VisitorRegistry({
  visitors,
  setVisitors,
  readOnly,
  canDelete,
}: {
  visitors: Visitor[];
  setVisitors: React.Dispatch<React.SetStateAction<Visitor[]>>;
  readOnly: boolean;
  canDelete: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [identification, setIdentification] = useState("");
  const [reason, setReason] = useState("");
  const [host, setHost] = useState("");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const { requestConfirmation, confirmationDialog } = useConfirmation();

  const registerVisitor = (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date();
    const entryTime = now.toISOString();
    setNotice("");
    startTransition(async () => {
      const result = await createVisitorAction({
        name: name.trim(),
        reason: reason.trim(),
        entryTime,
      });
      if (!result.ok) {
        setNotice(result.error);
        return;
      }
      setVisitors((current) => [{
        ...result.visitor,
        identification: identification.trim(),
        host: host.trim(),
      }, ...current]);
      setName("");
      setIdentification("");
      setReason("");
      setHost("");
      setNotice("La entrada de la persona externa fue registrada correctamente.");
    });
  };

  const registerExit = (visitor: Visitor) => {
    requestConfirmation({
      title: "Registrar salida",
      message: `Se registrará la salida de ${visitor.name} con la hora actual. ¿Deseas continuar?`,
      confirmLabel: "Sí, registrar salida",
    }, () => {
      const exitTime = new Date().toISOString();
      startTransition(async () => {
        const result = await updateVisitorAction(visitor.id, { exitTime });
        if (!result.ok) {
          setNotice(result.error);
          return;
        }
        setVisitors((current) => current.map((item) => item.id === visitor.id ? { ...item, exitTime: result.visitor.exitTime } : item));
      });
    });
  };

  const handleDeleteVisitor = (visitor: Visitor) => {
    requestConfirmation({
      title: "Eliminar registro de visitante",
      message: `Se eliminará el registro de ${visitor.name}. Esta acción no se puede deshacer.`,
      confirmLabel: "Sí, eliminar",
      tone: "danger",
    }, () => {
      startTransition(async () => {
        const result = await deleteVisitorAction(visitor.id);
        if (!result.ok) {
          setNotice(result.error);
          return;
        }
        setVisitors((current) => current.filter((item) => item.id !== visitor.id));
      });
    });
  };

  const filteredVisitors = visitors.filter((visitor) =>
    `${visitor.name} ${visitor.identification} ${visitor.host}`.toLowerCase().includes(search.toLowerCase()),
  );
  const activeCount = visitors.filter((visitor) => !visitor.exitTime).length;

  return (
    <>
      {confirmationDialog}
      <div className="page-intro">
        <div>
          <p className="eyebrow">{readOnly ? "CONSULTA DIRECTIVA" : "SEGURIDAD DEL PLANTEL"}</p>
          <h1>{readOnly ? "Personas ingresadas" : "Personas externas"}</h1>
          <p>{readOnly ? "Consulta las personas externas que han ingresado al plantel." : "Registra y supervisa a las personas ajenas a la comunidad escolar."}</p>
        </div>
        <div className="visitor-counter"><span>{activeCount}</span><div><small>DENTRO DEL PLANTEL</small><strong>{activeCount === 1 ? "Visita activa" : "Visitas activas"}</strong></div></div>
      </div>
      <div className={`visitor-layout ${readOnly ? "visitor-layout-readonly" : ""}`}>
        {!readOnly && <form className="panel visitor-form" onSubmit={registerVisitor}>
          <div className="panel-head"><div><p className="eyebrow">NUEVO REGISTRO</p><h2>Datos de la persona</h2></div><span className="form-icon"><Icon name="badge" /></span></div>
          <div className="visitor-fields">
            {notice && <div className="notice notice-success visitor-notice"><Icon name="check" /><div><strong>Entrada registrada</strong><p>{notice}</p></div></div>}
            <label>Nombre completo<input required value={name} onChange={(e) => { setName(e.target.value); setNotice(""); }} placeholder="Nombre y apellidos" /></label>
            <label>Identificación presentada<input required value={identification} onChange={(e) => setIdentification(e.target.value)} placeholder="Ej. INE · últimos 4 dígitos" /></label>
            <label>Motivo de la visita<textarea required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Describe brevemente el motivo" rows={3} /></label>
            <label>Persona o área que visita<input required value={host} onChange={(e) => setHost(e.target.value)} placeholder="Nombre del docente o área" /></label>
            <div className="entry-preview"><Icon name="clock" /><div><small>FECHA Y HORA DE ENTRADA</small><strong>Se asignarán automáticamente al confirmar</strong></div></div>
            <button className="primary-button" type="submit" disabled={isPending}><Icon name="check" size={18} /> {isPending ? "Guardando…" : "Registrar entrada"}</button>
          </div>
        </form>}

        <section className="panel visitor-history">
          <div className="panel-head visitor-history-head">
            <div><p className="eyebrow">BITÁCORA DE ACCESO</p><h2>Visitas registradas</h2></div>
            <div className="visitor-search"><Icon name="search" size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar persona…" /></div>
          </div>
          <div className="visitor-table">
            <div className="visitor-table-head"><span>Persona</span><span>Destino</span><span>Entrada</span><span>Salida</span></div>
            {filteredVisitors.map((visitor) => <div className="visitor-row" key={visitor.id}>
              <div><span className="avatar">{visitor.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><span><strong>{visitor.name}</strong><small>{visitor.identification} · {visitor.reason}</small></span></div>
              <span>{visitor.host}</span>
              <span><strong>{visitor.entryTime}</strong><small>{formatDate(visitor.date)}</small></span>
              <span>{visitor.exitTime ? <span className="exit-time">{visitor.exitTime}</span> : readOnly ? <span className="inside-status">En plantel</span> : <button className="exit-button" onClick={() => registerExit(visitor)} disabled={isPending}>Registrar salida</button>}</span>
              {canDelete && visitor.exitTime && (
                <button className="delete-button" onClick={() => handleDeleteVisitor(visitor)} disabled={isPending} aria-label={`Eliminar registro de ${visitor.name}`}>
                  <Icon name="trash" size={16} />
                </button>
              )}
            </div>)}
            {filteredVisitors.length === 0 && <div className="empty-state"><Icon name="badge" /><strong>Sin registros</strong><p>No hay personas que coincidan con la búsqueda.</p></div>}
          </div>
        </section>
      </div>
    </>
  );
}

function StudentListNumberEditor({
  student,
  students,
  setStudents,
}: {
  student: Student;
  students: Student[];
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(student.listNumber));
  const [error, setError] = useState("");

  useEffect(() => setValue(String(student.listNumber)), [student.listNumber]);

  const save = () => {
    const listNumber = Number(value);
    if (!isValidListNumber(listNumber)) {
      setError("Usa un número entre 1 y 999.");
      return;
    }
    if (!isListNumberAvailable(students, student.group, listNumber, student.id)) {
      setError(`El número ${listNumber} ya está ocupado en ${student.group}.`);
      return;
    }
    setStudents((current) => current
      .map((item) => item.id === student.id ? { ...item, listNumber } : item)
      .sort(compareStudentsByListNumber));
    setError("");
    setEditing(false);
  };

  if (!editing) {
    return <button className="list-number-button" type="button" onClick={() => setEditing(true)} aria-label={`Editar número de lista de ${student.name}`}>N.º {student.listNumber}</button>;
  }

  return (
    <div className="list-number-editor">
      <input type="number" min="1" max="999" value={value} onChange={(event) => { setValue(event.target.value); setError(""); }} aria-label={`Número de lista de ${student.name}`} />
      <button type="button" onClick={save} aria-label="Guardar número"><Icon name="check" size={14} /></button>
      <button type="button" onClick={() => { setValue(String(student.listNumber)); setError(""); setEditing(false); }} aria-label="Cancelar edición"><Icon name="close" size={14} /></button>
      {error && <small>{error}</small>}
    </div>
  );
}

function StudentManagement({
  students,
  groups,
  setStudents,
  onDeleteRecords,
  canDelete,
}: {
  students: Student[];
  groups: GroupRef[];
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
  onDeleteRecords: (studentId: string) => void;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const availableGroups = groups.length ? groups.map((group) => group.name) : [...new Set(students.map((student) => student.group))].sort();
  const [givenNames, setGivenNames] = useState("");
  const [paternalSurname, setPaternalSurname] = useState("");
  const [maternalSurname, setMaternalSurname] = useState("");
  const [group, setGroup] = useState(availableGroups[0] || "");
  const [listNumber, setListNumber] = useState(nextListNumber(students, availableGroups[0] || ""));
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const { requestConfirmation, confirmationDialog } = useConfirmation();

  useEffect(() => {
    if (!availableGroups.includes(group)) {
      const nextGroup = availableGroups[0] || "";
      setGroup(nextGroup);
      setListNumber(nextListNumber(students, nextGroup));
    }
  }, [availableGroups, group, students]);

  const numberedGroupStudents = sortAndNumberGroupStudents(students, group);
  const visibleStudents = numberedGroupStudents.filter((student) =>
    `${student.name} ${student.group} ${student.listNumber}`.toLowerCase().includes(search.toLowerCase()),
  );

  const addStudent = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValidListNumber(listNumber)) {
      setNotice({ type: "error", text: "El número de lista debe ser un entero entre 1 y 999." });
      return;
    }
    if (!isListNumberAvailable(students, group, listNumber)) {
      setNotice({ type: "error", text: `El número ${listNumber} ya está asignado en ${group}.` });
      return;
    }
    const groupDoc = groups.find((item) => item.name === group);
    if (!groupDoc) {
      setNotice({ type: "error", text: "El grupo seleccionado no existe en el servidor." });
      return;
    }
    const studentName = formatStudentName(paternalSurname, maternalSurname, givenNames);
    requestConfirmation({
      title: "Agregar alumno",
      message: `Se va a agregar a ${studentName} con el número ${listNumber} al grupo ${group}. ¿Deseas continuar?`,
      confirmLabel: "Sí, agregar alumno",
    }, () => {
      setNotice(null);
      startTransition(async () => {
        const result = await createStudentAction({
          firstName: givenNames.trim(),
          paternalSurname: paternalSurname.trim(),
          maternalSurname: maternalSurname.trim(),
          matricula: `${group.replace(/\s+/g, "")}-${listNumber}`,
          groupId: groupDoc.id,
        });
        if (!result.ok) {
          setNotice({ type: "error", text: result.error });
          return;
        }
        setStudents((current) => {
          const next = [...current, result.student].sort(compareStudentsByListNumber);
          setListNumber(nextListNumber(next, group));
          return next;
        });
        setGivenNames("");
        setPaternalSurname("");
        setMaternalSurname("");
        setNotice({ type: "success", text: "El alumno fue agregado correctamente a la lista." });
      });
    });
  };

  const deleteStudent = (student: Student) => {
    requestConfirmation({
      title: "Eliminar alumno",
      message: `Se eliminará a ${student.name} de ${student.group}, junto con sus registros de asistencia. ¿Deseas continuar?`,
      confirmLabel: "Sí, eliminar",
      tone: "danger",
    }, () => {
      setNotice(null);
      startTransition(async () => {
        const result = await deleteStudentAction(student.id);
        if (!result.ok) {
          setNotice({ type: "error", text: result.error });
          return;
        }
        setStudents((current) => current.filter((item) => item.id !== student.id));
        onDeleteRecords(student.id);
        setNotice({ type: "success", text: `${student.name} fue eliminado de la lista.` });
        router.refresh();
      });
    });
  };

  return (
    <>
      {confirmationDialog}
      <div className="page-intro">
        <div><p className="eyebrow">PADRÓN DEL GRUPO</p><h1>Agregar alumno a la lista</h1><p>Consulta los alumnos del grupo seleccionado y da de alta nuevos integrantes.</p></div>
        <div className="student-counter"><span>{visibleStudents.length}</span><div><small>ALUMNOS DE {group || "SIN GRUPO"}</small><strong>{availableGroups.length} {availableGroups.length === 1 ? "grupo asignado" : "grupos asignados"}</strong></div></div>
      </div>
      {availableGroups.length === 0 ? (
        <section className="panel empty-state"><Icon name="users" /><strong>No tienes grupos asignados</strong><p>Solicita al directivo que asigne un grupo antes de agregar alumnos.</p></section>
      ) : (
        <div className="management-layout">
          <form className="panel management-form" onSubmit={addStudent}>
            <div className="panel-head"><div><p className="eyebrow">NUEVO ALUMNO</p><h2>Datos del alumno</h2></div><span className="form-icon"><Icon name="plus" /></span></div>
            <div className="management-fields">
              {notice && <div className={`notice notice-${notice.type}`}><Icon name={notice.type === "success" ? "check" : "alert"} /><div><strong>{notice.type === "success" ? "Lista actualizada" : "No se pudo agregar"}</strong><p>{notice.text}</p></div></div>}
              <label>Apellido paterno<input required value={paternalSurname} onChange={(event) => { setPaternalSurname(event.target.value); setNotice(null); }} placeholder="Ej. Hernández" /></label>
              <label>Apellido materno<input required value={maternalSurname} onChange={(event) => { setMaternalSurname(event.target.value); setNotice(null); }} placeholder="Ej. López" /></label>
              <label>Nombre(s)<input required value={givenNames} onChange={(event) => { setGivenNames(event.target.value); setNotice(null); }} placeholder="Ej. Sofía" /></label>
              <label>Grupo<select required value={group} onChange={(event) => { setGroup(event.target.value); setListNumber(nextListNumber(students, event.target.value)); }}>{availableGroups.map((option) => <option key={option}>{option}</option>)}</select></label>
              <label>Número de lista<input required type="number" min="1" max="999" value={listNumber} onChange={(event) => setListNumber(Number(event.target.value))} /></label>
              <button className="primary-button" type="submit" disabled={isPending}><Icon name="plus" size={18} /> {isPending ? "Guardando…" : "Agregar alumno"}</button>
            </div>
          </form>
          <section className="panel management-list">
            <div className="panel-head management-list-head">
              <div><p className="eyebrow">LISTA ACTUAL</p><h2>Alumnos de {group}</h2></div>
              <div className="management-list-filters">
                <select value={group} onChange={(event) => { setGroup(event.target.value); setListNumber(nextListNumber(students, event.target.value)); setSearch(""); }} aria-label="Filtrar alumnos por grupo">
                  {availableGroups.map((option) => <option key={option}>{option}</option>)}
                </select>
                <div className="visitor-search"><Icon name="search" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar en este grupo…" /></div>
              </div>
            </div>
            <div className="student-management-table">
              <div className="student-management-head"><span>N.º</span><span>Alumno</span><span>Grupo</span><span>Acciones</span></div>
              {visibleStudents.map((student) => <div className="student-management-row" key={student.id}>
                <StudentListNumberEditor student={student} students={students} setStudents={setStudents} />
                <div><span className="avatar">{student.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><strong>{student.name}</strong></div>
                <span className="group-badge">{student.group}</span>
                {canDelete && <button className="delete-button" onClick={() => deleteStudent(student)} disabled={isPending} aria-label={`Eliminar a ${student.name}`}><Icon name="trash" size={16} /> Eliminar</button>}
              </div>)}
              {visibleStudents.length === 0 && <div className="empty-state"><Icon name="search" /><strong>Sin alumnos</strong><p>No hay alumnos que coincidan con la búsqueda.</p></div>}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function GroupStudentManagement({
  groups,
  students,
  setGroups,
  setStudents,
  groupTeacherMap,
  onDeleteRecords,
  canDelete,
}: {
  groups: GroupRef[];
  students: Student[];
  setGroups: React.Dispatch<React.SetStateAction<GroupRef[]>>;
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
  groupTeacherMap: Record<string, string>;
  onDeleteRecords: (studentId: string) => void;
  canDelete: boolean;
}) {
  const router = useRouter();
  const teacherNameForGroup = (groupId: string) => groupTeacherMap[groupId] || "Sin docente asignado";
  const [isPending, startTransition] = useTransition();
  const groupNames = groups.map((item) => item.name);
  const [newGroupGrade, setNewGroupGrade] = useState("1");
  const [newGroupLetter, setNewGroupLetter] = useState("A");
  const [givenNames, setGivenNames] = useState("");
  const [paternalSurname, setPaternalSurname] = useState("");
  const [maternalSurname, setMaternalSurname] = useState("");
  const [group, setGroup] = useState(groups[0]?.id || "");
  const [listNumber, setListNumber] = useState(nextListNumber(students, groups[0]?.name || ""));
  const [groupFilter, setGroupFilter] = useState("");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editGivenNames, setEditGivenNames] = useState("");
  const [editPaternalSurname, setEditPaternalSurname] = useState("");
  const [editMaternalSurname, setEditMaternalSurname] = useState("");
  const [editGroupId, setEditGroupId] = useState("");
  const { requestConfirmation, confirmationDialog } = useConfirmation();
  const numberedStudents = sortAndNumberStudents(students);
  const visibleStudents = numberedStudents.filter((student) =>
    (!groupFilter || student.group === groupFilter) &&
    `${student.name} ${student.listNumber}`.toLowerCase().includes(search.toLowerCase()),
  );

  const addGroup = (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = `${newGroupGrade}° ${newGroupLetter}`;
    if (groups.some((item) => item.name.toLowerCase() === normalized.toLowerCase())) {
      setNotice({ type: "error", text: "Ese grupo ya se encuentra registrado." });
      return;
    }
    requestConfirmation({
      title: "Crear grupo",
      message: `Se va a crear el grupo ${normalized}. ¿Deseas continuar?`,
      confirmLabel: "Sí, crear grupo",
    }, () => {
      setNotice(null);
      startTransition(async () => {
        const result = await createGroupAction({
          name: normalized,
          grade: Number(newGroupGrade),
        });
        if (!result.ok) {
          setNotice({ type: "error", text: result.error });
          return;
        }
        setGroups((current) => [...current, { id: result.group.id, name: result.group.name }].sort((a, b) => a.name.localeCompare(b.name)));
        setGroup(result.group.id);
        setListNumber(1);
        setNotice({ type: "success", text: `${result.group.name} fue creado y ya puede recibir alumnos o asignarse a un docente.` });
      });
    });
  };

  const addStudent = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValidListNumber(listNumber)) {
      setNotice({ type: "error", text: "El número de lista debe ser un entero entre 1 y 999." });
      return;
    }
    const groupDoc = groups.find((item) => item.id === group);
    if (!groupDoc) {
      setNotice({ type: "error", text: "El grupo seleccionado no existe en el servidor." });
      return;
    }
    if (!isListNumberAvailable(students, groupDoc.name, listNumber)) {
      setNotice({ type: "error", text: `El número ${listNumber} ya está asignado en ${groupDoc.name}.` });
      return;
    }
    const studentName = formatStudentName(paternalSurname, maternalSurname, givenNames);
    requestConfirmation({
      title: "Agregar alumno",
      message: `Se va a agregar a ${studentName} con el número ${listNumber} al grupo ${groupDoc.name}. ¿Deseas continuar?`,
      confirmLabel: "Sí, agregar alumno",
    }, () => {
      setNotice(null);
      startTransition(async () => {
        const result = await createStudentAction({
          firstName: givenNames.trim(),
          paternalSurname: paternalSurname.trim(),
          maternalSurname: maternalSurname.trim(),
          matricula: `${groupDoc.name.replace(/\s+/g, "")}-${listNumber}`,
          groupId: groupDoc.id,
        });
        if (!result.ok) {
          setNotice({ type: "error", text: result.error });
          return;
        }
        setStudents((current) => {
          const next = [...current, result.student].sort(compareStudentsByListNumber);
          setListNumber(nextListNumber(next, groupDoc.name));
          return next;
        });
        setGivenNames("");
        setPaternalSurname("");
        setMaternalSurname("");
        setNotice({ type: "success", text: `El alumno fue agregado correctamente a ${groupDoc.name}.` });
      });
    });
  };

  const deleteStudent = (student: Student) => {
    requestConfirmation({
      title: "Eliminar alumno",
      message: `Se eliminará a ${student.name} del grupo ${student.group}, junto con sus registros de asistencia. ¿Deseas continuar?`,
      confirmLabel: "Sí, eliminar",
      tone: "danger",
    }, () => {
      setNotice(null);
      startTransition(async () => {
        const result = await deleteStudentAction(student.id);
        if (!result.ok) {
          setNotice({ type: "error", text: result.error });
          return;
        }
        setStudents((current) => current.filter((item) => item.id !== student.id));
        onDeleteRecords(student.id);
        setNotice({ type: "success", text: `${student.name} fue eliminado del grupo ${student.group}.` });
        router.refresh();
      });
    });
  };

  const openEditStudent = (student: Student) => {
    const parts = getStudentNameParts(student);
    setEditingStudent(student);
    setEditGivenNames(parts.givenNames);
    setEditPaternalSurname(parts.paternalSurname);
    setEditMaternalSurname(parts.maternalSurname);
    setEditGroupId(groups.find((group) => group.name === student.group)?.id || "");
    setNotice(null);
  };

  const closeEditStudent = () => {
    setEditingStudent(null);
    setEditGivenNames("");
    setEditPaternalSurname("");
    setEditMaternalSurname("");
    setEditGroupId("");
  };

  const saveEditStudent = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingStudent) return;
    const student = editingStudent;
    const nextGivenNames = editGivenNames.trim();
    const nextPaternalSurname = editPaternalSurname.trim();
    const nextMaternalSurname = editMaternalSurname.trim();
    if (!nextGivenNames || !nextPaternalSurname) {
      setNotice({ type: "error", text: "El nombre y el apellido paterno son obligatorios." });
      return;
    }
    const nextGroup = groups.find((group) => group.id === editGroupId);
    if (!nextGroup) {
      setNotice({ type: "error", text: "Selecciona un grupo válido." });
      return;
    }
    const previousParts = getStudentNameParts(student);
    const previousName = formatStudentName(previousParts.paternalSurname, previousParts.maternalSurname, previousParts.givenNames);
    const nextName = formatStudentName(nextPaternalSurname, nextMaternalSurname, nextGivenNames);
    const groupChanged = nextGroup.name !== student.group;
    const listNumber = student.listNumber;
    const previousMatricula = `${student.group.replace(/\s+/g, "")}-${listNumber}`;
    const nextMatricula = `${nextGroup.name.replace(/\s+/g, "")}-${listNumber}`;
    const nameChanged = nextName !== previousName;
    if (!nameChanged && !groupChanged) {
      setNotice({ type: "error", text: "No hay cambios para guardar." });
      return;
    }

    const applyChanges = () => {
      setNotice(null);
      startTransition(async () => {
        const result = await updateStudentAction(student.id, {
          firstName: nextGivenNames,
          paternalSurname: nextPaternalSurname,
          maternalSurname: nextMaternalSurname,
          groupId: nextGroup.id,
        });
        if (!result.ok) {
          setNotice({ type: "error", text: result.error });
          return;
        }
        setStudents((current) => current
          .map((item) => item.id === student.id ? result.student : item)
          .sort(compareStudentsByListNumber));
        closeEditStudent();
        setNotice({ type: "success", text: `${result.student.name} fue actualizado correctamente.` });
        router.refresh();
      });
    };

    const summary = [
      nameChanged ? `Nombre: “${previousName}” → “${nextName}”` : null,
      groupChanged ? `Grupo: ${student.group} → ${nextGroup.name}` : null,
    ].filter(Boolean).join("\n");

    if (groupChanged) {
      requestConfirmation({
        title: "Cambiar de grupo",
        message: `${student.name} pasará de ${student.group} a ${nextGroup.name}, y su matrícula cambiará de ${previousMatricula} a ${nextMatricula}. ¿Deseas continuar?`,
        confirmLabel: "Sí, mover de grupo",
        tone: "danger",
      }, () => {
        requestConfirmation({
          title: "Guardar cambios del alumno",
          message: summary,
          confirmLabel: "Sí, guardar cambios",
        }, applyChanges);
      });
      return;
    }

    requestConfirmation({
      title: "Guardar cambios del alumno",
      message: summary,
      confirmLabel: "Sí, guardar cambios",
    }, applyChanges);
  };

  return (
    <>
      {confirmationDialog}
      <div className="page-intro">
        <div><p className="eyebrow">CONTROL ESCOLAR</p><h1>Grupos y alumnos</h1><p>Crea grupos nuevos y registra a los alumnos que formarán parte de cada uno.</p></div>
        <div className="student-counter"><span>{groups.length}</span><div><small>GRUPOS REGISTRADOS</small><strong>{students.length} alumnos en total</strong></div></div>
      </div>
      {notice && <div className={`notice notice-${notice.type} catalog-notice`}><Icon name={notice.type === "success" ? "check" : "alert"} /><div><strong>{notice.type === "success" ? "Catálogo actualizado" : "Revisa la información"}</strong><p>{notice.text}</p></div></div>}
      {editingStudent && (
        <div className="catalog-edit-backdrop" role="presentation" onMouseDown={() => !isPending && closeEditStudent()}>
          <form className="panel management-form catalog-edit-form" onSubmit={saveEditStudent} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="catalog-edit-title">
            <div className="panel-head"><div><p className="eyebrow">EDITAR ALUMNO</p><h2 id="catalog-edit-title">{editingStudent.name}</h2></div><button type="button" className="delete-button" onClick={closeEditStudent} disabled={isPending} aria-label="Cerrar edición"><Icon name="close" size={16} /></button></div>
            <div className="management-fields catalog-student-fields">
              <label>Apellido paterno<input required value={editPaternalSurname} onChange={(event) => setEditPaternalSurname(event.target.value)} /></label>
              <label>Apellido materno<input value={editMaternalSurname} onChange={(event) => setEditMaternalSurname(event.target.value)} /></label>
              <label>Nombre(s)<input required value={editGivenNames} onChange={(event) => setEditGivenNames(event.target.value)} /></label>
              <label>Grupo<select required value={editGroupId} onChange={(event) => setEditGroupId(event.target.value)}>{groups.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
              <button className="primary-button" type="submit" disabled={isPending}><Icon name="check" size={18} /> {isPending ? "Guardando…" : "Guardar cambios"}</button>
            </div>
          </form>
        </div>
      )}
      <div className="catalog-forms">
        <form className="panel management-form" onSubmit={addGroup}>
          <div className="panel-head"><div><p className="eyebrow">NUEVO GRUPO</p><h2>Crear grupo</h2></div><span className="form-icon"><Icon name="users" /></span></div>
          <div className="management-fields">
            <div className="group-name-fields">
              <label>Grado<select required value={newGroupGrade} onChange={(event) => { setNewGroupGrade(event.target.value); setNotice(null); }}>{schoolGrades.map((grade) => <option key={grade} value={grade}>{grade}°</option>)}</select></label>
              <label>Grupo<select required value={newGroupLetter} onChange={(event) => { setNewGroupLetter(event.target.value); setNotice(null); }}>{groupLetters.map((letter) => <option key={letter} value={letter}>{letter}</option>)}</select></label>
            </div>
            <p className="group-name-preview">Se creará el grupo <strong>{newGroupGrade}° {newGroupLetter}</strong></p>
            <button className="primary-button" type="submit" disabled={groups.some((item) => item.name.toLowerCase() === `${newGroupGrade}° ${newGroupLetter}`.toLowerCase())}><Icon name="plus" size={18} /> Agregar grupo</button>
          </div>
        </form>
        <form className="panel management-form" onSubmit={addStudent}>
          <div className="panel-head"><div><p className="eyebrow">NUEVO ALUMNO</p><h2>Agregar a un grupo</h2></div><span className="form-icon"><Icon name="plus" /></span></div>
          <div className="management-fields catalog-student-fields">
            <label>Apellido paterno<input required value={paternalSurname} onChange={(event) => { setPaternalSurname(event.target.value); setNotice(null); }} placeholder="Ej. Hernández" /></label>
            <label>Apellido materno<input required value={maternalSurname} onChange={(event) => { setMaternalSurname(event.target.value); setNotice(null); }} placeholder="Ej. López" /></label>
            <label>Nombre(s)<input required value={givenNames} onChange={(event) => { setGivenNames(event.target.value); setNotice(null); }} placeholder="Ej. Sofía" /></label>
            <label>Grupo<select required value={group} onChange={(event) => { setGroup(event.target.value); const nextGroup = groups.find((item) => item.id === event.target.value); setListNumber(nextListNumber(students, nextGroup?.name || "")); }}>{groups.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
            <label>Número de lista<input required type="number" min="1" max="999" value={listNumber} onChange={(event) => setListNumber(Number(event.target.value))} /></label>
            <button className="primary-button" type="submit" disabled={!groups.length || isPending}><Icon name="plus" size={18} /> {isPending ? "Guardando…" : "Agregar alumno"}</button>
          </div>
        </form>
      </div>
      <section className="panel management-list catalog-list">
        <div className="panel-head catalog-list-head">
          <div><p className="eyebrow">PADRÓN GENERAL</p><h2>Alumnos por grupo</h2></div>
          <div className="catalog-filters">
            <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}><option value="">Todos los grupos</option>{groupNames.map((option) => <option key={option}>{option}</option>)}</select>
            <div className="visitor-search"><Icon name="search" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar alumno…" /></div>
          </div>
        </div>
        <div className="student-management-table">
          <div className="student-management-head"><span>N.º</span><span>Alumno</span><span>Grupo</span><span>Docente asignado</span><span>Acciones</span></div>
          {visibleStudents.map((student) => <div className="student-management-row" key={student.id}>
            <StudentListNumberEditor student={student} students={students} setStudents={setStudents} />
            <div><span className="avatar">{student.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><strong>{student.name}</strong></div>
            <span className="group-badge">{student.group}</span>
            <span className="teacher-badge">{teacherNameForGroup(groups.find((group) => group.name === student.group)?.id ?? "")}</span>
            <div className="student-row-actions">
              <button type="button" className="secondary-button" onClick={() => openEditStudent(student)} disabled={isPending} aria-label={`Editar a ${student.name}`}><Icon name="plus" size={16} /> Editar</button>
              {canDelete && <button type="button" className="delete-button" onClick={() => deleteStudent(student)} disabled={isPending} aria-label={`Eliminar a ${student.name}`}><Icon name="trash" size={16} /> Eliminar</button>}
            </div>
          </div>)}
          {visibleStudents.length === 0 && <div className="empty-state"><Icon name="search" /><strong>Sin alumnos</strong><p>No hay alumnos que coincidan con los filtros seleccionados.</p></div>}
        </div>
      </section>
    </>
  );
}

function UserManagement({
  users,
  setUsers,
}: {
  users: AppUserSummary[];
  setUsers: React.Dispatch<React.SetStateAction<AppUserSummary[]>>;
}) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("Docente");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [resetUser, setResetUser] = useState<AppUserSummary | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetPending, setResetPending] = useState(false);
  const [resetNotice, setResetNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const sortedUsers = users.slice().sort((a, b) => a.username.localeCompare(b.username, "es-MX", { sensitivity: "base" }));
  const { requestConfirmation, confirmationDialog } = useConfirmation();

  const createUser = async () => {
    setPending(true);
    setNotice(null);
    const result = await createUserAction({ name, username, password, role });
    setPending(false);
    if (!result.ok) {
      setNotice({ type: "error", text: result.error });
      return;
    }
    setUsers((current) => [...current, result.user]);
    setName("");
    setUsername("");
    setPassword("");
    setRole("Docente");
    setNotice({ type: "success", text: `La cuenta ${result.user.username} fue creada con el rol ${result.user.role}.` });
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    requestConfirmation({
      title: "Crear usuario",
      message: `Se va a crear la cuenta @${username.trim().toLowerCase()} para ${name.trim()} con el rol ${role}. ¿Deseas continuar?`,
      confirmLabel: "Sí, crear usuario",
    }, createUser);
  };

  const resetPassword = async () => {
    if (!resetUser) return;
    setResetPending(true);
    setResetNotice(null);
    const result = await resetUserPasswordAction({ userId: resetUser.id, password: newPassword });
    setResetPending(false);
    if (!result.ok) {
      setResetNotice({ type: "error", text: result.error });
      return;
    }
    setNewPassword("");
    setConfirmPassword("");
    setResetNotice({ type: "success", text: `La contraseña de @${resetUser.username} fue restablecida correctamente.` });
  };

  const submitPasswordReset = (event: React.FormEvent) => {
    event.preventDefault();
    if (!resetUser) return;
    if (newPassword !== confirmPassword) {
      setResetNotice({ type: "error", text: "Las contraseñas no coinciden." });
      return;
    }
    requestConfirmation({
      title: "Restablecer contraseña",
      message: `Se reemplazará la contraseña de @${resetUser.username} y se cerrarán sus sesiones activas. ¿Deseas continuar?`,
      confirmLabel: "Sí, restablecer",
      tone: "danger",
    }, resetPassword);
  };

  const selectPasswordReset = (user: AppUserSummary) => {
    setResetUser(user);
    setNewPassword("");
    setConfirmPassword("");
    setResetNotice(null);
  };

  return (
    <>
      {confirmationDialog}
      <div className="page-intro">
        <div><p className="eyebrow">SEGURIDAD DEL SISTEMA</p><h1>Usuarios y accesos</h1><p>Asigna credenciales y define el nivel de acceso de cada integrante del personal.</p></div>
        <div className="student-counter"><span>{users.length}</span><div><small>CUENTAS ACTIVAS</small><strong>Acceso por usuario y contraseña</strong></div></div>
      </div>
      <div className="management-layout user-management-layout">
        <form className="panel management-form" onSubmit={submit}>
          <div className="panel-head"><div><p className="eyebrow">NUEVO USUARIO</p><h2>Datos de acceso</h2></div><span className="form-icon"><Icon name="lock" /></span></div>
          <div className="management-fields">
            {notice && <div className={`notice notice-${notice.type}`}><Icon name={notice.type === "success" ? "check" : "alert"} /><div><strong>{notice.type === "success" ? "Cuenta creada" : "No se pudo crear"}</strong><p>{notice.text}</p></div></div>}
            <label>Nombre completo<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre y apellidos" /></label>
            <label>Nombre de usuario<input required minLength={4} maxLength={30} value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} placeholder="Ej. docente.primero" autoComplete="off" /></label>
            <label>Contraseña<input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo 8 caracteres" autoComplete="new-password" /></label>
            <label>Rol<select required value={role} onChange={(event) => setRole(event.target.value as Role)}><option>Directivo</option><option>Docente</option><option>Vigilante de Acceso</option></select></label>
            <button className="primary-button" type="submit" disabled={pending}><Icon name="plus" size={18} /> {pending ? "Creando cuenta…" : "Crear usuario"}</button>
          </div>
        </form>
        <section className="panel management-list user-list">
          <div className="panel-head"><div><p className="eyebrow">CUENTAS REGISTRADAS</p><h2>Personal con acceso</h2></div><span className="security-note"><Icon name="lock" size={15} /> Contraseñas protegidas</span></div>
          <div className="user-access-table">
            <div className="user-access-head"><span>Usuario</span><span>Rol asignado</span><span>Recuperación</span></div>
            {sortedUsers.map((user) => (
              <div className="user-access-row" key={user.id}>
                <div><span className="avatar">{user.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><span><strong>{user.name}</strong><small>@{user.username}</small></span></div>
                <span className={`role-badge role-${user.role.toLowerCase().replaceAll(" ", "-")}`}>{user.role}</span>
                <button className="reset-password-button" type="button" onClick={() => selectPasswordReset(user)}><Icon name="lock" size={15} /> Restablecer</button>
              </div>
            ))}
          </div>
          {resetUser && (
            <form className="password-reset-box" onSubmit={submitPasswordReset}>
              <div className="password-reset-head">
                <div><small>RESTABLECER CONTRASEÑA</small><strong>{resetUser.name}</strong><span>@{resetUser.username}</span></div>
                <button type="button" onClick={() => setResetUser(null)} aria-label="Cerrar"><Icon name="close" size={16} /></button>
              </div>
              {resetNotice && <div className={`notice notice-${resetNotice.type}`}><Icon name={resetNotice.type === "success" ? "check" : "alert"} /><div><strong>{resetNotice.type === "success" ? "Contraseña actualizada" : "Revisa la información"}</strong><p>{resetNotice.text}</p></div></div>}
              <div className="password-reset-fields">
                <label>Nueva contraseña<input required minLength={8} type="password" value={newPassword} onChange={(event) => { setNewPassword(event.target.value); setResetNotice(null); }} placeholder="Mínimo 8 caracteres" autoComplete="new-password" /></label>
                <label>Confirmar contraseña<input required minLength={8} type="password" value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setResetNotice(null); }} placeholder="Repite la contraseña" autoComplete="new-password" /></label>
                <button className="primary-button" type="submit" disabled={resetPending}><Icon name="lock" size={16} /> {resetPending ? "Actualizando…" : "Guardar nueva contraseña"}</button>
              </div>
            </form>
          )}
        </section>
      </div>
    </>
  );
}

function TeacherManagement({
  teachers,
  setTeachers,
  groups,
  assignments,
  setAssignments,
  onDeleteTeacher,
  teacherIds,
  users,
  onAssignTeacher,
}: {
  teachers: TeacherProfile[];
  setTeachers: React.Dispatch<React.SetStateAction<TeacherProfile[]>>;
  groups: GroupRef[];
  assignments: Record<string, string[]>;
  setAssignments: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  onDeleteTeacher: (teacher: string) => void;
  teacherIds: Record<string, string>;
  users: AppUserSummary[];
  onAssignTeacher: (groupId: string, teacherId: string | null) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [mode, setMode] = useState<"register" | "manage">("register");
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [assignPending, setAssignPending] = useState(false);
  const [dates, setDates] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const { requestConfirmation, confirmationDialog } = useConfirmation();
  const activeTeachers = teachers.filter((teacher) => teacher.status === "Activo").length;
  const docenteUsers = users.filter((user) => user.role === "Docente");
  const groupsById = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const group of groups) map[group.id] = group.name;
    return map;
  }, [groups]);
  const assignedGroupNames = useMemo(() => new Set(Object.values(assignments).flat()), [assignments]);

  const assignTeacher = async () => {
    if (!selectedTeacherId || !selectedGroupId) return;
    setAssignPending(true);
    setNotice(null);
    const result = await onAssignTeacher(selectedGroupId, selectedTeacherId);
    setAssignPending(false);
    if (!result.ok) {
      setNotice({ type: "error", text: result.error ?? "No fue posible asignar el docente." });
      return;
    }
    const teacherName = docenteUsers.find((user) => user.id === selectedTeacherId)?.name ?? "";
    const groupName = groupsById[selectedGroupId] ?? "";
    setSelectedTeacherId("");
    setSelectedGroupId("");
    setNotice({ type: "success", text: `${teacherName} fue asignado a ${groupName}.` });
  };

  const unassignGroup = (teacherName: string, groupName: string) => {
    const groupDoc = groups.find((group) => group.name === groupName);
    if (!groupDoc) {
      setNotice({ type: "error", text: "No se encontró el grupo en el servidor." });
      return;
    }
    requestConfirmation({
      title: "Quitar grupo asignado",
      message: `Se eliminará la asignación del grupo ${groupName} para ${teacherName}. ¿Deseas continuar?`,
      confirmLabel: "Sí, quitar grupo",
      tone: "danger",
    }, async () => {
      const result = await onAssignTeacher(groupDoc.id, null);
      if (!result.ok) {
        setNotice({ type: "error", text: result.error ?? "No fue posible quitar el grupo." });
        return;
      }
      setNotice({ type: "success", text: `${groupName} fue eliminado de las asignaciones de ${teacherName}.` });
    });
  };

  const toggleStatus = (teacher: TeacherProfile) => {
    const nextStatus = teacher.status === "Activo" ? "Baja temporal" : "Activo";
    const teacherId = teacherIds[teacher.name];
    if (!teacherId) {
      setNotice({ type: "error", text: "No se encontró la cuenta del docente en el servidor." });
      return;
    }
    requestConfirmation({
      title: teacher.status === "Activo" ? "Dar de baja temporal" : "Reactivar docente",
      message: `${teacher.name} cambiará al estado “${nextStatus}”. ¿Deseas continuar?`,
      confirmLabel: teacher.status === "Activo" ? "Sí, dar de baja" : "Sí, reactivar",
      tone: teacher.status === "Activo" ? "danger" : "default",
    }, () => {
      startTransition(async () => {
        const result = await updateTeacherEmploymentStatusAction(teacherId, nextStatus);
        if (!result.ok) {
          setNotice({ type: "error", text: result.error });
          return;
        }
        setTeachers((current) => current.map((item) => item.name === teacher.name ? { ...item, status: nextStatus } : item));
        setNotice({ type: "success", text: `${teacher.name} ahora tiene estado: ${nextStatus}.` });
      });
    });
  };

  const justifyDate = (teacher: TeacherProfile) => {
    const date = dates[teacher.name];
    if (!date) {
      setNotice({ type: "error", text: "Selecciona una fecha para registrar la justificación." });
      return;
    }
    if (teacher.justifiedDates.includes(date)) {
      setNotice({ type: "error", text: "Ese día ya se encuentra justificado." });
      return;
    }
    const teacherId = teacherIds[teacher.name];
    if (!teacherId) {
      setNotice({ type: "error", text: "No se encontró la cuenta del docente en el servidor." });
      return;
    }
    startTransition(async () => {
      const result = await createTeacherJustificationAction({ teacherId, date });
      if (!result.ok) {
        setNotice({ type: "error", text: result.error });
        return;
      }
      setTeachers((current) => current.map((item) => item.name === teacher.name ? { ...item, justifiedDates: [...item.justifiedDates, date].sort().reverse() } : item));
      setDates((current) => ({ ...current, [teacher.name]: "" }));
      setNotice({ type: "success", text: `Se justificó el ${formatDate(date)} para ${teacher.name}.` });
    });
  };

  const removeJustification = (teacherName: string, date: string) => {
    const teacherId = teacherIds[teacherName];
    if (!teacherId) {
      setNotice({ type: "error", text: "No se encontró la cuenta del docente en el servidor." });
      return;
    }
    requestConfirmation({
      title: "Eliminar justificación",
      message: `Se eliminará la justificación del ${formatDate(date)} para ${teacherName}. ¿Deseas continuar?`,
      confirmLabel: "Sí, eliminar",
      tone: "danger",
    }, () => {
      startTransition(async () => {
        const result = await deleteTeacherJustificationAction(teacherId, date);
        if (!result.ok) {
          setNotice({ type: "error", text: result.error });
          return;
        }
        setTeachers((current) => current.map((teacher) => teacher.name === teacherName ? { ...teacher, justifiedDates: teacher.justifiedDates.filter((item) => item !== date) } : teacher));
        setNotice({ type: "success", text: `La justificación del ${formatDate(date)} fue eliminada.` });
      });
    });
  };

  const deleteTeacher = (teacherName: string) => {
    const teacherId = teacherIds[teacherName];
    if (!teacherId) {
      setNotice({ type: "error", text: "No se encontró la cuenta del docente en el servidor." });
      return;
    }
    requestConfirmation({
      title: "Eliminar docente definitivamente",
      message: `Se eliminará a ${teacherName} y se liberarán sus grupos asignados. Solo es posible si no tiene registros de asistencia, justificantes ni accesos asociados; en ese caso usa “Baja temporal”. Esta acción no se puede deshacer.`,
      confirmLabel: "Sí, eliminar definitivamente",
      tone: "danger",
    }, () => {
      startTransition(async () => {
        const result = await deleteTeacherAction(teacherId);
        if (!result.ok) {
          setNotice({ type: "error", text: result.error });
          return;
        }
        setTeachers((current) => current.filter((teacher) => teacher.name !== teacherName));
        onDeleteTeacher(teacherName);
        setNotice({ type: "success", text: `${teacherName} fue eliminado definitivamente del sistema.` });
      });
    });
  };

  return (
    <>
      {confirmationDialog}
      <div className="page-intro">
        <div><p className="eyebrow">ADMINISTRACIÓN DE PERSONAL</p><h1>Gestión de docentes</h1><p>Registra personal, controla bajas temporales y justifica ausencias por día.</p></div>
        <div className="student-counter"><span>{activeTeachers}</span><div><small>DOCENTES ACTIVOS</small><strong>{teachers.length} registrados en total</strong></div></div>
      </div>
      <div className="teacher-management-tabs" role="tablist" aria-label="Opciones de gestión docente">
        <button className={mode === "register" ? "active" : ""} type="button" role="tab" aria-selected={mode === "register"} onClick={() => { setMode("register"); setNotice(null); }}>
          <span><Icon name="plus" /></span>
          <div><strong>Registrar docente nuevo</strong><small>Captura sus datos y asigna un grupo opcionalmente</small></div>
          <Icon name="chevron" size={18} />
        </button>
        <button className={mode === "manage" ? "active" : ""} type="button" role="tab" aria-selected={mode === "manage"} onClick={() => { setMode("manage"); setNotice(null); }}>
          <span><Icon name="users" /></span>
          <div><strong>Administrar docentes</strong><small>Consulta, reactiva, justifica o da de baja</small></div>
          <Icon name="chevron" size={18} />
        </button>
      </div>
      {notice && <div className={`notice notice-${notice.type} catalog-notice`}><Icon name={notice.type === "success" ? "check" : "alert"} /><div><strong>{notice.type === "success" ? "Personal actualizado" : "Revisa la información"}</strong><p>{notice.text}</p></div></div>}
      {mode === "register" && (
        <section className="panel teacher-register-card" role="tabpanel">
          <div className="panel-head"><div><p className="eyebrow">ASIGNAR DOCENTE</p><h2>Asignar docente a grupo</h2></div><span className="form-icon"><Icon name="badge" /></span></div>
          <p className="assignment-help">Selecciona un docente ya registrado en <strong>Usuarios y accesos</strong> y el grupo al que se asignará.</p>
          <div className="teacher-register-form">
            <div className="teacher-name-fields">
              <label>Docente
                <select required value={selectedTeacherId} onChange={(event) => { setSelectedTeacherId(event.target.value); setNotice(null); }}>
                  <option value="">Selecciona un docente</option>
                  {docenteUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                </select>
              </label>
              <label>Grupo
                <select required value={selectedGroupId} onChange={(event) => { setSelectedGroupId(event.target.value); setNotice(null); }}>
                  <option value="">Selecciona un grupo</option>
                  {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
              </label>
            </div>
            {docenteUsers.length === 0 && <p className="assignment-help">Todavía no hay docentes registrados. Crea su cuenta en <strong>Usuarios y accesos</strong> con el rol Docente.</p>}
            {groups.length === 0 && <p className="assignment-help">Todavía no hay grupos registrados. Créalos primero en <strong>Grupos y alumnos</strong>.</p>}
            <div className="teacher-register-actions">
              <button
                type="button"
                className="primary-button"
                disabled={assignPending}
                onClick={() => {
                  if (!selectedTeacherId || !selectedGroupId) {
                    setNotice({ type: "error", text: "Selecciona un docente y un grupo válidos." });
                    return;
                  }
                  assignTeacher();
                }}
              >
                <Icon name="plus" size={18} /> {assignPending ? "Asignando…" : "Asignar docente a grupo"}
              </button>
            </div>
          </div>
        </section>
      )}
      {mode === "manage" && <div className="teacher-management-grid" role="tabpanel">
        {teachers.map((teacher) => <section className="panel teacher-management-card" key={teacher.name}>
          <div className="teacher-management-head">
            <span className="large-avatar">{teacher.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>
            <div><p className="eyebrow">DOCENTE</p><h2>{teacher.name}</h2><span className={`staff-status ${teacher.status === "Activo" ? "active" : "inactive"}`}><i></i>{teacher.status}</span>{[...new Set(assignments[teacher.name] || [])].length > 0 && <small className="teacher-assignment-summary">{[...new Set(assignments[teacher.name] || [])].join(", ")}</small>}</div>
          </div>
          <div className="teacher-management-actions">
            <button className={teacher.status === "Activo" ? "temporary-button" : "restore-button"} onClick={() => toggleStatus(teacher)} disabled={isPending}><Icon name={teacher.status === "Activo" ? "clock" : "check"} size={17} /> {teacher.status === "Activo" ? "Dar de baja temporal" : "Reactivar docente"}</button>
            <button className="permanent-delete-button" onClick={() => deleteTeacher(teacher.name)} disabled={isPending}><Icon name="trash" size={17} /> Eliminar definitivamente</button>
          </div>
          {[...new Set(assignments[teacher.name] || [])].length > 0 && (
            <div className="assigned-groups">
              {[...new Set(assignments[teacher.name] || [])].map((group) => (
                <div className="assigned-group" key={group}>
                  <span><Icon name="users" size={17} /> {group}</span>
                  <button onClick={() => unassignGroup(teacher.name, group)} disabled={isPending} aria-label={`Quitar ${group} de ${teacher.name}`}><Icon name="close" size={15} /></button>
                </div>
              ))}
            </div>
          )}
          <div className="justification-box">
            <div><p className="eyebrow">JUSTIFICAR DÍA</p><span>La fecha aparecerá como justificada en asistencia.</span></div>
            <div className="justification-row"><input type="date" value={dates[teacher.name] || ""} onChange={(event) => setDates((current) => ({ ...current, [teacher.name]: event.target.value }))} /><button className="secondary-button" onClick={() => justifyDate(teacher)} disabled={isPending}><Icon name="calendar" size={16} /> Justificar</button></div>
            {teacher.justifiedDates.length > 0 && <div className="justified-dates">{teacher.justifiedDates.slice(0, 4).map((date) => <span key={date}>{formatDate(date)}<button onClick={() => removeJustification(teacher.name, date)} aria-label={`Eliminar justificación del ${formatDate(date)}`}><Icon name="close" size={12} /></button></span>)}</div>}
          </div>
        </section>)}
        {teachers.length === 0 && <section className="panel empty-state"><Icon name="users" /><strong>No hay docentes registrados</strong><p>Selecciona “Registrar docente nuevo” para comenzar.</p></section>}
      </div>}
    </>
  );
}

function TeacherGroupManagement({
  teachers,
  groups,
  assignments,
  setAssignments,
  teacherIds,
  users,
  onAssignTeacher,
}: {
  teachers: TeacherProfile[];
  groups: GroupRef[];
  assignments: Record<string, string[]>;
  setAssignments: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  teacherIds: Record<string, string>;
  users: AppUserSummary[];
  onAssignTeacher: (groupId: string, teacherId: string | null) => Promise<{ ok: boolean; error?: string }>;
}) {
  const allGroups = groups.map((group) => group.name).slice().sort();
  const [selectedGroups, setSelectedGroups] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const { requestConfirmation, confirmationDialog } = useConfirmation();
  const assignedCount = Object.values(assignments).reduce((total, groups) => total + groups.length, 0);
  const docenteUsers = users.filter((user) => user.role === "Docente");
  const resolveTeacherId = (teacherName: string) =>
    teacherIds[teacherName] || docenteUsers.find((user) => user.name === teacherName)?.id || "";

  const addGroup = (teacher: string) => {
    const group = selectedGroups[teacher] || allGroups.find((option) => !(assignments[teacher] || []).includes(option));
    if (!group) return;
    const groupId = groups.find((item) => item.name === group)?.id;
    const teacherId = resolveTeacherId(teacher);
    if (!groupId || !teacherId) {
      setError("No se encontró el grupo o el docente en el servidor.");
      return;
    }
    requestConfirmation({
      title: "Asignar grupo",
      message: `Se asignará el grupo ${group} a ${teacher}. ¿Deseas continuar?`,
      confirmLabel: "Sí, asignar",
    }, async () => {
      setPending(true);
      setError("");
      setNotice("");
      const result = await onAssignTeacher(groupId, teacherId);
      setPending(false);
      if (!result.ok) {
        setError(result.error ?? "No fue posible asignar el grupo.");
        return;
      }
      setSelectedGroups((current) => ({ ...current, [teacher]: "" }));
      setNotice(`${group} fue asignado a ${teacher}.`);
    });
  };

  const removeGroup = (teacher: string, group: string) => {
    const groupId = groups.find((item) => item.name === group)?.id;
    if (!groupId) {
      setError("No se encontró el grupo en el servidor.");
      return;
    }
    requestConfirmation({
      title: "Retirar grupo asignado",
      message: `Se eliminará la asignación del grupo ${group} para ${teacher}. ¿Deseas continuar?`,
      confirmLabel: "Sí, retirar grupo",
      tone: "danger",
    }, async () => {
      setPending(true);
      setError("");
      setNotice("");
      const result = await onAssignTeacher(groupId, null);
      setPending(false);
      if (!result.ok) {
        setError(result.error ?? "No fue posible retirar el grupo.");
        return;
      }
      setNotice(`${group} fue eliminado de las asignaciones de ${teacher}.`);
    });
  };

  return (
    <>
      {confirmationDialog}
      <div className="page-intro">
        <div><p className="eyebrow">ORGANIZACIÓN ACADÉMICA</p><h1>Agregar grupo a docente</h1><p>Asigna o elimina grupos para definir las listas disponibles de cada docente.</p></div>
        <div className="student-counter"><span>{assignedCount}</span><div><small>ASIGNACIONES ACTIVAS</small><strong>{teachers.length} docentes registrados</strong></div></div>
      </div>
      {notice && <div className="inline-notice assignment-notice"><Icon name="check" /> {notice}</div>}
      {error && <div className="notice notice-error catalog-notice"><Icon name="alert" /><div><strong>No se pudo actualizar</strong><p>{error}</p></div></div>}
      <div className="teacher-group-grid">
        {teachers.map((teacher) => {
          const teacherGroups = [...new Set(assignments[teacher.name] || [])];
          const unassignedGroups = allGroups.filter((group) => !teacherGroups.includes(group));
          return <section className="panel teacher-group-card" key={teacher.name}>
            <div className="teacher-group-identity">
              <span className="large-avatar">{teacher.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>
              <div><p className="eyebrow">DOCENTE</p><h2>{teacher.name}</h2><small>{teacher.status} · {teacherGroups.length} {teacherGroups.length === 1 ? "grupo asignado" : "grupos asignados"}</small></div>
            </div>
            <div className="assigned-groups">
              {teacherGroups.map((group) => <div className="assigned-group" key={group}><span><Icon name="users" size={17} /> {group}</span><button onClick={() => removeGroup(teacher.name, group)} aria-label={`Eliminar ${group} de ${teacher.name}`}><Icon name="close" size={15} /></button></div>)}
              {teacherGroups.length === 0 && <p>Este docente todavía no tiene grupos asignados.</p>}
            </div>
            <div className="group-add-row">
              <select value={selectedGroups[teacher.name] || ""} onChange={(event) => setSelectedGroups((current) => ({ ...current, [teacher.name]: event.target.value }))} disabled={unassignedGroups.length === 0}>
                <option value="">{unassignedGroups.length ? "Selecciona un grupo" : "Todos los grupos asignados"}</option>
                {unassignedGroups.map((group) => <option key={group}>{group}</option>)}
              </select>
              <button className="primary-button" onClick={() => addGroup(teacher.name)} disabled={unassignedGroups.length === 0 || pending}><Icon name="plus" size={17} /> {pending ? "Guardando…" : "Agregar"}</button>
            </div>
          </section>;
        })}
      </div>
    </>
  );
}

const SCHOOL_DIRECTOR = "MTRO. OSCAR HERRERA GAYTÁN";
const weekdayInitials = ["D", "L", "M", "M", "J", "V", "S"];

const getMonthSchoolDays = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return [];
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: lastDay }, (_, index) => {
    const date = new Date(Date.UTC(year, monthNumber - 1, index + 1));
    const weekDay = date.getUTCDay();
    return {
      date: `${month}-${String(index + 1).padStart(2, "0")}`,
      day: index + 1,
      initial: weekdayInitials[weekDay],
      weekEnd: weekDay === 5,
      schoolDay: weekDay !== 0 && weekDay !== 6,
    };
  }).filter((day) => day.schoolDay);
};

const formatOfficialMonth = (month: string) =>
  new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${month}-01T12:00:00Z`))
    .toUpperCase();

const OFFICIAL_SHEET_MIN_ROWS = 30;
const getOfficialSheetRows = (list: OfficialAttendanceList) =>
  Array.from(
    { length: Math.max(OFFICIAL_SHEET_MIN_ROWS, list.students.length) },
    (_, index) => list.students[index],
  );

async function generateOfficialAttendancePdf(list: OfficialAttendanceList) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const regularFont = await document.embedFont(StandardFonts.Helvetica);
  const boldFont = await document.embedFont(StandardFonts.HelveticaBold);
  const [institutionResponse, schoolResponse] = await Promise.all([
    fetch("/attendance-iebem.png"),
    fetch(schoolLogo.src),
  ]);
  if (!institutionResponse.ok || !schoolResponse.ok) {
    throw new Error("No fue posible cargar los logotipos institucionales.");
  }
  const [institutionLogo, schoolSeal] = await Promise.all([
    document.embedPng(await institutionResponse.arrayBuffer()),
    document.embedPng(await schoolResponse.arrayBuffer()),
  ]);
  const drawCentered = (text: string, y: number, size: number, bold = false) => {
    const font = bold ? boldFont : regularFont;
    page.drawText(text, {
      x: (612 - font.widthOfTextAtSize(text, size)) / 2,
      y,
      size,
      font,
      color: rgb(0.05, 0.05, 0.05),
    });
  };
  const fitText = (text: string, width: number, initialSize: number) => {
    let size = initialSize;
    while (size > 4.2 && regularFont.widthOfTextAtSize(text, size) > width) size -= 0.2;
    return size;
  };

  page.drawImage(institutionLogo, { x: 37, y: 708, width: 110, height: 45 });
  page.drawImage(schoolSeal, { x: 524, y: 704, width: 50, height: 55 });
  drawCentered("SECRETARÍA DE EDUCACIÓN PÚBLICA", 750, 8, true);
  drawCentered("SUBDIRECCIÓN DE EDUCACIÓN PRIMARIA", 739, 7);
  drawCentered('ESCUELA PRIMARIA "VICENTE SUÁREZ"', 728, 7, true);
  drawCentered("ZONA ESCOLAR: 069     SECTOR: 13", 717, 7);
  drawCentered("CLAVE: 17DPR0623B", 706, 7);
  drawCentered("CICLO ESCOLAR 2026 - 2027", 695, 7, true);

  const [grade = "", groupLetter = ""] = list.group.split(/\s+/);
  drawCentered(`GRADO: ${grade}     GRUPO: "${groupLetter}"`, 673, 8, true);
  drawCentered("LISTA DE ASISTENCIA", 655, 11, true);
  drawCentered(`MES: ${formatOfficialMonth(list.month)}`, 638, 8, true);

  const schoolDays = getMonthSchoolDays(list.month);
  const sheetRows = getOfficialSheetRows(list);
  const tableX = 36;
  const tableTop = 616;
  const tableWidth = 540;
  const numberWidth = 25;
  const nameWidth = 157;
  const dayWidth = (tableWidth - numberWidth - nameWidth) / Math.max(1, schoolDays.length);
  const headerRowHeight = 13;
  const headerHeight = headerRowHeight * 2;
  const rowHeight = Math.min(12, 335 / sheetRows.length);
  const tableBottom = tableTop - headerHeight - (sheetRows.length * rowHeight);

  page.drawRectangle({
    x: tableX,
    y: tableTop - headerHeight,
    width: tableWidth,
    height: headerHeight,
    color: rgb(0.95, 0.95, 0.95),
    borderColor: rgb(0.1, 0.1, 0.1),
    borderWidth: 0.7,
  });
  page.drawLine({ start: { x: tableX + numberWidth + nameWidth, y: tableTop - headerRowHeight }, end: { x: tableX + tableWidth, y: tableTop - headerRowHeight }, thickness: 0.5, color: rgb(0.1, 0.1, 0.1) });
  page.drawText("N.º", { x: tableX + 6, y: tableTop - 17, size: 6.2, font: boldFont });
  page.drawText("Nombre del alumno", { x: tableX + numberWidth + 5, y: tableTop - 17, size: 6.2, font: boldFont });

  const dayStartX = tableX + numberWidth + nameWidth;
  schoolDays.forEach((day, index) => {
    const cellX = dayStartX + (index * dayWidth);
    page.drawLine({ start: { x: cellX, y: tableTop }, end: { x: cellX, y: tableBottom }, thickness: index === 0 ? 0.7 : 0.35, color: rgb(0.1, 0.1, 0.1) });
    const initialWidth = boldFont.widthOfTextAtSize(day.initial, 5.5);
    const numberText = String(day.day);
    page.drawText(day.initial, { x: cellX + ((dayWidth - initialWidth) / 2), y: tableTop - 9, size: 5.5, font: boldFont });
    page.drawText(numberText, { x: cellX + ((dayWidth - boldFont.widthOfTextAtSize(numberText, 5.2)) / 2), y: tableTop - 22, size: 5.2, font: boldFont });
    if (day.weekEnd) {
      page.drawLine({ start: { x: cellX + dayWidth, y: tableTop }, end: { x: cellX + dayWidth, y: tableBottom }, thickness: 1.2, color: rgb(0.05, 0.05, 0.05) });
    }
  });
  page.drawLine({ start: { x: tableX + numberWidth, y: tableTop }, end: { x: tableX + numberWidth, y: tableBottom }, thickness: 0.7, color: rgb(0.1, 0.1, 0.1) });
  page.drawLine({ start: { x: dayStartX, y: tableTop }, end: { x: dayStartX, y: tableBottom }, thickness: 0.7, color: rgb(0.1, 0.1, 0.1) });

  sheetRows.forEach((student, rowIndex) => {
    const rowTop = tableTop - headerHeight - (rowIndex * rowHeight);
    const rowBottom = rowTop - rowHeight;
    page.drawLine({ start: { x: tableX, y: rowBottom }, end: { x: tableX + tableWidth, y: rowBottom }, thickness: 0.45, color: rgb(0.1, 0.1, 0.1) });
    const number = String(student?.listNumber ?? rowIndex + 1);
    page.drawText(number, { x: tableX + ((numberWidth - regularFont.widthOfTextAtSize(number, 6)) / 2), y: rowBottom + 3.2, size: 6, font: regularFont });
    if (!student) return;
    const nameSize = fitText(student.name, nameWidth - 7, 6.3);
    page.drawText(student.name, { x: tableX + numberWidth + 4, y: rowBottom + 3.2, size: nameSize, font: regularFont });
    schoolDays.forEach((day, dayIndex) => {
      const mark = list.marks[student.studentId]?.[day.date];
      if (!mark) return;
      const cellX = dayStartX + (dayIndex * dayWidth);
      page.drawText(mark, {
        x: cellX + ((dayWidth - boldFont.widthOfTextAtSize(mark, 7)) / 2),
        y: rowBottom + 2.8,
        size: 7,
        font: boldFont,
      });
    });
  });
  page.drawLine({ start: { x: tableX, y: tableTop }, end: { x: tableX, y: tableBottom }, thickness: 0.7, color: rgb(0.1, 0.1, 0.1) });
  page.drawLine({ start: { x: tableX + tableWidth, y: tableTop }, end: { x: tableX + tableWidth, y: tableBottom }, thickness: 0.7, color: rgb(0.1, 0.1, 0.1) });

  const footerTop = Math.max(80, tableBottom - 28);
  drawCentered("Vo. Bo.", footerTop, 6.5);
  page.drawText("MAESTRO DE GRUPO", { x: 112, y: footerTop - 15, size: 6.5, font: boldFont });
  page.drawText("DIRECTOR DE LA ESCUELA", { x: 401, y: footerTop - 15, size: 6.5, font: boldFont });
  page.drawLine({ start: { x: 72, y: footerTop - 39 }, end: { x: 260, y: footerTop - 39 }, thickness: 0.6, color: rgb(0.1, 0.1, 0.1) });
  page.drawLine({ start: { x: 354, y: footerTop - 39 }, end: { x: 550, y: footerTop - 39 }, thickness: 0.6, color: rgb(0.1, 0.1, 0.1) });
  const teacherLabel = `PROF. ${list.teacher.toUpperCase()}`;
  page.drawText(teacherLabel, { x: 166 - (boldFont.widthOfTextAtSize(teacherLabel, 6.2) / 2), y: footerTop - 49, size: 6.2, font: boldFont });
  page.drawText(SCHOOL_DIRECTOR, { x: 452 - (boldFont.widthOfTextAtSize(SCHOOL_DIRECTOR, 6.2) / 2), y: footerTop - 49, size: 6.2, font: boldFont });

  return document.save();
}

function OfficialListDownloadButton({ list, className = "primary-button" }: { list: OfficialAttendanceList; className?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const download = async () => {
    setPending(true);
    setError("");
    try {
      const output = await generateOfficialAttendancePdf(list);
      const pdfBytes = new Uint8Array(output.length);
      pdfBytes.set(output);
      const safeGroup = list.group.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
      downloadBlob(new Blob([pdfBytes], { type: "application/pdf" }), `lista-oficial-${safeGroup}-${list.month}.pdf`);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "No fue posible generar la lista oficial.");
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="official-download">
      <button className={className} type="button" onClick={download} disabled={pending}>
        <Icon name="download" size={17} /> {pending ? "Generando PDF…" : "Descargar lista oficializada"}
      </button>
      {error && <small role="alert">{error}</small>}
    </div>
  );
}

function OfficialAttendanceSheet({ list }: { list: OfficialAttendanceList }) {
  const schoolDays = getMonthSchoolDays(list.month);
  const sheetRows = getOfficialSheetRows(list);
  const [grade = "", groupLetter = ""] = list.group.split(/\s+/);
  return (
    <section className="official-attendance-sheet">
      <header className="official-sheet-header">
        <Image src="/attendance-iebem.png" alt="Instituto de la Educación Básica del Estado de Morelos" width={184} height={75} unoptimized />
        <div>
          <strong>SECRETARÍA DE EDUCACIÓN PÚBLICA</strong>
          <span>SUBDIRECCIÓN DE EDUCACIÓN PRIMARIA</span>
          <span>ESCUELA PRIMARIA “VICENTE SUÁREZ”</span>
          <span>ZONA ESCOLAR: 069 &nbsp;&nbsp; SECTOR: 13</span>
          <span>CLAVE: 17DPR0623B</span>
          <span>CICLO ESCOLAR 2026–2027</span>
        </div>
        <Image src={schoolLogo} alt="Escudo de la Escuela Primaria Vicente Suárez" width={76} height={76} unoptimized />
      </header>
      <div className="official-sheet-title">
        <p>GRADO: <strong>{grade}</strong> &nbsp;&nbsp; GRUPO: <strong>“{groupLetter}”</strong></p>
        <h2>LISTA DE ASISTENCIA</h2>
        <p>MES: <strong>{formatOfficialMonth(list.month)}</strong></p>
      </div>
      <div className="official-sheet-table-wrap">
        <table>
          <thead>
            <tr>
              <th rowSpan={2}>N.º</th>
              <th rowSpan={2}>Nombre del alumno</th>
              {schoolDays.map((day) => <th className={day.weekEnd ? "week-end" : ""} key={`initial-${day.date}`}>{day.initial}</th>)}
            </tr>
            <tr>
              {schoolDays.map((day) => <th className={day.weekEnd ? "week-end" : ""} key={day.date}>{day.day}</th>)}
            </tr>
          </thead>
          <tbody>
            {sheetRows.map((student, rowIndex) => (
              <tr key={student?.studentId || `empty-${rowIndex}`}>
                <td>{student?.listNumber ?? rowIndex + 1}</td>
                <td>{student?.name || ""}</td>
                {schoolDays.map((day) => <td className={day.weekEnd ? "week-end" : ""} key={day.date}>{student ? list.marks[student.studentId]?.[day.date] || "" : ""}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="official-sheet-footer">
        <span>Vo. Bo.</span>
        <div>
          <section><strong>MAESTRO DE GRUPO</strong><span className="signature-line"></span>{list.teacher ? <b>PROF. {list.teacher.toUpperCase()}</b> : null}</section>
          <section><strong>DIRECTOR DE LA ESCUELA</strong><span className="signature-line"></span><b>{SCHOOL_DIRECTOR}</b></section>
        </div>
      </footer>
    </section>
  );
}

function OfficialListsArchive({ officialLists, groups }: { officialLists: OfficialAttendanceList[]; groups: string[] }) {
  const availableGroups = [...new Set([...groups, ...officialLists.map((list) => list.group)])].sort();
  const [group, setGroup] = useState(availableGroups[0] || "");
  const groupLists = officialLists
    .filter((list) => list.group === group)
    .slice()
    .sort((a, b) => b.month.localeCompare(a.month));
  const [month, setMonth] = useState(groupLists[0]?.month || "");

  useEffect(() => {
    if (!availableGroups.includes(group)) setGroup(availableGroups[0] || "");
  }, [availableGroups, group]);
  useEffect(() => {
    if (!groupLists.some((list) => list.month === month)) setMonth(groupLists[0]?.month || "");
  }, [groupLists, month]);

  const selectedList = groupLists.find((list) => list.month === month);
  return (
    <>
      <div className="page-intro official-archive-intro">
        <div><p className="eyebrow">DOCUMENTACIÓN OFICIAL</p><h1>Listas oficiales</h1><p>Consulta por grupo las listas cerradas por el docente y listas para impresión.</p></div>
        {selectedList && <OfficialListDownloadButton list={selectedList} />}
      </div>
      <section className="panel official-list-controls">
        <label>Grupo<select value={group} onChange={(event) => setGroup(event.target.value)}>{availableGroups.map((option) => <option key={option}>{option}</option>)}</select></label>
        <label>Mes<select value={month} onChange={(event) => setMonth(event.target.value)} disabled={!groupLists.length}>{groupLists.map((list) => <option key={list.id} value={list.month}>{formatOfficialMonth(list.month)}</option>)}</select></label>
        <div><small>DOCENTE QUE OFICIALIZÓ</small><strong>{selectedList?.teacher || "Sin lista oficial"}</strong></div>
      </section>
      {selectedList
        ? <OfficialAttendanceSheet list={selectedList} />
        : <section className="panel empty-state"><Icon name="calendar" /><strong>Sin listas oficializadas</strong><p>El grupo seleccionado aún no tiene pases de lista cerrados.</p></section>}
    </>
  );
}

function RollCall({
  records,
  setRecords,
  replaceRecords,
  officialLists,
  replaceOfficialLists,
  students,
  groups,
}: {
  records: AttendanceRecord[];
  setRecords: React.Dispatch<React.SetStateAction<AttendanceRecord[]>>;
  replaceRecords: (records: AttendanceRecord[]) => void;
  officialLists: OfficialAttendanceList[];
  replaceOfficialLists: (lists: OfficialAttendanceList[]) => void;
  students: Student[];
  groups: string[];
}) {
  const availableGroups = useMemo(() => [...new Set(groups)].filter(Boolean).sort(), [groups]);
  const [group, setGroup] = useState(availableGroups[0] || "");
  const [date, setDate] = useState(todayISO());
  const [draft, setDraft] = useState<Record<string, Status>>({});
  const [notice, setNotice] = useState("");
  const [isPending, startTransition] = useTransition();
  const { requestConfirmation, confirmationDialog } = useConfirmation();
  useEffect(() => {
    if (!availableGroups.includes(group)) {
      setGroup(availableGroups[0] || "");
      setDraft({});
      setNotice("");
    }
  }, [availableGroups, group]);
  const groupStudents = availableGroups.includes(group)
    ? sortAndNumberGroupStudents(students, group)
    : [];
  const officialList = availableGroups.includes(group)
    ? officialLists.find((list) => list.group === group && list.month === date.slice(0, 7))
    : undefined;
  const isOfficial = Boolean(officialList?.officialDates.includes(date));
  const statusFor = (student: Student): Status => draft[student.id]
    || records.find((record) => record.studentId === student.id && record.date === date && record.source === "Pase de lista")?.status
    || records.find((record) => record.studentId === student.id && record.date === date && record.source === "Acceso")?.status
    || "Presente";
  const setStatus = (id: string, status: Status) => !isOfficial && setDraft((old) => ({ ...old, [id]: status }));
  const saveDraft = () => {
    if (isOfficial || isPending || !groupStudents.length) return;
    setNotice("");
    startTransition(async () => {
      const results = await Promise.all(
        groupStudents.map((student) =>
          createAttendanceAction({ studentId: student.id, date, status: statusFor(student) }),
        ),
      );
      const failed = results.find((result) => !result.ok);
      if (failed && !failed.ok) {
        setNotice(failed.error);
        return;
      }
      const savedRecords = results
        .filter((result): result is { ok: true; record: AttendanceRecord } => result.ok)
        .map((result) => result.record);
      setRecords((old) => {
        const ids = new Set(groupStudents.map((s) => s.id));
        const rest = old.filter((record) => !(ids.has(record.studentId) && record.date === date && record.source === "Pase de lista"));
        return [...savedRecords, ...rest];
      });
      setDraft({});
      setNotice("Borrador guardado. Puedes continuar editándolo.");
    });
  };
  const absences = groupStudents.filter((s) => statusFor(s) === "Falta").length;
  const officialize = () => {
    requestConfirmation({
      title: "Oficializar pase de lista",
      message: `Se cerrará la asistencia del grupo ${group} para el ${formatDate(date)} y ya no podrá modificarse. ¿Deseas continuar?`,
      confirmLabel: "Sí, oficializar",
      tone: "danger",
    }, () => {
      startTransition(async () => {
        const result = await officializeAttendanceAction({
          group,
          date,
          attendance: groupStudents.map((student) => ({ studentId: student.id, status: statusFor(student) })),
        });
        if (!result.ok) {
          setNotice(result.error);
          return;
        }
        replaceRecords(result.attendanceRecords);
        replaceOfficialLists(result.officialAttendanceLists);
        setDraft({});
        setNotice("Pase de lista oficializado y agregado al formato mensual. Ya no se permiten modificaciones.");
      });
    });
  };

  if (!availableGroups.length) {
    return (
      <>
        <div className="page-intro"><div><p className="eyebrow">ASISTENCIA DEL GRUPO</p><h1>Pase de lista</h1><p>Registra inasistencias y oficializa la lista al terminar.</p></div></div>
        <section className="panel empty-state"><Icon name="users" /><strong>No tienes grupos asignados</strong><p>Solicita al Director que asigne un grupo a tu perfil docente para poder pasar lista.</p></section>
      </>
    );
  }

  return (
    <>
      {confirmationDialog}
      <div className="page-intro"><div><p className="eyebrow">ASISTENCIA DEL GRUPO</p><h1>Pase de lista</h1><p>Registra inasistencias de forma individual o masiva y oficializa al terminar.</p></div></div>
      <section className="panel roll-card">
        <div className="roll-toolbar">
          <label>Grupo asignado<select value={group} onChange={(e) => { setGroup(e.target.value); setDraft({}); setNotice(""); }}>{availableGroups.map((option) => <option key={option}>{option}</option>)}</select></label>
          <label>Fecha<input type="date" value={date} onChange={(e) => { setDate(e.target.value); setDraft({}); setNotice(""); }} /></label>
          <div className={`official-state ${isOfficial ? "closed" : ""}`}><Icon name={isOfficial ? "lock" : "clock"} /><span><small>ESTADO</small><strong>{isOfficial ? "Oficializado" : "Borrador editable"}</strong></span></div>
        </div>
        {notice && <div className="inline-notice"><Icon name={isOfficial ? "lock" : "check"} /> {notice}</div>}
        <div className="bulk-actions"><span><strong>{groupStudents.length}</strong> alumnos · <strong>{absences}</strong> faltas</span><button disabled={isOfficial} onClick={() => setDraft(Object.fromEntries(groupStudents.map((s) => [s.id, "Presente"])))}>Marcar todos presentes</button><button disabled={isOfficial} onClick={() => setDraft(Object.fromEntries(groupStudents.map((s) => [s.id, "Falta"])))}>Marcar todos con falta</button></div>
        <div className="attendance-table">
          <div className="attendance-head"><span>N.º · Alumno</span><span>Estado de asistencia</span></div>
          {groupStudents.map((student) => <div className="attendance-row" key={student.id}>
            <div><span className="list-number-chip">{student.listNumber}</span><span className="avatar">{student.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}</span><strong>{student.name}</strong></div>
            <div className="status-toggle">
              {(["Presente", "Retardo", "Falta"] as Status[]).map((status) => <button key={status} disabled={isOfficial} className={statusFor(student) === status ? `selected ${status.toLowerCase()}` : ""} onClick={() => setStatus(student.id, status)}>{status}</button>)}
            </div>
          </div>)}
        </div>
        <div className="roll-footer">
          <p><Icon name="alert" size={18} /> Al oficializar, el pase de lista se cerrará definitivamente.</p>
          <div>{!isOfficial && <button className="secondary-button" disabled={isPending} onClick={saveDraft}>{isPending ? "Guardando…" : "Guardar borrador"}</button>}<button className="primary-button" disabled={isOfficial || isPending || !groupStudents.length} onClick={officialize}><Icon name="lock" size={17} /> {isPending ? "Procesando…" : "Oficializar lista"}</button></div>
        </div>
      </section>
      {officialList && (
        <section className="official-list-preview">
          <div className="official-list-preview-head"><div><p className="eyebrow">FORMATO INSTITUCIONAL</p><h2>Lista oficial del mes</h2></div><OfficialListDownloadButton list={officialList} className="secondary-button" /></div>
          <OfficialAttendanceSheet list={officialList} />
        </section>
      )}
    </>
  );
}

type ReportRow = Student & {
  present: number;
  late: number;
  absent: number;
};

const rowPlaceholders = ["{{alumno}}", "{{grupo}}", "{{puntuales}}", "{{retardos}}", "{{faltas}}"];

const replaceReportPlaceholders = (value: string, row: ReportRow | null, total: number) => {
  const replacements: Record<string, string> = {
    "{{fecha}}": new Intl.DateTimeFormat("es-MX").format(new Date()),
    "{{total_alumnos}}": String(total),
    "{{alumno}}": row?.name || "",
    "{{grupo}}": row?.group || "",
    "{{puntuales}}": String(row?.present ?? ""),
    "{{retardos}}": String(row?.late ?? ""),
    "{{faltas}}": String(row?.absent ?? ""),
  };
  return Object.entries(replacements).reduce((result, [marker, replacement]) => result.replaceAll(marker, replacement), value);
};

const downloadBlob = (blob: Blob, filename: string) => {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

async function generateFlatAttendancePdf(source: ArrayBuffer, rows: ReportRow[], records: AttendanceRecord[]) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const sourceDocument = await PDFDocument.load(source);
  const sourcePage = sourceDocument.getPage(0);
  const { width, height } = sourcePage.getSize();
  if (Math.abs(width - 612) > 2 || Math.abs(height - 792) > 2) {
    throw new Error("El PDF no contiene campos editables ni utiliza el formato oficial tamaño carta.");
  }

  const outputDocument = await PDFDocument.create();
  const regularFont = await outputDocument.embedFont(StandardFonts.Helvetica);
  const boldFont = await outputDocument.embedFont(StandardFonts.HelveticaBold);
  const rowsByGroup = [...new Set(rows.map((row) => row.group))].flatMap((group) => {
    const groupRows = rows.filter((row) => row.group === group);
    return Array.from({ length: Math.max(1, Math.ceil(groupRows.length / 30)) }, (_, pageIndex) => ({
      group,
      rows: groupRows.slice(pageIndex * 30, (pageIndex + 1) * 30),
    }));
  });
  if (!rowsByGroup.length) rowsByGroup.push({ group: "", rows: [] });

  for (const groupPage of rowsByGroup) {
    const [page] = await outputDocument.copyPages(sourceDocument, [0]);
    outputDocument.addPage(page);
    const studentIds = new Set(groupPage.rows.map((row) => row.id));
    const groupRecords = records.filter((record) => studentIds.has(record.studentId));
    const latestDate = groupRecords.map((record) => record.date).sort().at(-1) || todayISO();
    const [year, month] = latestDate.split("-").map(Number);
    const schoolDays: string[] = [];
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let day = 1; day <= lastDay && schoolDays.length < 23; day += 1) {
      const date = new Date(Date.UTC(year, month - 1, day));
      const weekDay = date.getUTCDay();
      if (weekDay !== 0 && weekDay !== 6) schoolDays.push(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    }

    const [grade = "", groupLetter = ""] = groupPage.group.split(/\s+/);
    const monthLabel = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" })
      .format(new Date(`${latestDate}T12:00:00Z`))
      .toUpperCase();

    page.drawRectangle({ x: 245, y: 650, width: 180, height: 18, color: rgb(1, 1, 1) });
    page.drawText(`GRADO: ${grade}    GRUPO: "${groupLetter}"`, { x: 260, y: 655, size: 9, font: boldFont });
    page.drawRectangle({ x: 268, y: 612, width: 105, height: 18, color: rgb(1, 1, 1) });
    page.drawText(`MES: ${monthLabel}`, { x: 271, y: 617, size: 8, font: boldFont });

    const firstDayX = 222;
    const dayStep = 15.45;
    schoolDays.forEach((date, index) => {
      page.drawText(String(Number(date.slice(-2))), {
        x: firstDayX + (index * dayStep) + 4,
        y: 563,
        size: 5,
        font: regularFont,
      });
    });

    groupPage.rows.forEach((row, rowIndex) => {
      const baseSize = 6.5;
      const availableWidth = 150;
      const measuredWidth = regularFont.widthOfTextAtSize(row.name, baseSize);
      const fontSize = measuredWidth > availableWidth ? Math.max(4.8, baseSize * (availableWidth / measuredWidth)) : baseSize;
      const rowY = 541.5 - (rowIndex * 13.35);
      page.drawText(row.name, { x: 64, y: rowY, size: fontSize, font: regularFont });

      schoolDays.forEach((date, dayIndex) => {
        const dayRecords = groupRecords.filter((record) => record.studentId === row.id && record.date === date);
        const status = dayRecords.some((record) => record.status === "Falta")
          ? "F"
          : dayRecords.some((record) => record.status === "Retardo")
            ? "R"
            : dayRecords.some((record) => record.status === "Presente")
              ? "P"
              : "";
        if (status) {
          page.drawText(status, {
            x: firstDayX + (dayIndex * dayStep) + 4.8,
            y: rowY,
            size: 5.5,
            font: boldFont,
          });
        }
      });
    });
  }

  return outputDocument.save();
}

async function generateFromTemplate(template: ReportTemplate, rows: ReportRow[], records: AttendanceRecord[]) {
  if (!template.url || !template.filename) throw new Error("La plantilla no tiene un archivo disponible.");
  const response = await fetch(template.url);
  if (!response.ok) throw new Error("No fue posible abrir la plantilla almacenada.");
  const source = await response.arrayBuffer();
  const extension = template.filename.split(".").pop()?.toLowerCase();

  if (extension === "csv") {
    const text = new TextDecoder().decode(source);
    const output = text.split(/\r?\n/).flatMap((line) => {
      const isDetailRow = rowPlaceholders.some((marker) => line.includes(marker));
      return isDetailRow
        ? rows.map((row) => replaceReportPlaceholders(line, row, rows.length))
        : [replaceReportPlaceholders(line, null, rows.length)];
    }).join("\r\n");
    return { blob: new Blob(["\ufeff", output], { type: "text/csv;charset=utf-8" }), filename: "reporte-con-plantilla.csv" };
  }

  if (extension === "xlsx" || extension === "xls") {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(source, { type: "array", cellStyles: true });
    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const addresses = Object.keys(sheet).filter((key) => !key.startsWith("!"));
      const detailRow = addresses.map((address) => ({ address, cell: sheet[address], position: XLSX.utils.decode_cell(address) }))
        .find(({ cell }) => typeof cell?.v === "string" && rowPlaceholders.some((marker) => String(cell.v).includes(marker)))?.position.r;

      if (detailRow !== undefined && rows.length) {
        const range = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : { s: { r: 0, c: 0 }, e: { r: detailRow, c: 0 } };
        const extraRows = Math.max(0, rows.length - 1);
        if (extraRows) {
          Object.keys(sheet).filter((key) => !key.startsWith("!")).map((address) => ({ address, position: XLSX.utils.decode_cell(address) }))
            .filter(({ position }) => position.r > detailRow).sort((a, b) => b.position.r - a.position.r)
            .forEach(({ address, position }) => {
              sheet[XLSX.utils.encode_cell({ r: position.r + extraRows, c: position.c })] = sheet[address];
              delete sheet[address];
            });
        }
        const templateCells = Object.keys(sheet).filter((key) => !key.startsWith("!")).map((address) => ({ address, position: XLSX.utils.decode_cell(address), cell: sheet[address] }))
          .filter(({ position }) => position.r === detailRow);
        rows.forEach((row, index) => {
          templateCells.forEach(({ position, cell }) => {
            const nextCell = { ...cell };
            if (typeof nextCell.v === "string") {
              nextCell.v = replaceReportPlaceholders(nextCell.v, row, rows.length);
              nextCell.w = nextCell.v;
            }
            sheet[XLSX.utils.encode_cell({ r: detailRow + index, c: position.c })] = nextCell;
          });
        });
        range.e.r += extraRows;
        sheet["!ref"] = XLSX.utils.encode_range(range);
      }

      Object.keys(sheet).filter((key) => !key.startsWith("!")).forEach((address) => {
        const cell = sheet[address];
        if (typeof cell?.v === "string") {
          cell.v = replaceReportPlaceholders(cell.v, null, rows.length);
          cell.w = cell.v;
        }
      });
    });
    const output = XLSX.write(workbook, { bookType: "xlsx", type: "array", cellStyles: true });
    return { blob: new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename: "reporte-con-plantilla.xlsx" };
  }

  if (extension === "pdf") {
    const { PDFDocument } = await import("pdf-lib");
    const document = await PDFDocument.load(source);
    const form = document.getForm();
    const fieldNames = new Set(form.getFields().map((field) => field.getName()));
    if (!fieldNames.size) {
      const output = await generateFlatAttendancePdf(source, rows, records);
      const pdfBytes = new Uint8Array(output.length);
      pdfBytes.set(output);
      return { blob: new Blob([pdfBytes], { type: "application/pdf" }), filename: "lista-de-asistencia-oficial.pdf" };
    }
    const values: Record<string, string> = {
      fecha: new Intl.DateTimeFormat("es-MX").format(new Date()),
      total_alumnos: String(rows.length),
    };
    rows.forEach((row, index) => {
      const suffix = index + 1;
      values[`alumno_${suffix}`] = row.name;
      values[`grupo_${suffix}`] = row.group;
      values[`puntuales_${suffix}`] = String(row.present);
      values[`retardos_${suffix}`] = String(row.late);
      values[`faltas_${suffix}`] = String(row.absent);
    });
    Object.entries(values).forEach(([name, value]) => {
      if (fieldNames.has(name)) form.getTextField(name).setText(value);
    });
    form.flatten();
    const output = await document.save();
    const pdfBytes = new Uint8Array(output.length);
    pdfBytes.set(output);
    return { blob: new Blob([pdfBytes], { type: "application/pdf" }), filename: "reporte-con-plantilla.pdf" };
  }

  throw new Error("El formato de la plantilla no es compatible.");
}

function LegacyReports({ records, students, allowedGroups, initialTemplates }: { records: AttendanceRecord[]; students: Student[]; allowedGroups?: string[]; initialTemplates: ReportTemplate[] }) {
  const [studentFilter, setStudentFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedTemplateId, setSelectedTemplateId] = useState(String(initialTemplates[0]?.id || ""));
  const [templateNotice, setTemplateNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [templateBusy, setTemplateBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/report-templates?limit=20&sort=-createdAt")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((result) => {
        if (!active || !Array.isArray(result.docs)) return;
        setTemplates(result.docs);
        setSelectedTemplateId((current) => current || String(result.docs[0]?.id || ""));
      })
      .catch(() => {
        // The server-rendered list remains available if a refresh cannot complete.
      });
    return () => {
      active = false;
    };
  }, []);
  const visibleStudents = (allowedGroups ? students.filter((student) => allowedGroups.includes(student.group)) : students)
    .slice()
    .sort(compareStudentsByPaternalSurname);
  const reportRows = useMemo(() => visibleStudents.map((student) => {
    const entries = records.filter((r) => r.studentId === student.id);
    return {
      ...student,
      present: entries.filter((r) => r.status === "Presente").length,
      late: entries.filter((r) => r.status === "Retardo").length,
      absent: entries.filter((r) => r.status === "Falta").length,
    };
  }).filter((row) =>
    (!studentFilter || row.name.toLowerCase().includes(studentFilter.toLowerCase())) &&
    (!groupFilter || row.group === groupFilter) &&
    (!statusFilter || (statusFilter === "Retardo" ? row.late > 0 : row.absent > 0))
  ), [records, visibleStudents, studentFilter, groupFilter, statusFilter]);

  const exportCSV = () => {
    const csv = ["Alumno,Grupo,Puntual,Retardos,Faltas", ...reportRows.map((r) => `"${r.name}",${r.group},${r.present},${r.late},${r.absent}`)].join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    link.download = "reporte-asistencia.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const selectedTemplate = templates.find((template) => String(template.id) === selectedTemplateId);

  const uploadTemplate = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setTemplateBusy(true);
    setTemplateNotice(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("_payload", JSON.stringify({ title: file.name.replace(/\.[^.]+$/, "") }));
      const response = await fetch("/api/report-templates", { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.errors?.[0]?.message || "No fue posible guardar la plantilla.");
      const template = (result.doc || result) as ReportTemplate;
      setTemplates((current) => [template, ...current]);
      setSelectedTemplateId(String(template.id));
      setTemplateNotice({ type: "success", text: "Plantilla cargada y lista para generar reportes." });
    } catch (error) {
      setTemplateNotice({ type: "error", text: error instanceof Error ? error.message : "No fue posible guardar la plantilla." });
    } finally {
      setTemplateBusy(false);
      event.target.value = "";
    }
  };

  const exportWithTemplate = async () => {
    if (!selectedTemplate) return;
    setTemplateBusy(true);
    setTemplateNotice(null);
    try {
      const generated = await generateFromTemplate(selectedTemplate, reportRows, records);
      downloadBlob(generated.blob, generated.filename);
      setTemplateNotice({ type: "success", text: `Reporte generado con ${reportRows.length} alumnos.` });
    } catch (error) {
      setTemplateNotice({ type: "error", text: error instanceof Error ? error.message : "No fue posible generar el reporte." });
    } finally {
      setTemplateBusy(false);
    }
  };

  return (
    <>
      <div className="page-intro report-intro"><div><p className="eyebrow">CICLO ESCOLAR ACTIVO</p><h1>Reportes de asistencia</h1><p>Consulta acumulados de puntualidad, retardos e inasistencias por alumno o grupo.</p></div><div className="export-actions"><button className="secondary-button" onClick={() => window.print()}><Icon name="download" size={17} /> Exportar PDF</button><button className="primary-button" onClick={exportCSV}><Icon name="download" size={17} /> Exportar CSV / Excel</button></div></div>
      <section className="panel template-panel">
        <div className="panel-head">
          <div><p className="eyebrow">FORMATO INSTITUCIONAL</p><h2>Plantilla para reportes</h2></div>
          <span className="form-icon"><Icon name="download" /></span>
        </div>
        <div className="template-content">
          <div className="template-copy">
            <strong>Carga una plantilla CSV, Excel o PDF</strong>
            <p>En CSV o Excel usa una fila con <code>{"{{alumno}}"}</code>, <code>{"{{grupo}}"}</code>, <code>{"{{puntuales}}"}</code>, <code>{"{{retardos}}"}</code> y <code>{"{{faltas}}"}</code>. La fila se repetirá por cada alumno filtrado.</p>
            <p>La plantilla oficial PDF se completa directamente con grado, grupo, mes, alumnos y asistencia diaria. Otros PDF pueden usar campos de formulario como <code>alumno_1</code>, <code>grupo_1</code>, <code>puntuales_1</code>, <code>retardos_1</code> y <code>faltas_1</code>.</p>
          </div>
          <div className="template-controls">
            <label className="upload-button">
              <Icon name="plus" size={17} /> {templateBusy ? "Procesando…" : "Cargar plantilla"}
              <input type="file" accept=".csv,.xls,.xlsx,.pdf" onChange={uploadTemplate} disabled={templateBusy} />
            </label>
            <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} disabled={!templates.length || templateBusy}>
              <option value="">{templates.length ? "Selecciona una plantilla" : "Sin plantillas cargadas"}</option>
              {templates.map((template) => <option key={template.id} value={String(template.id)}>{template.title}</option>)}
            </select>
            <button className="primary-button" onClick={exportWithTemplate} disabled={!selectedTemplate || templateBusy}>
              <Icon name="download" size={17} /> Descargar con plantilla
            </button>
          </div>
          {templateNotice && <div className={`notice notice-${templateNotice.type} template-notice`}><Icon name={templateNotice.type === "success" ? "check" : "alert"} /><div><strong>{templateNotice.type === "success" ? "Plantilla lista" : "Revisa la plantilla"}</strong><p>{templateNotice.text}</p></div></div>}
        </div>
      </section>
      <section className="panel report-panel">
        <div className="filters">
          <label>Alumno<div className="input-icon"><Icon name="search" size={17} /><input value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)} placeholder="Nombre del alumno" /></div></label>
          <label>Grupo<select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}><option value="">Todos los grupos</option>{(allowedGroups || [...new Set(students.map((student) => student.group))]).slice().sort().map((group) => <option key={group}>{group}</option>)}</select></label>
          <label>Incidencia<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">Todas</option><option>Retardo</option><option>Falta</option></select></label>
          <button className="clear-button" onClick={() => { setStudentFilter(""); setGroupFilter(""); setStatusFilter(""); }}>Limpiar filtros</button>
        </div>
        <div className="report-summary"><span><strong>{reportRows.length}</strong> alumnos encontrados</span><span>Actualización diaria automática · Ciclo 2026–2027</span></div>
        <div className="report-table">
          <div className="report-head"><span>Alumno</span><span>Grupo</span><span>Puntuales</span><span>Retardos acumulados</span><span>Faltas acumuladas</span></div>
          {reportRows.map((row) => <div className="report-row" key={row.id}>
            <div><span className="avatar">{row.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}</span><strong>{row.name}</strong></div>
            <span>{row.group}</span><span className="number good">{row.present}</span><span className="number warn">{row.late}</span><span className="number bad">{row.absent}</span>
          </div>)}
          {reportRows.length === 0 && <div className="empty-state"><Icon name="search" /><strong>Sin resultados</strong><p>Ajusta los filtros para consultar otros alumnos.</p></div>}
        </div>
      </section>
    </>
  );
}

type ReportPeriod = "week" | "month" | "year";

const toLocalISODate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const getReportPeriod = (period: ReportPeriod, anchorDate: string) => {
  const anchor = new Date(`${anchorDate}T12:00:00`);
  if (period === "week") {
    const start = new Date(anchor);
    start.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(start.getDate() + 4);
    const startDate = toLocalISODate(start);
    const endDate = toLocalISODate(end);
    return { startDate, endDate, label: `Semana del ${formatDate(startDate)} al ${formatDate(endDate)}` };
  }
  if (period === "month") {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12);
    return {
      startDate: toLocalISODate(start),
      endDate: toLocalISODate(end),
      label: new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(anchor),
    };
  }
  return {
    startDate: `${anchor.getFullYear()}-01-01`,
    endDate: `${anchor.getFullYear()}-12-31`,
    label: `Año ${anchor.getFullYear()}`,
  };
};

function Reports({
  records,
  students,
  groups,
  assignments,
  allowedGroups,
}: {
  records: AttendanceRecord[];
  students: Student[];
  groups: string[];
  assignments: Record<string, string[]>;
  allowedGroups?: string[];
  initialTemplates: ReportTemplate[];
}) {
  const availableGroups = (allowedGroups || [...new Set([...groups, ...students.map((student) => student.group)])]).slice().sort();
  const [selectedGroup, setSelectedGroup] = useState(availableGroups[0] || "");
  const [period, setPeriod] = useState<ReportPeriod>("week");
  const [anchorDate, setAnchorDate] = useState(todayISO());
  const [studentFilter, setStudentFilter] = useState("");
  const [studentSearchOpen, setStudentSearchOpen] = useState(false);
  const periodRange = getReportPeriod(period, anchorDate);

  useEffect(() => {
    if (!selectedGroup || !availableGroups.includes(selectedGroup)) setSelectedGroup(availableGroups[0] || "");
  }, [availableGroups, selectedGroup]);

  const groupStudents = sortAndNumberGroupStudents(students, selectedGroup);

  const rows = useMemo(() => groupStudents.map((student) => {
    const statusByDate = new Map<string, Status>();
    records
      .filter((record) => record.studentId === student.id && record.date >= periodRange.startDate && record.date <= periodRange.endDate)
      .slice()
      .sort((a, b) => Number(a.source === "Pase de lista") - Number(b.source === "Pase de lista"))
      .forEach((record) => statusByDate.set(record.date, record.status));
    const statuses = [...statusByDate.values()];
    const present = statuses.filter((status) => status === "Presente").length;
    const late = statuses.filter((status) => status === "Retardo").length;
    const absent = statuses.filter((status) => status === "Falta").length;
    const recorded = statuses.length;
    return {
      ...student,
      present,
      late,
      absent,
      recorded,
      attended: present + late,
      attendanceRate: recorded ? Math.round(((present + late) / recorded) * 100) : null,
    };
  }), [groupStudents, periodRange.endDate, periodRange.startDate, records]);

  const matchesStudentSearch = (name: string, query: string) => {
    const tokens = normalizeSearch(query).split(/\s+/).filter(Boolean);
    const nameParts = normalizeSearch(name).split(/\s+/);
    return !tokens.length || tokens.every((token) => nameParts.some((part) => part.startsWith(token)));
  };
  const displayedRows = rows.filter((row) => matchesStudentSearch(row.name, studentFilter));
  const studentSuggestions = studentFilter.trim()
    ? rows.filter((row) => matchesStudentSearch(row.name, studentFilter)).slice(0, 6)
    : [];
  const attendedStudentCount = rows.filter((row) => row.attended > 0).length;
  const presentCount = rows.reduce((total, row) => total + row.present, 0);
  const lateCount = rows.reduce((total, row) => total + row.late, 0);
  const absentCount = rows.reduce((total, row) => total + row.absent, 0);
  const highestAbsence = rows.slice().sort((a, b) => b.absent - a.absent || compareStudentsByPaternalSurname(a, b))[0];
  const responsibleTeachers = Object.entries(assignments)
    .filter(([, teacherGroups]) => teacherGroups.includes(selectedGroup))
    .map(([teacher]) => teacher);
  const availableYears = [...new Set([
    Number(todayISO().slice(0, 4)),
    ...records.map((record) => Number(record.date.slice(0, 4))),
  ])].filter(Boolean).sort((a, b) => b - a);

  const changePeriod = (nextPeriod: ReportPeriod) => {
    setPeriod(nextPeriod);
    setAnchorDate(todayISO());
    setStudentFilter("");
  };

  const exportCSV = () => {
    const escapeCell = (value: string | number) => `"${String(value).replaceAll("\"", "\"\"")}"`;
    const teacher = responsibleTeachers.join(" / ") || "Sin docente asignado";
    const csvRows = displayedRows.map((row) => [
      periodRange.label,
      selectedGroup,
      teacher,
      row.listNumber,
      row.name,
      row.attended,
      row.present,
      row.late,
      row.absent,
      row.attendanceRate === null ? "Sin registros" : `${row.attendanceRate}%`,
    ].map(escapeCell).join(","));
    const csv = ["Periodo,Grupo,Docente responsable,Número de lista,Alumno,Asistencias,Puntuales,Retardos,Faltas,Porcentaje de asistencia", ...csvRows].join("\n");
    downloadBlob(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }), `asistencia-${selectedGroup || "grupo"}-${periodRange.startDate}-${periodRange.endDate}.csv`);
  };

  return (
    <>
      <div className="page-intro report-intro">
        <div><p className="eyebrow">SEGUIMIENTO ESCOLAR</p><h1>Reportes de asistencia</h1><p>Consulta una semana, un mes o un año completo para un grupo específico.</p></div>
        <div className="export-actions"><button className="secondary-button" onClick={() => window.print()}><Icon name="download" size={17} /> Imprimir / PDF</button><button className="primary-button" onClick={exportCSV}><Icon name="download" size={17} /> Exportar CSV</button></div>
      </div>

      <section className="panel attendance-report-controls">
        <div className="report-control-copy"><p className="eyebrow">PERIODO SELECCIONADO</p><h2>{periodRange.label}</h2><p>Los resultados corresponden únicamente al grupo {selectedGroup || "sin seleccionar"}.</p></div>
        <div className="report-date-filters period-filters">
          <label>Periodo<select value={period} onChange={(event) => changePeriod(event.target.value as ReportPeriod)}><option value="week">Semana</option><option value="month">Mes</option><option value="year">Año</option></select></label>
          {period === "week" && <label>Día de referencia<input required type="date" value={anchorDate} onChange={(event) => { if (event.target.value) setAnchorDate(event.target.value); }} /></label>}
          {period === "month" && <label>Mes<input required type="month" value={anchorDate.slice(0, 7)} onChange={(event) => { if (event.target.value) setAnchorDate(`${event.target.value}-01`); }} /></label>}
          {period === "year" && <label>Año<select value={anchorDate.slice(0, 4)} onChange={(event) => setAnchorDate(`${event.target.value}-01-01`)}>{availableYears.map((year) => <option key={year}>{year}</option>)}</select></label>}
          <label>Grupo<select required value={selectedGroup} onChange={(event) => { setSelectedGroup(event.target.value); setStudentFilter(""); }} disabled={!availableGroups.length}>{availableGroups.map((group) => <option key={group}>{group}</option>)}</select></label>
          <label>Buscar alumno<div className="input-icon student-autocomplete" onFocus={() => setStudentSearchOpen(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setStudentSearchOpen(false); }}><Icon name="search" size={16} /><input value={studentFilter} onChange={(event) => { setStudentFilter(event.target.value); setStudentSearchOpen(true); }} placeholder="Empieza a escribir un nombre" role="combobox" aria-autocomplete="list" aria-expanded={studentSearchOpen && Boolean(studentFilter.trim())} aria-controls="student-report-suggestions" />{studentSearchOpen && studentFilter.trim() && <div className="student-suggestions" id="student-report-suggestions" role="listbox">{studentSuggestions.map((student) => <button type="button" role="option" aria-selected="false" key={student.id} onMouseDown={(event) => event.preventDefault()} onClick={() => { setStudentFilter(student.name); setStudentSearchOpen(false); }}><span className="list-number-chip">{student.listNumber}</span><span><strong>{student.name}</strong><small>N.º {student.listNumber} · {student.group}</small></span></button>)}{studentSuggestions.length === 0 && <div className="student-suggestion-empty">No hay alumnos que coincidan.</div>}</div>}</div></label>
          <button className="secondary-button" type="button" onClick={() => { setAnchorDate(todayISO()); setStudentFilter(""); }}>Periodo actual</button>
        </div>
      </section>

      <div className="attendance-report-metrics">
        <div className="attendance-report-metric attended"><span><Icon name="check" /></span><div><small>ALUMNOS CON ASISTENCIA</small><strong>{attendedStudentCount}</strong><p>De {rows.length} alumnos del grupo</p></div></div>
        <div className="attendance-report-metric present"><span><Icon name="users" /></span><div><small>ASISTENCIAS PUNTUALES</small><strong>{presentCount}</strong><p>Registros del periodo</p></div></div>
        <div className="attendance-report-metric late"><span><Icon name="clock" /></span><div><small>RETARDOS</small><strong>{lateCount}</strong><p>Registros del periodo</p></div></div>
        <div className="attendance-report-metric absent"><span><Icon name="alert" /></span><div><small>FALTAS</small><strong>{absentCount}</strong><p>Registros del periodo</p></div></div>
      </div>

      <section className={`absence-alert ${highestAbsence?.absent ? "has-absence" : ""}`}>
        <span><Icon name={highestAbsence?.absent ? "alert" : "check"} /></span>
        <div>
          <p className="eyebrow">SEGUIMIENTO PRIORITARIO · {selectedGroup || "SIN GRUPO"}</p>
          {highestAbsence?.absent ? <><h2>{highestAbsence.name}</h2><p>Es el alumno con más faltas del grupo durante este periodo: <strong>{highestAbsence.absent}</strong> {highestAbsence.absent === 1 ? "falta" : "faltas"}.</p></> : <><h2>Sin faltas en el periodo</h2><p>No hay inasistencias registradas para este grupo durante {periodRange.label.toLowerCase()}.</p></>}
        </div>
      </section>

      {selectedGroup ? <section className="panel group-report-card">
        <div className="group-report-header">
          <div className="group-report-title"><span>{selectedGroup}</span><div><p className="eyebrow">GRUPO SELECCIONADO</p><h2>{rows.length} alumnos · {attendedStudentCount} con asistencia</h2></div></div>
          <div className="responsible-teacher"><Icon name="badge" size={18} /><div><small>DOCENTE RESPONSABLE</small><strong>{responsibleTeachers.length ? responsibleTeachers.join(" / ") : "Sin docente asignado"}</strong></div></div>
        </div>
        <div className="group-report-table period-report-table">
          <div className="group-report-head"><span>N.º · Alumno</span><span>Asistencias</span><span>Retardos</span><span>Faltas</span><span>Porcentaje</span></div>
          {displayedRows.map((row) => <div className="group-report-row" key={row.id}>
            <div><span className="list-number-chip">{row.listNumber}</span><span className="avatar">{row.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><strong>{row.name}</strong></div>
            <span className="number good">{row.attended}</span>
            <span className="number warn">{row.late}</span>
            <span className="number bad">{row.absent}</span>
            <span className={`attendance-rate ${row.attendanceRate !== null && row.attendanceRate < 80 ? "low" : ""}`}>{row.attendanceRate === null ? "Sin registros" : `${row.attendanceRate}%`}</span>
          </div>)}
          {displayedRows.length === 0 && <div className="empty-state"><Icon name="search" /><strong>Sin alumnos coincidentes</strong><p>Prueba con otro nombre o limpia la búsqueda.</p></div>}
        </div>
      </section> : <section className="panel empty-state"><Icon name="users" /><strong>No hay grupos disponibles</strong><p>Registra o asigna un grupo antes de consultar reportes.</p></section>}
    </>
  );
}

function StatusBadge({ status }: { status: Status }) {
  return <span className={`status-badge status-${status.toLowerCase()}`}>{status}</span>;
}

export default App;
