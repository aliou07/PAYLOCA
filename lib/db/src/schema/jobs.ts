import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const jobsTable = pgTable("payloca_jobs", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  companyName: text("company_name").notNull(),
  city: text("city").notNull(),
  locationDetails: text("location_details").notNull().default(""),
  contractType: text("contract_type").notNull(),
  educationLevel: text("education_level").notNull().default("Non précisé"),
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  description: text("description").notNull(),
  employerId: text("employer_id").notNull(),
  employerName: text("employer_name").notNull(),
  status: text("status").notNull().default("pending_review"),
  moderationNote: text("moderation_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("jobs_status_idx").on(table.status),
  index("jobs_city_idx").on(table.city),
  index("jobs_employer_id_idx").on(table.employerId),
  check("jobs_contract_type_check", sql`${table.contractType} in ('CDI', 'CDD', 'Stage', 'Mission', 'Apprentissage')`),
  check("jobs_status_check", sql`${table.status} in ('pending_review', 'approved', 'rejected', 'closed')`),
]);

export const jobApplicationsTable = pgTable("payloca_job_applications", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobsTable.id, { onDelete: "cascade" }),
  candidateId: text("candidate_id").notNull(),
  candidateName: text("candidate_name").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("submitted"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("job_applications_job_candidate_unique").on(table.jobId, table.candidateId),
  index("job_applications_job_id_idx").on(table.jobId),
  index("job_applications_candidate_id_idx").on(table.candidateId),
  check("job_applications_status_check", sql`${table.status} in ('submitted', 'shortlisted', 'rejected')`),
]);

export const insertJobSchema = createInsertSchema(jobsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertJobApplicationSchema = createInsertSchema(jobApplicationsTable).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertJob = z.infer<typeof insertJobSchema>;
export type InsertJobApplication = z.infer<typeof insertJobApplicationSchema>;
export type Job = typeof jobsTable.$inferSelect;
export type JobApplication = typeof jobApplicationsTable.$inferSelect;
