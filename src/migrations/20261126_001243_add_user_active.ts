import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`school_year_closures\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`cycle_label\` text NOT NULL,
  	\`closed_at\` text NOT NULL,
  	\`closed_by_id\` integer NOT NULL,
  	\`promoted\` numeric DEFAULT 0 NOT NULL,
  	\`graduated\` numeric DEFAULT 0 NOT NULL,
  	\`created_groups\` numeric DEFAULT 0 NOT NULL,
  	\`errors\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`closed_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`school_year_closures_cycle_label_idx\` ON \`school_year_closures\` (\`cycle_label\`);`)
  await db.run(sql`CREATE INDEX \`school_year_closures_closed_by_idx\` ON \`school_year_closures\` (\`closed_by_id\`);`)
  await db.run(sql`CREATE INDEX \`school_year_closures_updated_at_idx\` ON \`school_year_closures\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`school_year_closures_created_at_idx\` ON \`school_year_closures\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`school_year_closures_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`admins_id\` integer,
  	\`users_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`school_year_closures\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`admins_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`school_year_closures_rels_order_idx\` ON \`school_year_closures_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`school_year_closures_rels_parent_idx\` ON \`school_year_closures_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`school_year_closures_rels_path_idx\` ON \`school_year_closures_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`school_year_closures_rels_admins_id_idx\` ON \`school_year_closures_rels\` (\`admins_id\`);`)
  await db.run(sql`CREATE INDEX \`school_year_closures_rels_users_id_idx\` ON \`school_year_closures_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE TABLE \`_school_year_closures_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_cycle_label\` text NOT NULL,
  	\`version_closed_at\` text NOT NULL,
  	\`version_closed_by_id\` integer NOT NULL,
  	\`version_promoted\` numeric DEFAULT 0 NOT NULL,
  	\`version_graduated\` numeric DEFAULT 0 NOT NULL,
  	\`version_created_groups\` numeric DEFAULT 0 NOT NULL,
  	\`version_errors\` text,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`school_year_closures\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_closed_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`_school_year_closures_v_parent_idx\` ON \`_school_year_closures_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_school_year_closures_v_version_version_cycle_label_idx\` ON \`_school_year_closures_v\` (\`version_cycle_label\`);`)
  await db.run(sql`CREATE INDEX \`_school_year_closures_v_version_version_closed_by_idx\` ON \`_school_year_closures_v\` (\`version_closed_by_id\`);`)
  await db.run(sql`CREATE INDEX \`_school_year_closures_v_version_version_updated_at_idx\` ON \`_school_year_closures_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_school_year_closures_v_version_version_created_at_idx\` ON \`_school_year_closures_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_school_year_closures_v_created_at_idx\` ON \`_school_year_closures_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_school_year_closures_v_updated_at_idx\` ON \`_school_year_closures_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE TABLE \`_school_year_closures_v_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`admins_id\` integer,
  	\`users_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`_school_year_closures_v\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`admins_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_school_year_closures_v_rels_order_idx\` ON \`_school_year_closures_v_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`_school_year_closures_v_rels_parent_idx\` ON \`_school_year_closures_v_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_school_year_closures_v_rels_path_idx\` ON \`_school_year_closures_v_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`_school_year_closures_v_rels_admins_id_idx\` ON \`_school_year_closures_v_rels\` (\`admins_id\`);`)
  await db.run(sql`CREATE INDEX \`_school_year_closures_v_rels_users_id_idx\` ON \`_school_year_closures_v_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE TABLE \`school_settings\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`director_name\` text,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`school_settings_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`admins_id\` integer,
  	\`users_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`school_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`admins_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`school_settings_rels_order_idx\` ON \`school_settings_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`school_settings_rels_parent_idx\` ON \`school_settings_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`school_settings_rels_path_idx\` ON \`school_settings_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`school_settings_rels_admins_id_idx\` ON \`school_settings_rels\` (\`admins_id\`);`)
  await db.run(sql`CREATE INDEX \`school_settings_rels_users_id_idx\` ON \`school_settings_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE TABLE \`_school_settings_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`version_director_name\` text,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`_school_settings_v_created_at_idx\` ON \`_school_settings_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_school_settings_v_updated_at_idx\` ON \`_school_settings_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE TABLE \`_school_settings_v_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`admins_id\` integer,
  	\`users_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`_school_settings_v\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`admins_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_school_settings_v_rels_order_idx\` ON \`_school_settings_v_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`_school_settings_v_rels_parent_idx\` ON \`_school_settings_v_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_school_settings_v_rels_path_idx\` ON \`_school_settings_v_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`_school_settings_v_rels_admins_id_idx\` ON \`_school_settings_v_rels\` (\`admins_id\`);`)
  await db.run(sql`CREATE INDEX \`_school_settings_v_rels_users_id_idx\` ON \`_school_settings_v_rels\` (\`users_id\`);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`school_year_closures_id\` integer REFERENCES school_year_closures(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_school_year_closures_id_idx\` ON \`payload_locked_documents_rels\` (\`school_year_closures_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`school_year_closures\`;`)
  await db.run(sql`DROP TABLE \`school_year_closures_rels\`;`)
  await db.run(sql`DROP TABLE \`_school_year_closures_v\`;`)
  await db.run(sql`DROP TABLE \`_school_year_closures_v_rels\`;`)
  await db.run(sql`DROP TABLE \`school_settings\`;`)
  await db.run(sql`DROP TABLE \`school_settings_rels\`;`)
  await db.run(sql`DROP TABLE \`_school_settings_v\`;`)
  await db.run(sql`DROP TABLE \`_school_settings_v_rels\`;`)
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
  	\`official_list_corrections_id\` integer,
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
  	FOREIGN KEY (\`official_list_corrections_id\`) REFERENCES \`official_list_corrections\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`teacher_attendance_id\`) REFERENCES \`teacher_attendance\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`teacher_justifications_id\`) REFERENCES \`teacher_justifications\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "admins_id", "media_id", "folders_id", "tags_id", "report_templates_id", "users_id", "students_id", "groups_id", "attendance_id", "visitors_id", "official_lists_id", "official_list_corrections_id", "teacher_attendance_id", "teacher_justifications_id") SELECT "id", "order", "parent_id", "path", "admins_id", "media_id", "folders_id", "tags_id", "report_templates_id", "users_id", "students_id", "groups_id", "attendance_id", "visitors_id", "official_lists_id", "official_list_corrections_id", "teacher_attendance_id", "teacher_justifications_id" FROM \`payload_locked_documents_rels\`;`)
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
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_official_list_corrections__idx\` ON \`payload_locked_documents_rels\` (\`official_list_corrections_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_teacher_attendance_id_idx\` ON \`payload_locked_documents_rels\` (\`teacher_attendance_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_teacher_justifications_id_idx\` ON \`payload_locked_documents_rels\` (\`teacher_justifications_id\`);`)
}
