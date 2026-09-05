import assert from "node:assert/strict";
import test from "node:test";
import { containsUnsafeContact, hasUnsafePublicJobContact, type PublicJobTextInput } from "../src/lib/jobSafety.ts";

const validJob: Required<PublicJobTextInput> = {
  title: "Assistant administratif",
  companyName: "Entreprise Sahélienne",
  city: "Niamey",
  locationDetails: "Quartier Plateau",
  educationLevel: "Niveau secondaire",
  description: "Assurer l’accueil et le suivi quotidien des dossiers administratifs.",
};

test("accepts ordinary public employment text", () => {
  assert.equal(hasUnsafePublicJobContact(validJob), false);
  assert.equal(containsUnsafeContact("Expérience de deux ans souhaitée."), false);
});

for (const field of Object.keys(validJob) as Array<keyof PublicJobTextInput>) {
  for (const unsafe of [
    "Appelez le +227 90 12 34 56",
    "Écrivez à recrutement@example.com",
    "Consultez https://example.com/emploi",
  ]) {
    test(`rejects contact details in public field ${field}`, () => {
      assert.equal(hasUnsafePublicJobContact({ ...validJob, [field]: unsafe }), true);
    });
  }
}
