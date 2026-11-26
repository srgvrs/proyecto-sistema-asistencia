"use server"

import config from "@payload-config"
import { getPayload } from "payload"
import { appAuth } from "@/lib/app-auth"
import { compareStudentsByName } from "@/lib/student-ordering"
import type {
  AttendanceRecord,
  OfficialAttendanceList,
  OfficialAttendanceStudent,
  SchoolStateData,
  Status,
  Student,
  TeacherAttendance,
  TeacherProfile,
  Visitor,
} from "@/lib/school-data-types"
import { DEFAULT_DIRECTOR_NAME, todayISO } from "@/lib/school-data-types"
import { toMexicoDayKey, toSchoolDayKey } from "@/lib/date-range"

const isString = (value: unknown): value is string => typeof value === "string"

const getCycleLabel = (date: string): string => {
  const [yearText, monthText] = date.split("-")
  const year = Number(yearText)
  const month = Number(monthText)
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return ""
  const startYear = month >= 9 ? year : year - 1
  return `${startYear}–${startYear + 1}`
}

const MAX_NAME_LENGTH = 60

const normalizePersonName = (value: string): string =>
  value.trim().replace(/\s+/g, " ")

const normalizeName = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")

const buildNormalizedNameKey = (
  givenNames: string,
  paternalSurname: string,
  maternalSurname: string,
): string =>
  normalizeName(`${givenNames} ${paternalSurname} ${maternalSurname}`)

type ActionUser = NonNullable<Awaited<ReturnType<typeof appAuth.currentUser>>>

const findDuplicateStudentInGroup = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  groupId: number,
  givenNames: string,
  paternalSurname: string,
  maternalSurname: string,
  excludeId: number | null,
  user: ActionUser,
): Promise<boolean> => {
  const targetKey = buildNormalizedNameKey(givenNames, paternalSurname, maternalSurname)
  if (!targetKey) return false
  const result = await payload.find({
    collection: "students",
    where: { group: { equals: groupId } },
    limit: 1000,
    depth: 0,
    overrideAccess: false,
    user,
  })
  for (const doc of result.docs as StudentDoc[]) {
    if (excludeId !== null && Number(doc.id) === excludeId) continue
    const parts = resolveStudentNameParts(doc)
    const key = buildNormalizedNameKey(parts.givenNames, parts.paternalSurname, parts.maternalSurname)
    if (key === targetKey) return true
  }
  return false
}

const validatePersonName = (
  value: unknown,
  label: string,
  required: boolean,
): { ok: true; value: string } | { ok: false; error: string } => {
  if (!isString(value)) {
    return { ok: false, error: `${label} no es válido.` }
  }
  const normalized = normalizePersonName(value)
  if (!normalized) {
    if (required) return { ok: false, error: `${label} es obligatorio.` }
    return { ok: true, value: "" }
  }
  if (normalized.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `${label} no puede exceder ${MAX_NAME_LENGTH} caracteres.` }
  }
  return { ok: true, value: normalized }
}
const isListNumber = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 999
const isISODate = (value: unknown): value is string => {
  if (!isString(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}
const isISODateTime = (value: unknown): value is string => {
  if (!isString(value)) return false
  const date = new Date(value)
  return !Number.isNaN(date.valueOf())
}

const toISODate = (value: string | null | undefined): string => toSchoolDayKey(value)

const localDayRangeToUTC = (desde: string, hasta: string): { start: string; end: string } => {
  const start = new Date(`${desde}T00:00:00`);
  const end = new Date(`${hasta}T23:59:59.999`);
  return { start: start.toISOString(), end: end.toISOString() };
}

const toHHMM = (value: string | null | undefined): string => {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return ""
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Mexico_City",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date)
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00"
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00"
  return `${hour}:${minute}`
}


const assertDocenteOwnsStudent = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  studentId: number | string,
  user: { id: number | string },
): Promise<boolean> => {
  const student = await payload.findByID({
    collection: "students",
    id: Number(studentId),
    depth: 1,
    overrideAccess: true,
  }) as StudentDoc | null
  const group = student?.group
  const teacherId = group && typeof group === "object"
    ? (group as { teacher?: number | { id: number } | null }).teacher
    : undefined
  const resolvedTeacherId = teacherId && typeof teacherId === "object"
    ? teacherId.id
    : teacherId
  return String(resolvedTeacherId ?? "") === String(user.id)
}

const isStudentInOfficialMarks = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  studentId: number | string,
): Promise<boolean> => {
  const result = await payload.find({
    collection: "official-lists",
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
  for (const doc of result.docs as OfficialListDoc[]) {
    const marks = doc.marks
    if (!marks || typeof marks !== "object" || Array.isArray(marks)) continue
    if (String(studentId) in marks) return true
  }
  return false
}

const getOfficializedDatesForGroup = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  groupId: number,
): Promise<Set<string>> => {
  const result = await payload.find({
    collection: "official-lists",
    where: { group: { equals: groupId } },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })
  const dates = new Set<string>()
  for (const doc of result.docs as OfficialListDoc[]) {
    const marks = doc.marks
    if (!marks || typeof marks !== "object" || Array.isArray(marks)) continue
    for (const studentMarks of Object.values(marks as Record<string, Record<string, "." | "X">>)) {
      if (!studentMarks || typeof studentMarks !== "object") continue
      for (const date of Object.keys(studentMarks)) dates.add(date)
    }
  }
  return dates
}

const isStudentDateOfficialized = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  studentId: number | string,
  date: string,
): Promise<boolean> => {
  const month = date.slice(0, 7)
  const result = await payload.find({
    collection: "official-lists",
    where: { title: { contains: month } },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })
  for (const doc of result.docs as OfficialListDoc[]) {
    const marks = doc.marks
    if (!marks || typeof marks !== "object" || Array.isArray(marks)) continue
    const studentMarks = (marks as Record<string, Record<string, "." | "X">>)[String(studentId)]
    if (studentMarks && typeof studentMarks === "object" && date in studentMarks) {
      return true
    }
  }
  return false
}

const mapStatusToCollection = (status: Status): "Presente" | "Ausente" | "Retardo" | "Justificado" => {
  if (status === "Falta") return "Ausente"
  return status
}

const mapStatusFromCollection = (status: string): Status => {
  if (status === "Ausente" || status === "Justificado") return "Falta"
  if (status === "Retardo") return "Retardo"
  return "Presente"
}

type StudentDoc = {
  id: number
  firstName: string
  lastName?: string | null
  paternalSurname?: string | null
  maternalSurname?: string | null
  matricula: string
  group: number | { id: number; name: string }
  status?: "Activo" | "Egresado" | null
}

type GroupDoc = {
  id: number
  name: string
  grade: number
  teacher?: number | { id: number; name: string } | null
}

type AttendanceDoc = {
  id: number
  student: number | { id: number }
  date: string
  status: "Presente" | "Ausente" | "Retardo" | "Justificado"
  registeredBy: number | { id: number }
}

type VisitorDoc = {
  id: number
  name: string
  reason: string
  entryTime: string
  exitTime?: string | null
  host?: string | null
  hostUser?: number | { id: number } | null
  authorizationStatus?: "Pendiente" | "Autorizada" | "Rechazada" | null
  authorizedBy?: number | { id: number } | null
  authorizedByName?: string | null
  authorizedAt?: string | null
  registeredBy: number | { id: number }
}

type OfficialListDoc = {
  id: number
  title: string
  group: number | { id: number; name: string }
  file?: number | { id: number; url?: string | null } | null
  marks?: Record<string, Record<string, "." | "X">> | null
  roster?: unknown
  teacherName?: string | null
}

type TeacherAttendanceDoc = {
  id: number
  teacher: number | { id: number; name?: string }
  date: string
  entryTime: string
  exitTime?: string | null
}

type TeacherJustificationDoc = {
  id: number
  teacher: number | { id: number; name?: string }
  date: string
  reason?: string | null
}

type TeacherUserDoc = {
  id: number
  name: string
  role: "Directivo" | "Docente" | "Vigilante de Acceso"
  employmentStatus?: "Activo" | "Baja temporal" | null
}

const getRelationId = (value: any): string => {
  if (value === null || value === undefined) return ""
  if (typeof value === "object") return String(value.id)
  return String(value)
}

const parseListNumber = (matricula?: string | null): number => {
  const m = /-(\d+)$/.exec(matricula ?? "")
  return m ? Number(m[1]) : 0
}

const buildMatricula = (groupName: string, consecutive: number): string =>
  `${groupName.replace(/\s+/g, "")}-${consecutive}`

const getGroupMatriculaCounter = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  groupId: number,
  groupName: string,
  user: ActionUser,
): Promise<number> => {
  const group = await payload.findByID({
    collection: "groups",
    id: groupId,
    depth: 0,
    overrideAccess: false,
    user,
  }) as (GroupDoc & { lastMatriculaNumber?: number | null }) | null
  const stored = Number(group?.lastMatriculaNumber ?? 0)
  const students = await payload.find({
    collection: "students",
    where: { group: { equals: groupId } },
    limit: 2000,
    depth: 0,
    overrideAccess: false,
    user,
  })
  const prefix = groupName.replace(/\s+/g, "")
  const maxExisting = (students.docs as StudentDoc[]).reduce((max, doc) => {
    const matricula = doc.matricula ?? ""
    if (!matricula.startsWith(`${prefix}-`)) return max
    const value = parseListNumber(matricula)
    return value > max ? value : max
  }, 0)
  return Math.max(stored, maxExisting)
}

const bumpGroupMatriculaCounter = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  groupId: number,
  value: number,
  user: ActionUser,
): Promise<void> => {
  try {
    await payload.update({
      collection: "groups",
      id: groupId,
      data: { lastMatriculaNumber: value },
      overrideAccess: false,
      user,
    })
  } catch (error: any) {
    console.error(
      "BUMP GROUP COUNTER ERROR",
      JSON.stringify(error?.data?.errors ?? error?.message ?? error, null, 2),
    )
  }
}

const getRelationName = (value: number | { id: number; name?: string } | null | undefined): string => {
  if (value === null || value === undefined) return ""
  return typeof value === "number" ? String(value) : value.name || String(value.id)
}

const splitStudentName = (firstName: string, lastName: string) => {
  const parts = lastName.trim().split(/\s+/)
  const paternalSurname = parts[0] || ""
  const maternalSurname = parts.slice(1).join(" ")
  return {
    givenNames: firstName.trim(),
    paternalSurname,
    maternalSurname,
  }
}

const resolveStudentNameParts = (doc: StudentDoc) => {
  const fallback = splitStudentName(doc.firstName, doc.lastName ?? "")
  const paternalSurname = (doc.paternalSurname ?? "").trim() || fallback.paternalSurname
  const maternalSurname = (doc.maternalSurname ?? "").trim() || fallback.maternalSurname
  return {
    givenNames: doc.firstName.trim(),
    paternalSurname,
    maternalSurname,
  }
}

const buildStudentName = (firstName: string, paternalSurname: string, maternalSurname: string) =>
  `${paternalSurname} ${maternalSurname} ${firstName}`.replace(/\s+/g, " ").trim()

const mapStudentDoc = (
  doc: StudentDoc,
  listNumber: number,
  groupsById?: Map<string, string>,
): Student => {
  const parts = resolveStudentNameParts(doc)
  const groupId = getRelationId(doc.group)
  const groupName = groupsById?.get(groupId) || getRelationName(doc.group)
  return {
    id: String(doc.id),
    name: buildStudentName(parts.givenNames, parts.paternalSurname, parts.maternalSurname),
    listNumber,
    givenNames: parts.givenNames,
    paternalSurname: parts.paternalSurname,
    maternalSurname: parts.maternalSurname,
    group: groupName,
    status: doc.status === "Egresado" ? "Egresado" : "Activo",
  }
}

const mapAttendanceDoc = (doc: AttendanceDoc): AttendanceRecord => ({
  studentId: getRelationId(doc.student),
  date: toISODate(doc.date),
  time: "—",
  status: mapStatusFromCollection(doc.status),
  source: "Pase de lista",
})

const mapVisitorDoc = (doc: VisitorDoc): Visitor => ({
  id: String(doc.id),
  name: doc.name,
  identification: "",
  reason: doc.reason,
  host: (doc.host ?? "").trim(),
  hostUserId: getRelationId(doc.hostUser) || null,
  authorizationStatus: doc.authorizationStatus === "Autorizada" || doc.authorizationStatus === "Rechazada"
    ? doc.authorizationStatus
    : "Pendiente",
  authorizedByName: (doc.authorizedByName ?? "").trim(),
  authorizedAt: doc.authorizedAt ? toHHMM(doc.authorizedAt) : null,
  date: toMexicoDayKey(doc.entryTime),
  entryTime: toHHMM(doc.entryTime),
  exitTime: doc.exitTime ? toHHMM(doc.exitTime) : null,
})

const parseRoster = (value: unknown): OfficialAttendanceStudent[] | null => {
  if (!Array.isArray(value)) return null
  const roster: OfficialAttendanceStudent[] = []
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const entry = item as { studentId?: unknown; name?: unknown; listNumber?: unknown }
    if (typeof entry.studentId !== "string" || typeof entry.name !== "string") continue
    const listNumber = typeof entry.listNumber === "number" ? entry.listNumber : Number(entry.listNumber)
    if (!Number.isFinite(listNumber)) continue
    roster.push({ studentId: entry.studentId, name: entry.name, listNumber })
  }
  return roster.length ? roster : null
}

