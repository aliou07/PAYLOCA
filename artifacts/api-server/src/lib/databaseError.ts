export function getDatabaseErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const direct = (error as { code?: unknown }).code;
  if (typeof direct === "string") return direct;
  const cause = (error as { cause?: unknown }).cause;
  if (!cause || typeof cause !== "object") return undefined;
  const nested = (cause as { code?: unknown }).code;
  return typeof nested === "string" ? nested : undefined;
}
