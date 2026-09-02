import {
  and,
  desc,
  eq,
  ilike,
  or,
} from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  jobApplicationsTable,
  jobsTable,
} from "@workspace/db";
import {
  CreateJobApplicationBody,
  CreateJobApplicationParams,
  CreateJobApplicationResponse,
  CreateJobBody,
  CreateJobResponse,
  ListJobApplicationsParams,
  ListJobApplicationsResponse,
  ListJobsQueryParams,
  ListJobsResponse,
  ListJobsForModerationQueryParams,
  ListJobsForModerationResponse,
  ListMyJobsResponse,
  ModerateJobBody,
  ModerateJobParams,
  ModerateJobResponse,
  UpdateJobApplicationStatusBody,
  UpdateJobApplicationStatusParams,
  UpdateJobApplicationStatusResponse,
} from "@workspace/api-zod";
import {
  getAuthenticatedUserName,
  requireAccountType,
  requireAuth,
  requireModerator,
  requireYoungVip,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import {
  containsUnsafeContact,
  hasUnsafePublicJobContact,
} from "../lib/jobSafety";
import { getDatabaseErrorCode } from "../lib/databaseError";
const router: IRouter = Router();
function publicJob(
  job: typeof jobsTable.$inferSelect,
) {
  const {
    employerId: _employerId,
    moderationNote: _moderationNote,
    ...safeJob
  } = job;
  return safeJob;
}
router.get(
  "/jobs",
  async (req, res): Promise<void> => {
    const parsed = ListJobsQueryParams.safeParse(
      req.query,
    );
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.message,
      });
      return;
    }
    const filters = [
      eq(jobsTable.status, "approved"),
    ];
    if (parsed.data.city) {
      filters.push(
        eq(jobsTable.city, parsed.data.city),
      );
    }
    if (
      parsed.data.contractType &&
      parsed.data.contractType !== "all"
    ) {
      filters.push(
        eq(
          jobsTable.contractType,
          parsed.data.contractType,
        ),
      );
    }
    if (parsed.data.search) {
      const search = `%${parsed.data.search}%`;
      filters.push(
        or(
          ilike(jobsTable.title, search),
          ilike(jobsTable.companyName, search),
          ilike(jobsTable.description, search),
        )!,
      );
    }
    const jobs = await db
      .select()
      .from(jobsTable)
      .where(and(...filters))
      .orderBy(desc(jobsTable.createdAt));
    res.json(
      ListJobsResponse.parse(
        jobs.map(publicJob),
      ),
    );
  },
);
router.post(
  "/jobs",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!requireAccountType(req, res, ["agency"])) {
      return;
    }
    const parsed = CreateJobBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.message,
      });
      return;
    }
    if (
      parsed.data.salaryMin !== undefined &&
      parsed.data.salaryMax !== undefined &&
      parsed.data.salaryMin > parsed.data.salaryMax
    ) {
      res.status(400).json({
        error:
          "Le salaire minimum ne peut pas dépasser le salaire maximum.",
      });
      return;
    }
    if (hasUnsafePublicJobContact(parsed.data)) {
      res.status(400).json({
        error:
          "Pour protéger les candidats, ne mettez pas de téléphone, e-mail ou lien dans l’offre.",
      });
      return;
    }
    const userId = (req as AuthenticatedRequest).userId;
    const employerName =
      await getAuthenticatedUserName(userId, req);
    const [job] = await db
      .insert(jobsTable)
      .values({
        title: parsed.data.title.trim(),
        companyName: parsed.data.companyName.trim(),
        city: parsed.data.city.trim(),
        locationDetails:
          parsed.data.locationDetails?.trim() ?? "",
        contractType: parsed.data.contractType,
        educationLevel:
          parsed.data.educationLevel?.trim() ||
          "Non précisé",
        salaryMin: parsed.data.salaryMin ?? null,
        salaryMax: parsed.data.salaryMax ?? null,
        description: parsed.data.description.trim(),
        employerId: userId,
        employerName,
        status: "pending_review",
        moderationNote: null,
      })
      .returning();
    res.status(201).json(
      CreateJobResponse.parse(job),
    );
  },
);
router.get(
  "/jobs/mine",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!requireAccountType(req, res, ["agency"])) {
      return;
    }
    const userId = (req as AuthenticatedRequest).userId;
    const jobs = await db
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.employerId, userId))
      .orderBy(desc(jobsTable.createdAt));
    res.json(ListMyJobsResponse.parse(jobs));
  },
);
router.get(
  "/jobs/moderation",
  requireAuth,
  requireModerator,
  async (req, res): Promise<void> => {
    const parsed =
      ListJobsForModerationQueryParams.safeParse(
        req.query,
      );
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.message,
      });
      return;
    }
    const status =
      parsed.data.status ?? "pending_review";
    const jobs = await db
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.status, status))
      .orderBy(desc(jobsTable.createdAt));
    res.json(
      ListJobsForModerationResponse.parse(jobs),
    );
  },
);
router.patch(
  "/jobs/:id/moderation",
  requireAuth,
  requireModerator,
  async (req, res): Promise<void> => {
    const params = ModerateJobParams.safeParse(
      req.params,
    );
    const body = ModerateJobBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({
        error: "Décision de modération invalide.",
      });
      return;
    }
    const note =
      body.data.moderationNote?.trim() || null;
    if (body.data.status === "rejected" && !note) {
      res.status(400).json({
        error:
          "Un motif est requis pour refuser une offre.",
      });
      return;
    }
    const [updated] = await db
      .update(jobsTable)
      .set({
        status: body.data.status,
        moderationNote: note,
        updatedAt: new Date(),
      })
      .where(eq(jobsTable.id, params.data.id))
      .returning();
    if (!updated) {
      res.status(404).json({
        error: "Offre introuvable.",
      });
      return;
    }
    res.json(
      ModerateJobResponse.parse(updated),
    );
  },
);
router.get(
  "/jobs/:id/applications",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!requireAccountType(req, res, ["agency"])) {
      return;
    }
    const params =
      ListJobApplicationsParams.safeParse(
        req.params,
      );
    if (!params.success) {
      res.status(400).json({
        error: "Offre invalide.",
      });
      return;
    }
    const userId = (req as AuthenticatedRequest).userId;
    const [job] = await db
      .select({
        id: jobsTable.id,
        employerId: jobsTable.employerId,
      })
      .from(jobsTable)
      .where(eq(jobsTable.id, params.data.id))
      .limit(1);
    if (!job) {
      res.status(404).json({
        error: "Offre introuvable.",
      });
      return;
    }
    if (job.employerId !== userId) {
      res.status(403).json({
        error:
          "Seul l’employeur peut consulter ces candidatures.",
      });
      return;
    }
    const applications = await db
      .select()
      .from(jobApplicationsTable)
      .where(
        eq(jobApplicationsTable.jobId, job.id),
      )
      .orderBy(desc(jobApplicationsTable.createdAt));
    res.json(
      ListJobApplicationsResponse.parse(
        applications,
      ),
    );
  },
);
router.post(
  "/jobs/:id/applications",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!requireYoungVip(req, res)) {
      return;
    }
    const params =
      CreateJobApplicationParams.safeParse(
        req.params,
      );
    const body = CreateJobApplicationBody.safeParse(
      req.body,
    );
    if (!params.success || !body.success) {
      res.status(400).json({
        error: "Candidature invalide.",
      });
      return;
    }
    if (containsUnsafeContact(body.data.message)) {
      res.status(400).json({
        error:
          "Pour votre sécurité, n’ajoutez pas de téléphone, e-mail ou lien dans votre candidature.",
      });
      return;
    }
    const userId = (req as AuthenticatedRequest).userId;
    const [job] = await db
      .select({
        id: jobsTable.id,
        employerId: jobsTable.employerId,
      })
      .from(jobsTable)
      .where(
        and(
          eq(jobsTable.id, params.data.id),
          eq(jobsTable.status, "approved"),
        ),
      )
      .limit(1);
    if (!job) {
      res.status(404).json({
        error: "Cette offre n’est pas disponible.",
      });
      return;
    }
    if (job.employerId === userId) {
      res.status(400).json({
        error:
          "Vous ne pouvez pas postuler à votre propre offre.",
      });
      return;
    }
    const candidateName =
      await getAuthenticatedUserName(userId, req);
    try {
      const [application] = await db
        .insert(jobApplicationsTable)
        .values({
          jobId: job.id,
          candidateId: userId,
          candidateName,
          message: body.data.message.trim(),
          status: "submitted",
        })
        .returning();
      res.status(201).json(
        CreateJobApplicationResponse.parse(
          application,
        ),
      );
    } catch (error) {
      if (getDatabaseErrorCode(error) !== "23505") {
        throw error;
      }
      req.log.warn(
        {
          err: error,
        },
        "Duplicate job application rejected",
      );
      res.status(409).json({
        error:
          "Vous avez déjà postulé à cette offre.",
      });
    }
  },
);
router.patch(
  "/job-applications/:id/status",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!requireAccountType(req, res, ["agency"])) {
      return;
    }
    const params =
      UpdateJobApplicationStatusParams.safeParse(
        req.params,
      );
    const body =
      UpdateJobApplicationStatusBody.safeParse(
        req.body,
      );
    if (!params.success || !body.success) {
      res.status(400).json({
        error: "Décision invalide.",
      });
      return;
    }
    const userId = (req as AuthenticatedRequest).userId;
    const [record] = await db
      .select({
        applicationId: jobApplicationsTable.id,
        employerId: jobsTable.employerId,
      })
      .from(jobApplicationsTable)
      .innerJoin(
        jobsTable,
        eq(
          jobApplicationsTable.jobId,
          jobsTable.id,
        ),
      )
      .where(
        eq(
          jobApplicationsTable.id,
          params.data.id,
        ),
      )
      .limit(1);
    if (!record) {
      res.status(404).json({
        error: "Candidature introuvable.",
      });
      return;
    }
    if (record.employerId !== userId) {
      res.status(403).json({
        error:
          "Seul l’employeur peut modifier cette candidature.",
      });
      return;
    }
    const [updated] = await db
      .update(jobApplicationsTable)
      .set({
        status: body.data.status,
        updatedAt: new Date(),
      })
      .where(
        eq(
          jobApplicationsTable.id,
          record.applicationId,
        ),
      )
      .returning();
    res.json(
      UpdateJobApplicationStatusResponse.parse(
        updated,
      ),
    );
  },
);
export default router;
