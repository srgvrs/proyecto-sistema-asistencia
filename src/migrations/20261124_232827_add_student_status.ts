import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`official_list_corrections\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`official_list_id\` integer NOT NULL,
  	\`date\` text NOT NULL,
  	\`student_id\` integer NOT NULL,
  	\`previous_status\` text NOT NULL,
  	\`new_status\` text NOT NULL,
  	\`corrected_by_id\` integer NOT NULL,
  	\`corrected_at\` text NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`official_list_id\`) REFERENCES \`official_lists\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`student_id\`) REFERENCES \`students\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`corrected_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`official_list_corrections_official_list_idx\` ON \`official_list_corrections\` (\`official_list_id\`);`)
  await db.run(sql`CREATE INDEX \`official_list_corrections_student_idx\` ON \`official_list_corrections\` (\`student_id\`);`)
  await db.run(sql`CREATE INDEX \`official_list_corrections_corrected_by_idx\` ON \`official_list_corrections\` (\`corrected_by_id\`);`)
  await db.run(sql`CREATE INDEX \`official_list_corrections_updated_at_idx\` ON \`official_list_corrections\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`official_list_corrections_created_at_idx\` ON \`official_list_corrections\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`official_list_corrections_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`admins_id\` integer,
  	\`users_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`official_list_corrections\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`admins_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`official_list_corrections_rels_order_idx\` ON \`official_list_corrections_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`official_list_corrections_rels_parent_idx\` ON \`official_list_corrections_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`official_list_corrections_rels_path_idx\` ON \`official_list_corrections_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`official_list_corrections_rels_admins_id_idx\` ON \`official_list_corrections_rels\` (\`admins_id\`);`)
  await db.run(sql`CREATE INDEX \`official_list_corrections_rels_users_id_idx\` ON \`official_list_corrections_rels\` (\`users_id\`);`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_students\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`first_name\` text NOT NULL,
  	\`paternal_surname\` text NOT NULL,
  	\`maternal_surname\` text,
  	\`last_name\` text,
  	\`matricula\` text NOT NULL,
  	\`group_id\` integer NOT NULL,
  	\`status\` text DEFAULT 'Activo',
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`group_id\`) REFERENCES \`groups\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_students\`("id", "first_name", "paternal_surname", "maternal_surname", "last_name", "matricula", "group_id", "status", "updated_at", "created_at") SELECT "id", "first_name", "paternal_surname", "maternal_surname", "last_name", "matricula", "group_id", "status", "updated_at", "created_at" FROM \`students\`;`)
  await db.run(sql`DROP TABLE \`students\`;`)
  await db.run(sql`ALTER TABLE \`__new_students\` RENAME TO \`students\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE UNIQUE INDEX \`students_matricula_idx\` ON \`students\` (\`matricula\`);`)
  await db.run(sql`CREATE INDEX \`students_group_idx\` ON \`students\` (\`group_id\`);`)
  await db.run(sql`CREATE INDEX \`students_status_idx\` ON \`students\` (\`status\`);`)
  await db.run(sql`CREATE INDEX \`students_updated_at_idx\` ON \`students\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`students_created_at_idx\` ON \`students\` (\`created_at\`);`)
  await db.run(sql`ALTER TABLE \`groups\` ADD \`last_matricula_number\` numeric DEFAULT 0;`)
  await db.run(sql`CREATE UNIQUE INDEX \`groups_name_idx\` ON \`groups\` (\`name\`);`)
  await db.run(sql`ALTER TABLE \`official_lists\` ADD \`roster\` text;`)
  await db.run(sql`ALTER TABLE \`official_lists\` ADD \`teacher_name\` text;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`official_list_corrections_id\` integer REFERENCES official_list_corrections(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_official_list_corrections__idx\` ON \`payload_locked_documents_rels\` (\`official_list_corrections_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`official_list_corrections\`;`)
  await db.run(sql`DROP TABLE \`official_list_corrections_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`admins_id\` integer,
  	\`media_id\` integer,
  	\`folders_id\` integer,
  	\`tags_id\` integer,
  	\`report_templates_id\` integer,
  	\`users_id\` integer,
  	\`students_id\` integer,
  	\`groups_id\` integer,
  	\`attendance_id\` integer,
  	\`visitors_id\` integer,
  	\`official_lists_id\` integer,
  	\`teacher_attendance_id\` integer,
  	\`teacher_justifications_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`admins_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`folders_id\`) REFERENCES \`folders\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`tags_id\`) REFERENCES \`tags\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`report_templates_id\`) REFERENCES \`report_templates\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`students_id\`) REFERENCES \`students\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`groups_id\`) REFERENCES \`groups\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`attendance_id\`) REFERENCES \`attendance\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`visitors_id\`) REFERENCES \`visitors\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`official_lists_id\`) REFERENCES \`official_lists\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`teacher_attendance_id\`) REFERENCES \`teacher_attendance\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`teacher_justifications_id\`) REFERENCES \`teacher_justifications\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "admins_id", "media_id", "folders_id", "tags_id", "report_templates_id", "users_id", "students_id", "groups_id", "attendance_id", "visitors_id", "official_lists_id", "teacher_attendance_id", "teacher_justifications_id") SELECT "id", "order", "parent_id", "path", "admins_id", "media_id", "folders_id", "tags_id", "report_templates_id", "users_id", "students_id", "groups_id", "attendance_id", "visitors_id", "official_lists_id", "teacher_attendance_id", "teacher_justifications_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_admins_id_idx\` ON \`payload_locked_documents_rels\` (\`admins_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_folders_id_idx\` ON \`payload_locked_documents_rels\` (\`folders_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_tags_id_idx\` ON \`payload_locked_documents_rels\` (\`tags_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_report_templates_id_idx\` ON \`payload_locked_documents_rels\` (\`report_templates_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_students_id_idx\` ON \`payload_locked_documents_rels\` (\`students_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_groups_id_idx\` ON \`payload_locked_documents_rels\` (\`groups_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_attendance_id_idx\` ON \`payload_locked_documents_rels\` (\`attendance_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_visitors_id_idx\` ON \`payload_locked_documents_rels\` (\`visitors_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_official_lists_id_idx\` ON \`payload_locked_documents_rels\` (\`official_lists_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_teacher_attendance_id_idx\` ON \`payload_locked_documents_rels\` (\`teacher_attendance_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_teacher_justifications_id_idx\` ON \`payload_locked_documents_rels\` (\`teacher_justifications_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_students\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`first_name\` text NOT NULL,
  	\`last_name\` text NOT NULL,
  	\`matricula\` text NOT NULL,
  	\`group_id\` integer NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`group_id\`) REFERENCES \`groups\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_students\`("id", "first_name", "last_name", "matricula", "group_id", "updated_at", "created_at") SELECT "id", "first_name", "last_name", "matricula", "group_id", "updated_at", "created_at" FROM \`students\`;`)
  await db.run(sql`DROP TABLE \`students\`;`)
  await db.run(sql`ALTER TABLE \`__new_students\` RENAME TO \`students\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`students_matricula_idx\` ON \`students\` (\`matricula\`);`)
  await db.run(sql`CREATE INDEX \`students_group_idx\` ON \`students\` (\`group_id\`);`)
  await db.run(sql`CREATE INDEX \`students_updated_at_idx\` ON \`students\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`students_created_at_idx\` ON \`students\` (\`created_at\`);`)
  await db.run(sql`DROP INDEX \`groups_name_idx\`;`)
  await db.run(sql`ALTER TABLE \`groups\` DROP COLUMN \`last_matricula_number\`;`)
  await db.run(sql`ALTER TABLE \`official_lists\` DROP COLUMN \`roster\`;`)
  await db.run(sql`ALTER TABLE \`official_lists\` DROP COLUMN \`teacher_name\`;`)
}
