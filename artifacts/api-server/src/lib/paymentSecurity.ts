import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import type { Request } from "express";
export function hasValidPaymentSignature(
  req: Request,
): boolean {
  const secret =
    process.env.PAYLOCA_PAYMENT_WEBHOOK_SECRET;
  const signature =
    req.header(
      "x-payloca-payment-signature",
    ) ??
    req.header("x-payment-signature");
  if (!secret || !signature) {
    return false;
  }
  const rawBody = (
    req as Request & {
      rawBody?: Buffer;
    }
  ).rawBody;
  const payload =
    rawBody ??
    Buffer.from(
      JSON.stringify(req.body ?? {}),
    );
  const expected = createHmac(
    "sha256",
    secret,
  )
    .update(payload)
    .digest("hex");
  const provided = signature
    .replace(/^sha256=/i, "")
    .trim()
    .toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(provided)) {
    return false;
  }
  const expectedBuffer = Buffer.from(
    expected,
    "utf8",
  );
  const providedBuffer = Buffer.from(
    provided,
    "utf8",
  );
  return timingSafeEqual(
    expectedBuffer,
    providedBuffer,
  );
}
