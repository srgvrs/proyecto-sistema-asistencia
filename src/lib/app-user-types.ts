export type Role = "Directivo" | "Docente" | "Vigilante de Acceso"

export type AppUserSummary = {
  id: string
  name: string
  role: Role
  username: string
}
