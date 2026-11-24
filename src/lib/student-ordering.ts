import type { Student } from "./school-data-types"

const collator = new Intl.Collator("es", { sensitivity: "base" })

const nameParts = (student: Student) => {
  if (student.paternalSurname !== undefined || student.maternalSurname !== undefined || student.givenNames !== undefined) {
    return {
      paternalSurname: student.paternalSurname ?? "",
      maternalSurname: student.maternalSurname ?? "",
      givenNames: student.givenNames ?? "",
    }
  }
  const parts = student.name.trim().split(/\s+/)
  return {
    paternalSurname: parts.length >= 3 ? parts[parts.length - 2] : parts.at(-1) || "",
    maternalSurname: parts.length >= 3 ? parts.at(-1) || "" : "",
    givenNames: parts.length >= 3 ? parts.slice(0, -2).join(" ") : parts[0] || "",
  }
}

export const compareStudentsAlphabetically = (a: Student, b: Student): number => {
  const aName = nameParts(a)
  const bName = nameParts(b)
  return (
    collator.compare(aName.paternalSurname, bName.paternalSurname) ||
    collator.compare(aName.maternalSurname, bName.maternalSurname) ||
    collator.compare(aName.givenNames, bName.givenNames)
  )
}

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
      .sort(compareStudentsAlphabetically)
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
    .sort(compareStudentsAlphabetically)
    .map((student, index) => ({ ...student, listNumber: index + 1 }))