const buildRosterFromStudents = (students: Student[]): OfficialAttendanceStudent[] =>
  students
    .slice()
    .sort(compareStudentsByName)
    .map((student, index) => ({
      studentId: student.id,
      name: student.name,
      listNumber: index + 1,
    }))

const monthFromTitle = (title: string): string => {
  const match = /(\d{4})-(\d{2})/.exec(title)
  if (match) return `${match[1]}-${match[2]}`
  const months = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ]
  const lower = title.toLowerCase()
  const monthIndex = months.findIndex((name) => lower.includes(name))
  const yearMatch = /(\d{4})/.exec(title)
  if (monthIndex >= 0 && yearMatch) {
    return `${yearMatch[1]}-${String(monthIndex + 1).padStart(2, "0")}`
  }
  return ""
}

const mapOfficialListDoc = (
  doc: OfficialListDoc,
  groupStudents?: Student[],
  groupTeacherName?: string,
): OfficialAttendanceList => {
  const marks = (doc.marks && typeof doc.marks === "object" && !Array.isArray(doc.marks))
    ? (doc.marks as Record<string, Record<string, "." | "X">>)
    : {}
  const officialDates = [...new Set(
    Object.values(marks).flatMap((studentMarks) => Object.keys(studentMarks || {})),
  )].sort()
  const roster = parseRoster(doc.roster)
    ?? (groupStudents && groupStudents.length ? buildRosterFromStudents(groupStudents) : [])
  const month = officialDates[0]?.slice(0, 7) || monthFromTitle(doc.title) || ""
  const teacher = (typeof doc.teacherName === "string" && doc.teacherName.trim())
    ? doc.teacherName
    : (groupTeacherName ?? "")
  return {
    id: String(doc.id),
    group: getRelationName(doc.group),
    month,
    teacher,
    officialDates,
    students: roster,
    marks,
    updatedAt: new Date().toISOString(),
  }
}

export async function loadOfficialAttendanceStatusAction(
  input: { listId: string; date: string },
): Promise<
  | { ok: true; statuses: Record<string, Status> }
  | { ok: false; error: string }
> {
  const user = await appAuth.currentUser()
  if (!user || user.role !== "Directivo") {
    return { ok: false, error: "Solo un directivo puede consultar la asistencia oficial." }
  }
  if (!isString(input.listId) || !isISODate(input.date)) {
    return { ok: false, error: "Los datos de la consulta no son válidos." }
  }
  const numericListId = Number(input.listId)
  if (!Number.isInteger(numericListId) || numericListId <= 0) {
    return { ok: false, error: "Identificador inválido." }
  }
  try {
    const payload = await getPayload({ config })
    const listDoc = await payload.findByID({
      collection: "official-lists",
      id: numericListId,
      depth: 0,
      overrideAccess: false,
      user,
    }) as OfficialListDoc | null
    if (!listDoc) return { ok: false, error: "La lista oficial no existe." }
    const existingMarks = (listDoc.marks && typeof listDoc.marks === "object" && !Array.isArray(listDoc.marks))
      ? (listDoc.marks as Record<string, Record<string, "." | "X">>)
      : {}
    const dateInMarks = Object.values(existingMarks).some(
      (studentMarks) => studentMarks && typeof studentMarks === "object" && input.date in studentMarks,
    )
    if (!dateInMarks) {
      return { ok: false, error: "La fecha no pertenece a esta lista oficial." }
    }
    const roster = parseRoster(listDoc.roster) ?? []
    const studentIds = roster.map((entry) => Number(entry.studentId)).filter((id) => Number.isInteger(id) && id > 0)
    const statuses: Record<string, Status> = {}
    for (const entry of roster) statuses[entry.studentId] = "Presente"
    if (studentIds.length) {
      const attendance = await payload.find({
        collection: "attendance",
        where: {
          and: [
            { student: { in: studentIds } },
            { date: { equals: `${input.date}T00:00:00.000Z` } },
          ],
        },
        limit: 500,
        overrideAccess: false,
        user,
      })
      for (const doc of attendance.docs as AttendanceDoc[]) {
        statuses[getRelationId(doc.student)] = mapStatusFromCollection(doc.status)
      }
    }
    return { ok: true, statuses }
  } catch (error: any) {
    console.error(
      "LOAD OFFICIAL ATTENDANCE STATUS ERROR",
      JSON.stringify(error?.data?.errors ?? error?.message ?? error, null, 2),
    )
    return { ok: false, error: "No fue posible consultar la asistencia oficial." }
  }
}

type CorrectOfficialAttendanceInput = {
  listId: string
  date: string
  entries: Array<{ studentId: string; status: Status }>
}

export async function correctOfficialAttendanceAction(
  input: CorrectOfficialAttendanceInput,
): Promise<
  | { ok: true; changed: number; errors: string[]; officialAttendanceList: OfficialAttendanceList }
  | { ok: false; error: string; changed: number; errors: string[]; officialAttendanceList: OfficialAttendanceList | null }
> {
  const user = await appAuth.currentUser()
  if (!user || user.role !== "Directivo") {
    return {
      ok: false,
      error: "Solo un directivo puede corregir la asistencia oficial.",
      changed: 0,
      errors: [],
      officialAttendanceList: null,
    }
  }
  if (
    !isString(input.listId) ||
    !isISODate(input.date) ||
    !Array.isArray(input.entries) ||
    input.entries.length > 500 ||
    !input.entries.every((item) =>
      item && isString(item.studentId) && ["Presente", "Retardo", "Falta"].includes(item.status),
    )
  ) {
    return {
      ok: false,
      error: "Los datos de la corrección no son válidos.",
      changed: 0,
      errors: [],
      officialAttendanceList: null,
    }
  }
  const numericListId = Number(input.listId)
  if (!Number.isInteger(numericListId) || numericListId <= 0) {
    return {
      ok: false,
      error: "Identificador inválido.",
      changed: 0,
      errors: [],
      officialAttendanceList: null,
    }
  }

  try {
    const payload = await getPayload({ config })

    const listDoc = await payload.findByID({
      collection: "official-lists",
      id: numericListId,
      depth: 0,
      overrideAccess: false,
      user,
    }) as OfficialListDoc | null
    if (!listDoc) {
      return {
        ok: false,
        error: "La lista oficial no existe.",
        changed: 0,
        errors: [],
        officialAttendanceList: null,
      }
    }

    const existingMarks = (listDoc.marks && typeof listDoc.marks === "object" && !Array.isArray(listDoc.marks))
      ? (listDoc.marks as Record<string, Record<string, "." | "X">>)
      : {}
    const roster = parseRoster(listDoc.roster) ?? []
    const rosterIds = new Set(roster.map((entry) => entry.studentId))
    const dateInMarks = Object.values(existingMarks).some(
      (studentMarks) => studentMarks && typeof studentMarks === "object" && input.date in studentMarks,
    )
    if (!dateInMarks) {
      return {
        ok: false,
        error: "La fecha no pertenece a esta lista oficial.",
        changed: 0,
        errors: [],
        officialAttendanceList: null,
      }
    }
    for (const entry of input.entries) {
      const inRoster = rosterIds.has(entry.studentId)
      const inMarks = Boolean(existingMarks[entry.studentId] && input.date in existingMarks[entry.studentId])
      if (!inRoster && !inMarks) {
        return {
          ok: false,
          error: "La lista incluye alumnos que no pertenecen a esta lista oficial.",
          changed: 0,
          errors: [],
          officialAttendanceList: null,
        }
      }
    }

    const studentIds = input.entries.map((entry) => Number(entry.studentId))
    const existingAttendance = await payload.find({
      collection: "attendance",
      where: {
        and: [
          { student: { in: studentIds } },
          { date: { equals: `${input.date}T00:00:00.000Z` } },
        ],
      },
      limit: 500,
      overrideAccess: false,
      user,
    })
    const attendanceByStudent = new Map(
      (existingAttendance.docs as AttendanceDoc[]).map((doc) => [getRelationId(doc.student), doc]),
    )

    const nextMarks: Record<string, Record<string, "." | "X">> = { ...existingMarks }
    const errors: string[] = []
    let changed = 0

    for (const entry of input.entries) {
      const studentId = entry.studentId
      const existing = attendanceByStudent.get(studentId)
      const currentStatus = existing ? mapStatusFromCollection(existing.status) : null
      if (currentStatus === entry.status) continue

      const collectionStatus = mapStatusToCollection(entry.status)
      try {
        if (existing) {
          await payload.update({
            collection: "attendance",
            id: existing.id,
            data: { status: collectionStatus },
            overrideAccess: false,
            user,
          })
        } else {
          await payload.create({
            collection: "attendance",
            data: {
              student: Number(studentId),
              date: `${input.date}T00:00:00.000Z`,
              status: collectionStatus,
              registeredBy: user.id,
            },
            overrideAccess: false,
            user,
          })
        }
      } catch (error: any) {
        console.error(
          "CORRECT OFFICIAL ATTENDANCE ERROR",
          JSON.stringify(error?.data?.errors ?? error?.message ?? error, null, 2),
        )
        errors.push(`No fue posible actualizar la asistencia del alumno ${studentId}.`)
        continue
      }

      nextMarks[studentId] = {
        ...(nextMarks[studentId] || {}),
        [input.date]: entry.status === "Falta" ? "X" : ".",
      }

      try {
        await payload.create({
          collection: "official-list-corrections",
          data: {
            officialList: numericListId,
            date: input.date,
            student: Number(studentId),
            previousStatus: currentStatus ?? entry.status,
            newStatus: entry.status,
            correctedBy: user.id,
            correctedAt: new Date().toISOString(),
          },
          overrideAccess: false,
          user,
        })
      } catch (error: any) {
        console.error(
          "CORRECT OFFICIAL ATTENDANCE HISTORY ERROR",
          JSON.stringify(error?.data?.errors ?? error?.message ?? error, null, 2),
        )
        errors.push(`No fue posible registrar el historial del alumno ${studentId}.`)
      }

      changed += 1
    }

    if (changed === 0) {
      return {
        ok: false,
        error: "No hay cambios.",
        changed: 0,
        errors,
        officialAttendanceList: null,
      }
    }

    const updated = await payload.update({
      collection: "official-lists",
      id: numericListId,
      data: { marks: nextMarks },
      overrideAccess: false,
      user,
    }) as OfficialListDoc

    const officialDates = [...new Set(
      Object.values(nextMarks).flatMap((studentMarks) => Object.keys(studentMarks || {})),
    )].sort()
    const month = officialDates[0]?.slice(0, 7) || monthFromTitle(updated.title) || ""
    const officialAttendanceList: OfficialAttendanceList = {
      id: String(updated.id),
      group: getRelationName(updated.group),
      month,
      teacher: (typeof updated.teacherName === "string" && updated.teacherName.trim())
        ? updated.teacherName
        : "",
      officialDates,
      students: roster,
      marks: nextMarks,
      updatedAt: new Date().toISOString(),
    }

    return { ok: true, changed, errors, officialAttendanceList }
  } catch (error: any) {
    console.error(
      "CORRECT OFFICIAL ATTENDANCE ERROR",
      JSON.stringify(error?.data?.errors ?? error?.message ?? error, null, 2),
    )
    return {
      ok: false,
      error: "No fue posible corregir la lista oficial. Intenta nuevamente.",
      changed: 0,
      errors: [],
      officialAttendanceList: null,
    }
  }
}

type OfficializeAttendanceInput = {
  group: string
  date: string
  attendance: Array<{ studentId: string; status: Status }>
}

export async function officializeAttendanceAction(
  input: OfficializeAttendanceInput,
): Promise<
  | { ok: true; attendanceRecords: AttendanceRecord[]; officialAttendanceLists: OfficialAttendanceList[]; warning?: string; sessionEnds: boolean }
  | { ok: false; error: string; sessionEnds: boolean }
