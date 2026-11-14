"use server"

import config from "@payload-config"
import { getPayload } from "payload"
import { appAuth } from "@/lib/app-auth"
import type {
  AttendanceRecord,
  OfficialAttendanceList,
  OfficialAttendanceStudent,
  SchoolStateData,
  Status,
  Student,
  Visitor,
} from "@/lib/school-data-types"

const isString = (value: unknown): value is string => typeof value === "string"
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

const toISODate = (value: string | null | undefined): string => {
  if (!value) return ""
  return value.slice(0, 10)
}

const toHHMM = (value: string | null | undefined): string => {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return ""
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

const toISODateTimeFromHHMM = (date: string, time: string): string => {
  const [hours, minutes] = time.split(":").map(Number)
  const base = new Date(`${date}T00:00:00`)
  base.setHours(hours || 0, minutes || 0, 0, 0)
  return base.toISOString()
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
  id: string
  firstName: string
  lastName: string
  matricula: string
  group: string | { id: string; name: string }
}

type GroupDoc = {
  id: string
  name: string
  grade: number
  teacher?: string | { id: string; name: string } | null
}

type AttendanceDoc = {
  id: string
  student: string | { id: string }
  date: string
  status: "Presente" | "Ausente" | "Retardo" | "Justificado"
  registeredBy: string | { id: string }
}

type VisitorDoc = {
  id: string
  name: string
  reason: string
  entryTime: string
  exitTime?: string | null
  registeredBy: string | { id: string }
}

type OfficialListDoc = {
  id: string
  title: string
  group: string | { id: string; name: string }
  file?: string | { id: string; url?: string | null } | null
  marks?: Record<string, Record<string, "." | "X">> | null
}

const getRelationId = (value: string | { id: string } | null | undefined): string => {
  if (!value) return ""
  return typeof value === "string" ? value : value.id
}

const getRelationName = (value: string | { id: string; name?: string } | null | undefined): string => {
  if (!value) return ""
  return typeof value === "string" ? value : value.name || value.id
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

const buildStudentName = (firstName: string, lastName: string) =>
  `${lastName.trim()} ${firstName.trim()}`.replace(/\s+/g, " ").trim()

const mapStudentDoc = (doc: StudentDoc, listNumber: number): Student => {
  const parts = splitStudentName(doc.firstName, doc.lastName)
  return {
    id: doc.id,
    name: buildStudentName(doc.firstName, doc.lastName),
    listNumber,
    givenNames: parts.givenNames,
    paternalSurname: parts.paternalSurname,
    maternalSurname: parts.maternalSurname,
    group: getRelationName(doc.group),
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
  id: doc.id,
  name: doc.name,
  identification: "",
  reason: doc.reason,
  host: "",
  date: toISODate(doc.entryTime),
  entryTime: toHHMM(doc.entryTime),
  exitTime: doc.exitTime ? toHHMM(doc.exitTime) : null,
})

const mapOfficialListDoc = (doc: OfficialListDoc): OfficialAttendanceList => {
  const marks = (doc.marks && typeof doc.marks === "object" && !Array.isArray(doc.marks))
    ? (doc.marks as Record<string, Record<string, "." | "X">>)
    : {}
  const officialDates = [...new Set(
    Object.values(marks).flatMap((studentMarks) => Object.keys(studentMarks || {})),
  )].sort()
  return {
    id: doc.id,
    group: getRelationName(doc.group),
    month: officialDates[0]?.slice(0, 7) || "",
    teacher: "",
    officialDates,
    students: [],
    marks,
    updatedAt: new Date().toISOString(),
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
  | { ok: true; attendanceRecords: AttendanceRecord[]; officialAttendanceLists: OfficialAttendanceList[] }
  | { ok: false; error: string }
> {
  const user = await appAuth.currentUser()
  if (!user || user.role !== "Docente") {
    return { ok: false, error: "Solo un docente puede oficializar la asistencia." }
  }
  if (!isString(input.group) || !isISODate(input.date) || !Array.isArray(input.attendance) || input.attendance.length > 500) {
    return { ok: false, error: "La asistencia enviada no tiene un formato válido." }
  }
  if (!input.attendance.every((item) =>
    item && isString(item.studentId) && ["Presente", "Retardo", "Falta"].includes(item.status)
  )) {
    return { ok: false, error: "Hay estados de asistencia no válidos." }
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
    if (!groupDoc) return { ok: false, error: "El grupo no existe." }
    if (getRelationId(groupDoc.teacher) !== user.id) {
      return { ok: false, error: "El grupo no está asignado a tu cuenta docente." }
    }

    const studentsResult = await payload.find({
      collection: "students",
      where: { group: { equals: groupDoc.id } },
      limit: 500,
      sort: "lastName",
      overrideAccess: false,
      user,
    })
    const groupStudents = studentsResult.docs as StudentDoc[]
    if (!groupStudents.length) return { ok: false, error: "El grupo no tiene alumnos registrados." }

    const submittedStatuses = new Map(input.attendance.map((item) => [item.studentId, item.status]))
    if (submittedStatuses.size !== groupStudents.length ||
      groupStudents.some((student) => !submittedStatuses.has(student.id))) {
      return { ok: false, error: "La lista debe incluir a todos los alumnos del grupo." }
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
      const status = submittedStatuses.get(student.id) as Status
      const collectionStatus = mapStatusToCollection(status)
      const existing = existingByStudent.get(student.id)
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
        studentId: student.id,
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
      const status = submittedStatuses.get(student.id) as Status
      marks[student.id] = {
        ...(marks[student.id] || {}),
        [input.date]: status === "Falta" ? "X" : ".",
      }
    }
    const officialDates = [...new Set([
      ...Object.values(marks).flatMap((studentMarks) => Object.keys(studentMarks || {})),
    ])].sort()

    let officialListId: string
    if (existingList) {
      const updated = await payload.update({
        collection: "official-lists",
        id: existingList.id,
        data: { marks },
        overrideAccess: false,
        user,
      })
      officialListId = (updated as OfficialListDoc).id
    } else {
      const created = await payload.create({
        collection: "official-lists",
        data: {
          title,
          group: groupDoc.id,
          marks,
        },
        overrideAccess: false,
        user,
      })
      officialListId = (created as OfficialListDoc).id
    }

    const officialAttendanceLists: OfficialAttendanceList[] = [
      {
        id: officialListId,
        group: input.group,
        month,
        teacher: user.name,
        officialDates,
        students: groupStudents.map((student, index) => ({
          studentId: student.id,
          name: buildStudentName(student.firstName, student.lastName),
          listNumber: index + 1,
        })),
        marks,
        updatedAt: new Date().toISOString(),
      },
    ]

    return { ok: true, attendanceRecords, officialAttendanceLists }
  } catch {
    return { ok: false, error: "No fue posible oficializar la lista. Intenta nuevamente." }
  }
}

export async function loadSchoolStateAction(): Promise<
  { ok: true; data: SchoolStateData } | { ok: false; error: string }
> {
  const user = await appAuth.currentUser()
  if (!user) return { ok: false, error: "Sesión no válida." }

  try {
    const payload = await getPayload({ config })

    const [groupsResult, studentsResult, attendanceResult, visitorsResult, officialListsResult] = await Promise.all([
      payload.find({ collection: "groups", limit: 200, sort: "name", overrideAccess: false, user }),
      payload.find({ collection: "students", limit: 2000, sort: "lastName", overrideAccess: false, user }),
      payload.find({ collection: "attendance", limit: 5000, sort: "-date", overrideAccess: false, user }),
      payload.find({ collection: "visitors", limit: 500, sort: "-entryTime", overrideAccess: false, user }),
      payload.find({ collection: "official-lists", limit: 200, sort: "-createdAt", overrideAccess: false, user }),
    ])

    const groups = (groupsResult.docs as GroupDoc[]).map((group) => ({ id: group.id, name: group.name }))
    const studentsByGroup = new Map<string, number>()
    const students: Student[] = (studentsResult.docs as StudentDoc[]).map((doc) => {
      const groupName = getRelationName(doc.group)
      const nextNumber = (studentsByGroup.get(groupName) || 0) + 1
      studentsByGroup.set(groupName, nextNumber)
      return mapStudentDoc(doc, nextNumber)
    })
    const attendanceRecords = (attendanceResult.docs as AttendanceDoc[]).map(mapAttendanceDoc)
    const visitors = (visitorsResult.docs as VisitorDoc[]).map(mapVisitorDoc)
    const officialAttendanceLists = (officialListsResult.docs as OfficialListDoc[]).map(mapOfficialListDoc)

    return {
      ok: true,
      data: {
        students,
        groups,
        attendanceRecords,
        officialAttendanceLists,
        visitors,
        teacherAttendance: [],
        teacherGroups: {},
        teachers: [],
      },
    }
  } catch {
    return { ok: false, error: "No fue posible actualizar la información escolar." }
  }
}

type StudentInput = {
  firstName: string
  lastName: string
  matricula: string
  groupId: string
}

export async function createStudentAction(
  input: StudentInput,
): Promise<{ ok: true; student: Student } | { ok: false; error: string }> {
  const user = await appAuth.currentUser()
  if (!user || (user.role !== "Directivo" && user.role !== "Docente")) {
    return { ok: false, error: "No tienes permiso para crear alumnos." }
  }
  if (!isString(input.firstName) || !isString(input.lastName) || !isString(input.matricula) || !isString(input.groupId)) {
    return { ok: false, error: "Los datos del alumno no son válidos." }
  }
  try {
    const payload = await getPayload({ config })
    const doc = await payload.create({
      collection: "students",
      data: {
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        matricula: input.matricula.trim(),
        group: input.groupId,
      },
      overrideAccess: false,
      user,
    })
    return { ok: true, student: mapStudentDoc(doc as StudentDoc, 0) }
  } catch {
    return { ok: false, error: "No fue posible crear el alumno." }
  }
}

export async function updateStudentAction(
  id: string,
  input: Partial<StudentInput>,
): Promise<{ ok: true; student: Student } | { ok: false; error: string }> {
  const user = await appAuth.currentUser()
  if (!user || (user.role !== "Directivo" && user.role !== "Docente")) {
    return { ok: false, error: "No tienes permiso para actualizar alumnos." }
  }
  if (!isString(id)) return { ok: false, error: "Identificador inválido." }
  const data: Record<string, string> = {}
  if (isString(input.firstName)) data.firstName = input.firstName.trim()
  if (isString(input.lastName)) data.lastName = input.lastName.trim()
  if (isString(input.matricula)) data.matricula = input.matricula.trim()
  if (isString(input.groupId)) data.group = input.groupId
  if (!Object.keys(data).length) return { ok: false, error: "No hay cambios para guardar." }
  try {
    const payload = await getPayload({ config })
    const doc = await payload.update({
      collection: "students",
      id,
      data,
      overrideAccess: false,
      user,
    })
    return { ok: true, student: mapStudentDoc(doc as StudentDoc, 0) }
  } catch {
    return { ok: false, error: "No fue posible actualizar el alumno." }
  }
}

export async function deleteStudentAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await appAuth.currentUser()
  if (!user || user.role !== "Directivo") {
    return { ok: false, error: "No tienes permiso para eliminar alumnos." }
  }
  if (!isString(id)) return { ok: false, error: "Identificador inválido." }
  try {
    const payload = await getPayload({ config })
    await payload.delete({ collection: "students", id, overrideAccess: false, user })
    return { ok: true }
  } catch {
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
  try {
    const payload = await getPayload({ config })
    const doc = await payload.create({
      collection: "groups",
      data: {
        name: input.name.trim(),
        grade: input.grade,
        teacher: input.teacherId || undefined,
      },
      overrideAccess: false,
      user,
    })
    const group = doc as GroupDoc
    return { ok: true, group: { id: group.id, name: group.name, grade: group.grade } }
  } catch {
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
  if (isString(input.name)) data.name = input.name.trim()
  if (Number.isInteger(input.grade)) data.grade = input.grade
  if (input.teacherId !== undefined) data.teacher = input.teacherId || null
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
    return { ok: true, group: { id: group.id, name: group.name, grade: group.grade } }
  } catch {
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
    await payload.delete({ collection: "groups", id, overrideAccess: false, user })
    return { ok: true }
  } catch {
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
    const doc = await payload.create({
      collection: "attendance",
      data: {
        student: input.studentId,
        date: `${input.date}T00:00:00.000Z`,
        status: mapStatusToCollection(input.status),
        registeredBy: user.id,
      },
      overrideAccess: false,
      user,
    })
    return { ok: true, record: mapAttendanceDoc(doc as AttendanceDoc) }
  } catch {
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
  const data: Record<string, unknown> = {}
  if (isString(input.studentId)) data.student = input.studentId
  if (isISODate(input.date)) data.date = `${input.date}T00:00:00.000Z`
  if (input.status && ["Presente", "Retardo", "Falta"].includes(input.status)) {
    data.status = mapStatusToCollection(input.status)
  }
  if (!Object.keys(data).length) return { ok: false, error: "No hay cambios para guardar." }
  try {
    const payload = await getPayload({ config })
    const doc = await payload.update({
      collection: "attendance",
      id,
      data,
      overrideAccess: false,
      user,
    })
    return { ok: true, record: mapAttendanceDoc(doc as AttendanceDoc) }
  } catch {
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
  } catch {
    return { ok: false, error: "No fue posible eliminar la asistencia." }
  }
}

type VisitorInput = {
  name: string
  reason: string
  entryTime: string
  exitTime?: string | null
}

export async function createVisitorAction(
  input: VisitorInput,
): Promise<{ ok: true; visitor: Visitor } | { ok: false; error: string }> {
  const user = await appAuth.currentUser()
  if (!user || (user.role !== "Directivo" && user.role !== "Vigilante de Acceso")) {
    return { ok: false, error: "No tienes permiso para registrar visitantes." }
  }
  if (!isString(input.name) || !isString(input.reason) || !isISODateTime(input.entryTime)) {
    return { ok: false, error: "Los datos del visitante no son válidos." }
  }
  try {
    const payload = await getPayload({ config })
    const doc = await payload.create({
      collection: "visitors",
      data: {
        name: input.name.trim(),
        reason: input.reason.trim(),
        entryTime: input.entryTime,
        exitTime: input.exitTime || null,
        registeredBy: user.id,
      },
      overrideAccess: false,
      user,
    })
    return { ok: true, visitor: mapVisitorDoc(doc as VisitorDoc) }
  } catch {
    return { ok: false, error: "No fue posible registrar al visitante." }
  }
}

export async function updateVisitorAction(
  id: string,
  input: Partial<VisitorInput>,
): Promise<{ ok: true; visitor: Visitor } | { ok: false; error: string }> {
  const user = await appAuth.currentUser()
  if (!user || (user.role !== "Directivo" && user.role !== "Vigilante de Acceso")) {
    return { ok: false, error: "No tienes permiso para actualizar visitantes." }
  }
  if (!isString(id)) return { ok: false, error: "Identificador inválido." }
  const data: Record<string, unknown> = {}
  if (isString(input.name)) data.name = input.name.trim()
  if (isString(input.reason)) data.reason = input.reason.trim()
  if (isISODateTime(input.entryTime)) data.entryTime = input.entryTime
  if (input.exitTime !== undefined) data.exitTime = input.exitTime || null
  if (!Object.keys(data).length) return { ok: false, error: "No hay cambios para guardar." }
  try {
    const payload = await getPayload({ config })
    const doc = await payload.update({
      collection: "visitors",
      id,
      data,
      overrideAccess: false,
      user,
    })
    return { ok: true, visitor: mapVisitorDoc(doc as VisitorDoc) }
  } catch {
    return { ok: false, error: "No fue posible actualizar al visitante." }
  }
}

export async function deleteVisitorAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await appAuth.currentUser()
  if (!user || user.role !== "Directivo") {
    return { ok: false, error: "No tienes permiso para eliminar visitantes." }
  }
  if (!isString(id)) return { ok: false, error: "Identificador inválido." }
  try {
    const payload = await getPayload({ config })
    await payload.delete({ collection: "visitors", id, overrideAccess: false, user })
    return { ok: true }
  } catch {
    return { ok: false, error: "No fue posible eliminar al visitante." }
  }
}

export { toISODateTimeFromHHMM }
