import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import {
  Storage,
  type File,
} from "@google-cloud/storage";
const SIDECAR_ENDPOINT =
  "http://127.0.0.1:1106";
export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});
export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
  }
}
export class ObjectStorageService {
  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR;
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR is not configured.",
      );
    }
    return dir;
  }
  normalizeObjectEntityPath(
    rawPath: string,
  ): string {
    if (
      !