> {
  const user = await appAuth.currentUser()
  if (!user || user.role !== "Docente") {
    return { ok: false, error: "Solo un docente puede oficializar la asistencia.", sessionEnds: false }
  }
  if (!isString(input.group) || !isISODate(input.date) || !Array.isArray(input.attendance) || input.attendance.length > 500) {
    return { ok: false, error: "La asistencia enviada no tiene un formato válido.", sessionEnds: false }
  }
  if (!input.attendance.every((item) =>
    item && isString(item.studentId) && ["Presente", "Retardo", "Falta"].includes(item.status)
  )) {
    return { ok: false, error: "Hay estados de asistencia no válidos.", sessionEnds: false }
  }

  try {
    const payload = await getPayload({ config })

    const groupsResult = await payload.find({
      collection: "groups",
      where: { name: { equals: input.group } },
      limit: 1,
      overrideAccess: false,
      user,
    })
    const groupDoc = groupsResult.docs[0] as GroupDoc | undefined
    if (!groupDoc) return { ok: false, error: "El grupo no existe.", sessionEnds: false }
    if (getRelationId(groupDoc.teacher) !== String(user.id)) {
      return { ok: false, error: "El grupo no está asignado a tu cuenta docente.", sessionEnds: false }
    }

    const studentsResult = await payload.find({
      collection: "students",
      where: { group: { equals: groupDoc.id } },
      limit: 500,
      sort: "paternalSurname",
      overrideAccess: false,
      user,
    })
    const groupStudents = (studentsResult.docs as StudentDoc[]).filter((student) => student.status !== "Egresado")
    if (!groupStudents.length) return { ok: false, error: "El grupo no tiene alumnos registrados.", sessionEnds: false }

    const submittedStatuses = new Map(input.attendance.map((item) => [item.studentId, item.status]))
    if (submittedStatuses.size !== groupStudents.length ||
      groupStudents.some((student) => !submittedStatuses.has(String(student.id)))) {
      return { ok: false, error: "La lista debe incluir a todos los alumnos del grupo.", sessionEnds: false }
    }

    const existingAttendance = await payload.find({
      collection: "attendance",
      where: {
        and: [
          { student: { in: groupStudents.map((student) => student.id) } },
          { date: { equals: `${input.date}T00:00:00.000Z` } },
        ],
      },
      limit: 500,
      overrideAccess: false,
      user,
    })
    const existingByStudent = new Map(
      (existingAttendance.docs as AttendanceDoc[]).map((doc) => [getRelationId(doc.student), doc]),
    )

    const attendanceRecords: AttendanceRecord[] = []
    for (const student of groupStudents) {
      const studentId = String(student.id)
      const status = submittedStatuses.get(studentId) as Status
      const collectionStatus = mapStatusToCollection(status)
      const existing = existingByStudent.get(studentId)
      if (existing) {
        await payload.update({
          collection: "attendance",
          id: existing.id,
          data: { status: collectionStatus },
          overrideAccess: false,
          user,
        })
      } else {
        await payload.create({
          collection: "attendance",
          data: {
            student: student.id,
            date: `${input.date}T00:00:00.000Z`,
            status: collectionStatus,
            registeredBy: user.id,
          },
          overrideAccess: false,
          user,
        })
      }
      attendanceRecords.push({
        studentId,
        date: input.date,
        time: "—",
        status,
        source: "Pase de lista",
      })
    }

    const month = input.date.slice(0, 7)
    const monthLabel = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" })
      .format(new Date(`${month}-01T12:00:00Z`))
    const title = `Lista oficial ${input.group} · ${monthLabel}`
    const existingLists = await payload.find({
      collection: "official-lists",
      where: {
        and: [
          { group: { equals: groupDoc.id } },
          { title: { equals: title } },
        ],
      },
      limit: 1,
      overrideAccess: false,
      user,
    })
    const existingList = existingLists.docs[0] as OfficialListDoc | undefined
    const existingMarks = (existingList?.marks && typeof existingList.marks === "object" && !Array.isArray(existingList.marks))
      ? (existingList.marks as Record<string, Record<string, "." | "X">>)
      : {}
    const marks: Record<string, Record<string, "." | "X">> = { ...existingMarks }
    for (const student of groupStudents) {
      const studentId = String(student.id)
      const status = submittedStatuses.get(studentId) as Status
      marks[studentId] = {
        ...(marks[studentId] || {}),
        [input.date]: status === "Falta" ? "X" : ".",
      }
    }
    const officialDates = [...new Set([
      ...Object.values(marks).flatMap((studentMarks) => Object.keys(studentMarks || {})),
    ])].sort()

    const roster: OfficialAttendanceStudent[] = groupStudents.map((student, index) => {
      const parts = resolveStudentNameParts(student)
      return {
        studentId: String(student.id),
        name: buildStudentName(parts.givenNames, parts.paternalSurname, parts.maternalSurname),
        listNumber: index + 1,
      }
    })

    let officialListId: string
    if (existingList) {
      const updated = await payload.update({
        collection: "official-lists",
        id: existingList.id,
        data: { marks, roster, teacherName: user.name },
        overrideAccess: false,
        user,
      })
      officialListId = String((updated as OfficialListDoc).id)
    } else {
      const created = await payload.create({
        collection: "official-lists",
        data: {
          title,
          group: groupDoc.id,
          marks,
          roster,
          teacherName: user.name,
        },
        overrideAccess: false,
        user,
      })
      officialListId = String((created as OfficialListDoc).id)
    }

    const officialAttendanceLists: OfficialAttendanceList[] = [
      {
        id: officialListId,
        group: input.group,
        month,
        teacher: user.name,
        officialDates,
        students: roster,
        marks,
        updatedAt: new Date().toISOString(),
      },
    ]

    let warning: string | undefined
    let sessionEnds = false
    const today = todayISO()
    if (input.date === today) {
      try {
        const teacherGroupsResult = await payload.find({
          collection: "groups",
          where: { teacher: { equals: user.id } },
          limit: 200,
          depth: 0,
          overrideAccess: false,
          user,
        })
        const teacherGroupDocs = teacherGroupsResult.docs as GroupDoc[]
        const groupsWithStudents: GroupDoc[] = []
        for (const group of teacherGroupDocs) {
          const studentsInGroup = await payload.find({
            collection: "students",
            where: {
              and: [
                { group: { equals: group.id } },
                { status: { not_equals: "Egresado" } },
              ],
            },
            limit: 1,
            depth: 0,
            overrideAccess: false,
            user,
          })
          if ((studentsInGroup.totalDocs ?? studentsInGroup.docs.length) > 0) {
            groupsWithStudents.push(group)
          }
        }
        let allOfficializedToday = groupsWithStudents.length > 0
        for (const group of groupsWithStudents) {
          const dates = await getOfficializedDatesForGroup(payload, Number(group.id))
          if (!dates.has(today)) {
            allOfficializedToday = false
            break
          }
        }
        sessionEnds = allOfficializedToday
        if (allOfficializedToday) {
          const todayAttendance = await payload.find({
            collection: "teacher-attendance",
            where: {
              and: [
                { teacher: { equals: user.id } },
                { date: { equals: `${today}T00:00:00.000Z` } },
              ],
            },
            limit: 1,
            depth: 0,
            overrideAccess: false,
            user,
          })
          const todayRecord = todayAttendance.docs[0] as TeacherAttendanceDoc | undefined
          if (!todayRecord) {
            warning = "No hay registro de entrada hoy; no se registró salida automática."
          } else if (!todayRecord.exitTime) {
            try {
              await payload.update({
                collection: "teacher-attendance",
                id: todayRecord.id,
                data: { exitTime: new Date().toISOString() },
                overrideAccess: false,
                user,
              })
            } catch (exitError: any) {
              console.error(
                "OFFICIALIZE AUTO EXIT ERROR",
                JSON.stringify(exitError?.data?.errors ?? exitError?.message ?? exitError, null, 2),
              )
              warning = "No fue posible registrar la salida automática del docente."
            }
          }
        }
      } catch (autoExitError: any) {
        console.error(
          "OFFICIALIZE AUTO EXIT CHECK ERROR",
          JSON.stringify(autoExitError?.data?.errors ?? autoExitError?.message ?? autoExitError, null, 2),
        )
        warning = "No fue posible verificar la salida automática del docente."
      }
    }

    return { ok: true, attendanceRecords, officialAttendanceLists, warning, sessionEnds }
  } catch (error: any) {
    console.error(
      "OFFICIALIZE ERROR",
      JSON.stringify(error?.data?.errors ?? error?.message ?? error, null, 2),
    )
    return { ok: false, error: "No fue posible oficializar la lista. Intenta nuevamente.", sessionEnds: false }
  }
}

type RangeDataInput = { desde: string; hasta: string }

type RangeDataResult = {
  attendance: AttendanceRecord[]
  visitors: Visitor[]
  teacherAttendance: TeacherAttendance[]
  truncated: boolean
  warnings: string[]
}

const RANGE_PAGE_SIZE = 500
const RANGE_MAX_PAGES = 20
const MAX_RANGE_DAYS = 800

const daysBetweenInclusive = (desde: string, hasta: string): number => {
  const start = new Date(`${desde}T00:00:00Z`).valueOf()
  const end = new Date(`${hasta}T00:00:00Z`).valueOf()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return Number.POSITIVE_INFINITY
  return Math.floor((end - start) / 86_400_000) + 1
}

const fetchAllPages = async <T>(
  payload: Awaited<ReturnType<typeof getPayload>>,
  args: Parameters<typeof payload.find>[0],
  user: ActionUser,
): Promise<{ docs: T[]; truncated: boolean }> => {
  const docs: T[] = []
  let page = 1
  while (page <= RANGE_MAX_PAGES) {
    let result: Awaited<ReturnType<typeof payload.find>>
    try {
      result = await payload.find({
        ...args,
        page,
        limit: RANGE_PAGE_SIZE,
        overrideAccess: false,
        user,
      })
    } catch (error: any) {
      console.error(
        "LOAD RANGE DATA COLLECTION ERROR",
        JSON.stringify({
          collection: args.collection,
          page,
          message: error?.data?.errors?.[0]?.message ?? error?.message ?? String(error),
          errors: error?.data?.errors ?? null,
        }, null, 2),
      )
      throw error
    }
    docs.push(...(result.docs as T[]))
    if (!result.hasNextPage) return { docs, truncated: false }
    page += 1
  }
  return { docs, truncated: true }
}

export async function loadRangeDataAction(
  input: RangeDataInput,
): Promise<{ ok: true; data: RangeDataResult } | { ok: false; error: string }> {
  const user = await appAuth.currentUser()
  if (!user || user.role !== "Directivo") {
    return { ok: false, error: "Solo un directivo puede consultar rangos de fechas." }
  }
  if (!isISODate(input?.desde) || !isISODate(input?.hasta) || input.desde > input.hasta) {
    return { ok: false, error: "El rango de fechas no es válido." }
  }
  if (daysBetweenInclusive(input.desde, input.hasta) > MAX_RANGE_DAYS) {
    return { ok: false, error: `El rango no puede exceder ${MAX_RANGE_DAYS} días.` }
  }
  try {
    const payload = await getPayload({ config })
    const dayRange = localDayRangeToUTC(input.desde, input.hasta)
    const attendanceWhere = {
      and: [
        { date: { greater_than_equal: `${input.desde}T00:00:00.000Z` } },
        { date: { less_than_equal: `${input.hasta}T00:00:00.000Z` } },
      ],
    }
    const timeWhere = {
      and: [
        { entryTime: { greater_than_equal: dayRange.start } },
        { entryTime: { less_than_equal: dayRange.end } },
      ],
    }

    const warnings: string[] = []

    const loadCollection = async <T>(
      collection: "attendance" | "visitors" | "teacher-attendance",
      args: Parameters<typeof payload.find>[0],
    ): Promise<{ docs: T[]; truncated: boolean }> => {
      try {
        return await fetchAllPages<T>(payload, args, user)
      } catch (error: any) {
        const message = error?.data?.errors?.[0]?.message ?? error?.message ?? String(error)
        console.error(
          `LOAD RANGE DATA COLLECTION FAILED [${collection}]`,
          JSON.stringify({ collection, message, errors: error?.data?.errors ?? null }, null, 2),
        )
        warnings.push(`No fue posible cargar la colección "${collection}".`)
        return { docs: [], truncated: false }
      }
    }

    const [attendance, visitors, teacherAttendance] = await Promise.all([
      loadCollection<AttendanceDoc>("attendance", {
        collection: "attendance",
        where: attendanceWhere,
        sort: "-date",
        depth: 0,
      }),
      loadCollection<VisitorDoc>("visitors", {
        collection: "visitors",
        where: timeWhere,
        sort: "-entryTime",
        depth: 0,
      }),
      loadCollection<TeacherAttendanceDoc>("teacher-attendance", {
        collection: "teacher-attendance",
        where: timeWhere,
        sort: "-date",
        depth: 1,
      }),
    ])

    return {
      ok: true,
      data: {
        attendance: attendance.docs.map(mapAttendanceDoc),
        visitors: visitors.docs.map(mapVisitorDoc),
        teacherAttendance: teacherAttendance.docs.map((doc) => ({
          id: String(doc.id),
          teacher: getRelationName(doc.teacher),
          date: toSchoolDayKey(doc.date),
          entryTime: toHHMM(doc.entryTime),
          exitTime: doc.exitTime ? toHHMM(doc.exitTime) : null,
        })),
        truncated: attendance.truncated || visitors.truncated || teacherAttendance.truncated,
        warnings,
      },
    }
  } catch (error: any) {
    console.error(
      "LOAD RANGE DATA ERROR",
      JSON.stringify(error?.data?.errors ?? error?.message ?? error, null, 2),
    )
    return { ok: false, error: "No fue posible cargar los datos del rango seleccionado." }
  }
}

export async function loadSchoolStateAction(): Promise<
  { ok: true; data: SchoolStateData } | { ok: false; error: string }
