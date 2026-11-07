// Site & SEO: search and sharing details for whole public pages.
// Two tabs: Blog (/blog) and Calendar (/theme-of-the-year, kept with each school year).
// Only the chosen tab is loaded and shown. Single notes and events keep their own
// "Search and sharing" sections inside their editors.
import { randomBytes } from "node:crypto";
import type { Express, Request, Response } from "express";
import { requireAdmin } from "./auth.ts";
import { getPool } from "./db.ts";
import { csp, esc, eyebrow, page } from "./html.ts";
import { PhotoError, SHARE_HEIGHT, SHARE_WIDTH, removeCover, saveShareUpload } from "./photos.ts";
import { COVER_PATH } from "./schemas.ts";
import {
  absolute,
  keywordList,
  readSeoExtras,
  SCHOOL_NAME,
  schemaTypeOf,
  SEO_EXTRAS_SCRIPT,
  seoExtrasHtml,
  type SeoExtras,
} from "./seo-fields.ts";
import { listYears, updateYearSeo, updateYearTheme, yearById, type YearRow } from "./calendar/db.ts";
import { removeUnreferenced } from "./calendar/photos.ts";
import { selectYear, workingYear } from "./calendar/admin-routes.ts";
import { calendarSeoSchema, firstIssue, themeSchema, UUID } from "./calendar/schemas.ts";
import { setShareImage as setYearShareImage } from "./calendar/db.ts";

export type SitePageKey = "blog";

export type SitePageRow = {
  key: SitePageKey;
  seo_title: string;
  seo_description: string;
  share_title: string;
  share_description: string;
  share_image: string | null;
  share_image_alt: string;
  seo_keywords: string;
  seo_canonical: string;
  seo_noindex: boolean;
  seo_author: string;
  seo_schema_type: string;
  seo_schema_json: string;
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
  keywords: string;
  canonical: string;
  robots: string;
  author: string;
  schemaType: string;
  schemaJson: string;
};

const SITE_COPY = {
  saved: "Saved. The website shows the new details within a minute.",
  imageSaved: "Share image saved. Now fill in “What is in the share image” and press Save.",
  imageRemoved: "Share image removed. The website uses its own photo again.",
  yearChanged: "Now showing that school year.",
  themeSaved: "Theme saved. It shows in the calendar hero on the website.",
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

const COLUMNS =
  "key, seo_title, seo_description, share_title, share_description, share_image, share_image_alt, seo_keywords, seo_canonical, seo_noindex, seo_author, seo_schema_type, seo_schema_json, updated_at";

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
    keywords: row.seo_keywords,
    canonical: row.seo_canonical,
    robots: row.seo_noindex ? "noindex, nofollow" : "index, follow",
    author: row.seo_author || SCHOOL_NAME,
    schemaType: schemaTypeOf("blogPage", row.seo_schema_type),
    schemaJson: row.seo_schema_json,
  };
}

type SiteInput = {
  seoTitle: string;
  seoDescription: string;
  shareTitle: string;
  shareDescription: string;
  shareImageAlt: string;
  extras: SeoExtras;
};

