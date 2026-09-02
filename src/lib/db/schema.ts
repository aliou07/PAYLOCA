import { pgTable, serial, varchar, text, timestamp, uuid } from 'drizzle-orm/pg-core'
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 256 }).notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
})