> {
  const user = await appAuth.currentUser()
  if (!user) return { ok: false, error: "Sesión no válida." }

  try {
    const payload = await getPayload({ config })

    const safeFind = async (args: any) => {
      try {
        return await payload.find(args)
      } catch (e) {
        console.warn("FIND FALLÓ", args.collection, (e as any)?.message)
        return { docs: [], totalDocs: 0 } as any
      }
    }

    const teachersQuery = user.role === "Docente"
      ? {
          collection: "users" as const,
          where: { id: { equals: user.id } },
          limit: 1,
          sort: "name",
          overrideAccess: true,
        }
      : {
          collection: "users" as const,
          where: { role: { equals: "Docente" } },
          limit: 500,
          sort: "name",
          overrideAccess: false,
          user,
        }

    const canReadVisitors = user.role === "Directivo" || user.role === "Vigilante de Acceso" || user.role === "Docente"

    const [
      groupsResult,
      studentsResult,
      attendanceResult,
      visitorsResult,
      officialListsResult,
      teachersResult,
      teacherAttendanceResult,
      teacherJustificationsResult,
      schoolSettingsResult,
    ] = await Promise.all([
      safeFind({ collection: "groups", limit: 200, sort: "name", overrideAccess: false, user }),
      safeFind({ collection: "students", limit: 2000, sort: "paternalSurname", overrideAccess: false, user }),
      safeFind({ collection: "attendance", limit: 5000, sort: "-date", overrideAccess: false, user }),
      canReadVisitors
        ? safeFind({
            collection: "visitors",
            where: user.role === "Docente" ? { hostUser: { equals: user.id } } : undefined,
            limit: 500,
            sort: "-entryTime",
            overrideAccess: false,
            user,
          })
        : Promise.resolve({ docs: [], totalDocs: 0 } as any),
      safeFind({ collection: "official-lists", limit: 200, sort: "-createdAt", overrideAccess: false, user }),
      safeFind(teachersQuery),
      safeFind({ collection: "teacher-attendance", limit: 2000, sort: "-date", overrideAccess: false, user }),
      safeFind({ collection: "teacher-justifications", limit: 2000, sort: "-date", overrideAccess: false, user }),
      (async () => {
        try {
          return await payload.findGlobal({
            slug: "school-settings",
            depth: 0,
            overrideAccess: false,
            user,
          })
        } catch (e) {
          console.error(
            "LOAD SCHOOL SETTINGS ERROR",
            JSON.stringify((e as any)?.data?.errors ?? (e as any)?.message ?? e, null, 2),
          )
          return null
        }
      })(),
    ])

    const groups = (groupsResult.docs as GroupDoc[]).map((group) => ({ id: String(group.id), name: group.name }))
    const groupsById = new Map<string, string>(groups.map((group) => [group.id, group.name]))
    const studentsByGroup = new Map<string, number>()
    const students: Student[] = (studentsResult.docs as StudentDoc[]).map((doc) => {
      const groupName = groupsById.get(getRelationId(doc.group)) || getRelationName(doc.group)
      const nextNumber = (studentsByGroup.get(groupName) || 0) + 1
      studentsByGroup.set(groupName, nextNumber)
      return mapStudentDoc(doc, parseListNumber(doc.matricula) || nextNumber, groupsById)
    })
    const attendanceRecords = (attendanceResult.docs as AttendanceDoc[]).map(mapAttendanceDoc)
    const visitors = (visitorsResult.docs as VisitorDoc[]).map(mapVisitorDoc)
    const studentsByGroupName = new Map<string, Student[]>()
    for (const student of students) {
      const list = studentsByGroupName.get(student.group) || []
      list.push(student)
      studentsByGroupName.set(student.group, list)
    }
    const teacherNameByGroupId = new Map<string, string>()
    for (const group of groupsResult.docs as GroupDoc[]) {
      const teacherId = getRelationId(group.teacher)
      if (!teacherId) continue
      const teacherDoc = (teachersResult.docs as TeacherUserDoc[]).find((doc) => String(doc.id) === teacherId)
      if (teacherDoc) teacherNameByGroupId.set(String(group.id), teacherDoc.name)
    }
    const officialAttendanceLists = (officialListsResult.docs as OfficialListDoc[]).map((doc) =>
      mapOfficialListDoc(
        doc,
        studentsByGroupName.get(getRelationName(doc.group)),
        teacherNameByGroupId.get(getRelationId(doc.group)),
      ),
    )

    const teacherDocs = teachersResult.docs as TeacherUserDoc[]
    const justificationsByTeacher = new Map<string, string[]>()
    for (const doc of teacherJustificationsResult.docs as TeacherJustificationDoc[]) {
      const teacherId = getRelationId(doc.teacher)
      const list = justificationsByTeacher.get(teacherId) || []
      list.push(toISODate(doc.date))
      justificationsByTeacher.set(teacherId, list)
    }
    const teachers: TeacherProfile[] = teacherDocs.map((doc) => {
      const parts = splitStudentName(doc.name, "")
      return {
        name: doc.name,
        givenNames: parts.givenNames,
        paternalSurname: "",
        maternalSurname: "",
        status: doc.employmentStatus === "Baja temporal" ? "Baja temporal" : "Activo",
        justifiedDates: (justificationsByTeacher.get(String(doc.id)) || []).sort().reverse(),
      }
    })

    const teacherNameById = new Map<string, string>(
      teacherDocs.map((doc) => [String(doc.id), doc.name]),
    )
    const teacherGroups: Record<string, string[]> = {}
    for (const group of groupsResult.docs as GroupDoc[]) {
      const teacherId = getRelationId(group.teacher)
      if (!teacherId) continue
      const teacherName = teacherNameById.get(teacherId)
      if (!teacherName) continue
      const list = teacherGroups[teacherName] || []
      list.push(group.name)
      teacherGroups[teacherName] = list
    }

    const teacherAttendance: TeacherAttendance[] = (teacherAttendanceResult.docs as TeacherAttendanceDoc[]).map((doc) => {
      const teacherId = getRelationId(doc.teacher)
      const teacherDoc = teacherDocs.find((item) => Number(item.id) === Number(teacherId))
      return {
        id: String(doc.id),
        teacher: teacherDoc?.name || getRelationName(doc.teacher),
        date: toISODate(doc.date),
        entryTime: toHHMM(doc.entryTime),
        exitTime: doc.exitTime ? toHHMM(doc.exitTime) : null,
      }
    })

    const configuredDirectorName = (schoolSettingsResult as { directorName?: string | null } | null)?.directorName
    const directorName = (typeof configuredDirectorName === "string" && configuredDirectorName.trim())
      ? configuredDirectorName.trim()
      : DEFAULT_DIRECTOR_NAME

    console.log("LOAD", { groups: groups.length, students: students.length, teachers: teachers.length })
    return {
      ok: true,
      data: {
        students,
        groups,
        attendanceRecords,
        officialAttendanceLists,
        visitors,
        teacherAttendance,
        teacherGroups,
        teachers,
        directorName,
      },
    }
  } catch (error: any) {
    console.error("LOAD ERROR", JSON.stringify((error as any)?.data?.errors ?? (error as any)?.message ?? error, null, 2))
    return { ok: false, error: "No fue posible actualizar la información escolar." }
  }
}

type StudentInput = {
  firstName: string
  paternalSurname: string
  maternalSurname?: string
  lastName?: string
  matricula: string
  groupId: string
  confirmDuplicate?: boolean
}

export async function createStudentAction(
  input: StudentInput,
): Promise<{ ok: true; student: Student } | { ok: false; error: string; code?: "DUPLICATE_NAME" }> {
  const user = await appAuth.currentUser()
  if (!user || (user.role !== "Directivo" && user.role !== "Docente")) {
    return { ok: false, error: "No tienes permiso para crear alumnos." }
  }
  if (!isString(input.matricula) || !isString(input.groupId)) {
    return { ok: false, error: "Los datos del alumno no son válidos." }
  }
  const firstNameResult = validatePersonName(input.firstName, "El nombre", true)
  if (!firstNameResult.ok) return firstNameResult
  const paternalSurnameResult = validatePersonName(input.paternalSurname, "El apellido paterno", true)
  if (!paternalSurnameResult.ok) return paternalSurnameResult
  const maternalSurnameResult = validatePersonName(input.maternalSurname ?? "", "El apellido materno", false)
  if (!maternalSurnameResult.ok) return maternalSurnameResult
  if (input.lastName !== undefined && !isString(input.lastName)) {
    return { ok: false, error: "Los datos del alumno no son válidos." }
  }
  const groupId = Number(input.groupId)
  if (!Number.isInteger(groupId)) {
    return { ok: false, error: "El grupo seleccionado no es válido." }
  }
  try {
    const payload = await getPayload({ config })
    if (user.role === "Docente") {
      const group = await payload.findByID({
        collection: "groups",
        id: groupId,
        depth: 0,
        overrideAccess: true,
        user,
      })
      const teacherId = group?.teacher && typeof group.teacher === "object"
        ? group.teacher.id
        : group?.teacher
      if (String(teacherId ?? "") !== String(user.id)) {
        return { ok: false, error: "Solo puedes agregar alumnos a tus grupos asignados." }
      }
    }
    const groupDoc = await payload.findByID({
      collection: "groups",
      id: groupId,
      depth: 0,
      overrideAccess: false,
      user,
    }) as GroupDoc | null
    if (!groupDoc) {
      return { ok: false, error: "El grupo seleccionado no existe." }
    }
    const firstName = firstNameResult.value
    const paternalSurname = paternalSurnameResult.value
    const maternalSurname = maternalSurnameResult.value
    const lastName = normalizePersonName(input.lastName ?? "") || `${paternalSurname} ${maternalSurname}`.trim()

    if (input.confirmDuplicate !== true) {
      const duplicate = await findDuplicateStudentInGroup(
        payload,
        groupId,
        firstName,
        paternalSurname,
        maternalSurname,
        null,
        user,
      )
      if (duplicate) {
        return {
          ok: false,
          code: "DUPLICATE_NAME",
          error: "Ya existe un alumno con ese nombre en este grupo.",
        }
      }
    }

    const baseCounter = await getGroupMatriculaCounter(payload, groupId, groupDoc.name, user)
    let attempt = 0
    let lastError: any = null
    while (attempt < 2) {
      const consecutive = baseCounter + 1 + attempt
      const matricula = buildMatricula(groupDoc.name, consecutive)
      try {
        const doc = await payload.create({
          collection: "students",
          data: {
            firstName,
            paternalSurname,
            maternalSurname: maternalSurname || undefined,
            lastName,
            matricula,
            group: groupId,
          },
          overrideAccess: false,
          user,
        })
        await bumpGroupMatriculaCounter(payload, groupId, consecutive, user)
        const created = doc as StudentDoc
        return { ok: true, student: mapStudentDoc(created, parseListNumber(created.matricula)) }
      } catch (error: any) {
        lastError = error
        if (!/unique|duplicate|UNIQUE/i.test(error?.message ?? "")) {
          throw error
        }
        attempt += 1
      }
    }
    console.error(
      "CREATE STUDENT DUPLICATE MATRICULA",
      JSON.stringify(lastError?.data?.errors ?? lastError?.message ?? lastError, null, 2),
    )
    return {
      ok: false,
      error: "No fue posible asignar una matrícula única en este grupo. Intenta nuevamente.",
    }
  } catch (error: any) {
    console.error(
      "ERROR AL CREAR ALUMNO:",
      JSON.stringify(error?.data?.errors ?? error?.message ?? error, null, 2),
    )
    if (/unique|duplicate|UNIQUE/i.test(error?.message ?? "")) {
      return { ok: false, error: "Esa matrícula ya está registrada." }
    }
    return { ok: false, error: "No fue posible crear el alumno." }
  }
}

export async function studentAppearsInOfficialMarksAction(
  id: string,
): Promise<{ ok: true; appears: boolean } | { ok: false; error: string }> {
  const user = await appAuth.currentUser()
  if (!user || user.role !== "Directivo") {
    return { ok: false, error: "No tienes permiso para consultar esta información." }
  }
  if (!isString(id)) return { ok: false, error: "Identificador inválido." }
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return { ok: false, error: "Identificador inválido." }
  }
  try {
    const payload = await getPayload({ config })
    const appears = await isStudentInOfficialMarks(payload, numericId)
    return { ok: true, appears }
  } catch (error: any) {
    console.error(
      "STUDENT OFFICIAL MARKS CHECK ERROR",
      JSON.stringify(error?.data?.errors ?? error?.message ?? error, null, 2),
    )
    return { ok: false, error: "No fue posible verificar las listas oficiales." }
  }
}

export async function updateStudentAction(
  id: string,
  input: Partial<StudentInput>,
): Promise<
  | { ok: true; student: Student; studentInOfficialMarks: boolean }
  | { ok: false; error: string; code?: "DUPLICATE_NAME" }
