const unsafeContact =
  /(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?\d[\d\s().-]{6,}\d))/i;
export type PublicJobTextInput = {
  title?: string;
  companyName?: string;
  city?: string;
  locationDetails?: string;
  educationLevel?: string;
  description?: string;
};
export function containsUnsafeContact(
  value?: string,
): boolean {
  return Boolean(
    value && unsafeContact.test(value),
  );
}
export function hasUnsafePublicJobContact(
  input: PublicJobTextInput,
): boolean {
  return [
    input.title,
    input.companyName,
    input.city,
    input.locationDetails,
    input.educationLevel,
    input.description,
  ].some(containsUnsafeContact);
}
