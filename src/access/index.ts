import type { Access } from "payload"

export const isDirectivo: Access = ({ req }) => {
  if (req.user?.collection === "admins") return true
  return req.user?.collection === "users" && req.user.role === "Directivo"
}

export const isDocente: Access = ({ req }) => {
  if (req.user?.collection === "admins") return true
  return req.user?.collection === "users" && req.user.role === "Docente"
}

export const isVigilante: Access = ({ req }) => {
  if (req.user?.collection === "admins") return true
  return req.user?.collection === "users" && req.user.role === "Vigilante de Acceso"
}

export const isStaff: Access = ({ req }) => {
  if (req.user?.collection === "admins") return true
  return (
    req.user?.collection === "users" &&
    (req.user.role === "Directivo" ||
      req.user.role === "Docente" ||
      req.user.role === "Vigilante de Acceso")
  )
}