> {
  const user = await appAuth.currentUser()
  if (!user || user.role !== "Directivo") {
    return { ok: false, error: "No tienes permiso para editar alumnos." }
  }
  if (!isString(id)) return { ok: false, error: "Identificador inválido." }
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return { ok: false, error: "Identificador inválido." }
  }
  const data: Record<string, string | number> = {}
  if (input.firstName !== undefined) {
    const result = validatePersonName(input.firstName, "El nombre", true)
    if (!result.ok) return result
    data.firstName = result.value
  }
  if (input.paternalSurname !== undefined) {
    const result = validatePersonName(input.paternalSurname, "El apellido paterno", true)
    if (!result.ok) return result
    data.paternalSurname = result.value
  }
  if (input.maternalSurname !== undefined) {
    const result = validatePersonName(input.maternalSurname, "El apellido materno", false)
    if (!result.ok) return result
    data.maternalSurname = result.value
  }
  if (input.lastName !== undefined) {
    if (!isString(input.lastName)) {
      return { ok: false, error: "Los apellidos no son válidos." }
    }
    data.lastName = normalizePersonName(input.lastName)
  }
  let nextGroupId: number | null = null
  if (input.groupId !== undefined) {
    if (!isString(input.groupId) || !input.groupId.trim()) {
      return { ok: false, error: "El grupo seleccionado no es válido." }
    }
    const parsed = Number(input.groupId)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return { ok: false, error: "El grupo seleccionado no es válido." }
    }
    nextGroupId = parsed
  }
  if (!Object.keys(data).length && nextGroupId === null) {
    return { ok: false, error: "No hay cambios para guardar." }
  }
  try {
    const payload = await getPayload({ config })

    const current = await payload.findByID({
      collection: "students",
      id: numericId,
      depth: 0,
      overrideAccess: false,
      user,
    }) as StudentDoc | null
    if (!current) return { ok: false, error: "El alumno no existe." }

    const currentGroupId = getRelationId(current.group)
    const groupChanged = nextGroupId !== null && String(nextGroupId) !== currentGroupId

    if (input.confirmDuplicate !== true) {
      const currentParts = resolveStudentNameParts(current)
      const nextGivenNames = typeof data.firstName === "string" ? data.firstName : currentParts.givenNames
      const nextPaternalSurname = typeof data.paternalSurname === "string" ? data.paternalSurname : currentParts.paternalSurname
      const nextMaternalSurname = typeof data.maternalSurname === "string" ? data.maternalSurname : currentParts.maternalSurname
      const targetGroupId = groupChanged ? (nextGroupId as number) : Number(currentGroupId)
      if (Number.isInteger(targetGroupId) && targetGroupId > 0) {
        const duplicate = await findDuplicateStudentInGroup(
          payload,
          targetGroupId,
          nextGivenNames,
          nextPaternalSurname,
          nextMaternalSurname,
          numericId,
          user,
        )
        if (duplicate) {
          return {
            ok: false,
            code: "DUPLICATE_NAME",
            error: "Ya existe un alumno con ese nombre en este grupo.",
          }
        }
      }
    }

    if (groupChanged) {
      const group = await payload.findByID({
        collection: "groups",
        id: nextGroupId as number,
        depth: 0,
        overrideAccess: false,
        user,
      }) as GroupDoc | null
      if (!group) return { ok: false, error: "El grupo seleccionado no existe." }

      const currentConsecutive = parseListNumber(current.matricula)
      if (!currentConsecutive) {
        return { ok: false, error: "El alumno no tiene un consecutivo válido en su matrícula." }
      }
      const preferredMatricula = buildMatricula(group.name, currentConsecutive)
      const collision = await payload.find({
        collection: "students",
        where: {
          and: [
            { matricula: { equals: preferredMatricula } },
            { id: { not_equals: numericId } },
          ],
        },
        limit: 1,
        depth: 0,
        overrideAccess: false,
        user,
      })
      let nextMatricula = preferredMatricula
      let nextConsecutive = currentConsecutive
      if (collision.docs.length > 0) {
        const counter = await getGroupMatriculaCounter(payload, nextGroupId as number, group.name, user)
        nextConsecutive = counter + 1
        nextMatricula = buildMatricula(group.name, nextConsecutive)
      }
      data.group = nextGroupId as number
      data.matricula = nextMatricula
      await bumpGroupMatriculaCounter(payload, nextGroupId as number, nextConsecutive, user)
    }

    const doc = await payload.update({
      collection: "students",
      id: numericId,
      data,
      overrideAccess: false,
      user,
    })
    const studentInOfficialMarks = groupChanged
      ? await isStudentInOfficialMarks(payload, numericId)
      : false
    return {
      ok: true,
      student: mapStudentDoc(doc as StudentDoc, parseListNumber((doc as StudentDoc).matricula)),
      studentInOfficialMarks,
    }
  } catch (error: any) {
    console.error(
      "UPDATE STUDENT ERROR",
      JSON.stringify(error?.data?.errors ?? error?.message ?? error, null, 2),
    )
    if (/unique|duplicate|UNIQUE/i.test(error?.message ?? "")) {
      return { ok: false, error: "Esa matrícula ya está registrada." }
    }
    return { ok: false, error: "No fue posible actualizar el alumno." }
  }
}

export async function deleteStudentAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await appAuth.currentUser()
  if (!user || (user.role !== "Directivo" && user.role !== "Docente")) {
    return { ok: false, error: "No tienes permiso para eliminar alumnos." }
  }
  if (!isString(id)) return { ok: false, error: "Identificador inválido." }
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return { ok: false, error: "Identificador inválido." }
  }
  try {
    const payload = await getPayload({ config })

    if (user.role === "Docente") {
      const owns = await assertDocenteOwnsStudent(payload, numericId, user)
      if (!owns) {
        return { ok: false, error: "No tienes permiso sobre este alumno." }
      }
      if (await isStudentInOfficialMarks(payload, numericId)) {
        return { ok: false, error: "El alumno tiene asistencia oficializada. Solo el Directivo puede eliminarlo." }
      }
    }

    await payload.delete({
      collection: "attendance",
      where: { student: { equals: numericId } },
      overrideAccess: user.role === "Docente",
      user,
    })

    await payload.delete({ collection: "students", id: numericId, overrideAccess: false, user })
    return { ok: true }
  } catch (error: any) {
    console.error(
      "DELETE STUDENT ERROR",
      JSON.stringify(error?.data?.errors ?? error?.message ?? error, null, 2),
    )
    return { ok: false, error: "No fue posible eliminar el alumno." }
  }
}

type GroupInput = {
  name: string
  grade: number
  teacherId?: string | null
}

export async function createGroupAction(
  input: GroupInput,
): Promise<{ ok: true; group: { id: string; name: string; grade: number } } | { ok: false; error: string }> {
  const user = await appAuth.currentUser()
  if (!user || user.role !== "Directivo") {
    return { ok: false, error: "No tienes permiso para crear grupos." }
  }
  if (!isString(input.name) || !Number.isInteger(input.grade) || input.grade < 1 || input.grade > 6) {
    return { ok: false, error: "Los datos del grupo no son válidos." }
  }
  const name = input.name.trim()
  try {
    const payload = await getPayload({ config })
    const existing = await payload.find({
      collection: "groups",
      where: { name: { equals: name } },
      limit: 1,
      overrideAccess: false,
      user,
    })
    if (existing.docs.length > 0) {
      return { ok: false, error: "Ese grupo ya existe." }
    }
    const doc = await payload.create({
      collection: "groups",
      data: {
        name,
        grade: input.grade,
        teacher: input.teacherId ? Number(input.teacherId) : undefined,
      },
      overrideAccess: false,
      user,
    })
    const group = doc as GroupDoc
    return { ok: true, group: { id: String(group.id), name: group.name, grade: group.grade } }
  } catch (error: any) {
    console.error("CREATE GROUP ERROR", error?.message)
    if (/unique|duplicate|UNIQUE/i.test(error?.message ?? "")) {
      return { ok: false, error: "Ese grupo ya existe." }
    }
    return { ok: false, error: "No fue posible crear el grupo." }
  }
}

export async function updateGroupAction(
  id: string,
  input: Partial<GroupInput>,
): Promise<{ ok: true; group: { id: string; name: string; grade: number } } | { ok: false; error: string }> {
  const user = await appAuth.currentUser()
  if (!user || user.role !== "Directivo") {
    return { ok: false, error: "No tienes permiso para actualizar grupos." }
  }
  if (!isString(id)) return { ok: false, error: "Identificador inválido." }
  const data: Record<string, unknown> = {}
  if (input.name !== undefined) {
    if (!isString(input.name) || !input.name.trim()) {
      return { ok: false, error: "El nombre del grupo no es válido." }
    }
    data.name = input.name.trim()
  }
  if (input.grade !== undefined) {
    if (!Number.isInteger(input.grade) || input.grade < 1 || input.grade > 6) {
      return { ok: false, error: "El grado debe ser un número entero entre 1 y 6." }
    }
    data.grade = input.grade
  }
  if (input.teacherId !== undefined) data.teacher = input.teacherId ? Number(input.teacherId) : null
  if (!Object.keys(data).length) return { ok: false, error: "No hay cambios para guardar." }
  try {
    const payload = await getPayload({ config })
    const doc = await payload.update({
      collection: "groups",
      id,
      data,
      overrideAccess: false,
      user,
    })
    const group = doc as GroupDoc
    return { ok: true, group: { id: String(group.id), name: group.name, grade: group.grade } }
  } catch (error: any) {
    console.error("UPDATE GROUP ERROR", error?.message)
    return { ok: false, error: "No fue posible actualizar el grupo." }
  }
}

export async function deleteGroupAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await appAuth.currentUser()
  if (!user || user.role !== "Directivo") {
    return { ok: false, error: "No tienes permiso para eliminar grupos." }
  }
  if (!isString(id)) return { ok: false, error: "Identificador inválido." }
  try {
    const payload = await getPayload({ config })
    const numericId = Number(id)
    if (!Number.isInteger(numericId) || numericId <= 0) {
      return { ok: false, error: "Identificador inválido." }
    }
    const groupStudents = await payload.find({
      collection: "students",
      where: { group: { equals: numericId } },
      limit: 1000,
      depth: 0,
      overrideAccess: false,
      user,
    })
    const studentCount = groupStudents.totalDocs ?? groupStudents.docs.length
    if (studentCount > 0) {
      return {
        ok: false,
        error: `El grupo tiene ${studentCount} ${studentCount === 1 ? "alumno" : "alumnos"}. Muévelos o elimínalos antes.`,
      }
    }
    await payload.delete({ collection: "groups", id: numericId, overrideAccess: false, user })
    return { ok: true }
  } catch (error: any) {
    console.error(
      "DELETE GROUP ERROR",
      JSON.stringify(error?.data?.errors ?? error?.message ?? error, null, 2),
    )
    return { ok: false, error: "No fue posible eliminar el grupo." }
  }
}

type AttendanceInput = {
  studentId: string
  date: string
  status: Status
}

export async function createAttendanceAction(
  input: AttendanceInput,
): Promise<{ ok: true; record: AttendanceRecord } | { ok: false; error: string }> {
  const user = await appAuth.currentUser()
  if (!user || (user.role !== "Directivo" && user.role !== "Docente")) {
    return { ok: false, error: "No tienes permiso para registrar asistencia." }
  }
  if (!isString(input.studentId) || !isISODate(input.date) || !["Presente", "Retardo", "Falta"].includes(input.status)) {
    return { ok: false, error: "Los datos de asistencia no son válidos." }
  }
  try {
    const payload = await getPayload({ config })
    if (user.role === "Docente") {
      const owns = await assertDocenteOwnsStudent(payload, input.studentId, user)
      if (!owns) {
        return { ok: false, error: "No tienes permiso sobre este alumno." }
      }
      if (await isStudentDateOfficialized(payload, input.studentId, input.date)) {
        return { ok: false, error: "La lista ya fue oficializada. Solo el Directivo puede modificarla." }
      }
    }
    const doc = await payload.create({
      collection: "attendance",
      data: {
        student: Number(input.studentId),
        date: `${input.date}T00:00:00.000Z`,
        status: mapStatusToCollection(input.status),
        registeredBy: user.id,
      },
      overrideAccess: false,
      user,
    })
    return { ok: true, record: mapAttendanceDoc(doc as AttendanceDoc) }
  } catch (error: any) {
    console.error(
      "CREATE ATTENDANCE ERROR",
      JSON.stringify(error?.data?.errors ?? error?.message ?? error, null, 2),
    )
    return { ok: false, error: "No fue posible registrar la asistencia." }
  }
}

export async function updateAttendanceAction(
  id: string,
  input: Partial<AttendanceInput>,
): Promise<{ ok: true; record: AttendanceRecord } | { ok: false; error: string }> {
  const user = await appAuth.currentUser()
  if (!user || (user.role !== "Directivo" && user.role !== "Docente")) {
    return { ok: false, error: "No tienes permiso para actualizar asistencia." }
  }
  if (!isString(id)) return { ok: false, error: "Identificador inválido." }
  if (user.role === "Docente" && "registeredBy" in (input as Record<string, unknown>)) {
    return { ok: false, error: "No tienes permiso sobre este alumno." }
  }
  const data: Record<string, unknown> = {}
  if (isString(input.studentId)) data.student = Number(input.studentId)
  if (isISODate(input.date)) data.date = `${input.date}T00:00:00.000Z`
  if (input.status && ["Presente", "Retardo", "Falta"].includes(input.status)) {
    data.status = mapStatusToCollection(input.status)
  }
  if (!Object.keys(data).length) return { ok: false, error: "No hay cambios para guardar." }
  try {
    const payload = await getPayload({ config })
    if (user.role === "Docente") {
      const existing = await payload.findByID({
        collection: "attendance",
        id,
        depth: 0,
        overrideAccess: true,
        user,
      }) as AttendanceDoc | null
      const existingStudentId = Number(getRelationId(existing?.student))
      if (existingStudentId) {
        const ownsExisting = await assertDocenteOwnsStudent(payload, existingStudentId, user)
        if (!ownsExisting) {
          return { ok: false, error: "No tienes permiso sobre este alumno." }
        }
      }
      if (isString(input.studentId)) {
        const ownsNew = await assertDocenteOwnsStudent(payload, input.studentId, user)
        if (!ownsNew) {
          return { ok: false, error: "No tienes permiso sobre este alumno." }
        }
      }
      const studentId = isString(input.studentId)
        ? Number(input.studentId)
        : existingStudentId
      const effectiveDate = isISODate(input.date)
        ? input.date
        : toISODate(existing?.date)
      if (studentId && effectiveDate) {
        if (await isStudentDateOfficialized(payload, studentId, effectiveDate)) {
          return { ok: false, error: "La lista ya fue oficializada. Solo el Directivo puede modificarla." }
        }
      }
    }
    const doc = await payload.update({
      collection: "attendance",
      id,
      data,
      overrideAccess: false,
      user,
    })
    return { ok: true, record: mapAttendanceDoc(doc as AttendanceDoc) }
  } catch (error: any) {
    console.error(
      "UPDATE ATTENDANCE ERROR",
      JSON.stringify(error?.data?.errors ?? error?.message ?? error, null, 2),
    )
    return { ok: false, error: "No fue posible actualizar la asistencia." }
  }
}

export async function deleteAttendanceAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await appAuth.currentUser()
  if (!user || user.role !== "Directivo") {
    return { ok: false, error: "No tienes permiso para eliminar asistencia." }
  }
  if (!isString(id)) return { ok: false, error: "Identificador inválido." }
  try {
    const payload = await getPayload({ config })
    await payload.delete({ collection: "attendance", id, overrideAccess: false, user })
    return { ok: true }
  } catch (error: any) {
    console.error("DELETE ATTENDANCE ERROR", error?.message)
    return { ok: false, error: "No fue posible eliminar la asistencia." }
  }
}

