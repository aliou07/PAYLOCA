import type { RequestHandler } from "express";
type RateLimitPolicy = {
  windowMs: number;
  max: number;
  message: string;
};
type Bucket = {
  count: number;
  resetAt: number;
};
const buckets = new Map<string, Bucket>();
const MAX_TRACKED_KEYS = 5000;
function clientKey(
  req: Parameters<RequestHandler>[0],
): string {
  return (
    req.ip ||
    req.socket.remoteAddress ||
    "unknown"
  );
}
function requestPath(
  req: Parameters<RequestHandler>[0],
): string {
  return req.originalUrl.split("?")[0];
}
function pruneBuckets(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
  while (buckets.size >= MAX_TRACKED_KEYS) {
    const oldest = buckets.keys().next().value;
    if (typeof oldest !== "string") {
      break;
    }
    buckets.delete(oldest);
  }
}
export function createRateLimiter(
  policy: RateLimitPolicy,
): RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    pruneBuckets(now);
    const key = `${clientKey(req)}:${req.method}:${requestPath(req)}`;
    const current = buckets.get(key);
    const bucket =
      !current || current.resetAt <= now
        ? {
            count: 1,
            resetAt: now + policy.windowMs,
          }
        : {
            count: current.count + 1,
            resetAt: current.resetAt,
          };
    buckets.set(key, bucket);
    res.setHeader(
      "X-RateLimit-Limit",
      String(policy.max),
    );
    res.setHeader(
      "X-RateLimit-Remaining",
      String(
        Math.max(0, policy.max - bucket.count),
      ),
    );
    res.setHeader(
      "X-RateLimit-Reset",
      String(Math.ceil(bucket.resetAt / 1000)),
    );
    if (bucket.count > policy.max) {
      res.setHeader(
        "Retry-After",
        String(
          Math.max(
            1,
            Math.ceil(
              (bucket.resetAt - now) / 1000,
            ),
          ),
        ),
      );
      res.status(429).json({
        error: policy.message,
        code: "RATE_LIMITED",
      });
      return;
    }
    next();
  };
}
const globalApiRateLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 240,
  message:
    "Trop de requêtes. Réessayez dans quelques instants.",
});
const sensitiveRateLimiter = createRateLimiter({
  windowMs: 10 * 60_000,
  max: 20,
  message:
    "Trop de tentatives sur cette action. Réessayez plus tard.",
});
const sensitivePaths = new Set([
  "/api/account-type",
  "/api/membership/payment",
  "/api/membership/simulation",
  "/api/membership/payment-return",
  "/api/gifts/payment",
  "/api/gifts/payment-return",
  "/api/gifts/redeem",
]);
export const protectApiRequests: RequestHandler = (
  req,
  res,
  next,
) => {
  globalApiRateLimiter(req, res, () => {
    if (sensitivePaths.has(requestPath(req))) {
      sensitiveRateLimiter(req, res, next);
      return;
    }
    next();
  });
};
function allowedOrigins(): Set<string> {
  return new Set(
    (process.env.PAYLOCA_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) =>
        origin.trim().replace(/\/$/, ""),
      )
      .filter(Boolean),
  );
}
export const enforceBrowserOrigin: RequestHandler = (
  req,
  res,
  next,
) => {
  if (
    !["POST", "PUT", "PATCH", "DELETE"].includes(
      req.method,
    )
  ) {
    next();
    return;
  }
  const origin = req.header("origin");
  if (!origin) {
    next();
    return;
  }
  const requestOrigin = `${req.protocol}://${req.get(
    "host",
  )}`;
  const permitted = allowedOrigins();
  if (
    origin !== requestOrigin &&
    !permitted.has(origin)
  ) {
    res.status(403).json({
      error: "Origine de requête non autorisée.",
      code: "ORIGIN_FORBIDDEN",
    });
    return;
  }
  next();
};
export const securityHeaders: RequestHandler = (
  _req,
  res,
  next,
) => {
  res.setHeader(
    "X-Content-Type-Options",
    "nosniff",
  );
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Referrer-Policy",
    "strict-origin-when-cross-origin",
  );
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  res.setHeader(
    "Cross-Origin-Resource-Policy",
    "same-site",
  );
  res.setHeader("Cache-Control", "no-store");
  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  next();
};
