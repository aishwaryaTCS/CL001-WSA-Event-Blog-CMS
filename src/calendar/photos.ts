import { randomBytes } from "node:crypto";
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import path from "node:path";
import sharp from "sharp";
import { UPLOADS_DIR } from "../photos.ts";
import { COPY, checkCoverUpload } from "../schemas.ts";
import { referencedPaths } from "./db.ts";
import { CAL_COPY, PHOTO_NAME } from "./schemas.ts";

// Follows the pattern of src/photos.ts (which stays unchanged): Sharp re-encodes every
// upload to WebP, which drops EXIF and GPS data, and the original is never kept.

export const CAL_UPLOADS_DIR = path.join(UPLOADS_DIR, "calendar");
export const PUBLIC_PREFIX = "/api/calendar/photos/";
const MAX_BYTES = 5 * 1024 * 1024;
const PIXEL_LIMIT = 40_000_000;

export class CalendarPhotoError extends Error {
  readonly status: number;
  constructor(status: number, message: string = CAL_COPY.photoRejected) {
    super(message);
    this.status = status;
  }
}

export async function ensureCalendarUploads(): Promise<void> {
  await mkdir(CAL_UPLOADS_DIR, { recursive: true });
}

/** Absolute file for a stored path or bare file name, or null when it is not a calendar photo. */
export function fileFor(value: string): string | null {
  const name = value.startsWith(PUBLIC_PREFIX) ? value.slice(PUBLIC_PREFIX.length) : value;
  if (!PHOTO_NAME.test(name)) return null;
  const root = path.resolve(CAL_UPLOADS_DIR);
  const full = path.resolve(root, name);
  if (path.dirname(full) !== root) return null;
  return full;
}

function newName(): string {
  return randomBytes(16).toString("hex");
}

// Same size and shape rules as blog cover photos: landscape, 1200 × 800 up to 3000 × 2000.
const SIZE_COPY = { small: COPY.photoSize, large: COPY.photoTooLarge, shape: COPY.photoShape } as const;

async function decode(file: Buffer): Promise<() => sharp.Sharp> {
  try {
    const meta = await sharp(file, { limitInputPixels: PIXEL_LIMIT, animated: false }).metadata();
    if (meta.format !== "jpeg" && meta.format !== "png" && meta.format !== "webp") throw new CalendarPhotoError(415);
    if (!meta.width || !meta.height) throw new CalendarPhotoError(415);
    // EXIF orientations 5–8 turn the photo on its side, so check it as it will be shown.
    const turned = (meta.orientation ?? 1) >= 5;
    const problem = checkCoverUpload(turned ? meta.height : meta.width, turned ? meta.width : meta.height);
    if (problem) throw new CalendarPhotoError(400, SIZE_COPY[problem]);
  } catch (error) {
    if (error instanceof CalendarPhotoError) throw error;
    throw new CalendarPhotoError(415);
  }
  // rotate() applies the camera orientation before the metadata is dropped.
  return () => sharp(file, { limitInputPixels: PIXEL_LIMIT, animated: false }).rotate();
}

async function encode(pipeline: sharp.Sharp): Promise<{ data: Buffer; info: sharp.OutputInfo }> {
  try {
    return await pipeline.webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
  } catch {
    throw new CalendarPhotoError(415);
  }
}

/** Event photo: 1600 px long edge for the overlay, 640 px for thumbnails and sharing. */
export async function saveEventPhoto(
  file: Buffer,
): Promise<{ file: string; thumb: string; width: number; height: number }> {
  const base = await decode(file);
  const large = await encode(base().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }));
  const small = await encode(base().resize(640, 640, { fit: "inside", withoutEnlargement: true }));
  const name = newName();
  await writeFile(path.join(CAL_UPLOADS_DIR, `${name}.webp`), large.data);
  await writeFile(path.join(CAL_UPLOADS_DIR, `${name}-w640.webp`), small.data);
  return {
    file: `${PUBLIC_PREFIX}${name}.webp`,
    thumb: `${PUBLIC_PREFIX}${name}-w640.webp`,
    width: large.info.width,
    height: large.info.height,
  };
}

