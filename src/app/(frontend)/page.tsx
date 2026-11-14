import config from "@payload-config"
import { connection } from "next/server"
import { getPayload } from "payload"
import SchoolApp, { type ReportTemplate } from "./SchoolApp"
import { appAuth, listUsersForDirectivo, toAppUserSummary } from "@/lib/app-auth"
import { loadSchoolStateAction } from "./school-data-actions"
import type { SchoolStateData } from "@/lib/school-data-types"

export default async function HomePage() {
  await connection()
  const payload = await getPayload({ config })
  const currentUser = await appAuth.currentUser()
  const users = currentUser ? await listUsersForDirectivo(currentUser) : []
  const schoolStateResult = currentUser ? await loadSchoolStateAction() : null
  const schoolState: SchoolStateData | null = schoolStateResult?.ok ? schoolStateResult.data : null
  const templates = await payload.find({
    collection: "report-templates",
    limit: 20,
    sort: "-createdAt",
    overrideAccess: false,
  })

  return (
    <SchoolApp
      initialSession={currentUser ? toAppUserSummary(currentUser) : null}
      initialSchoolState={schoolState}
      initialTemplates={templates.docs as ReportTemplate[]}
      initialUsers={users}
    />
  )
}
