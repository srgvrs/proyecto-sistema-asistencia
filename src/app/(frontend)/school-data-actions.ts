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
  TeacherAttendance,
  TeacherProfile,
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


const isDateOfficialized = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  groupId: number | string,
  date: string,
): Promise<boolean> => {
  const month = date.slice(0, 7)
  const result = await payload.find({
    collection: "official-lists",
    where: {
      and: [
        { group: { equals: groupId } },
        { title: { contains: month } },
      ],
    },
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })
  for (const doc of result.docs as OfficialListDoc[]) {
    const marks = doc.marks
    if (!marks || typeof marks !== "object" || Array.isArray(marks)) continue
    for (const studentMarks of Object.values(marks)) {
      if (studentMarks && typeof studentMarks === "object" && date in studentMarks) {
        return true
      }
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
  host: "",
  date: toISODate(doc.entryTime),
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
    .sort((a, b) => {
      const options = { sensitivity: "base" as const }
      return (
        (a.paternalSurname ?? "").localeCompare(b.paternalSurname ?? "", "es-MX", options) ||
        (a.maternalSurname ?? "").localeCompare(b.maternalSurname ?? "", "es-MX", options) ||
        (a.givenNames ?? "").localeCompare(b.givenNames ?? "", "es-MX", options)
      )
    })
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
    if (getRelationId(groupDoc.teacher) !== String(user.id)) {
      return { ok: false, error: "El grupo no está asignado a tu cuenta docente." }
    }
    if (await isDateOfficialized(payload, groupDoc.id, input.date)) {
      return { ok: false, error: "La lista ya fue oficializada. Solo el Directivo puede modificarla." }
    }

    const studentsResult = await payload.find({
      collection: "students",
      where: { group: { equals: groupDoc.id } },
      limit: 500,
      sort: "paternalSurname",
      overrideAccess: false,
      user,
    })
    const groupStudents = studentsResult.docs as StudentDoc[]
    if (!groupStudents.length) return { ok: false, error: "El grupo no tiene alumnos registrados." }

    const submittedStatuses = new Map(input.attendance.map((item) => [item.studentId, item.status]))
    if (submittedStatuses.size !== groupStudents.length ||
      groupStudents.some((student) => !submittedStatuses.has(String(student.id)))) {
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

    return { ok: true, attendanceRecords, officialAttendanceLists }
  } catch (error: any) {
    console.error(
      "OFFICIALIZE ERROR",
      JSON.stringify(error?.data?.errors ?? error?.message ?? error, null, 2),
    )
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

    const [
      groupsResult,
      studentsResult,
      attendanceResult,
      visitorsResult,
      officialListsResult,
      teachersResult,
      teacherAttendanceResult,
      teacherJustificationsResult,
    ] = await Promise.all([
      safeFind({ collection: "groups", limit: 200, sort: "name", overrideAccess: false, user }),
      safeFind({ collection: "students", limit: 2000, sort: "paternalSurname", overrideAccess: false, user }),
      safeFind({ collection: "attendance", limit: 5000, sort: "-date", overrideAccess: false, user }),
      safeFind({ collection: "visitors", limit: 500, sort: "-entryTime", overrideAccess: false, user }),
      safeFind({ collection: "official-lists", limit: 200, sort: "-createdAt", overrideAccess: false, user }),
      safeFind(teachersQuery),
      safeFind({ collection: "teacher-attendance", limit: 2000, sort: "-date", overrideAccess: false, user }),
      safeFind({ collection: "teacher-justifications", limit: 2000, sort: "-date", overrideAccess: false, user }),
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

    const teacherAttendance: TeacherAttendance[] = (teacherAttendanceResult.docs as TeacherAttendanceDoc[]).map((doc, index) => {
      const teacherId = getRelationId(doc.teacher)
      const teacherDoc = teacherDocs.find((item) => String(item.id) === teacherId)
      return {
        id: index + 1,
        teacher: teacherDoc?.name || getRelationName(doc.teacher),
        date: toISODate(doc.date),
        entryTime: toHHMM(doc.entryTime),
        exitTime: doc.exitTime ? toHHMM(doc.exitTime) : null,
      }
    })

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
      },
    }
  } catch (error: any) {
    console.error("LOAD ERROR", JSON.stringify((error as any)?.data?.errors ?? (error as any)?.message ?? error, null, 2))
    return { ok: false, error: (error as any)?.data?.errors?.[0]?.message || (error as any)?.message || "No fue posible actualizar la información escolar." }
  }
}

type StudentInput = {
  firstName: string
  paternalSurname: string
  maternalSurname?: string
  lastName?: string
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
  if (!isString(input.firstName) || !isString(input.paternalSurname) || !isString(input.matricula) || !isString(input.groupId)) {
    return { ok: false, error: "Los datos del alumno no son válidos." }
  }
  if (input.maternalSurname !== undefined && !isString(input.maternalSurname)) {
    return { ok: false, error: "Los datos del alumno no son válidos." }
  }
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
    const groupStudents = await payload.find({
      collection: "students",
      where: { group: { equals: groupId } },
      limit: 2000,
      overrideAccess: false,
      user,
    })
    const usedNumbers = new Set(
      (groupStudents.docs as StudentDoc[])
        .map((doc) => parseListNumber(doc.matricula))
        .filter((value) => value > 0),
    )
    const requestedNumber = parseListNumber(input.matricula)
    const listNumber = requestedNumber > 0
      ? requestedNumber
      : Math.max(0, ...usedNumbers) + 1
    if (usedNumbers.has(listNumber)) {
      return { ok: false, error: `El número ${listNumber} ya está asignado en ese grupo.` }
    }
    const matricula = requestedNumber > 0
      ? input.matricula.trim()
      : `${input.matricula.trim().replace(/-\d+$/, "")}-${listNumber}`
    const paternalSurname = input.paternalSurname.trim()
    const maternalSurname = (input.maternalSurname ?? "").trim()
    const lastName = (input.lastName ?? "").trim() || `${paternalSurname} ${maternalSurname}`.trim()
    const doc = await payload.create({
      collection: "students",
      data: {
        firstName: input.firstName.trim(),
        paternalSurname,
        maternalSurname: maternalSurname || undefined,
        lastName,
        matricula,
        group: groupId,
      },
      overrideAccess: false,
      user,
    })
    const created = doc as StudentDoc
    return { ok: true, student: mapStudentDoc(created, parseListNumber(created.matricula)) }
  } catch (error: any) {
    console.error("ERROR AL CREAR ALUMNO:", error)
    if (/unique|duplicate|UNIQUE/i.test(error?.message ?? "")) {
      return { ok: false, error: "Esa matrícula ya está registrada." }
    }
    return { ok: false, error: error?.message || "No fue posible crear el alumno." }
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
  const data: Record<string, string | number> = {}
  if (isString(input.firstName)) data.firstName = input.firstName.trim()
  if (isString(input.paternalSurname)) data.paternalSurname = input.paternalSurname.trim()
  if (isString(input.maternalSurname)) data.maternalSurname = input.maternalSurname.trim()
  if (isString(input.lastName)) data.lastName = input.lastName.trim()
  if (isString(input.matricula)) data.matricula = input.matricula.trim()
  if (isString(input.groupId)) data.group = Number(input.groupId)
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
      const student = await payload.findByID({
        collection: "students",
        id: numericId,
        depth: 1,
        overrideAccess: true,
        user,
      })
      const group = (student as StudentDoc | null)?.group
      const teacherId = group && typeof group === "object"
        ? (group as { teacher?: number | { id: number } | null }).teacher
        : undefined
      const resolvedTeacherId = teacherId && typeof teacherId === "object"
        ? teacherId.id
        : teacherId
      if (String(resolvedTeacherId ?? "") !== String(user.id)) {
        return { ok: false, error: "Solo puedes eliminar alumnos de tus grupos asignados." }
      }
    }

    await payload.delete({
      collection: "attendance",
      where: { student: { equals: numericId } },
      overrideAccess: false,
      user,
    })

    await payload.delete({ collection: "students", id: numericId, overrideAccess: false, user })
    return { ok: true }
  } catch (error: any) {
    console.error(
      "DELETE STUDENT ERROR",
      JSON.stringify(error?.data?.errors ?? error?.message ?? error, null, 2),
    )
    return {
      ok: false,
      error: error?.data?.errors?.[0]?.message || error?.message || "No fue posible eliminar el alumno.",
    }
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
  if (isString(input.name)) data.name = input.name.trim()
  if (Number.isInteger(input.grade)) data.grade = input.grade
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
    if (user.role === "Docente") {
      const student = await payload.findByID({
        collection: "students",
        id: Number(input.studentId),
        depth: 0,
        overrideAccess: true,
        user,
      })
      const groupId = getRelationId((student as StudentDoc | null)?.group)
      if (groupId && await isDateOfficialized(payload, groupId, input.date)) {
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
      const studentId = isString(input.studentId)
        ? Number(input.studentId)
        : Number(getRelationId(existing?.student))
      const effectiveDate = isISODate(input.date)
        ? input.date
        : toISODate(existing?.date)
      if (studentId && effectiveDate) {
        const student = await payload.findByID({
          collection: "students",
          id: studentId,
          depth: 0,
          overrideAccess: true,
          user,
        })
        const groupId = getRelationId((student as StudentDoc | null)?.group)
        if (groupId && await isDateOfficialized(payload, groupId, effectiveDate)) {
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
        id: 0,
        teacher: getRelationName(created.teacher),
        date: toISODate(created.date),
        entryTime: toHHMM(created.entryTime),
        exitTime: created.exitTime ? toHHMM(created.exitTime) : null,
      },
    }
  } catch {
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
    const doc = await payload.update({
      collection: "teacher-attendance",
      id,
      data,
      overrideAccess: false,
      user,
    })
    const updated = doc as TeacherAttendanceDoc
    return {
      ok: true,
      record: {
        id: 0,
        teacher: getRelationName(updated.teacher),
        date: toISODate(updated.date),
        entryTime: toHHMM(updated.entryTime),
        exitTime: updated.exitTime ? toHHMM(updated.exitTime) : null,
      },
    }
  } catch {
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
  } catch {
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
  } catch {
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
    return { ok: false, error: error?.data?.errors?.[0]?.message || error?.message || "Error al asignar." }
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
    await payload.delete({
      collection: "users",
      id: teacherId as any,
      overrideAccess: false,
      user,
    } as any)
    return { ok: true }
  } catch (error: any) {
    console.error("ERROR REAL AL ELIMINAR DOCENTE:", error)
    return {
      ok: false,
      error: error?.message || "No fue posible eliminar al docente.",
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
  } catch {
    return { ok: false, error: "No fue posible actualizar el estado del docente." }
  }
}

