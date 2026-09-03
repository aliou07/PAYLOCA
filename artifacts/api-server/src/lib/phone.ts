export function normalizeNigerPhone(
  value: string,
): string {
  const compact =
    value
      .trim()
      .replace(/[\s().-]/g, "");

  const local =
    compact.startsWith("+227")
      ? compact.slice(4)
      : compact.startsWith("227")
        ? compact.slice(3)
        : compact;

  return /^\d{8}$/.test(local)
    ? `+227${local}`
    : "";
}
