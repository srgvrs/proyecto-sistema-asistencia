import type { Student } from "./school-data-types"

const collator = new Intl.Collator("es", { sensitivity: "base" })

const cleanNamePart = (value: string | null | undefined): string =>
  (value ?? "").trim().replace(/\s+/g, " ")

const nameParts = (student: Student) => {
  if (student.paternalSurname !== undefined || student.maternalSurname !== undefined || student.givenNames !== undefined) {
    return {
      paternalSurname: cleanNamePart(student.paternalSurname),
      maternalSurname: cleanNamePart(student.maternalSurname),
      givenNames: cleanNamePart(student.givenNames),
    }
  }
  const parts = cleanNamePart(student.name).split(" ").filter(Boolean)
  return {
    paternalSurname: parts.length >= 3 ? parts[parts.length - 2] : parts.at(-1) || "",
    maternalSurname: parts.length >= 3 ? parts.at(-1) || "" : "",
    givenNames: parts.length >= 3 ? parts.slice(0, -2).join(" ") : parts[0] || "",
  }
}

/**
 * Single source of truth for ordering students: paternal surname, then
 * maternal surname, then given names. Uses `localeCompare("es", { sensitivity: "base" })`
 * so accents and letter case are ignored, and trims/collapses whitespace.
 */
export const compareStudentsByName = (a: Student, b: Student): number => {
  const aName = nameParts(a)
  const bName = nameParts(b)
  return (
    aName.paternalSurname.localeCompare(bName.paternalSurname, "es", { sensitivity: "base" }) ||
    aName.maternalSurname.localeCompare(bName.maternalSurname, "es", { sensitivity: "base" }) ||
    aName.givenNames.localeCompare(bName.givenNames, "es", { sensitivity: "base" })
  )
}

export const compareStudentsAlphabetically = compareStudentsByName

/**
 * Sorts students alphabetically (paternal, maternal, given names) and assigns
 * a 1-based list number per group. The list number is derived, never persisted.
 */
export const sortAndNumberStudents = (students: Student[]): Student[] => {
  const byGroup = new Map<string, Student[]>()
  for (const student of students) {
    const list = byGroup.get(student.group) || []
    list.push(student)
    byGroup.set(student.group, list)
  }
  const numbered: Student[] = []
  for (const groupStudents of byGroup.values()) {
    groupStudents
      .slice()
      .sort(compareStudentsByName)
      .forEach((student, index) => {
        numbered.push({ ...student, listNumber: index + 1 })
      })
  }
  return numbered
}

export const sortAndNumberGroupStudents = (students: Student[], group: string): Student[] =>
  students
    .filter((student) => student.group === group)
    .slice()
    .sort(compareStudentsByName)
    .map((student, index) => ({ ...student, listNumber: index + 1 }))