/** A single cropped image, used for the page share image (1200×630) and rhythm cards (800×600). */
export async function saveCropped(file: Buffer, width: number, height: number): Promise<string> {
  const base = await decode(file);
  const output = await encode(base().resize(width, height, { fit: "cover", position: "attention" }));
  const name = newName();
  await writeFile(path.join(CAL_UPLOADS_DIR, `${name}.webp`), output.data);
  return `${PUBLIC_PREFIX}${name}.webp`;
}

/** Removes files that no row references any more. Safe to call with paths shared between years. */
export async function removeUnreferenced(paths: Array<string | null | undefined>): Promise<void> {
  const wanted = paths.filter((value): value is string => typeof value === "string" && value.length > 0);
  if (!wanted.length) return;
  const keep = await referencedPaths();
  for (const value of wanted) {
    if (keep.has(value)) continue;
    const full = fileFor(value);
    if (!full) continue;
    await unlink(full).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") console.error("Could not remove a calendar photo.");
    });
  }
}

/** Startup sweep: files no row references and older than one day. */
export async function sweepCalendarUploads(): Promise<number> {
  const keep = await referencedPaths();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const name of await readdir(CAL_UPLOADS_DIR)) {
    if (!PHOTO_NAME.test(name) || keep.has(`${PUBLIC_PREFIX}${name}`)) continue;
    const full = path.join(CAL_UPLOADS_DIR, name);
    try {
      if ((await stat(full)).mtimeMs > cutoff) continue;
      await unlink(full);
      removed += 1;
    } catch {
      // Already gone or unreadable: nothing to do.
    }
  }
  return removed;
}

// ---- Multipart (one field named "file") --------------------------------

export async function readUpload(req: IncomingMessage): Promise<Buffer> {
  const header = req.headers["content-type"];
  if (!header || !header.toLowerCase().startsWith("multipart/form-data")) throw new CalendarPhotoError(415);
  const match = header.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = (match?.[1] || match?.[2] || "").trim();
  if (!boundary || boundary.length > 200) throw new CalendarPhotoError(415);
  const declared = Number(req.headers["content-length"] ?? 0);
  const ceiling = MAX_BYTES + 64 * 1024;
  if (declared > ceiling) throw new CalendarPhotoError(413);

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > ceiling) throw new CalendarPhotoError(413);
    chunks.push(buffer);
  }
  const file = extractFile(Buffer.concat(chunks), boundary);
  if (!file || file.length === 0) throw new CalendarPhotoError(415);
  if (file.length > MAX_BYTES) throw new CalendarPhotoError(413);
  return file;
}

function extractFile(body: Buffer, boundary: string): Buffer | null {
  const marker = Buffer.from(`--${boundary}`);
  const headerBreak = Buffer.from("\r\n\r\n");
  let position = body.indexOf(marker);
  while (position >= 0 && position < body.length) {
    let cursor = position + marker.length;
    if (body[cursor] === 45 && body[cursor + 1] === 45) return null;
    if (body[cursor] === 13 && body[cursor + 1] === 10) cursor += 2;
    const next = body.indexOf(marker, cursor);
    const part = body.subarray(cursor, next === -1 ? body.length : next);
    const split = part.indexOf(headerBreak);
    if (split >= 0) {
      const headers = part.subarray(0, split).toString("utf8").toLowerCase();
      if (/name="file"/.test(headers)) {
        let data = part.subarray(split + headerBreak.length);
        if (data.length >= 2 && data[data.length - 2] === 13 && data[data.length - 1] === 10) data = data.subarray(0, data.length - 2);
        return data;
      }
    }
    if (next === -1) return null;
    position = next;
  }
  return null;
}
