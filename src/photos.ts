import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { IncomingMessage } from "node:http";
import sharp from "sharp";
import { ROOT } from "./root.ts";
import { COPY, COVER_HEIGHT, COVER_PATH, COVER_WIDTH, checkCoverUpload } from "./schemas.ts";

export const UPLOADS_DIR = path.join(ROOT, "uploads");
const MAX_BYTES = 5 * 1024 * 1024;

const DIMENSION_COPY = {
  small: COPY.photoSize,
  large: COPY.photoTooLarge,
  shape: COPY.photoShape,
} as const;

export class PhotoError extends Error {
  readonly kind: "size" | "type" | "dimensions";
  constructor(kind: "size" | "type" | "dimensions", message?: string) {
    super(message ?? (kind === "dimensions" ? COPY.photoSize : COPY.photoRejected));
    this.kind = kind;
  }
}

export async function ensureUploads(): Promise<void> {
  await mkdir(UPLOADS_DIR, { recursive: true });
}

export function fileForCover(coverImage: string | null): string | null {
  if (!coverImage || !COVER_PATH.test(coverImage)) return null;
  const name = coverImage.slice("/api/uploads/".length);
  const full = path.resolve(UPLOADS_DIR, name);
  const root = path.resolve(UPLOADS_DIR);
  if (full !== path.join(root, name)) return null;
  return full;
}

/** Best effort: the note is already deleted or saved, so a file that cannot be removed is only logged. */
export async function removeCover(coverImage: string | null): Promise<void> {
  const full = fileForCover(coverImage);
  if (!full) return;
  await unlink(full).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") console.error(`Could not remove old photo ${path.basename(full)}: ${error.code ?? error.message}`);
  });
}

export async function coverSize(coverImage: string): Promise<{ width: number; height: number } | null> {
  const full = fileForCover(coverImage);
  if (!full) return null;
  try {
    // Read into memory first: opening the path directly lets sharp keep the file open,
    // which on Windows stops a later delete or replace of the same file.
    const meta = await sharp(await readFile(full)).metadata();
    if (!meta.width || !meta.height) return null;
    return { width: meta.width, height: meta.height };
  } catch {
    return null;
  }
}

export async function saveUpload(req: IncomingMessage): Promise<{ coverImage: string; width: number; height: number }> {
  const file = await readFilePart(req);
  let output: { data: Buffer; info: sharp.OutputInfo };
  try {
    const meta = await sharp(file, { limitInputPixels: 40_000_000, animated: false }).metadata();
    if (meta.format !== "jpeg" && meta.format !== "png" && meta.format !== "webp") throw new PhotoError("type");
    if (!meta.width || !meta.height) throw new PhotoError("type");
    // EXIF orientations 5–8 turn the photo on its side, so width and height swap once rotated.
    const turned = (meta.orientation ?? 1) >= 5;
    const shownWidth = turned ? meta.height : meta.width;
    const shownHeight = turned ? meta.width : meta.height;
    const problem = checkCoverUpload(shownWidth, shownHeight);
    if (problem) throw new PhotoError("dimensions", DIMENSION_COPY[problem]);
    output = await sharp(file, { limitInputPixels: 40_000_000, animated: false })
      .rotate()
      .resize(COVER_WIDTH, COVER_HEIGHT, { fit: "cover", position: "centre" })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
  } catch (error) {
    if (error instanceof PhotoError) throw error;
    throw new PhotoError("type");
  }
  if (output.info.width !== COVER_WIDTH || output.info.height !== COVER_HEIGHT) throw new PhotoError("dimensions");
  const name = `${randomBytes(16).toString("hex")}.webp`;
  await writeFile(path.join(UPLOADS_DIR, name), output.data);
  return {
    coverImage: `/api/uploads/${name}`,
    width: output.info.width,
    height: output.info.height,
  };
}

/** Share image for a whole page: any landscape photo, cropped to 1200 × 630 (the size WhatsApp and Facebook show). */
export const SHARE_WIDTH = 1200;
export const SHARE_HEIGHT = 630;
export async function saveShareUpload(req: IncomingMessage): Promise<string> {
  const file = await readFilePart(req);
  let output: { data: Buffer; info: sharp.OutputInfo };
  try {
    const meta = await sharp(file, { limitInputPixels: 40_000_000, animated: false }).metadata();
    if (meta.format !== "jpeg" && meta.format !== "png" && meta.format !== "webp") throw new PhotoError("type");
    if (!meta.width || !meta.height) throw new PhotoError("type");
    const turned = (meta.orientation ?? 1) >= 5;
    const shownWidth = turned ? meta.height : meta.width;
    const shownHeight = turned ? meta.width : meta.height;
    const problem = checkCoverUpload(shownWidth, shownHeight);
    if (problem) throw new PhotoError("dimensions", DIMENSION_COPY[problem]);
    output = await sharp(file, { limitInputPixels: 40_000_000, animated: false })
      .rotate()
      .resize(SHARE_WIDTH, SHARE_HEIGHT, { fit: "cover", position: "centre" })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
  } catch (error) {
    if (error instanceof PhotoError) throw error;
    throw new PhotoError("type");
  }
  const name = `${randomBytes(16).toString("hex")}.webp`;
  await writeFile(path.join(UPLOADS_DIR, name), output.data);
  return `/api/uploads/${name}`;
}

async function readFilePart(req: IncomingMessage): Promise<Buffer> {
  const header = req.headers["content-type"];
  if (!header || !header.toLowerCase().startsWith("multipart/form-data")) throw new PhotoError("type");
  const match = header.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = (match?.[1] || match?.[2] || "").trim();
  if (!boundary) throw new PhotoError("type");

  const chunks: Buffer[] = [];
  let total = 0;
  const ceiling = MAX_BYTES + 64 * 1024;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > ceiling) throw new PhotoError("size");
    chunks.push(buffer);
  }
  const file = extractFile(Buffer.concat(chunks), boundary);
  if (!file || file.length === 0) throw new PhotoError("type");
  if (file.length > MAX_BYTES) throw new PhotoError("size");
  return file;
}

function extractFile(body: Buffer, boundary: string): Buffer | null {
  const marker = Buffer.from(`--${boundary}`);
  const headerBreak = Buffer.from("\r\n\r\n");
  let position = body.indexOf(marker);
  if (position < 0) return null;
  while (position >= 0 && position < body.length) {
    let cursor = position + marker.length;
    if (body[cursor] === 45 && body[cursor + 1] === 45) return null;
    if (body[cursor] === 13 && body[cursor + 1] === 10) cursor += 2;
    const next = body.indexOf(marker, cursor);
    const part = body.subarray(cursor, next === -1 ? body.length : next);
    const split = part.indexOf(headerBreak);
    if (split >= 0) {
      const headers = part.subarray(0, split).toString("utf8").toLowerCase();
      if (headers.includes('name="file"')) {
        let data = part.subarray(split + headerBreak.length);
        if (data.length >= 2 && data[data.length - 2] === 13 && data[data.length - 1] === 10) {
          data = data.subarray(0, data.length - 2);
        }
        return data;
      }
    }
    if (next === -1) return null;
    position = next;
  }
  return null;
}
