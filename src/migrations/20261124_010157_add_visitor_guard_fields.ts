import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`visitors\` ADD \`identification\` text DEFAULT '' NOT NULL;`)
  await db.run(sql`ALTER TABLE \`visitors\` ADD \`host\` text DEFAULT '' NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`visitors\` DROP COLUMN \`host\`;`)
  await db.run(sql`ALTER TABLE \`visitors\` DROP COLUMN \`identification\`;`)
}
