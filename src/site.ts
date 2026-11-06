// Site & SEO: search and sharing details for whole public pages (today: the /blog list page).
// Single notes and events keep their own "Search and sharing" sections in their editors.
import { randomBytes } from "node:crypto";
import type { Express, Request, Response } from "express";
import { requireAdmin } from "./auth.ts";
import { getPool } from "./db.ts";
import { csp, esc, eyebrow, page } from "./html.ts";
import { PhotoError, SHARE_HEIGHT, SHARE_WIDTH, removeCover, saveShareUpload } from "./photos.ts";
import { COVER_PATH } from "./schemas.ts";

export type SitePageKey = "blog";

export type SitePageRow = {
  key: SitePageKey;
  seo_title: string;
  seo_description: string;
  share_title: string;
  share_description: string;
  share_image: string | null;
  share_image_alt: string;
  updated_at: Date;
};

/** What the website reads. Empty share fields fall back to the search fields. */
export type PublicSitePage = {
  seoTitle: string;
  seoDescription: string;
  shareTitle: string;
  shareDescription: string;
  shareImage: string | null;
  shareImageAlt: string;
};

const SITE_COPY = {
  saved: "Saved. The website shows the new details within a minute.",
  imageSaved: "Share image saved. Now fill in “What is in the share image” and press Save.",
  imageRemoved: "Share image removed. The website uses its own blog photo again.",
  titleRequired: "Add the search title.",
  descriptionRequired: "Add the search description.",
  titleCap: "Search title must be 200 characters or fewer.",
  descriptionCap: "Search description must be 300 characters or fewer.",
  shareTitleCap: "Share title must be 200 characters or fewer.",
  shareDescriptionCap: "Share description must be 300 characters or fewer.",
  altCap: "What is in the share image must be 160 characters or fewer.",
  altRequired: "Describe what is in the share image.",
} as const;

// ---------- Data ----------

const COLUMNS = "key, seo_title, seo_description, share_title, share_description, share_image, share_image_alt, updated_at";

export async function sitePage(key: SitePageKey): Promise<SitePageRow | null> {
  const result = await getPool().query(`select ${COLUMNS} from site_pages where key = $1`, [key]);
  return (result.rows[0] as SitePageRow | undefined) ?? null;
}

export async function publicSitePage(key: SitePageKey): Promise<PublicSitePage | null> {
  const row = await sitePage(key);
  if (!row) return null;
  return {
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    shareTitle: row.share_title || row.seo_title,
    shareDescription: row.share_description || row.seo_description,
    shareImage: row.share_image,
    shareImageAlt: row.share_image_alt,
  };
}

type SiteInput = {
  seoTitle: string;
  seoDescription: string;
  shareTitle: string;
  shareDescription: string;
  shareImageAlt: string;
};

async function saveSiteText(key: SitePageKey, input: SiteInput): Promise<void> {
  await getPool().query(
    `update site_pages
        set seo_title = $2, seo_description = $3, share_title = $4, share_description = $5,
            share_image_alt = $6, updated_at = now()
      where key = $1`,
    [key, input.seoTitle, input.seoDescription, input.shareTitle, input.shareDescription, input.shareImageAlt],
  );
}

async function setShareImage(key: SitePageKey, image: string | null): Promise<string | null> {
  const before = await sitePage(key);
  await getPool().query(
    `update site_pages set share_image = $2, share_image_alt = case when $2::text is null then '' else share_image_alt end, updated_at = now() where key = $1`,
    [key, image],
  );
  return before?.share_image ?? null;
}

// ---------- Checks ----------

function field(body: unknown, name: string): string {
  const value = body && typeof body === "object" ? (body as Record<string, unknown>)[name] : undefined;
  return typeof value === "string" ? value.trim() : "";
}

function readInput(body: unknown, hasImage: boolean): { ok: true; value: SiteInput } | { ok: false; error: string; value: SiteInput } {
  const value: SiteInput = {
    seoTitle: field(body, "seoTitle"),
    seoDescription: field(body, "seoDescription"),
    shareTitle: field(body, "shareTitle"),
    shareDescription: field(body, "shareDescription"),
    shareImageAlt: field(body, "shareImageAlt"),
  };
  const fail = (error: string) => ({ ok: false as const, error, value });
  if (!value.seoTitle) return fail(SITE_COPY.titleRequired);
  if (value.seoTitle.length > 200) return fail(SITE_COPY.titleCap);
  if (!value.seoDescription) return fail(SITE_COPY.descriptionRequired);
  if (value.seoDescription.length > 300) return fail(SITE_COPY.descriptionCap);
  if (value.shareTitle.length > 200) return fail(SITE_COPY.shareTitleCap);
  if (value.shareDescription.length > 300) return fail(SITE_COPY.shareDescriptionCap);
  if (value.shareImageAlt.length > 160) return fail(SITE_COPY.altCap);
  if (hasImage && !value.shareImageAlt) return fail(SITE_COPY.altRequired);
  return { ok: true, value };
}

// ---------- Screen ----------

