import { randomBytes } from "node:crypto";
import path from "node:path";
import type { Express, Request, Response } from "express";
import { ROOT } from "./root.ts";
import {
  COOKIE_NAME,
  adminFromRequest,
  checkPassword,
  cookieOptions,
  hashPassword,
  loginAllowed,
  loginFailed,
  loginKey,
  loginSucceeded,
  passwordMatches,
  requireAdmin,
  sessionValue,
} from "./auth.ts";
import {
  adminByEmail,
  deleteNote,
  listNotes,
  listVisible,
  noteById,
  saveNote,
  slugTaken,
  unpublishNote,
  updatePassword,
  type Admin,
  type NoteRow,
} from "./db.ts";
import {
  blankEditor,
  csp,
  editorFromRequest,
  editorFromRow,
  editorPage,
  notesPage,
  page,
  passwordPage,
  previewPage,
  signInPage,
  type EditorForm,
} from "./html.ts";
import { PhotoError, coverSize, removeCover, saveUpload } from "./photos.ts";
import { toAdmin } from "./present.ts";
import {
  COPY,
  COVER_HEIGHT,
  COVER_WIDTH,
  loginSchema,
  noteFromBody,
  passwordProblem,
  passwordSchema,
  publishBlock,
} from "./schemas.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function mountAdmin(app: Express): void {
  app.get("/admin/brand/logo.png", (_req, res) => {
    res.sendFile(path.join(ROOT, "src", "brand", "wellsprings-logo.png"));
  });

  app.get("/admin/brand/favicon.png", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.sendFile(path.join(ROOT, "src", "brand", "favicon.png"));
  });

  app.get("/admin", async (req, res, next) => {
    try {
      if (await adminFromRequest(req)) {
        res.redirect("/admin/home");
        return;
      }
      const notice = req.query.notice === "password" ? COPY.passwordChanged : "";
      send(res, 200, "Sign in", () => signInPage("", notice), false);
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/login", async (req, res, next) => {
    try {
      const result = await attemptLogin(req);
      if (result.ok) {
        setSession(res, result.admin);
        res.redirect("/admin/home");
        return;
      }
      send(res, result.status, "Sign in", () => signInPage(result.error, ""), false);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/login", async (req, res, next) => {
    try {
      const result = await attemptLogin(req);
      if (result.ok) {
        setSession(res, result.admin);
        res.json({ ok: true });
        return;
      }
      res.status(result.status).json({ error: result.error });
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/logout", (_req, res) => {
    clearSession(res);
    res.redirect("/admin");
  });

  app.post("/api/admin/logout", (_req, res) => {
    clearSession(res);
    res.json({ ok: true });
  });

  app.get("/admin/password", requireAdmin, (_req, res) => {
    send(res, 200, "Change password", () => passwordPage(""), true);
  });

  app.post("/admin/password", requireAdmin, async (req, res, next) => {
    try {
      const result = await changePassword(res, req, true);
      if (!result.ok) {
        send(res, result.status, "Change password", () => passwordPage(result.error), true);
        return;
      }
      clearSession(res);
      res.redirect("/admin?notice=password");
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/password", requireAdmin, async (req, res, next) => {
    try {
      const result = await changePassword(res, req, false);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      clearSession(res);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.get("/admin/notes", requireAdmin, async (_req, res, next) => {
    try {
      const rows = await listNotes();
      send(res, 200, "Notes", (nonce) => notesPage(rows, nonce), true);
    } catch (error) {
      next(error);
    }
  });

  app.get("/admin/notes/new", requireAdmin, (_req, res) => {
    send(res, 200, "New note", (nonce) => editorPage(blankEditor(), "", "", nonce), true);
  });

  app.post("/admin/notes", requireAdmin, async (req, res, next) => {
    try {
      await writeNote(req, res, null, "form");
    } catch (error) {
      next(error);
    }
  });

  app.get("/admin/notes/:id/preview", requireAdmin, async (req, res, next) => {
    try {
      const note = await loadNote(req.params.id);
      if (!note) {
        res.redirect("/admin/notes");
        return;
      }
      const more = (await listVisible()).filter((row) => row.id !== note.id && row.slug && row.pillar).slice(0, 2);
      send(res, 200, "Preview", () => previewPage(note, more), true);
    } catch (error) {
      next(error);
    }
  });

  app.get("/admin/notes/:id", requireAdmin, async (req, res, next) => {
    try {
      const note = await loadNote(req.params.id);
      if (!note) {
        res.redirect("/admin/notes");
        return;
      }
      const notice = req.query.notice === "draft" ? COPY.draftSaved : req.query.notice === "published" ? COPY.published : "";
      send(res, 200, "Edit note", (nonce) => editorPage(editorFromRow(note), "", notice, nonce), true);
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/notes/:id", requireAdmin, async (req, res, next) => {
    try {
      await writeNote(req, res, String(req.params.id), "form");
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/notes/:id/unpublish", requireAdmin, async (req, res, next) => {
    try {
      const note = await loadNote(req.params.id);
      if (!note) {
        res.redirect("/admin/notes");
        return;
      }
      await unpublishNote(note.id);
      res.redirect(`/admin/notes/${note.id}`);
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/notes/:id/delete", requireAdmin, async (req, res, next) => {
    try {
      const note = await loadNote(req.params.id);
      if (!note) {
        res.redirect("/admin/notes");
        return;
      }
      const deleted = await deleteNote(note.id);
      if (deleted) await removeCover(deleted.cover_image);
      res.redirect("/admin/notes");
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/posts", requireAdmin, async (_req, res, next) => {
    try {
      const rows = await listNotes();
      res.json(
        rows.map((row) => ({
          id: row.id,
          title: row.title,
          dateLabel: row.date_label,
          publishDate: row.publish_date,
          status: row.status,
          featured: row.featured,
          slug: row.slug,
          slugLocked: row.slug_locked,
        })),
      );
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/posts", requireAdmin, async (req, res, next) => {
    try {
      await writeNote(req, res, null, "json");
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/posts/:id", requireAdmin, async (req, res, next) => {
    try {
      const note = await loadNote(req.params.id);
      if (!note) {
        res.status(404).json({ error: COPY.notFound });
        return;
      }
      res.json(toAdmin(note));
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/admin/posts/:id", requireAdmin, async (req, res, next) => {
    try {
      await writeNote(req, res, String(req.params.id), "json");
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/posts/:id/unpublish", requireAdmin, async (req, res, next) => {
    try {
      const note = await loadNote(req.params.id);
      if (!note) {
        res.status(404).json({ error: COPY.notFound });
        return;
      }
      const saved = await unpublishNote(note.id);
      res.json(toAdmin(saved ?? note));
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/admin/posts/:id", requireAdmin, async (req, res, next) => {
    try {
      const note = await loadNote(req.params.id);
      if (!note) {
        res.status(404).json({ error: COPY.notFound });
        return;
      }
      const deleted = await deleteNote(note.id);
      if (deleted) await removeCover(deleted.cover_image);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/uploads", requireAdmin, async (req, res, next) => {
    try {
      const saved = await saveUpload(req);
      res.json(saved);
    } catch (error) {
      if (error instanceof PhotoError) {
        const status = error.kind === "size" ? 413 : error.kind === "dimensions" ? 400 : 415;
        res.status(status).json({ error: error.message });
        return;
      }
      next(error);
    }
  });
}

function send(res: Response, status: number, title: string, render: (nonce: string) => string, signedIn: boolean): void {
  const nonce = randomBytes(16).toString("base64url");
  res.setHeader("Content-Security-Policy", csp(nonce));
  res.status(status).type("html").send(page(title, render(nonce), signedIn, nonce));
}

async function loadNote(id: string | string[] | undefined): Promise<NoteRow | null> {
  const value = String(id ?? "");
  if (!UUID.test(value)) return null;
  return noteById(value);
}

async function attemptLogin(req: Request): Promise<{ ok: true; admin: Admin } | { ok: false; status: number; error: string }> {
  const parsed = loginSchema.safeParse(req.body);
  const email = parsed.success ? parsed.data.email.trim().toLowerCase().slice(0, 254) : "";
  const password = parsed.success ? parsed.data.password.slice(0, 200) : "";
  // req.ip is the visitor's address, also behind Nginx (see "trust proxy" in index.ts).
  const key = loginKey(email, req.ip);
  if (!loginAllowed(key)) return { ok: false, status: 429, error: COPY.wait };
  const admin = email.includes("@") ? await adminByEmail(email) : null;
  const match = await checkPassword(admin?.password_hash ?? null, password);
  if (!admin || !match) {
    const outcome = loginFailed(key);
    return { ok: false, status: outcome === "wait" ? 429 : 401, error: outcome === "wait" ? COPY.wait : COPY.badLogin };
  }
  loginSucceeded(key);
  return { ok: true, admin };
}

async function changePassword(
  res: Response,
  req: Request,
  checkConfirm: boolean,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const admin = res.locals.admin as Admin | undefined;
  if (!admin) return { ok: false, status: 401, error: COPY.signInRequired };
  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) return { ok: false, status: 400, error: COPY.badPassword };
  const key = `pwd|${admin.id}`;
  if (!loginAllowed(key)) return { ok: false, status: 429, error: COPY.wait };
  const match = await passwordMatches(admin.password_hash, parsed.data.currentPassword.slice(0, 200));
  if (!match) {
    const outcome = loginFailed(key);
    return { ok: false, status: outcome === "wait" ? 429 : 400, error: outcome === "wait" ? COPY.wait : COPY.badPassword };
  }
  const problem = passwordProblem(parsed.data.newPassword, parsed.data.confirmPassword, checkConfirm);
  if (problem) return { ok: false, status: 400, error: problem };
  await updatePassword(admin.id, await hashPassword(parsed.data.newPassword));
  loginSucceeded(key);
  return { ok: true };
}

async function writeNote(req: Request, res: Response, id: string | null, source: "form" | "json"): Promise<void> {
  const existing = id ? await loadNote(id) : null;
  if (id && !existing) {
    if (source === "json") res.status(404).json({ error: COPY.notFound });
    else res.redirect("/admin/notes");
    return;
  }
  const parsed = noteFromBody(req.body, source, existing);
  if (!parsed.ok) {
    await rejectWrite(req, res, source, existing, parsed.error, 400);
    return;
  }
  let input = parsed.value;
  if (input.slug && (await slugTaken(input.slug, existing?.id ?? null))) {
    await rejectWrite(req, res, source, existing, COPY.slugTaken, 409);
    return;
  }
  let size: { width: number; height: number } | null = null;
  if (input.coverImage) {
    size = await coverSize(input.coverImage);
    if (!size) {
      await rejectWrite(req, res, source, existing, COPY.photoRejected, 400);
      return;
    }
  }
  if (input.status === "published") {
    const blocked = publishBlock(input, {
      previousDateLabel: existing?.date_label,
      previousAuthor: existing?.author,
      coverWidth: size?.width ?? null,
      coverHeight: size?.height ?? null,
    });
    if (blocked) {
      await rejectWrite(req, res, source, existing, blocked, 400);
      return;
    }
    if (!size || size.width !== COVER_WIDTH || size.height !== COVER_HEIGHT) {
      await rejectWrite(req, res, source, existing, COPY.coverSize, 400);
      return;
    }
  }
  try {
    const saved = await saveNote(existing?.id ?? null, input, null, size);
    if (existing?.cover_image && existing.cover_image !== saved.cover_image) await removeCover(existing.cover_image);
    if (source === "json") {
      res.status(existing ? 200 : 201).json(toAdmin(saved));
      return;
    }
    const notice = input.status === "published" ? "published" : "draft";
    res.redirect(`/admin/notes/${saved.id}?notice=${notice}`);
  } catch (error) {
    if (isSlugConflict(error)) {
      await rejectWrite(req, res, source, existing, COPY.slugTaken, 409);
      return;
    }
    throw error;
  }
}

async function rejectWrite(
  req: Request,
  res: Response,
  source: "form" | "json",
  existing: NoteRow | null,
  error: string,
  status: number,
): Promise<void> {
  if (source === "json") {
    res.status(status).json({ error });
    return;
  }
  const base = existing ? editorFromRow(existing) : blankEditor();
  const form: EditorForm = editorFromRequest(req.body, base);
  send(res, status, existing ? "Edit note" : "New note", (nonce) => editorPage(form, error, "", nonce), true);
}

function isSlugConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const pgError = error as { code?: string; constraint?: string };
  return pgError.code === "23505" && String(pgError.constraint ?? "").includes("slug");
}

function setSession(res: Response, admin: Admin): void {
  res.cookie(COOKIE_NAME, sessionValue(admin), {
    ...cookieOptions(process.env.NODE_ENV === "production"),
    maxAge: 12 * 60 * 60 * 1000,
    signed: true,
  });
}

function clearSession(res: Response): void {
  res.clearCookie(COOKIE_NAME, cookieOptions(process.env.NODE_ENV === "production"));
}