type VisitorInput = {
  name: string
  reason: string
  entryTime: string
  exitTime?: string | null
  host?: string
  hostUserId?: string | null
  authorizeEntry?: boolean
}

export async function createVisitorAction(
  input: VisitorInput,
): Promise<{ ok: true; visitor: Visitor } | { ok: false; error: string }> {
  const user = await appAuth.currentUser()
  if (!user || (user.role !== "Directivo" && user.role !== "Vigilante de Acceso" && user.role !== "Docente")) {
    return { ok: false, error: "No tienes permiso para registrar visitantes." }
  }
  if (!isString(input.name) || !isString(input.reason) || !isISODateTime(input.entryTime)) {
    return { ok: false, error: "Los datos del visitante no son válidos." }
  }
  const host = isString(input.host) ? input.host.trim() : ""
  if (host.length > 120) {
    return { ok: false, error: "La persona o área visitada no puede exceder 120 caracteres." }
  }
  let hostUserId: number | null = null
  if (input.hostUserId !== undefined && input.hostUserId !== null && input.hostUserId !== "") {
    if (!isString(input.hostUserId)) {
      return { ok: false, error: "El docente o directivo visitado no es válido." }
    }
    const parsed = Number(input.hostUserId)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return { ok: false, error: "El docente o directivo visitado no es válido." }
    }
    hostUserId = parsed
  }
  try {
    const payload = await getPayload({ config })
    if (hostUserId !== null) {
      const hostResult = await payload.find({
        collection: "users",
        where: {
          and: [
            { id: { equals: hostUserId } },
            { role: { in: ["Docente", "Directivo"] } },
          ],
        },
        limit: 1,
        depth: 0,
        overrideAccess: false,
        user,
      })
      if (!hostResult.docs.length) {
        return { ok: false, error: "El docente o directivo visitado no existe." }
      }
    }

    const now = new Date().toISOString()
    const data: Record<string, unknown> = {
      name: input.name.trim(),
      reason: input.reason.trim(),
      entryTime: input.entryTime,
      exitTime: input.exitTime || null,
      registeredBy: user.id,
    }

    if (user.role === "Docente") {
      data.host = user.name
      data.hostUser = user.id
      data.authorizationStatus = "Autorizada"
      data.authorizedBy = user.id
      data.authorizedByName = user.name
      data.authorizedAt = now
    } else if (user.role === "Vigilante de Acceso") {
      data.host = host || undefined
      data.hostUser = hostUserId ?? undefined
      data.authorizationStatus = "Pendiente"
    } else {
      const authorizeEntry = input.authorizeEntry !== false
      data.host = host || undefined
      data.hostUser = hostUserId ?? undefined
      if (authorizeEntry) {
        data.authorizationStatus = "Autorizada"
        data.authorizedBy = user.id
        data.authorizedByName = user.name
        data.authorizedAt = now
      } else {
        data.authorizationStatus = "Pendiente"
      }
    }

    const doc = await payload.create({
      collection: "visitors",
      data: data as any,
      overrideAccess: false,
      user,
    })
    return { ok: true, visitor: mapVisitorDoc(doc as VisitorDoc) }
  } catch (error: any) {
    console.error(
      "CREATE VISITOR ERROR",
      JSON.stringify(error?.data?.errors ?? error?.message ?? error, null, 2),
    )
    return { ok: false, error: "No fue posible registrar al visitante." }
  }
}

export async function updateVisitorAction(
  id: string,
  input: Partial<VisitorInput>,
): Promise<{ ok: true; visitor: Visitor } | { ok: false; error: string }> {
  const user = await appAuth.currentUser()
  if (!user || (user.role !== "Directivo" && user.role !== "Vigilante de Acceso" && user.role !== "Docente")) {
    return { ok: false, error: "No tienes permiso para actualizar visitantes." }
  }
  if (!isString(id)) return { ok: false, error: "Identificador inválido." }
  const data: Record<string, unknown> = {}
  if (user.role === "Directivo") {
    if (isString(input.name)) data.name = input.name.trim()
    if (isString(input.reason)) data.reason = input.reason.trim()
    if (isISODateTime(input.entryTime)) data.entryTime = input.entryTime
  }
  if (input.exitTime !== undefined) data.exitTime = input.exitTime || null
  if (!Object.keys(data).length) return { ok: false, error: "No hay cambios para guardar." }
  try {
    const payload = await getPayload({ config })
    const existing = await payload.findByID({
      collection: "visitors",
      id,
      depth: 0,
      overrideAccess: false,
      user,
    }) as VisitorDoc | null
    if (!existing) {
      return { ok: false, error: "La visita no existe." }
    }
    if (user.role === "Vigilante de Acceso") {
      if (getRelationId(existing.registeredBy) !== String(user.id)) {
        return { ok: false, error: "No tienes permiso sobre este registro." }
      }
      if (Object.keys(data).some((key) => key !== "exitTime")) {
        return { ok: false, error: "Solo puedes registrar la salida de la visita." }
      }
    }
    if (user.role === "Docente") {
      if (getRelationId(existing.hostUser) !== String(user.id)) {
        return { ok: false, error: "Solo puedes actualizar las visitas dirigidas a ti." }
      }
      if (Object.keys(data).some((key) => key !== "exitTime")) {
        return { ok: false, error: "Solo puedes registrar la salida de la visita." }
      }
    }
    const doc = await payload.update({
      collection: "visitors",
      id,
      data,
      overrideAccess: false,
      user,
    })
    return { ok: true, visitor: mapVisitorDoc(doc as VisitorDoc) }
  } catch (error: any) {
    console.error(
      "UPDATE VISITOR ERROR",
      JSON.stringify(error?.data?.errors ?? error?.message ?? error, null, 2),
    )
    return { ok: false, error: "No fue posible actualizar al visitante." }
  }
}

type AuthorizeVisitorInput = {
  visitorId: string
  decision: "Autorizada" | "Rechazada"
}

export async function authorizeVisitorAction(
  input: AuthorizeVisitorInput,
): Promise<{ ok: true; visitor: Visitor } | { ok: false; error: string }> {
  const user = await appAuth.currentUser()
  if (!user || (user.role !== "Directivo" && user.role !== "Docente")) {
    return { ok: false, error: "No tienes permiso para autorizar visitas." }
  }
  if (!isString(input.visitorId) || (input.decision !== "Autorizada" && input.decision !== "Rechazada")) {
    return { ok: false, error: "Los datos de la autorización no son válidos." }
  }
  const numericId = Number(input.visitorId)
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return { ok: false, error: "Identificador inválido." }
  }
  try {
    const payload = await getPayload({ config })
    const existing = await payload.findByID({
      collection: "visitors",
      id: numericId,
      depth: 0,
      overrideAccess: false,
      user,
    }) as VisitorDoc | null
    if (!existing) {
      return { ok: false, error: "La visita no existe." }
    }
    const currentStatus = existing.authorizationStatus === "Autorizada" || existing.authorizationStatus === "Rechazada"
      ? existing.authorizationStatus
      : "Pendiente"
    if (currentStatus !== "Pendiente") {
      return { ok: false, error: "Esta visita ya fue resuelta." }
    }
    if (user.role === "Docente" && getRelationId(existing.hostUser) !== String(user.id)) {
      return { ok: false, error: "Solo puedes autorizar las visitas dirigidas a ti." }
    }
    const doc = await payload.update({
      collection: "visitors",
      id: numericId,
      data: {
        authorizationStatus: input.decision,
        authorizedBy: user.id,
        authorizedByName: user.name,
        authorizedAt: new Date().toISOString(),
      },
      overrideAccess: false,
      user,
    })
    return { ok: true, visitor: mapVisitorDoc(doc as VisitorDoc) }
  } catch (error: any) {
    console.error(
      "AUTHORIZE VISITOR ERROR",
      JSON.stringify(error?.data?.errors ?? error?.message ?? error, null, 2),
    )
    return { ok: false, error: "No fue posible registrar la autorización." }
  }
}

export async function deleteVisitorAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await appAuth.currentUser()
  if (!user || user.role !== "Directivo") {
    return { ok: false, error: "No tienes permiso para eliminar visitas." }
  }
  if (!isString(id)) return { ok: false, error: "Identificador inválido." }
  try {
    const payload = await getPayload({ config })
    await payload.delete({ collection: "visitors", id, overrideAccess: false, user })
    return { ok: true }
  } catch (error: any) {
    console.error("DELETE VISITOR ERROR", error?.message)
    return { ok: false, error: "No fue posible eliminar al visitante." }
  }
}

type TeacherAttendanceInput = {
  teacherId: string
  date: string
  entryTime: string
  exitTime?: string | null
}

export async function createTeacherAttendanceAction(
  input: TeacherAttendanceInput,
): Promise<{ ok: true; record: TeacherAttendance } | { ok: false; error: string }> {
  const user = await appAuth.currentUser()
  if (!user || (user.role !== "Directivo" && user.role !== "Docente")) {
    return { ok: false, error: "No tienes permiso para registrar asistencia docente." }
  }
  if (!isString(input.teacherId) || !isISODate(input.date) || !isISODateTime(input.entryTime)) {
    return { ok: false, error: "Los datos de asistencia docente no son válidos." }
  }
  if (user.role === "Docente" && String(user.id) !== input.teacherId) {
    return { ok: false, error: "Solo puedes registrar tu propia asistencia." }
  }
  try {
    const payload = await getPayload({ config })
    const doc = await payload.create({
      collection: "teacher-attendance",
      data: {
        teacher: Number(input.teacherId),
        date: `${input.date}T00:00:00.000Z`,
        entryTime: input.entryTime,
        exitTime: input.exitTime || null,
      },
      overrideAccess: false,
      user,
    })
    const created = doc as TeacherAttendanceDoc
    return {
      ok: true,
      record: {
        id: String(created.id),
        teacher: getRelationName(created.teacher),
        date: toISODate(created.date),
        entryTime: toHHMM(created.entryTime),
        exitTime: created.exitTime ? toHHMM(created.exitTime) : null,
      },
    }
  } catch (error: any) {
    console.error("CREATE TEACHER ATTENDANCE ERROR", error?.message)
    return { ok: false, error: "No fue posible registrar la asistencia docente." }
  }
}

export async function updateTeacherAttendanceAction(
  id: string,
  input: { exitTime?: string | null },
): Promise<{ ok: true; record: TeacherAttendance } | { ok: false; error: string }> {
  const user = await appAuth.currentUser()
  if (!user || (user.role !== "Directivo" && user.role !== "Docente")) {
    return { ok: false, error: "No tienes permiso para actualizar asistencia docente." }
  }
  if (!isString(id)) return { ok: false, error: "Identificador inválido." }
  const data: Record<string, unknown> = {}
  if (input.exitTime !== undefined) {
    if (input.exitTime !== null && !isISODateTime(input.exitTime)) {
      return { ok: false, error: "La hora de salida no es válida." }
    }
    data.exitTime = input.exitTime
  }
  if (!Object.keys(data).length) return { ok: false, error: "No hay cambios para guardar." }
  try {
    const payload = await getPayload({ config })
    if (user.role === "Docente") {
      const existing = await payload.findByID({
        collection: "teacher-attendance",
        id,
        depth: 0,
        overrideAccess: true,
        user,
      }) as TeacherAttendanceDoc | null
      if (!existing || getRelationId(existing.teacher) !== String(user.id)) {
        return { ok: false, error: "No tienes permiso sobre este registro." }
      }
      if (toISODate(existing.date) !== todayISO()) {
        return { ok: false, error: "Ese registro no corresponde al día de hoy." }
      }
    }
    const doc = await payload.update({
      collection: "teacher-attendance",
      id,
      data,
      overrideAccess: false,
      user,
    })
    const updated = doc as TeacherAttendanceDoc
    if (input.exitTime !== undefined && input.exitTime !== null && !updated.exitTime) {
      console.error(
        "UPDATE TEACHER ATTENDANCE NOT PERSISTED",
        JSON.stringify({ id, requestedExitTime: input.exitTime, storedExitTime: updated.exitTime }, null, 2),
      )
      return { ok: false, error: "La salida no se guardó en el servidor. Intenta nuevamente." }
    }
    const verified = await payload.findByID({
      collection: "teacher-attendance",
      id,
      depth: 0,
      overrideAccess: true,
      user,
    }) as TeacherAttendanceDoc | null
    if (!verified) {
      console.error("UPDATE TEACHER ATTENDANCE VERIFY MISSING", JSON.stringify({ id }, null, 2))
      return { ok: false, error: "No fue posible confirmar la salida registrada." }
    }
    if (input.exitTime !== undefined && input.exitTime !== null && !verified.exitTime) {
      console.error(
        "UPDATE TEACHER ATTENDANCE VERIFY MISMATCH",
        JSON.stringify({ id, requestedExitTime: input.exitTime, storedExitTime: verified.exitTime }, null, 2),
      )
      return { ok: false, error: "La salida no se guardó en el servidor. Intenta nuevamente." }
    }
    return {
      ok: true,
      record: {
        id: String(verified.id),
        teacher: getRelationName(verified.teacher),
        date: toISODate(verified.date),
        entryTime: toHHMM(verified.entryTime),
        exitTime: verified.exitTime ? toHHMM(verified.exitTime) : null,
      },
    }
  } catch (error: any) {
    console.error(
      "UPDATE TEACHER ATTENDANCE ERROR",
      JSON.stringify(error?.data?.errors ?? error?.message ?? error, null, 2),
    )
    return { ok: false, error: "No fue posible actualizar la asistencia docente." }
  }
}