function siteBody(row: SitePageRow, error: string, notice: string, form?: SiteInput): string {
  const v: SiteInput = form ?? {
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    shareTitle: row.share_title,
    shareDescription: row.share_description,
    shareImageAlt: row.share_image_alt,
  };
  const image = row.share_image && COVER_PATH.test(row.share_image) ? row.share_image : "";
  return `<main class="sheet narrow">
    ${eyebrow("Site & SEO")}
    <h1>Page details</h1>
    <p class="intro">How whole pages of the website look on Google and when shared on WhatsApp or Facebook. Each note and each event has its own section for this inside its editor.</p>
    ${error ? `<p class="banner error" role="status">${esc(error)}</p>` : ""}
    ${notice ? `<p class="banner notice" role="status">${esc(notice)}</p>` : ""}

    <form class="panel" method="post" action="/admin/site">
      ${eyebrow("Blog page · /blog")}
      <div class="field">
        <label for="seoTitle">Search title</label>
        <input id="seoTitle" name="seoTitle" type="text" maxlength="200" required value="${esc(v.seoTitle)}">
        <span class="help">The blue Google link and the browser tab. About 60 characters.</span>
      </div>
      <div class="field">
        <label for="seoDescription">Search description</label>
        <textarea id="seoDescription" class="short" name="seoDescription" maxlength="300" rows="3" required>${esc(v.seoDescription)}</textarea>
        <span class="help">The grey line under that link. About 160 characters.</span>
      </div>
      <div class="field">
        <label for="shareTitle">Share title <span class="muted">(optional)</span></label>
        <input id="shareTitle" name="shareTitle" type="text" maxlength="200" value="${esc(v.shareTitle)}">
        <span class="help">The bold line on WhatsApp and Facebook. Leave empty to use the search title.</span>
      </div>
      <div class="field">
        <label for="shareDescription">Share description <span class="muted">(optional)</span></label>
        <textarea id="shareDescription" class="short" name="shareDescription" maxlength="300" rows="3">${esc(v.shareDescription)}</textarea>
        <span class="help">The line under it. Leave empty to use the search description.</span>
      </div>
      <div class="field">
        <label for="shareImageAlt">What is in the share image${image ? "" : ` <span class="muted">(after you add one)</span>`}</label>
        <input id="shareImageAlt" name="shareImageAlt" type="text" maxlength="160" value="${esc(v.shareImageAlt)}"${image ? " required" : ""}>
        <span class="help">For screen readers. Describe the scene.</span>
      </div>
      <div class="actions"><button class="primary" type="submit">Save</button></div>
    </form>

    <section class="panel">
      ${eyebrow("Share image · /blog")}
      <p class="help">Shown when the blog page is shared. Sideways (landscape) photo, from 1200 × 800 up to 3000 × 2000, under 5 MB. We crop it to ${SHARE_WIDTH} × ${SHARE_HEIGHT}, so keep the subject in the middle.</p>
      ${
        image
          ? `<img class="frame" src="${esc(image)}" alt="${esc(row.share_image_alt)}" width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}">`
          : `<p class="help"><strong>None yet.</strong> Until you add one, the website uses its own blog photo.</p>`
      }
      <form method="post" action="/admin/site/share-image" enctype="multipart/form-data" class="actions">
        <input id="shareFile" name="file" type="file" accept="image/jpeg,image/png,image/webp" required>
        <button class="secondary" type="submit">${image ? "Replace image" : "Upload image"}</button>
      </form>
      ${
        image
          ? `<form method="post" action="/admin/site/share-image/remove" class="actions" data-confirm="Remove the share image? The website goes back to its own blog photo."><button class="secondary" type="submit">Remove image</button></form>`
          : ""
      }
    </section>

    <section class="panel">
      ${eyebrow("Calendar page")}
      <p class="help">The calendar page's search title, description and share image are kept with each school year.</p>
      <div class="actions"><a class="button secondary" href="/admin/calendar/settings">Open Calendar · Page &amp; SEO</a></div>
    </section>
  </main>`;
}

const CONFIRM_SCRIPT = `for (const form of document.querySelectorAll("[data-confirm]")) {
  form.addEventListener("submit", (event) => { if (!window.confirm(form.getAttribute("data-confirm"))) event.preventDefault(); });
}`;

function send(res: Response, status: number, body: string): void {
  const nonce = randomBytes(16).toString("base64url");
  res.setHeader("Content-Security-Policy", csp(nonce));
  res.status(status).type("html").send(page("Site & SEO", `${body}<script nonce="${esc(nonce)}">${CONFIRM_SCRIPT}</script>`, true, nonce));
}

function noticeFrom(req: Request): string {
  const n = req.query.notice;
  return n === "saved" ? SITE_COPY.saved : n === "image" ? SITE_COPY.imageSaved : n === "removed" ? SITE_COPY.imageRemoved : "";
}

// ---------- Routes ----------

export function mountSite(app: Express): void {
  app.get("/admin/site", requireAdmin, async (req, res, next) => {
    try {
      const row = await sitePage("blog");
      if (!row) throw new Error("site_pages row missing");
      send(res, 200, siteBody(row, "", noticeFrom(req)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/site", requireAdmin, async (req, res, next) => {
    try {
      const row = await sitePage("blog");
      if (!row) throw new Error("site_pages row missing");
      const parsed = readInput(req.body, Boolean(row.share_image));
      if (!parsed.ok) {
        send(res, 400, siteBody(row, parsed.error, "", parsed.value));
        return;
      }
      await saveSiteText("blog", parsed.value);
      res.redirect("/admin/site?notice=saved");
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/site/share-image", requireAdmin, async (req, res, next) => {
    try {
      const row = await sitePage("blog");
      if (!row) throw new Error("site_pages row missing");
      let image: string;
      try {
        image = await saveShareUpload(req);
      } catch (error) {
        if (error instanceof PhotoError) {
          send(res, error.kind === "size" ? 413 : 400, siteBody(row, error.message, ""));
          return;
        }
        throw error;
      }
      const old = await setShareImage("blog", image);
      if (old && old !== image) await removeCover(old);
      res.redirect("/admin/site?notice=image");
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/site/share-image/remove", requireAdmin, async (_req, res, next) => {
    try {
      const old = await setShareImage("blog", null);
      if (old) await removeCover(old);
      res.redirect("/admin/site?notice=removed");
    } catch (error) {
      next(error);
    }
  });
}
