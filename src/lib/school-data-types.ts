export type Status = "Presente" | "Retardo" | "Falta"

export type StudentStatus = "Activo" | "Egresado"

export type Student = {
  id: string
  name: string
  listNumber: number
  givenNames?: string
  paternalSurname?: string
  maternalSurname?: string
  group: string
  status: StudentStatus
}

export type GroupRef = {
  id: string
  name: string
}

export type AttendanceRecord = {
  studentId: string
  date: string
  time: string
  status: Status
  source: "Acceso" | "Pase de lista"
}

export type OfficialAttendanceStudent = {
  studentId: string
  name: string
  listNumber: number
}

export type OfficialAttendanceList = {
  id: string
  group: string
  month: string
  teacher: string
  officialDates: string[]
  students: OfficialAttendanceStudent[]
  marks: Record<string, Record<string, "." | "X">>
  updatedAt: string
}

export type VisitorAuthorizationStatus = "Pendiente" | "Autorizada" | "Rechazada"

export type Visitor = {
  id: string
  name: string
  identification: string
  reason: string
  host: string
  hostUserId: string | null
  authorizationStatus: VisitorAuthorizationStatus
  authorizedByName: string
  authorizedAt: string | null
  date: string
  entryTime: string
  exitTime: string | null
}

export type TeacherAttendance = {
  id: string
  teacher: string
  date: string
  entryTime: string
  exitTime: string | null
}

export type TeacherProfile = {
  name: string
  givenNames?: string
  paternalSurname?: string
  maternalSurname?: string
  status: "Activo" | "Baja temporal"
  justifiedDates: string[]
}

export type SchoolStateData = {
  students: Student[]
  groups: GroupRef[]
  attendanceRecords: AttendanceRecord[]
  officialAttendanceLists: OfficialAttendanceList[]
  visitors: Visitor[]
  teacherAttendance: TeacherAttendance[]
  teacherGroups: Record<string, string[]>
  teachers: TeacherProfile[]
  directorName: string
}

export const DEFAULT_DIRECTOR_NAME = "MTRO. OSCAR HERRERA GAYTÁN"

export type SchoolStateSection = keyof SchoolStateData

export const SCHOOL_TIME_ZONE = "America/Mexico_City"

export const todayISO = (): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: SCHOOL_TIME_ZONE }).format(new Date())

export const toISODateTimeFromHHMM = (date: string, time: string): string => {
  const [hours, minutes] = time.split(":").map(Number)
  const base = new Date(`${date}T00:00:00`)
  base.setHours(hours || 0, minutes || 0, 0, 0)
  return base.toISOString()
}
