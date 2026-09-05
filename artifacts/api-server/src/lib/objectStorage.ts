import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { Storage, type File } from "@google-cloud/storage";

const SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
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
    if (!dir) throw new Error("PRIVATE_OBJECT_DIR is not configured.");
    return dir;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) return rawPath;
    const url = new URL(rawPath);
    let objectDir = this.getPrivateObjectDir();
    if (!objectDir.endsWith("/")) objectDir += "/";
    if (!url.pathname.startsWith(objectDir)) return url.pathname;
    return `/objects/${url.pathname.slice(objectDir.length)}`;
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const fullPath = `${this.getPrivateObjectDir()}/uploads/${randomUUID()}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    const response = await fetch(`${SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: bucketName,
        object_name: objectName,
        method: "PUT",
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Failed to sign upload URL (${response.status}).`);
    const data = await response.json() as { signed_url?: string };
    if (!data.signed_url) throw new Error("Storage returned no upload URL.");
    return data.signed_url;
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();
    const entityId = objectPath.slice("/objects/".length);
    if (!entityId || entityId.includes("..")) throw new ObjectNotFoundError();
    const objectDir = this.getPrivateObjectDir().replace(/\/$/, "");
    const { bucketName, objectName } = parseObjectPath(`${objectDir}/${entityId}`);
    const file = objectStorageClient.bucket(bucketName).file(objectName);
    const [exists] = await file.exists();
    if (!exists) throw new ObjectNotFoundError();
    return file;
  }

  async downloadObject(file: File): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const stream = Readable.toWeb(file.createReadStream()) as ReadableStream;
    const headers: Record<string, string> = {
      "Content-Type": String(metadata.contentType || "application/octet-stream"),
      "Cache-Control": "private, max-age=300",
    };
    if (metadata.size) headers["Content-Length"] = String(metadata.size);
    return new Response(stream, { headers });
  }

  async verifyImage(objectPath: string, expected: { contentType: string; size: number }): Promise<boolean> {
    const file = await this.getObjectEntityFile(objectPath);
    const [metadata] = await file.getMetadata();
    const actualType = String(metadata.contentType || "").toLowerCase();
    const actualSize = Number(metadata.size);
    if (actualType !== expected.contentType || actualSize !== expected.size || actualSize < 1 || actualSize > 10 * 1024 * 1024) {
      return false;
    }
    const [header] = await file.download({ start: 0, end: 11 });
    return (
      (actualType === "image/jpeg" && header.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
      || (actualType === "image/png" && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
      || (actualType === "image/gif" && (header.subarray(0, 6).toString() === "GIF87a" || header.subarray(0, 6).toString() === "GIF89a"))
      || (actualType === "image/webp" && header.subarray(0, 4).toString() === "RIFF" && header.subarray(8, 12).toString() === "WEBP")
    );
  }
}

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const parts = normalized.split("/");
  if (parts.length < 3 || !parts[1] || !parts.slice(2).join("/")) throw new Error("Chemin de stockage invalide.");
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}
