import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

export const jobsTable = pgTable("payloca_jobs", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  company: text("company"),
  location: text("location"),
  salary: integer("salary"),
  type: text("type"),
  status: text("status").default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  paylocaJobsStatusCheck: check("payloca_jobs_status_check", sql`${table.status} in ('open', 'closed')`),
  paylocaJobsLocationIdx: index("payloca_jobs_location_idx").on(table.location),
}));

export const jobApplicationsTable = pgTable("payloca_job_applications", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull(),
  userId: text("user_id").notNull(),
  status: text("status").default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  paylocaJobApplicationsJobIdx: index("payloca_job_applications_job_idx").on(table.jobId),
  paylocaJobApplicationsStatusCheck: check("payloca_job_applications_status_check", sql`${table.status} in ('pending', 'accepted', 'rejected')`),
}));
