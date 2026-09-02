import express, { type ErrorRequestHandler, type Express, type Request } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  enforceBrowserOrigin,
  protectApiRequests,
  securityHeaders,
} from "./middlewares/security";
const app: Express = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(securityHeaders);
app.use("/api", enforceBrowserOrigin);
app.use("/api", protectApiRequests);
app.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buffer) => {
      (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
    },
  }),
);
app.use(
  express.urlencoded({
    extended: false,
    limit: "32kb",
  }),
);
app.use("/api", router);
app.use("/api", (_req, res) => {
  res.status(404).json({
    error: "Route API introuvable.",
  });
});
const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const errorType =
    typeof error === "object" &&
    error !== null &&
    "type" in error
      ? String((error as { type?: unknown }).type)
      : "";
  if (errorType === "entity.too.large") {
    res.status(413).json({
      error: "Requête trop volumineuse.",
    });
    return;
  }
  if (errorType === "entity.parse.failed") {
    res.status(400).json({
      error: "Corps de requête JSON invalide.",
    });
    return;
  }
  logger.error(
    {
      err: error,
      method: req.method,
      path: req.path,
    },
    "Unhandled API error",
  );
  res.status(500).json({
    error: "Une erreur interne est survenue.",
  });
};
app.use(errorHandler);
export default app;