type TeacherJustificationInput = {
  teacherId: string
  date: string
  reason?: string
}

export async function createTeacherJustificationAction(
  input: TeacherJustificationInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await appAuth.currentUser()
  if (!user || user.role !== "Directivo") {
    return { ok: false, error: "Solo un directivo puede registrar justificantes." }
  }
  if (!isString(input.teacherId) || !isISODate(input.date)) {
    return { ok: false, error: "Los datos del justificante no son válidos." }
  }
  try {
    const payload = await getPayload({ config })
    await payload.create({
      collection: "teacher-justifications",
      data: {
        teacher: Number(input.teacherId),
        date: `${input.date}T00:00:00.000Z`,
        reason: input.reason?.trim() || undefined,
        createdByUser: user.id,
      },
      overrideAccess: false,
      user,
    })
    return { ok: true }
  } catch (error: any) {
    console.error("CREATE TEACHER JUSTIFICATION ERROR", error?.message)
    return { ok: false, error: "No fue posible registrar el justificante." }
  }
}

export async function deleteTeacherJustificationAction(
  teacherId: string,
  date: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await appAuth.currentUser()
  if (!user || user.role !== "Directivo") {
    return { ok: false, error: "Solo un directivo puede eliminar justificantes." }
  }
  if (!isString(teacherId) || !isISODate(date)) {
    return { ok: false, error: "Los datos del justificante no son válidos." }
  }
  try {
    const payload = await getPayload({ config })
    const existing = await payload.find({
      collection: "teacher-justifications",
      where: {
        and: [
          { teacher: { equals: Number(teacherId) } },
          { date: { equals: `${date}T00:00:00.000Z` } },
        ],
      },
      limit: 1,
      overrideAccess: false,
      user,
    })
    const doc = existing.docs[0]
    if (!doc) return { ok: false, error: "El justificante no existe." }
    await payload.delete({ collection: "teacher-justifications", id: doc.id, overrideAccess: false, user })
    return { ok: true }
  } catch (error: any) {
    console.error("DELETE TEACHER JUSTIFICATION ERROR", error?.message)
    return { ok: false, error: "No fue posible eliminar el justificante." }
  }
}

export async function assignTeacherToGroupAction(
  groupId: string,
  teacherId: string | null,
): Promise<
  | { ok: true; group: { id: string; name: string; teacherId: string | null } }
  | { ok: false; error: string }
> {
  const user = await appAuth.currentUser()
  if (!user || user.role !== "Directivo") {
    return { ok: false, error: "Solo un directivo puede asignar docentes a grupos." }
  }
  if (!isString(groupId) || groupId.trim() === "") {
    return { ok: false, error: "El grupo seleccionado no es válido." }
  }
  if (teacherId !== null && (!isString(teacherId) || teacherId.trim() === "")) {
    return { ok: false, error: "El docente seleccionado no es válido." }
  }
  try {
    const payload = await getPayload({ config })

    if (teacherId !== null) {
      const teacherResult = await payload.find({
        collection: "users",
        where: {
          and: [
            { id: { equals: teacherId } },
            { role: { equals: "Docente" } },
          ],
        },
        limit: 1,
        overrideAccess: false,
        user,
      })
      const teacherDoc = teacherResult.docs[0] as TeacherUserDoc | undefined
      if (!teacherDoc) {
        return { ok: false, error: "El docente seleccionado no existe." }
      }
      if (teacherDoc.employmentStatus === "Baja temporal") {
        return { ok: false, error: "No puedes asignar grupos a un docente con baja temporal." }
      }
    }

    const numericGroupId = Number(groupId)
    if (!Number.isInteger(numericGroupId)) {
      return { ok: false, error: "El grupo seleccionado no es válido." }
    }
    const numericTeacherId = teacherId === null ? null : Number(teacherId)
    if (numericTeacherId !== null && !Number.isInteger(numericTeacherId)) {
      return { ok: false, error: "El docente seleccionado no es válido." }
    }
    const doc = await payload.update({
      collection: "groups",
      id: numericGroupId,
      data: { teacher: numericTeacherId },
      overrideAccess: false,
      user,
    })
    return {
      ok: true,
      group: {
        id: String(doc.id),
        name: doc.name,
        teacherId: numericTeacherId === null ? null : String(numericTeacherId),
      },
    }
  } catch (error: any) {
    console.error("ERROR REAL AL ASIGNAR:", JSON.stringify(error?.data?.errors ?? error, null, 2))
    return { ok: false, error: "No fue posible asignar el docente al grupo." }
  }
}

export async function deleteTeacherAction(
  teacherId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await appAuth.currentUser()
  if (!user || user.role !== "Directivo") {
    return { ok: false, error: "Solo un directivo puede eliminar docentes." }
  }
  if (!isString(teacherId) || teacherId.trim() === "") {
    return { ok: false, error: "El docente seleccionado no es válido." }
  }
  try {
    const payload = await getPayload({ config })
    const numericTeacherId = Number(teacherId)
    if (!Number.isInteger(numericTeacherId) || numericTeacherId <= 0) {
      return { ok: false, error: "El docente seleccionado no es válido." }
    }
    const assignedGroups = await payload.find({
      collection: "groups",
      where: { teacher: { equals: numericTeacherId } },
      limit: 1,
      depth: 0,
      overrideAccess: false,
      user,
    })
    if ((assignedGroups.totalDocs ?? assignedGroups.docs.length) > 0) {
      return {
        ok: false,
        error: "El docente tiene grupos asignados. Reasígnalos antes de eliminarlo.",
      }
    }
    await payload.delete({
      collection: "users",
      id: numericTeacherId,
      overrideAccess: false,
      user,
    } as any)
    return { ok: true }
  } catch (error: any) {
    console.error(
      "ERROR REAL AL ELIMINAR DOCENTE:",
      JSON.stringify(error?.data?.errors ?? error?.message ?? error, null, 2),
    )
    return { ok: false, error: "No fue posible eliminar al docente." }
  }
}

type SchoolYearCloseStudentPlan = {
  id: string
  name: string
  currentGroup: string
  destination: string
  currentMatricula: string
  nextMatricula: string
  matriculaConflict: boolean
}

type SchoolYearCloseGroupPlan = {
  groupId: string
  groupName: string
  grade: number
  letter: string
  destinationGroupName: string
  destinationGroupId: string | null
  destinationWillBeCreated: boolean
  students: SchoolYearCloseStudentPlan[]
}

type SchoolYearClosePreviousClosure = {
  id: string
  closedAt: string
  closedBy: string
  promoted: number
  graduated: number
  createdGroups: number
  errorCount: number
}

type SchoolYearClosePreview = {
  groups: SchoolYearCloseGroupPlan[]
  warnings: string[]
  previousClosures: SchoolYearClosePreviousClosure[]
  totals: {
    promoted: number
    graduated: number
    excluded: number
    groupsToCreate: number
  }
}

export async function previewSchoolYearCloseAction(
  input: { excludedStudentIds?: string[] },
): Promise<{ ok: true; preview: SchoolYearClosePreview } | { ok: false; error: string }> {
  const user = await appAuth.currentUser()
  if (!user || user.role !== "Directivo") {
    return { ok: false, error: "Solo un directivo puede cerrar el ciclo escolar." }
  }
  const rawExcluded = Array.isArray(input?.excludedStudentIds) ? input.excludedStudentIds : []
  if (rawExcluded.length > 5000 || !rawExcluded.every((id) => isString(id))) {
    return { ok: false, error: "La lista de alumnos excluidos no es válida." }
  }
  const excludedIds = new Set<string>()
  for (const id of rawExcluded) {
    const numeric = Number(id)
    if (!Number.isInteger(numeric) || numeric <= 0) {
      return { ok: false, error: "La lista de alumnos excluidos no es válida." }
    }
    excludedIds.add(String(numeric))
  }

  try {
    const payload = await getPayload({ config })

    const groupsResult = await payload.find({
      collection: "groups",
      limit: 500,
      sort: "name",
      depth: 0,
      overrideAccess: false,
      user,
    })
    const studentsResult = await fetchAllPages<StudentDoc>(payload, {
      collection: "students",
      depth: 0,
    }, user)
    const previousClosuresResult = await payload.find({
      collection: "school-year-closures",
      where: { cycleLabel: { equals: getCycleLabel(todayISO()) } },
      limit: 50,
      sort: "-closedAt",
      depth: 1,
      overrideAccess: false,
      user,
    })

    const groupDocs = groupsResult.docs as GroupDoc[]
    const studentDocs = studentsResult.docs

    const groupsByName = new Map<string, GroupDoc>()
    for (const group of groupDocs) groupsByName.set(group.name, group)

    const matriculaOwners = new Map<string, string>()
    for (const doc of studentDocs) {
      if (doc.matricula) matriculaOwners.set(doc.matricula, String(doc.id))
    }

    const previousClosures: SchoolYearClosePreviousClosure[] = (previousClosuresResult.docs as any[]).map((doc) => {
      const closedBy = doc.closedBy && typeof doc.closedBy === "object" ? doc.closedBy : null
      const errors = Array.isArray(doc.errors) ? doc.errors : []
      return {
        id: String(doc.id),
        closedAt: typeof doc.closedAt === "string" ? doc.closedAt : "",
        closedBy: closedBy?.name ?? closedBy?.email ?? "Usuario desconocido",
        promoted: Number(doc.promoted ?? 0),
        graduated: Number(doc.graduated ?? 0),
        createdGroups: Number(doc.createdGroups ?? 0),
        errorCount: errors.length,
      }
    })

    const warnings: string[] = []
    const groups: SchoolYearCloseGroupPlan[] = []
    let promoted = 0
    let graduated = 0
    let excluded = 0
    const groupsToCreateNames = new Set<string>()

    const studentsByGroupId = new Map<string, StudentDoc[]>()
    for (const doc of studentDocs) {
      const groupId = getRelationId(doc.group)
      if (!groupId) continue
      const list = studentsByGroupId.get(groupId) || []
      list.push(doc)
      studentsByGroupId.set(groupId, list)
    }

    for (const group of groupDocs) {
      const match = /^(\d)°\s*([A-Za-z])$/.exec(group.name.trim())
      if (!match) {
        warnings.push(`El grupo "${group.name}" no tiene un nombre con el formato esperado (por ejemplo "1° A"). Se omitirá del cierre de ciclo.`)
        continue
      }
      const grade = Number(match[1])
      const letter = match[2].toUpperCase()
      if (!Number.isInteger(grade) || grade < 1 || grade > 6) {
        warnings.push(`El grupo "${group.name}" tiene un grado fuera de rango. Se omitirá del cierre de ciclo.`)
        continue
      }

      const isGraduating = grade === 6
      const destinationGroupName = isGraduating ? "Egresado" : `${grade + 1}° ${letter}`
      const destinationGroup = isGraduating ? null : groupsByName.get(destinationGroupName) ?? null
      const destinationWillBeCreated = !isGraduating && !destinationGroup

      const groupStudents = (studentsByGroupId.get(String(group.id)) || [])
        .filter((doc) => (doc.status ?? "Activo") === "Activo")
        .slice()
        .sort((a, b) => compareStudentsByName(
          { ...mapStudentDoc(a, 0), group: group.name },
          { ...mapStudentDoc(b, 0), group: group.name },
        ))

      const studentPlans: SchoolYearCloseStudentPlan[] = []
      for (const doc of groupStudents) {
        const studentId = String(doc.id)
        const parts = resolveStudentNameParts(doc)
        const displayName = buildStudentName(parts.givenNames, parts.paternalSurname, parts.maternalSurname)
        const currentMatricula = doc.matricula ?? ""
        const consecutive = parseListNumber(currentMatricula)

        if (excludedIds.has(studentId)) {
          excluded += 1
          studentPlans.push({
            id: studentId,
            name: displayName,
            currentGroup: group.name,
            destination: group.name,
            currentMatricula,
            nextMatricula: currentMatricula,
            matriculaConflict: false,
          })
          continue
        }

        if (isGraduating) {
          graduated += 1
          studentPlans.push({
            id: studentId,
            name: displayName,
            currentGroup: group.name,
            destination: "Egresado",
            currentMatricula,
            nextMatricula: currentMatricula,
            matriculaConflict: false,
          })
          continue
        }

        promoted += 1
        const prefix = destinationGroupName.replace(/\s+/g, "")
        let nextConsecutive = consecutive > 0 ? consecutive : 1
        let nextMatricula = `${prefix}-${nextConsecutive}`
        let matriculaConflict = false
        const owner = matriculaOwners.get(nextMatricula)
        if (owner && owner !== studentId) {
          matriculaConflict = true
          let candidate = nextConsecutive + 1
          while (matriculaOwners.has(`${prefix}-${candidate}`)) candidate += 1
          nextConsecutive = candidate
          nextMatricula = `${prefix}-${nextConsecutive}`
        }
        matriculaOwners.set(nextMatricula, studentId)

        studentPlans.push({
          id: studentId,
          name: displayName,
          currentGroup: group.name,
          destination: destinationGroupName,
          currentMatricula,
          nextMatricula,
          matriculaConflict,
        })
      }

      const studentsToMove = studentPlans.filter((plan) => !excludedIds.has(plan.id) && plan.destination !== plan.currentGroup).length
      if (destinationWillBeCreated && studentsToMove > 0) groupsToCreateNames.add(destinationGroupName)

      groups.push({
        groupId: String(group.id),
        groupName: group.name,
        grade,
        letter,
        destinationGroupName,
        destinationGroupId: destinationGroup ? String(destinationGroup.id) : null,
        destinationWillBeCreated,
        students: studentPlans,
      })
    }

    return {
      ok: true,
      preview: {
        groups,
        warnings,
        previousClosures,
        totals: {
          promoted,
          graduated,
          excluded,
          groupsToCreate: groupsToCreateNames.size,
        },
      },
    }
  } catch (error: any) {
    console.error(
      "PREVIEW SCHOOL YEAR CLOSE ERROR",
      JSON.stringify(error?.data?.errors ?? error?.message ?? error, null, 2),
    )
    return { ok: false, error: "No fue posible generar la vista previa del cierre de ciclo." }
  }
}

