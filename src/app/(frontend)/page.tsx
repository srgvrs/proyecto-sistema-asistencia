import config from "@payload-config"
import { connection } from "next/server"
import { getPayload } from "payload"
import SchoolApp, { type ReportTemplate } from "./SchoolApp"
import { appAuth, listUsersForDirectivo, toAppUserSummary } from "@/lib/app-auth"
import { loadSchoolStateAction } from "./school-data-actions"
import type { SchoolStateData } from "@/lib/school-data-types"
import { getDefaultDateRange, validateDateRange, type DateRange } from "@/lib/date-range"

type HomePageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

const readDateRange = (params: { [key: string]: string | string[] | undefined }): DateRange => {
  const rawDesde = typeof params.desde === "string" ? params.desde : ""
  const rawHasta = typeof params.hasta === "string" ? params.hasta : ""
  if (validateDateRange(rawDesde, rawHasta)) return { desde: rawDesde, hasta: rawHasta }
  return getDefaultDateRange()
}

export default async function HomePage({ searchParams }: HomePageProps) {
  await connection()
  const resolvedSearchParams = await searchParams
  const initialDateRange = readDateRange(resolvedSearchParams)
  const payload = await getPayload({ config })
  const currentUser = await appAuth.currentUser()
  const users = currentUser ? await listUsersForDirectivo(currentUser) : []
  const schoolStateResult = currentUser ? await loadSchoolStateAction() : null
  const schoolState: SchoolStateData | null = schoolStateResult?.ok ? schoolStateResult.data : null
  console.log("PAGE", !!currentUser, schoolStateResult?.ok, schoolState?.students.length ?? null)
  let templates: ReportTemplate[] = []
  if (currentUser) {
    try {
      const result = await payload.find({
        collection: "report-templates",
        limit: 20,
        sort: "-createdAt",
        overrideAccess: false,
        user: currentUser,
      })
      templates = result.docs as ReportTemplate[]
    } catch (error) {
      console.error(
        "No fue posible cargar las plantillas de reportes:",
        error instanceof Error ? error.message : error,
      )
    }
  }

  return (
    <SchoolApp
      key={`${currentUser?.id ?? "anon"}-${schoolState?.students.length ?? 0}-${schoolState?.groups.length ?? 0}-${schoolState?.teachers.length ?? 0}`}
      initialSession={currentUser ? toAppUserSummary(currentUser) : null}
      initialSchoolState={schoolState}
      initialTemplates={templates}
      initialUsers={users}
      initialDateRange={initialDateRange}
    />
  )
}
