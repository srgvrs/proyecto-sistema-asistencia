import type { Access, GlobalConfig } from "payload"

const isAppUser: Access = ({ req }) => req.user?.collection === "users"

export const SchoolState: GlobalConfig = {
  slug: "school-state",
  label: "Estado operativo escolar",
  access: {
    read: isAppUser,
    update: isAppUser,
  },
  admin: {
    hidden: true,
  },
  fields: [
    { name: "students", type: "json" },
    { name: "groups", type: "json" },
    { name: "attendanceRecords", type: "json" },
    { name: "officialAttendanceLists", type: "json" },
    { name: "visitors", type: "json" },
    { name: "teacherAttendance", type: "json" },
    { name: "teacherGroups", type: "json" },
    { name: "teachers", type: "json" },
  ],
  versions: false,
}