async function saveSiteText(key: SitePageKey, input: SiteInput): Promise<void> {
  await getPool().query(
    `update site_pages
        set seo_title = $2, seo_description = $3, share_title = $4, share_description = $5,
            share_image_alt = $6, seo_keywords = $7, seo_canonical = $8, seo_noindex = $9, seo_author = $10,
            seo_schema_type = $11, seo_schema_json = $12, updated_at = now()
      where key = $1`,
    [
      key,
      input.seoTitle,
      input.seoDescription,
      input.shareTitle,
      input.shareDescription,
      input.shareImageAlt,
      input.extras.keywords,
      input.extras.canonical,
      input.extras.noindex,
      input.extras.author,
      input.extras.schemaType,
      input.extras.schemaJson,
    ],
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
  const extras = readSeoExtras(body, { canonical: true, author: true, kind: "blogPage" });
  const value: SiteInput = {
    seoTitle: field(body, "seoTitle"),
    seoDescription: field(body, "seoDescription"),
    shareTitle: field(body, "shareTitle"),
    shareDescription: field(body, "shareDescription"),
    shareImageAlt: field(body, "shareImageAlt"),
    extras: extras.value,
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
  if (!extras.ok) return fail(extras.error);
  return { ok: true, value };
}

// ---------- Screen pieces ----------

type Tab = "blog" | "calendar";

function tabs(active: Tab | null): string {
  const item = (key: Tab, label: string, path: string, about: string) =>
    `<a role="tab" href="/admin/site?page=${key}" aria-selected="${key === active ? "true" : "false"}"${key === active ? ' aria-current="page"' : ""}>
      <strong>${label}</strong><span>${path}</span>${active ? "" : `<em>${about}</em>`}</a>`;
  return `<nav class="site-tabs${active ? "" : " is-choosing"}" role="tablist" aria-label="Which page">${item("blog", "Blog", "/blog", "Google title, description, sharing and share image of the blog page.")}${item("calendar", "Calendar", "/theme-of-the-year", "Theme of the year, Google details and share image, per school year.")}</nav>`;
}

/** /admin/site with no page picked: just the two pages to choose from. */
function chooserBody(notice: string): string {
  return shell(null, "", notice, `<p class="help site-choose">Choose a page to edit its details.</p>`);
}

function shell(active: Tab | null, error: string, notice: string, inner: string): string {
  return `<main class="sheet site-sheet">
    <header class="page-head">
      ${eyebrow("Site & SEO")}
      <h1>Page details</h1>
      <p class="intro">How whole pages of the website look on Google and when shared on WhatsApp or Facebook. Choose a page. Each note and each event has its own section for this inside its editor.</p>
    </header>
    ${tabs(active)}
    ${error ? `<p class="banner error" role="status">${esc(error)}</p>` : ""}
    ${notice ? `<p class="banner notice" role="status">${esc(notice)}</p>` : ""}
    ${inner}
  </main>`;
}

function googlePreview(path: string, title: string, description: string): string {
  return `<div class="google-result" aria-live="polite">
      <p class="google-url">wellspringsacademy.in › ${esc(path.replace(/^\//, ""))}</p>
      <p class="google-title" data-mirror="seoTitle">${esc(title)}</p>
      <p class="google-description" data-mirror="seoDescription">${esc(description)}</p>
    </div>`;
}

function collectionJsonLd(
  kind: "blogPage" | "calendarPage",
  path: string,
  title: string,
  description: string,
  extras: SeoExtras,
  image: string,
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": schemaTypeOf(kind, extras.schemaType),
    name: title,
    description,
    url: extras.canonical || absolute(path),
    inLanguage: "en-IN",
    author: { "@type": "Organization", name: extras.author || SCHOOL_NAME },
    publisher: { "@type": "EducationalOrganization", name: SCHOOL_NAME, url: absolute("/") },
  };
  const keywords = keywordList(extras.keywords);
  if (keywords.length) data.keywords = keywords.join(", ");
  if (image) data.image = absolute(image);
  return data;
}

// ---------- Blog tab ----------

function blogBody(row: SitePageRow, error: string, notice: string, form?: SiteInput): string {
  const v: SiteInput = form ?? {
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    shareTitle: row.share_title,
    shareDescription: row.share_description,
    shareImageAlt: row.share_image_alt,
    extras: {
      keywords: row.seo_keywords,
      canonical: row.seo_canonical,
      noindex: row.seo_noindex,
      author: row.seo_author,
      schemaType: row.seo_schema_type,
      schemaJson: row.seo_schema_json,
    },
  };
  const image = row.share_image && COVER_PATH.test(row.share_image) ? row.share_image : "";
  return shell(
    "blog",
    error,
    notice,
    `<form class="panel" method="post" action="/admin/site">
      ${eyebrow("Search and sharing (meta title & description) · /blog")}
      <div class="seo-pair">
        <div class="field">
          <label for="seoTitle">Search title <span class="muted">(meta title)</span></label>
          <input id="seoTitle" name="seoTitle" type="text" maxlength="200" required value="${esc(v.seoTitle)}">
          <span class="help">The blue Google link and the browser tab. About 60 characters.</span>
        </div>
        <div class="field">
          <label for="seoDescription">Search description <span class="muted">(meta description)</span></label>
          <textarea id="seoDescription" class="short" name="seoDescription" maxlength="300" rows="3" required>${esc(v.seoDescription)}</textarea>
          <span class="help">The grey line under that link. About 160 characters.</span>
        </div>
      </div>
      ${googlePreview("/blog", v.seoTitle, v.seoDescription)}
      <h3 class="seo-sub">Sharing on WhatsApp &amp; Facebook</h3>
      <div class="seo-pair">
        <div class="field">
          <label for="shareTitle">Share title <span class="muted">(optional)</span></label>
          <input id="shareTitle" name="shareTitle" type="text" maxlength="200" value="${esc(v.shareTitle)}" placeholder="Same as the search title">
        </div>
        <div class="field">
          <label for="shareDescription">Share description <span class="muted">(optional)</span></label>
          <textarea id="shareDescription" class="short" name="shareDescription" maxlength="300" rows="2" placeholder="Same as the search description">${esc(v.shareDescription)}</textarea>
        </div>
      </div>
      <div class="field">
        <label for="shareImageAlt">What is in the share image${image ? "" : ` <span class="muted">(after you add one)</span>`}</label>
        <input id="shareImageAlt" name="shareImageAlt" type="text" maxlength="160" value="${esc(v.shareImageAlt)}"${image ? " required" : ""}>
        <span class="help">For screen readers. Describe the scene.</span>
      </div>
      <h3 class="seo-sub">More search settings</h3>
      ${seoExtrasHtml(v.extras, {
        kind: "blogPage",
        autoCanonical: absolute("/blog"),
        author: true,
        autoAuthor: SCHOOL_NAME,
        pageLabel: "the blog page",
        jsonLd: collectionJsonLd("blogPage", "/blog", v.seoTitle, v.seoDescription, v.extras, image),
      })}
      <div class="publish-bar"><div class="actions"><button class="primary" type="submit">Save blog page</button></div></div>
    </form>

    <section class="panel share-panel">
      ${eyebrow("Share image · /blog")}
      <div class="share-layout">
        ${
          image
            ? `<img class="frame share-thumb" src="${esc(image)}" alt="${esc(row.share_image_alt)}" width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}">`
            : `<div class="share-thumb empty"><span>No share image yet</span></div>`
        }
        <div>
          <p class="help">Shown when the blog page is shared. Landscape photo, 1200 × 800 to 3000 × 2000, under 5 MB. Cropped to ${SHARE_WIDTH} × ${SHARE_HEIGHT}, so keep the subject in the middle.${image ? "" : " Until you add one, the website uses its own blog photo."}</p>
          <form method="post" action="/admin/site/share-image" enctype="multipart/form-data" class="actions">
            <input id="shareFile" name="file" type="file" accept="image/jpeg,image/png,image/webp" required>
            <button class="secondary" type="submit">${image ? "Replace image" : "Upload image"}</button>
          </form>
          ${
            image
              ? `<form method="post" action="/admin/site/share-image/remove" class="actions" data-confirm="Remove the share image? The website goes back to its own blog photo."><button class="secondary danger" type="submit">Remove image</button></form>`
              : ""
          }
        </div>
      </div>
    </section>`,
  );
}

// ---------- Calendar tab ----------

type CalendarForm = { seoTitle: string; seoDescription: string; shareImageAlt: string; extras: SeoExtras };

function calendarBody(year: YearRow, years: YearRow[], error: string, notice: string, form?: CalendarForm, themeDraft?: string): string {
  const v: CalendarForm = form ?? {
    seoTitle: year.seo_title,
    seoDescription: year.seo_description,
    shareImageAlt: year.share_image_alt,
    extras: {
      keywords: year.seo_keywords,
      canonical: year.seo_canonical,
      noindex: year.seo_noindex,
      author: year.seo_author,
      schemaType: year.seo_schema_type,
      schemaJson: year.seo_schema_json,
    },
  };
  const yearPicker = `<form class="year-switch" method="post" action="/admin/site/calendar/year">
      <label for="site-year">School year</label>
      <select id="site-year" name="yearId">${years
        .map((row) => `<option value="${esc(row.id)}"${row.id === year.id ? " selected" : ""}>${esc(row.label)} · ${esc(row.theme_name)}${row.is_current ? " · on the site" : ""}</option>`)
        .join("")}</select>
      <button class="secondary sm" type="submit">Show</button>
    </form>`;
  return shell(
    "calendar",
    error,
    notice,
    `<div class="site-year-bar">${yearPicker}<p class="help">${year.is_current ? "This year is on the website now." : "This year is not on the website. Its details are used once you make it current, or when parents open it under “Year”."}</p></div>
    <form class="panel theme-panel" id="theme" method="post" action="/admin/site/calendar/theme">
      <input type="hidden" name="yearId" value="${esc(year.id)}">
      ${eyebrow(`Theme of the year · ${year.label}`)}
      <div class="inline-form">
        <div class="field grow">
          <label for="themeName">Theme name</label>
          <input id="themeName" name="themeName" type="text" maxlength="40" required value="${esc(themeDraft ?? year.theme_name)}" placeholder="Roots to Wings">
        </div>
        <button class="primary" type="submit">Save theme</button>
      </div>
      <p class="help">Shown large in the hero of /theme-of-the-year, as “Theme of the Year · ${esc(year.label)}”. Also used in each event’s automatic search title.</p>
    </form>
    <form class="panel" method="post" action="/admin/site/calendar">
      <input type="hidden" name="yearId" value="${esc(year.id)}">
      ${eyebrow(`Search and sharing (meta title & description) · /theme-of-the-year · ${year.label}`)}
      <div class="seo-pair">
        <div class="field">
          <label for="seoTitle">Search title <span class="muted">(meta title)</span></label>
          <input id="seoTitle" name="seoTitle" type="text" maxlength="200" required value="${esc(v.seoTitle)}">
          <span class="help">About 60 characters.</span>
        </div>
        <div class="field">
          <label for="seoDescription">Search description <span class="muted">(meta description)</span></label>
          <textarea id="seoDescription" class="short" name="seoDescription" maxlength="300" rows="3" required>${esc(v.seoDescription)}</textarea>
          <span class="help">About 160 characters.</span>
        </div>
      </div>
      ${googlePreview("/theme-of-the-year", v.seoTitle, v.seoDescription)}
      <div class="field mt">
        <label for="shareImageAlt">What is in the share image${year.share_image ? "" : ` <span class="muted">(after you add one)</span>`}</label>
        <input id="shareImageAlt" name="shareImageAlt" type="text" maxlength="160" value="${esc(v.shareImageAlt)}">
      </div>
      <h3 class="seo-sub">More search settings</h3>
      ${seoExtrasHtml(v.extras, {
        kind: "calendarPage",
        autoCanonical: absolute("/theme-of-the-year"),
        author: true,
        autoAuthor: SCHOOL_NAME,
        pageLabel: "the calendar page",
        jsonLd: collectionJsonLd("calendarPage", "/theme-of-the-year", v.seoTitle, v.seoDescription, v.extras, year.share_image ?? ""),
      })}
      <p class="help">Each event’s pop-up link has its own search details in the event editor, under SEO.</p>
      <div class="publish-bar"><div class="actions"><button class="primary" type="submit">Save calendar page</button></div></div>
    </form>

    <section class="panel share-panel">
      ${eyebrow(`Share image · /theme-of-the-year · ${year.label}`)}
      <div class="share-layout">
        ${
          year.share_image
            ? `<img class="frame share-thumb" src="${esc(year.share_image)}" alt="" width="1200" height="630">`
            : `<div class="share-thumb empty"><span>No share image yet</span></div>`
        }
        <div>
          <p class="help">Shown when the calendar link is shared. Landscape photo, 1200 × 800 to 3000 × 2000, under 5 MB. Cropped to 1200 × 630.${year.share_image ? "" : " Without one, the hero image is used."}</p>
          <div class="field mt">
            <label for="cal-share-file">${year.share_image ? "Replace" : "Upload"} share image</label>
            <input id="cal-share-file" type="file" accept="image/jpeg,image/png,image/webp">
            <p class="help" role="status" id="cal-share-status"></p>
          </div>
          ${
            year.share_image
              ? `<form method="post" action="/admin/site/calendar/share-image/remove" class="actions" data-confirm="Remove the share image?"><button class="secondary danger" type="submit">Remove image</button></form>`
              : ""
          }
        </div>
      </div>
    </section>`,
  );
}

const PAGE_SCRIPT = `
for (const form of document.querySelectorAll("[data-confirm]")) {
  form.addEventListener("submit", (event) => { if (!window.confirm(form.getAttribute("data-confirm"))) event.preventDefault(); });
}
for (const target of document.querySelectorAll("[data-mirror]")) {
  const source = document.getElementById(target.getAttribute("data-mirror"));
  if (source) source.addEventListener("input", () => { target.textContent = source.value; });
}
const yearSelect = document.getElementById("site-year");
if (yearSelect) yearSelect.addEventListener("change", () => yearSelect.form.submit());
const calFile = document.getElementById("cal-share-file");
if (calFile) {
  calFile.addEventListener("change", () => {
    const file = calFile.files && calFile.files[0];
    if (!file) return;
    const status = document.getElementById("cal-share-status");
    const data = new FormData();
    data.append("file", file);
    calFile.disabled = true;
    status.textContent = "Uploading…";
    fetch("/api/admin/calendar/settings/share-image", { method: "POST", body: data, credentials: "same-origin", headers: { Accept: "application/json" } })
      .then((response) => response.json().catch(() => ({})).then((json) => ({ ok: response.ok, json })))
      .then((result) => {
        if (result.ok) { window.location.assign("/admin/site?page=calendar&notice=image"); return; }
        status.textContent = result.json.error || "Not uploaded.";
        calFile.disabled = false;
        calFile.value = "";
      })
      .catch(() => { status.textContent = "Not uploaded."; calFile.disabled = false; });
  });
}
`;

function send(res: Response, status: number, body: string): void {
  const nonce = randomBytes(16).toString("base64url");
  res.setHeader("Content-Security-Policy", csp(nonce));
  res
    .status(status)
    .type("html")
    .send(page("Site & SEO", `${body}<script nonce="${esc(nonce)}">${PAGE_SCRIPT}${SEO_EXTRAS_SCRIPT}</script>`, true, nonce));
}

function noticeFrom(req: Request): string {
  const n = req.query.notice;
  return n === "saved"
    ? SITE_COPY.saved
    : n === "image"
      ? SITE_COPY.imageSaved
      : n === "removed"
        ? SITE_COPY.imageRemoved
        : n === "year"
          ? SITE_COPY.yearChanged
          : n === "theme"
            ? SITE_COPY.themeSaved
            : "";
}

function tabFrom(req: Request): Tab | null {
  return req.query.page === "calendar" ? "calendar" : req.query.page === "blog" ? "blog" : null;
}

async function renderCalendar(req: Request, res: Response, status: number, error: string, form?: CalendarForm, themeDraft?: string): Promise<void> {
  const [year, years] = await Promise.all([workingYear(req), listYears()]);
  if (!year) {
    send(
      res,
      200,
      shell("calendar", "", "", `<section class="panel"><p class="help">No calendar year yet. Create one on <a href="/admin/calendar/years">Calendar · Years</a>.</p><div class="spacer"></div></section>`),
    );
    return;
  }
  send(res, status, calendarBody(year, years, error, error ? "" : noticeFrom(req), form, themeDraft));
}

// ---------- Routes ----------

export function mountSite(app: Express): void {
  app.get("/admin/site", requireAdmin, async (req, res, next) => {
    try {
      const tab = tabFrom(req);
      if (tab === "calendar") {
        await renderCalendar(req, res, 200, "");
        return;
      }
      if (!tab) {
        send(res, 200, chooserBody(noticeFrom(req)));
        return;
      }
      const row = await sitePage("blog");
      if (!row) throw new Error("site_pages row missing");
      send(res, 200, blogBody(row, "", noticeFrom(req)));
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
        send(res, 400, blogBody(row, parsed.error, "", parsed.value));
        return;
      }
      await saveSiteText("blog", parsed.value);
      res.redirect("/admin/site?page=blog&notice=saved");
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
          send(res, error.kind === "size" ? 413 : 400, blogBody(row, error.message, ""));
          return;
        }
        throw error;
      }
      const old = await setShareImage("blog", image);
      if (old && old !== image) await removeCover(old);
      res.redirect("/admin/site?page=blog&notice=image");
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/site/share-image/remove", requireAdmin, async (_req, res, next) => {
    try {
      const old = await setShareImage("blog", null);
      if (old) await removeCover(old);
      res.redirect("/admin/site?page=blog&notice=removed");
    } catch (error) {
      next(error);
    }
  });

  // Calendar tab: which school year to show. Same choice as the Calendar section's year.
  app.post("/admin/site/calendar/year", requireAdmin, async (req, res, next) => {
    try {
      const id = field(req.body, "yearId");
      if (UUID.test(id) && (await yearById(id))) selectYear(res, id);
      res.redirect("/admin/site?page=calendar&notice=year");
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/site/calendar", requireAdmin, async (req, res, next) => {
    try {
      const year = await workingYear(req);
      // The form names its year; refuse a save meant for a year that is no longer selected.
      if (!year || field(req.body, "yearId") !== year.id) {
        res.redirect("/admin/site?page=calendar");
        return;
      }
      const extras = readSeoExtras(req.body, { canonical: true, author: true, kind: "calendarPage" });
      const form: CalendarForm = {
        seoTitle: field(req.body, "seoTitle"),
        seoDescription: field(req.body, "seoDescription"),
        shareImageAlt: field(req.body, "shareImageAlt"),
        extras: extras.value,
      };
      const parsed = calendarSeoSchema.safeParse(form);
      if (!parsed.success) {
        await renderCalendar(req, res, 400, firstIssue(parsed.error), form);
        return;
      }
      if (!extras.ok) {
        await renderCalendar(req, res, 400, extras.error, form);
        return;
      }
      await updateYearSeo(year.id, { ...parsed.data, ...extras.value });
      res.redirect("/admin/site?page=calendar&notice=saved");
    } catch (error) {
      next(error);
    }
  });

  // Theme of the year: lives here with the calendar page's other details.
  app.post("/admin/site/calendar/theme", requireAdmin, async (req, res, next) => {
    try {
      const year = await workingYear(req);
      if (!year || field(req.body, "yearId") !== year.id) {
        res.redirect("/admin/site?page=calendar");
        return;
      }
      const raw = field(req.body, "themeName");
      const parsed = themeSchema.safeParse({ themeName: raw });
      if (!parsed.success) {
        await renderCalendar(req, res, 400, firstIssue(parsed.error), undefined, raw);
        return;
      }
      await updateYearTheme(year.id, parsed.data.themeName);
      res.redirect("/admin/site?page=calendar&notice=theme");
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/site/calendar/share-image/remove", requireAdmin, async (req, res, next) => {
    try {
      const year = await workingYear(req);
      if (year) await removeUnreferenced([await setYearShareImage(year.id, null)]);
      res.redirect("/admin/site?page=calendar&notice=removed");
    } catch (error) {
      next(error);
    }
  });
}
