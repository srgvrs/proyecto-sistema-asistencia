"use server"

import config from "@payload-config"
import { getPayload } from "payload"
import { appAuth } from "@/lib/app-auth"
import type { Role } from "@/lib/app-user-types"
import type {
  AttendanceRecord,
  OfficialAttendanceList,
  OfficialAttendanceStudent,
  SchoolStateData,
  SchoolStateSection,
  Status,
  Student,
} from "@/lib/school-data-types"

const sectionRoles: Record<SchoolStateSection, Role[]> = {
  students: ["Docente", "Directivo"],
  groups: ["Directivo"],
  attendanceRecords: ["Docente", "Directivo"],
  officialAttendanceLists: [],
  visitors: ["Vigilante de Acceso"],
  teacherAttendance: ["Docente", "Directivo"],
  teacherGroups: ["Directivo"],
  teachers: ["Directivo"],
}

const isString = (value: unknown): value is string => typeof value === "string"
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= 500 && value.every(isString)
const isListNumber = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 999
const isISODate = (value: unknown): value is string => {
  if (!isString(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

function isValidStudent(value: unknown): value is Student {
  if (!value || typeof value !== "object") return false
  const student = value as Record<string, unknown>
  return ["id", "name", "group"].every((field) => isString(student[field])) &&
    isListNumber(student.listNumber) &&
    ["givenNames", "paternalSurname", "maternalSurname"].every((field) => student[field] === undefined || isString(student[field]))
}

function isValidAttendanceRecord(value: unknown): value is AttendanceRecord {
  if (!value || typeof value !== "object") return false
  const record = value as Record<string, unknown>
  return isString(record.studentId) &&
    isISODate(record.date) &&
    isString(record.time) &&
    ["Presente", "Retardo", "Falta"].includes(String(record.status)) &&
    ["Acceso", "Pase de lista"].includes(String(record.source))
}

function isValidOfficialStudent(value: unknown): value is OfficialAttendanceStudent {
  if (!value || typeof value !== "object") return false
  const student = value as Record<string, unknown>
  return isString(student.studentId) && isString(student.name) && isListNumber(student.listNumber)
}

function isValidOfficialList(value: unknown): value is OfficialAttendanceList {
  if (!value || typeof value !== "object") return false
  const list = value as Record<string, unknown>
  if (!["id", "group", "month", "teacher", "updatedAt"].every((field) => isString(list[field]))) return false
  if (!/^\d{4}-\d{2}$/.test(String(list.month))) return false
  if (!Array.isArray(list.officialDates) || !list.officialDates.every(isISODate)) return false
  if (!Array.isArray(list.students) || !list.students.every(isValidOfficialStudent)) return false
  if (!list.marks || typeof list.marks !== "object" || Array.isArray(list.marks)) return false
  return Object.values(list.marks).every((studentMarks) => {
    if (!studentMarks || typeof studentMarks !== "object" || Array.isArray(studentMarks)) return false
    return Object.entries(studentMarks).every(([date, mark]) => isISODate(date) && (mark === "." || mark === "X"))
  })
}

function isValidSection(section: SchoolStateSection, value: unknown) {
  if (section === "groups") return isStringArray(value)
  if (section === "teacherGroups") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false
    return Object.entries(value).every(([teacher, groups]) => isString(teacher) && isStringArray(groups))
  }
  if (!Array.isArray(value) || value.length > 5000) return false
  if (section === "students") {
    if (!value.every(isValidStudent)) return false
    const ids = new Set<string>()
    const groupNumbers = new Set<string>()
    return value.every((student) => {
      const groupNumber = `${student.group}\u0000${student.listNumber}`
      if (ids.has(student.id) || groupNumbers.has(groupNumber)) return false
      ids.add(student.id)
      groupNumbers.add(groupNumber)
      return true
    })
  }
  if (section === "attendanceRecords") {
    return value.every(isValidAttendanceRecord)
  }
  if (section === "officialAttendanceLists") return value.every(isValidOfficialList)
  if (section === "visitors") {
    return value.every((item) => {
      if (!item || typeof item !== "object") return false
      const visitor = item as Record<string, unknown>
      return typeof visitor.id === "number" &&
        ["name", "identification", "reason", "host", "date", "entryTime"].every((field) => isString(visitor[field])) &&
        (visitor.exitTime === null || isString(visitor.exitTime))
    })
  }
  if (section === "teacherAttendance") {
    return value.every((item) => {
      if (!item || typeof item !== "object") return false
      const attendance = item as Record<string, unknown>
      return typeof attendance.id === "number" &&
        ["teacher", "date", "entryTime"].every((field) => isString(attendance[field])) &&
        (attendance.exitTime === null || isString(attendance.exitTime))
    })
  }
  const teacherFields = new Set(["name", "givenNames", "paternalSurname", "maternalSurname", "status", "justifiedDates"])
  return value.every((item) => {
    if (!item || typeof item !== "object") return false
    const teacher = item as Record<string, unknown>
    return Object.keys(teacher).every((field) => teacherFields.has(field)) &&
      isString(teacher.name) &&
      ["givenNames", "paternalSurname", "maternalSurname"].every((field) => teacher[field] === undefined || isString(teacher[field])) &&
      ["Activo", "Baja temporal"].includes(String(teacher.status)) &&
      isStringArray(teacher.justifiedDates)
  })
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
    const state = await payload.findGlobal({
      slug: "school-state",
      overrideAccess: false,
      user,
    }) as unknown as Partial<SchoolStateData>
    const students = Array.isArray(state.students) ? state.students.filter(isValidStudent) : []
    const groupStudents = students
      .filter((student) => student.group === input.group)
      .sort((a, b) => a.listNumber - b.listNumber || a.name.localeCompare(b.name, "es-MX"))
    if (!groupStudents.length) return { ok: false, error: "El grupo no tiene alumnos registrados." }
    if (new Set(groupStudents.map((student) => student.listNumber)).size !== groupStudents.length) {
      return { ok: false, error: "Hay números de lista repetidos en el grupo. Corrígelos antes de oficializar." }
    }

    const assignedGroups = state.teacherGroups?.[user.name] || []
    if (!assignedGroups.includes(input.group)) {
      return { ok: false, error: "El grupo no está asignado a tu cuenta docente." }
    }
    const submittedStatuses = new Map(input.attendance.map((item) => [item.studentId, item.status]))
    if (submittedStatuses.size !== groupStudents.length ||
      groupStudents.some((student) => !submittedStatuses.has(student.id))) {
      return { ok: false, error: "La lista debe incluir a todos los alumnos del grupo." }
    }

    const groupIds = new Set(groupStudents.map((student) => student.id))
    const currentRecords = Array.isArray(state.attendanceRecords)
      ? state.attendanceRecords.filter(isValidAttendanceRecord)
      : []
    const attendanceRecords: AttendanceRecord[] = [
      ...groupStudents.map((student) => ({
        studentId: student.id,
        date: input.date,
        time: "—",
        status: submittedStatuses.get(student.id) as Status,
        source: "Pase de lista" as const,
      })),
      ...currentRecords.filter((record) =>
        !(groupIds.has(record.studentId) && record.date === input.date && record.source === "Pase de lista")
      ),
    ]

    const month = input.date.slice(0, 7)
    const id = `${input.group}-${month}`
    const currentLists = Array.isArray(state.officialAttendanceLists)
      ? state.officialAttendanceLists.filter(isValidOfficialList)
      : []
    const existing = currentLists.find((list) => list.id === id)
    const roster = new Map((existing?.students || []).map((student) => [student.studentId, student]))
    groupStudents.forEach((student) => roster.set(student.id, {
      studentId: student.id,
      name: student.name,
      listNumber: student.listNumber,
    }))
    const marks = structuredClone(existing?.marks || {})
    groupStudents.forEach((student) => {
      marks[student.id] = {
        ...(marks[student.id] || {}),
        [input.date]: submittedStatuses.get(student.id) === "Falta" ? "X" : ".",
      }
    })
    const officialList: OfficialAttendanceList = {
      id,
      group: input.group,
      month,
      teacher: user.name,
      officialDates: [...new Set([...(existing?.officialDates || []), input.date])].sort(),
      students: [...roster.values()].sort((a, b) => a.listNumber - b.listNumber || a.name.localeCompare(b.name, "es-MX")),
      marks,
      updatedAt: new Date().toISOString(),
    }
    const officialAttendanceLists = [
      officialList,
      ...currentLists.filter((list) => list.id !== id),
    ]

    await payload.updateGlobal({
      slug: "school-state",
      data: { attendanceRecords, officialAttendanceLists },
      overrideAccess: false,
      user,
    })
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
    const state = await payload.findGlobal({
      slug: "school-state",
      overrideAccess: false,
      user,
    })
    return { ok: true, data: state as unknown as SchoolStateData }
  } catch {
    return { ok: false, error: "No fue posible actualizar la información escolar." }
  }
}

export async function saveSchoolStateSectionAction(
  section: SchoolStateSection,
  value: SchoolStateData[SchoolStateSection],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await appAuth.currentUser()
  if (!user || !sectionRoles[section]?.includes(user.role)) {
    return { ok: false, error: "No tienes permiso para actualizar esta información." }
  }
  if (!isValidSection(section, value)) {
    return { ok: false, error: "La información enviada no tiene un formato válido." }
  }

  try {
    const payload = await getPayload({ config })
    await payload.updateGlobal({
      slug: "school-state",
      data: { [section]: value },
      overrideAccess: false,
      user,
    })
    return { ok: true }
  } catch {
    return { ok: false, error: "No fue posible guardar la actualización." }
  }
}
