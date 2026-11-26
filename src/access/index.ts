import type { Access } from "payload"

const isActiveUser = (user: { active?: boolean | null } | null | undefined) =>
  user?.active !== false

export const isDirectivo: Access = ({ req }) => {
  if (req.user?.collection === "admins") return true
  return (
    req.user?.collection === "users" &&
    isActiveUser(req.user) &&
    req.user.role === "Directivo"
  )
}

export const isDocente: Access = ({ req }) => {
  if (req.user?.collection === "admins") return true
  return (
    req.user?.collection === "users" &&
    isActiveUser(req.user) &&
    req.user.role === "Docente"
  )
}

export const isVigilante: Access = ({ req }) => {
  if (req.user?.collection === "admins") return true
  return (
    req.user?.collection === "users" &&
    isActiveUser(req.user) &&
    req.user.role === "Vigilante de Acceso"
  )
}

export const isStaff: Access = ({ req }) => {
  if (req.user?.collection === "admins") return true
  return (
    req.user?.collection === "users" &&
    isActiveUser(req.user) &&
    (req.user.role === "Directivo" ||
      req.user.role === "Docente" ||
      req.user.role === "Vigilante de Acceso")
  )
}