type CloseSchoolYearResult =
  | {
      ok: true
      promoted: number
      graduated: number
      createdGroups: number
      errors: string[]
    }
  | {
      ok: false
      error: string
      promoted: number
      graduated: number
      createdGroups: number
      errors: string[]
    }

type SchoolYearClosureDoc = {
  id: number
  cycleLabel: string
  closedAt?: string | null
}

export async function closeSchoolYearAction(
  input: { excludedStudentIds?: string[]; confirmText?: string },
): Promise<CloseSchoolYearResult> {
  const emptyResult = { promoted: 0, graduated: 0, createdGroups: 0, errors: [] as string[] }
  const user = await appAuth.currentUser()
  if (!user || user.role !== "Directivo") {
    return { ok: false, error: "Solo un directivo puede cerrar el ciclo escolar.", ...emptyResult }
  }
  const rawExcluded = Array.isArray(input?.excludedStudentIds) ? input.excludedStudentIds : []
  if (rawExcluded.length > 5000 || !rawExcluded.every((id) => isString(id))) {
    return { ok: false, error: "La lista de alumnos excluidos no es válida.", ...emptyResult }
  }
  const excludedIds = new Set<string>()
  for (const id of rawExcluded) {
    const numeric = Number(id)
    if (!Number.isInteger(numeric) || numeric <= 0) {
      return { ok: false, error: "La lista de alumnos excluidos no es válida.", ...emptyResult }
    }
    excludedIds.add(String(numeric))
  }

  const cycleLabel = getCycleLabel(todayISO())
  if (!cycleLabel) {
    return { ok: false, error: "No fue posible determinar el ciclo escolar actual.", ...emptyResult }
  }

  let payload: Awaited<ReturnType<typeof getPayload>>
  try {
    payload = await getPayload({ config })
  } catch (error: any) {
    console.error(
      "CLOSE SCHOOL YEAR PAYLOAD ERROR",
      JSON.stringify(error?.data?.errors ?? error?.message ?? error, null, 2),
    )
    return { ok: false, error: "No fue posible iniciar el cierre de ciclo.", ...emptyResult }
  }

  let closureId: number | null = null
  let studentsMoved = false

  try {
    const existing = await payload.find({
      collection: "school-year-closures",
      where: { cycleLabel: { equals: cycleLabel } },
      limit: 50,
      sort: "-closedAt",
      depth: 0,
      overrideAccess: false,
      user,
    })
    const hasPreviousClosures = existing.docs.length > 0
    const expectedConfirmText = hasPreviousClosures ? "CERRAR OTRA VEZ" : "CERRAR CICLO"
    if (input?.confirmText !== expectedConfirmText) {
      return { ok: false, error: `Debes escribir ${expectedConfirmText} para confirmar.`, ...emptyResult }
    }
    const recentClosure = (existing.docs as SchoolYearClosureDoc[]).find((doc) => {
      const closedAt = typeof doc.closedAt === "string" ? new Date(doc.closedAt).valueOf() : NaN
      return Number.isFinite(closedAt) && Date.now() - closedAt < 2 * 60 * 1000
    })
    if (recentClosure) {
      return {
        ok: false,
        error: "Ya se ejecutó un cierre hace unos momentos. Espera antes de intentarlo otra vez.",
        ...emptyResult,
      }
    }

    const groupsResult = await payload.find({
      collection: "groups",
      limit: 500,
      sort: "name",
      depth: 0,
      overrideAccess: false,
      user,
    })
    const studentsResult = await fetchAllPages<StudentDoc>(payload, {
      collection: "students",
      depth: 0,
    }, user)

    const groupDocs = groupsResult.docs as GroupDoc[]
    const studentDocs = studentsResult.docs

    const groupsByName = new Map<string, GroupDoc>()
    for (const group of groupDocs) groupsByName.set(group.name, group)

    const matriculaOwners = new Map<string, string>()
    for (const doc of studentDocs) {
      if (doc.matricula) matriculaOwners.set(doc.matricula, String(doc.id))
    }

    const studentsByGroupId = new Map<string, StudentDoc[]>()
    for (const doc of studentDocs) {
      const groupId = getRelationId(doc.group)
      if (!groupId) continue
      const list = studentsByGroupId.get(groupId) || []
      list.push(doc)
      studentsByGroupId.set(groupId, list)
    }

    type PlannedStudent = {
      doc: StudentDoc
      destinationGroupName: string
      isGraduating: boolean
      nextMatricula: string
      nextConsecutive: number
    }
    type PlannedGroup = {
      group: GroupDoc
      grade: number
      letter: string
      destinationGroupName: string
      isGraduating: boolean
      students: PlannedStudent[]
    }

    const plan: PlannedGroup[] = []
    const warnings: string[] = []

    for (const group of groupDocs) {
      const match = /^(\d)°\s*([A-Za-z])$/.exec(group.name.trim())
      if (!match) {
        warnings.push(`El grupo "${group.name}" no tiene un nombre con el formato esperado (por ejemplo "1° A"). Se omitirá del cierre de ciclo.`)
        continue
      }
      const grade = Number(match[1])
      const letter = match[2].toUpperCase()
      if (!Number.isInteger(grade) || grade < 1 || grade > 6) {
        warnings.push(`El grupo "${group.name}" tiene un grado fuera de rango. Se omitirá del cierre de ciclo.`)
        continue
      }
      const isGraduating = grade === 6
      const destinationGroupName = isGraduating ? "Egresado" : `${grade + 1}° ${letter}`
      const groupStudents = (studentsByGroupId.get(String(group.id)) || [])
        .filter((doc) => (doc.status ?? "Activo") === "Activo")
        .filter((doc) => !excludedIds.has(String(doc.id)))
        .slice()
        .sort((a, b) => compareStudentsByName(
          { ...mapStudentDoc(a, 0), group: group.name },
          { ...mapStudentDoc(b, 0), group: group.name },
        ))

      const plannedStudents: PlannedStudent[] = []
      for (const doc of groupStudents) {
        const studentId = String(doc.id)
        if (isGraduating) {
          plannedStudents.push({
            doc,
            destinationGroupName,
            isGraduating: true,
            nextMatricula: doc.matricula ?? "",
            nextConsecutive: 0,
          })
          continue
        }
        const consecutive = parseListNumber(doc.matricula)
        const prefix = destinationGroupName.replace(/\s+/g, "")
        let nextConsecutive = consecutive > 0 ? consecutive : 1
        let nextMatricula = `${prefix}-${nextConsecutive}`
        const owner = matriculaOwners.get(nextMatricula)
        if (owner && owner !== studentId) {
          let candidate = nextConsecutive + 1
          while (matriculaOwners.has(`${prefix}-${candidate}`)) candidate += 1
          nextConsecutive = candidate
          nextMatricula = `${prefix}-${nextConsecutive}`
        }
        matriculaOwners.set(nextMatricula, studentId)
        plannedStudents.push({
          doc,
          destinationGroupName,
          isGraduating: false,
          nextMatricula,
          nextConsecutive,
        })
      }

      plan.push({
        group,
        grade,
        letter,
        destinationGroupName,
        isGraduating,
        students: plannedStudents,
      })
    }

    // Create the closure record BEFORE moving any student so two rapid clicks
    // cannot both proceed. If anything fails before the first student is moved,
    // the record is deleted so the Directivo can retry.
    const closure = await payload.create({
      collection: "school-year-closures",
      data: {
        cycleLabel,
        closedAt: new Date().toISOString(),
        closedBy: user.id,
        promoted: 0,
        graduated: 0,
        createdGroups: 0,
      },
      overrideAccess: false,
      user,
    }) as SchoolYearClosureDoc
    closureId = Number(closure.id)

    // Process from highest grade to lowest so promoted students never collide
    // with students still sitting in their current group.
    const orderedPlan = plan.slice().sort((a, b) => b.grade - a.grade)

    const errors: string[] = [...warnings]
    let promoted = 0
    let graduated = 0
    let createdGroups = 0

    for (const plannedGroup of orderedPlan) {
      if (plannedGroup.isGraduating) {
        for (const planned of plannedGroup.students) {
          try {
            await payload.update({
              collection: "students",
              id: planned.doc.id,
              data: { status: "Egresado" },
              overrideAccess: false,
              user,
            })
            studentsMoved = true
            graduated += 1
          } catch (error: any) {
            console.error(
              "CLOSE SCHOOL YEAR GRADUATE ERROR",
              JSON.stringify(error?.data?.errors ?? error?.message ?? error, null, 2),
            )
            errors.push(`No fue posible egresar al alumno ${planned.doc.id}.`)
          }
        }
        continue
      }

      if (plannedGroup.students.length === 0) continue

      let destinationGroup = groupsByName.get(plannedGroup.destinationGroupName) ?? null
      if (!destinationGroup) {
        try {
          const created = await payload.create({
            collection: "groups",
            data: {
              name: plannedGroup.destinationGroupName,
              grade: plannedGroup.grade + 1,
            },
            overrideAccess: false,
            user,
          }) as GroupDoc
          destinationGroup = created
          groupsByName.set(created.name, created)
          createdGroups += 1
        } catch (error: any) {
          console.error(
            "CLOSE SCHOOL YEAR CREATE GROUP ERROR",
            JSON.stringify(error?.data?.errors ?? error?.message ?? error, null, 2),
          )
          errors.push(`No fue posible crear el grupo ${plannedGroup.destinationGroupName}.`)
          continue
        }
      }

      const destinationGroupId = Number(destinationGroup.id)
      let maxConsecutive = Number((destinationGroup as GroupDoc & { lastMatriculaNumber?: number | null }).lastMatriculaNumber ?? 0)

      for (const planned of plannedGroup.students) {
        try {
          await payload.update({
            collection: "students",
            id: planned.doc.id,
            data: {
              group: destinationGroupId,
              matricula: planned.nextMatricula,
            },
            overrideAccess: false,
            user,
          })
          studentsMoved = true
          promoted += 1
          if (planned.nextConsecutive > maxConsecutive) maxConsecutive = planned.nextConsecutive
        } catch (error: any) {
          console.error(
            "CLOSE SCHOOL YEAR PROMOTE ERROR",
            JSON.stringify(error?.data?.errors ?? error?.message ?? error, null, 2),
          )
          errors.push(`No fue posible promover al alumno ${planned.doc.id}.`)
        }
      }

      if (maxConsecutive > 0) {
        try {
          await payload.update({
            collection: "groups",
            id: destinationGroupId,
            data: { lastMatriculaNumber: maxConsecutive },
            overrideAccess: false,
            user,
          })
        } catch (error: any) {
          console.error(
            "CLOSE SCHOOL YEAR COUNTER ERROR",
            JSON.stringify(error?.data?.errors ?? error?.message ?? error, null, 2),
          )
          errors.push(`No fue posible actualizar el contador del grupo ${plannedGroup.destinationGroupName}.`)
        }
      }
    }

    try {
      await payload.update({
        collection: "school-year-closures",
        id: closureId,
        data: {
          promoted,
          graduated,
          createdGroups,
          errors: errors.length ? errors : null,
        },
        overrideAccess: true,
      })
    } catch (error: any) {
      console.error(
        "CLOSE SCHOOL YEAR FINALIZE ERROR",
        JSON.stringify(error?.data?.errors ?? error?.message ?? error, null, 2),
      )
    }

    return { ok: true, promoted, graduated, createdGroups, errors }
  } catch (error: any) {
    console.error(
      "CLOSE SCHOOL YEAR ERROR",
      JSON.stringify(error?.data?.errors ?? error?.message ?? error, null, 2),
    )
    if (closureId !== null && !studentsMoved) {
      try {
        await payload.delete({
          collection: "school-year-closures",
          id: closureId,
          overrideAccess: true,
        })
      } catch (cleanupError: any) {
        console.error(
          "CLOSE SCHOOL YEAR CLEANUP ERROR",
          JSON.stringify(cleanupError?.data?.errors ?? cleanupError?.message ?? cleanupError, null, 2),
        )
      }
    }
    return {
      ok: false,
      error: "No fue posible completar el cierre de ciclo.",
      ...emptyResult,
    }
  }
}

export async function updateTeacherEmploymentStatusAction(
  teacherId: string,
  status: "Activo" | "Baja temporal",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await appAuth.currentUser()
  if (!user || user.role !== "Directivo") {
    return { ok: false, error: "Solo un directivo puede cambiar el estado laboral." }
  }
  if (!isString(teacherId) || (status !== "Activo" && status !== "Baja temporal")) {
    return { ok: false, error: "Los datos del docente no son válidos." }
  }
  try {
    const payload = await getPayload({ config })
    await payload.update({
      collection: "users",
      id: Number(teacherId),
      data: { employmentStatus: status },
      overrideAccess: false,
      user,
    })
    return { ok: true }
  } catch (error: any) {
    console.error("UPDATE TEACHER EMPLOYMENT STATUS ERROR", error?.message)
    return { ok: false, error: "No fue posible actualizar el estado del docente." }
  }
}

