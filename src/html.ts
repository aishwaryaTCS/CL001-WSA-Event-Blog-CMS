import { readFileSync } from "node:fs";
import type { NoteRow } from "./db.ts";
import { autosaveScript } from "./autosave.ts";
import {
  CARD_EXCERPT_CHARS,
  CARD_TITLE_CHARS,
  COPY,
  COVER_HEIGHT,
  COVER_PATH,
  COVER_UPLOAD,
  COVER_WIDTH,
  DESIGNATIONS,
  SALUTATIONS,
  authorIsStructured,
  autoSeoDescription,
  autoSeoTitle,
  isPublishMessage,
  kolkataToday,
  parseDateLabel,
  seoIsAutomatic,
  slugify,
  type Designation,
  type NoteInput,
  type Salutation,
} from "./schemas.ts";

const css = readFileSync(new URL("./admin.css", import.meta.url), "utf8");

export function csp(nonce: string): string {
  return [
    "default-src 'self'",
    "img-src 'self'",
    `style-src 'nonce-${nonce}' https://fonts.googleapis.com`,
    "font-src https://fonts.gstatic.com",
    `script-src 'nonce-${nonce}'`,
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join("; ");
}

const arrow = `<svg class="arrow" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6"></path></svg>`;

function logo(): string {
  return `<img class="logo" src="/admin/brand/logo.png" alt="Wellsprings Academy" width="542" height="320">`;
}

export function eyebrow(text: string, tone = ""): string {
  return `<p class="eyebrow${tone ? ` ${tone}` : ""}"><span class="rule" aria-hidden="true"></span>${esc(text)}</p>`;
}

export function page(title: string, body: string, signedIn: boolean, nonce: string): string {
  const mast = signedIn
    ? `<header class="mast"><div class="mast-inner"><a href="/admin/home">${logo()}</a><nav><a href="/admin/home">Home</a><a href="/admin/notes">Notes</a><a href="/admin/calendar">Calendar</a><a href="/admin/site">Site &amp; SEO</a><a href="/admin/help">Help</a><a href="/admin/password">Password</a><form method="post" action="/admin/logout"><button class="link" type="submit">Sign out</button></form></nav></div></header>`
    : "";
  const foot = signedIn
    ? `<footer class="colophon"><div><span>Wellsprings Academy</span><span>Think · Build · Belong</span></div></footer>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${esc(title)} · Wellsprings CMS</title>
  <link rel="icon" type="image/png" sizes="48x48" href="/admin/brand/favicon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,500;0,600;1,500&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
  <style nonce="${esc(nonce)}">${css}</style>
</head>
<body>
  ${mast}
  ${body}
  ${foot}
</body>
</html>`;
}

export function signInPage(error: string, notice: string): string {
  return `<section class="gate">
    <div class="gate-copy">
      ${logo()}
      ${eyebrow("School desk")}
      <h1>Sign in.</h1>
      <p class="intro">The desk where a teacher’s week becomes a note parents can read. Think, build, belong — told without the brochure voice.</p>
      <ul class="legend">
        <li class="think"><i></i>Think</li>
        <li class="build"><i></i>Build</li>
        <li class="belong"><i></i>Belong</li>
      </ul>
    </div>
    <div class="gate-panel">
      <form class="gate-form" method="post" action="/admin/login">
        <h2>Welcome back</h2>
        <p class="intro">Use the school admin email and password.</p>
        ${notice ? `<p class="banner notice" role="status">${esc(notice)}</p>` : ""}
        ${error ? `<p class="banner error" role="status">${esc(error)}</p>` : ""}
        <div class="field">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" autocomplete="username" required>
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input id="password" name="password" type="password" autocomplete="current-password" required>
        </div>
        <button class="primary" type="submit">Sign in</button>
      </form>
    </div>
  </section>`;
}

export function passwordPage(error: string): string {
  return `<main class="sheet narrow">
    ${eyebrow("School desk")}
    <h1>Change password</h1>
    <p class="intro">After this change you sign in again. The new password needs 12 characters.</p>
    ${error ? `<p class="banner error" role="status">${esc(error)}</p>` : ""}
    <form class="panel" method="post" action="/admin/password">
      <div class="field">
        <label for="currentPassword">Current password</label>
        <input id="currentPassword" name="currentPassword" type="password" autocomplete="current-password" required>
      </div>
      <div class="field">
        <label for="newPassword">New password</label>
        <input id="newPassword" name="newPassword" type="password" autocomplete="new-password" required>
      </div>
      <div class="field">
        <label for="confirmPassword">Confirm new password</label>
        <input id="confirmPassword" name="confirmPassword" type="password" autocomplete="new-password" required>
      </div>
      <button class="primary" type="submit">Change password</button>
    </form>
  </main>`;
}

/** Words the notes search looks through: headline, summary, teacher, school date, pillar, status, URL. */
function searchText(row: NoteRow): string {
  return [row.title, row.excerpt, row.author, row.date_label, row.pillar ?? "", row.status, row.slug ?? ""]
    .join(" ")
    .toLowerCase();
}

const NOTES_SEARCH_SCRIPT = `(() => {
  const input = document.getElementById("note-search");
  if (!input) return;
  const items = Array.from(document.querySelectorAll(".search-item"));
  const groups = Array.from(document.querySelectorAll("[data-search-group]"));
  const count = document.getElementById("note-search-count");
  const none = document.getElementById("note-search-none");
  function run() {
    const words = input.value.toLowerCase().trim().split(/\\s+/).filter(Boolean);
    let shown = 0;
    for (const item of items) {
      const hit = words.every((word) => item.dataset.search.includes(word));
      item.hidden = !hit;
      if (hit) shown += 1;
    }
    for (const group of groups) {
      const name = group.dataset.searchGroup;
      const any = items.some((item) => item.dataset.group === name && !item.hidden);
      group.hidden = !any;
    }
    count.textContent = words.length ? shown + (shown === 1 ? " note" : " notes") + " found." : "";
    none.hidden = !words.length || shown > 0;
  }
  input.addEventListener("input", run);
  input.addEventListener("keydown", (event) => { if (event.key === "Escape") { input.value = ""; run(); } });
  run();
})();`;

export function notesPage(rows: NoteRow[], nonce = ""): string {
  const featured = rows.find((row) => row.featured) ?? null;
  const rest = featured ? rows.filter((row) => row.id !== featured.id) : rows;
  const published = rows.filter((row) => row.status === "published").length;
  const item = (row: NoteRow, group: string, html: string) =>
    `<div class="search-item" data-group="${group}" data-search="${esc(searchText(row))}">${html}</div>`;
  const list = rest.length
    ? `<div class="note-grid">${rest.map((row) => item(row, "rest", noteCard(row))).join("")}</div>`
    : "";
  const search = rows.length
    ? `<div class="list-search">
        <label for="note-search">Search notes</label>
        <input id="note-search" type="search" autocomplete="off" placeholder="Headline, summary, teacher, term or week">
        <span id="note-search-count" class="help" role="status" aria-live="polite"></span>
      </div>`
    : "";
  const body = rows.length
    ? `${featured ? `<div data-search-group="featured"><p class="eyebrow section-label"><span class="rule" aria-hidden="true"></span>This week's note</p></div>${item(featured, "featured", featureCard(featured))}` : ""}
       ${rest.length ? `<div data-search-group="rest"><p class="eyebrow section-label"><span class="rule" aria-hidden="true"></span>${featured ? "More notes" : "All notes"}</p></div>${list}` : ""}
       <p id="note-search-none" class="empty-search" hidden>No notes match that search.</p>`
    : `<div class="empty">${eyebrow("Nothing on the desk")}<h2>No notes yet.</h2><p class="intro">The first note you publish is what parents find on the website.</p></div>`;
  return `<main class="sheet">
    <header class="page-head">
      <div class="page-head-row">
        <div>
          ${eyebrow("Notes from school")}
          <h1>What we noticed.</h1>
          <p class="intro">Drafts stay on this desk. A published note appears on the website once its calendar date has arrived.</p>
        </div>
        <a class="button" href="/admin/notes/new">New note ${arrow}</a>
      </div>
      <dl class="facts">
        <div><dt>Notes</dt><dd>${rows.length}</dd></div>
        <div><dt>Published</dt><dd>${published}</dd></div>
        <div><dt>Drafts</dt><dd>${rows.length - published}</dd></div>
        <div><dt>This week</dt><dd>${featured ? "1" : "0"}</dd></div>
      </dl>
    </header>
    ${search}
    ${body}
  </main>
  ${rows.length && nonce ? `<script nonce="${esc(nonce)}">${NOTES_SEARCH_SCRIPT}</script>` : ""}`;
}

export type EditorForm = NoteInput & {
  id: string | null;
  savedStatus: NoteRow["status"] | null;
  slugLocked: boolean;
  coverWidth: number | null;
  coverHeight: number | null;
};

function parseDesignationValue(value: string): Designation | null {
  return (DESIGNATIONS as readonly string[]).includes(value) ? (value as Designation) : null;
}

function parseSalutationValue(value: string): Salutation | null {
  return (SALUTATIONS as readonly string[]).includes(value) ? (value as Salutation) : null;
}

function parseGradeValue(value: string): number | null {
  if (!value) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 10 ? number : null;
}

export function editorFromRow(row: NoteRow): EditorForm {
  return {
    id: row.id,
    savedStatus: row.status,
    slugLocked: row.slug_locked,
    title: row.title,
    excerpt: row.excerpt,
    body: row.body,
    bodyText: row.body.join("\n\n"),
    pillar: row.pillar,
    dateLabel: row.date_label,
    author: row.author,
    authorTitle: row.author_title,
    authorFirstName: row.author_first_name,
    authorLastName: row.author_last_name,
    authorDesignation: row.author_designation,
    authorGrade: row.author_grade,
    imageAlt: row.image_alt,
    caption: row.caption,
    slug: row.slug,
    publishDate: row.publish_date,
    featured: row.featured,
    includesStudent: row.includes_student,
    photoConsent: row.photo_consent,
    nameConsent: row.name_consent,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    coverImage: row.cover_image,
    coverWidth: row.cover_width,
    coverHeight: row.cover_height,
    status: row.status,
  };
}

export function editorFromRequest(body: unknown, base: EditorForm): EditorForm {
  if (!body || typeof body !== "object") return base;
  const data = body as Record<string, unknown>;
  const str = (key: string) => (typeof data[key] === "string" ? data[key] : "");
  const on = (key: string) => data[key] === "on" || data[key] === true || data[key] === "1" || data[key] === "true";
  const pillarRaw = str("pillar").toLowerCase();
  const pillar = pillarRaw === "think" || pillarRaw === "build" || pillarRaw === "belong" ? pillarRaw : null;
  const includesStudent = on("includesStudent");
  return {
    ...base,
    title: str("title"),
    excerpt: str("excerpt"),
    bodyText: str("bodyText") || (typeof data.body === "string" ? data.body : base.bodyText),
    body: [],
    pillar,
    dateLabel: str("dateLabel"),
    author: str("author"),
    authorTitle: parseSalutationValue(str("authorTitle")),
    authorFirstName: str("authorFirstName"),
    authorLastName: str("authorLastName"),
    authorDesignation: parseDesignationValue(str("authorDesignation")),
    authorGrade: parseGradeValue(str("authorGrade")),
    imageAlt: str("imageAlt"),
    caption: str("caption"),
    slug: base.slugLocked ? base.slug : str("slug") || null,
    publishDate: str("publishDate") || base.publishDate,
    featured: on("featured"),
    includesStudent,
    photoConsent: includesStudent ? on("photoConsent") : false,
    nameConsent: includesStudent ? on("nameConsent") : false,
    seoTitle: str("seoTitle") || null,
    seoDescription: str("seoDescription") || null,
    coverImage: str("coverImage") || null,
    coverWidth: str("coverWidth") ? Number(str("coverWidth")) || null : base.coverWidth,
    coverHeight: str("coverHeight") ? Number(str("coverHeight")) || null : base.coverHeight,
  };
}

export function blankEditor(): EditorForm {
  return {
    id: null,
    savedStatus: null,
    slugLocked: false,
    title: "",
    excerpt: "",
    body: [],
    bodyText: "",
    pillar: null,
    dateLabel: "",
    author: "",
    authorTitle: null,
    authorFirstName: "",
    authorLastName: "",
    authorDesignation: null,
    authorGrade: null,
    imageAlt: "",
    caption: "",
    slug: null,
    publishDate: kolkataToday(),
    featured: false,
    includesStudent: false,
    photoConsent: false,
    nameConsent: false,
    seoTitle: null,
    seoDescription: null,
    coverImage: null,
    coverWidth: null,
    coverHeight: null,
    status: "draft",
  };
}

export function editorPage(form: EditorForm, error: string, notice: string, nonce: string): string {
  const publishError = isPublishMessage(error) ? error : "";
  const formError = publishError ? "" : error;
  const action = form.id ? `/admin/notes/${form.id}` : "/admin/notes";
  const slugDirty = !form.slugLocked && !!form.slug && form.slug !== slugify(form.title);
  const parsedDate = parseDateLabel(form.dateLabel);
  const legacyDate = Boolean(form.dateLabel) && !parsedDate;
  const structuredAuthor = authorIsStructured(form);
  const legacyAuthor = Boolean(form.author) && !structuredAuthor;
  const seoTitleValue = form.seoTitle ?? (form.title ? autoSeoTitle(form.title) : "");
  const seoDescriptionValue = form.seoDescription ?? autoSeoDescription(form.excerpt) ?? "";
  const seoAutomatic = seoIsAutomatic(form.seoTitle, form.seoDescription, form.title, form.excerpt);
  const cover = form.coverImage && COVER_PATH.test(form.coverImage) ? form.coverImage : "";
  const deleteBase = form.savedStatus === "published" ? COPY.deletePublishedNote : COPY.deleteDraft;
  const deleteConfirm = form.slugLocked && form.slug
    ? `${deleteBase} The URL /blog/${form.slug} will be given up.`
    : deleteBase;
  const pillarLabel = form.pillar ? form.pillar[0].toUpperCase() + form.pillar.slice(1) : "Pillar";
  const term1Weeks = Array.from({ length: 25 }, (_, index) => index + 1)
    .map((week) => `<option value="${week}"${parsedDate?.term === "1" && parsedDate.week === String(week) ? " selected" : ""}>Week ${week}</option>`)
    .join("");
  const term2Weeks = Array.from({ length: 27 }, (_, index) => index + 26)
    .map((week) => `<option value="${week}"${parsedDate?.term === "2" && parsedDate.week === String(week) ? " selected" : ""}>Week ${week}</option>`)
    .join("");

  return `<main class="sheet">
    <header class="page-head editor-head">
      ${eyebrow(form.id ? "Edit note" : "New note", "coral")}
      <h1>${form.title ? esc(form.title) : "A note from the classroom."}</h1>
      <p class="intro">${form.savedStatus === "published" ? "This note is on the website when its date has arrived." : "Nothing is public until you publish."}</p>
    </header>
    <p id="form-status" class="${formError ? "error" : "notice"}" role="status">${esc(formError || notice)}</p>
    <div class="studio">
    <form id="note-form" method="post" action="${esc(action)}"
      data-note-id="${form.id ? esc(form.id) : ""}"
      data-slug-locked="${form.slugLocked ? "1" : "0"}"
      data-slug-dirty="${slugDirty ? "1" : "0"}"
      data-title-warn="${CARD_TITLE_CHARS}"
      data-excerpt-warn="${CARD_EXCERPT_CHARS}"
      data-cover-width="${COVER_WIDTH}"
      data-cover-height="${COVER_HEIGHT}"
      data-legacy-date="${legacyDate ? "1" : "0"}"
      data-legacy-author="${legacyAuthor ? "1" : "0"}"
      data-seo-automatic="${seoAutomatic ? "1" : "0"}">
      <section class="panel">
        ${eyebrow("The note")}
        <p class="help">This is what a parent reads.</p>
        <div class="field">
          <label for="title">Headline</label>
          <input id="title" name="title" type="text" maxlength="120" required value="${esc(form.title)}">
          <span class="help">Title on the article, the featured note, and each card.</span>
          <span id="title-count" class="count"></span>
        </div>
        <div class="field">
          <label for="excerpt">Short summary</label>
          <textarea id="excerpt" class="short" name="excerpt" maxlength="300" rows="3">${esc(form.excerpt)}</textarea>
          <span class="help">Under the title on /blog. Also used for search and sharing when those fields stay automatic.</span>
          <span id="excerpt-count" class="count"></span>
        </div>
        <div class="field">
          <label for="body">The note</label>
          <textarea id="body" name="bodyText">${esc(form.bodyText)}</textarea>
          <span class="help">A blank line starts a new paragraph. The first paragraph is larger on the article.</span>
        </div>
        <div class="field">
          <label for="pillar">Think, Build, or Belong</label>
          ${pillarCards(form.pillar)}
          <select id="pillar" class="sr" name="pillar" tabindex="-1" aria-hidden="true">
            <option value="">Choose</option>
            ${["think", "build", "belong"]
              .map((pillar) => {
                const label = pillar[0].toUpperCase() + pillar.slice(1);
                return `<option value="${pillar}"${form.pillar === pillar ? " selected" : ""}>${label}</option>`;
              })
              .join("")}
          </select>
          <span class="help">The coloured tag.</span>
        </div>
        <div class="field">
          <span class="label" id="school-date-label">School date</span>
          <div class="field-row" role="group" aria-labelledby="school-date-label">
            <div>
              <label for="termSelect">Term</label>
              <select id="termSelect">
                <option value="">Choose term</option>
                <option value="1"${parsedDate?.term === "1" ? " selected" : ""}>Term 1</option>
                <option value="2"${parsedDate?.term === "2" ? " selected" : ""}>Term 2</option>
              </select>
            </div>
            <div>
              <label for="weekSelect">Week</label>
              <select id="weekSelect"${parsedDate ? "" : " disabled"}>
                <option value="">Choose week</option>
                <optgroup id="term1-weeks" label="Term 1"${parsedDate?.term === "1" ? "" : " hidden"}>${term1Weeks}</optgroup>
                <optgroup id="term2-weeks" label="Term 2"${parsedDate?.term === "2" ? "" : " hidden"}>${term2Weeks}</optgroup>
              </select>
            </div>
          </div>
          <input id="dateLabel" name="dateLabel" type="hidden" value="${esc(form.dateLabel)}">
          ${legacyDate ? `<p class="help" id="date-legacy">Current: ${esc(form.dateLabel)}</p>` : ""}
          <span class="help">Printed on the card and under the title.</span>
        </div>
        <div class="field">
          <span class="label">Written by</span>
          <span class="help">Shown on the featured note and the article. Cards show the school date only.</span>
          ${legacyAuthor ? `<p class="help" id="author-legacy">Current: ${esc(form.author)}</p>` : ""}
          <input id="author" name="author" type="hidden" value="${esc(form.author)}">
          <div class="author-name">
            <div class="field">
              <label for="authorTitle">Salutation</label>
              <select id="authorTitle" name="authorTitle">
                <option value="">None</option>
                ${SALUTATIONS.map((item) => `<option value="${esc(item)}"${form.authorTitle === item ? " selected" : ""}>${esc(item)}</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <label for="authorFirstName">First name</label>
              <input id="authorFirstName" name="authorFirstName" type="text" maxlength="24" autocomplete="off" value="${esc(form.authorFirstName)}">
            </div>
            <div class="field">
              <label for="authorLastName">Last name</label>
              <input id="authorLastName" name="authorLastName" type="text" maxlength="24" autocomplete="off" value="${esc(form.authorLastName)}">
            </div>
          </div>
          <div class="author-meta">
            <div class="field">
              <label for="authorDesignation">Designation</label>
              <select id="authorDesignation" name="authorDesignation">
                <option value="">Choose designation</option>
                ${DESIGNATIONS.map((item) => `<option value="${esc(item)}"${form.authorDesignation === item ? " selected" : ""}>${esc(item)}</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <label for="authorGrade">Grade</label>
              <select id="authorGrade" name="authorGrade">
                <option value="">Whole school</option>
                ${Array.from({ length: 10 }, (_, index) => index + 1)
                  .map((grade) => `<option value="${grade}"${form.authorGrade === grade ? " selected" : ""}>Grade ${grade}</option>`)
                  .join("")}
              </select>
            </div>
          </div>
        </div>
      </section>
      <section class="panel">
        ${eyebrow("Photograph")}
        <div class="field">
          <label for="coverFile">Cover photo</label>
          <input id="coverFile" type="file" accept="image/jpeg,image/png,image/webp">
          <input id="coverImage" name="coverImage" type="hidden" value="${esc(cover)}">
          <input id="coverWidth" name="coverWidth" type="hidden" value="${form.coverWidth ?? ""}">
          <input id="coverHeight" name="coverHeight" type="hidden" value="${form.coverHeight ?? ""}">
          <span class="help">Sideways (landscape) photo, from 1200 × 800 up to 3000 × 2000, under 5 MB. Best: 2400 × 1600.</span>
          <p id="photoError" class="error" role="status"></p>
          <div id="coverEmpty" class="frame wide blank${form.pillar ? ` tint-${form.pillar}` : ""}"${cover ? " hidden" : ""}></div>
          <img id="coverPreview" class="frame wide" alt="" width="${COVER_WIDTH}" height="${COVER_HEIGHT}"${cover ? ` src="${esc(cover)}"` : " hidden"}>
        </div>
        <div class="field">
          <label for="imageAlt">What is in the photo</label>
          <input id="imageAlt" name="imageAlt" type="text" maxlength="200" value="${esc(form.imageAlt)}">
          <span class="help">For screen readers. Describe the scene.</span>
        </div>
        <div class="field">
          <label for="caption">Caption</label>
          <input id="caption" name="caption" type="text" maxlength="160" value="${esc(form.caption)}">
          <span class="help">One line under the photo.</span>
        </div>
      </section>
      <section class="panel">
        ${eyebrow("Publishing")}
        <div class="field">
          <label for="slug">URL</label>
          <div class="slug"><span>/blog/</span><input id="slug" name="slug" type="text" maxlength="80" spellcheck="false" autocapitalize="off" autocomplete="off" value="${esc(form.slug ?? "")}"${form.slugLocked ? " readonly" : ""}></div>
          <span class="help">Becomes /blog/this-text. Change it only before the first publish. After that it stays, so shared links keep working.</span>
        </div>
        <div class="field">
          <label for="publishDate">Calendar date</label>
          <input id="publishDate" name="publishDate" type="date" required value="${esc(form.publishDate)}">
          <span class="help">Orders the notes. A future date stays hidden until that day.</span>
        </div>
        <label class="check"><input id="featured" name="featured" type="checkbox"${form.featured ? " checked" : ""}> This week's note</label>
        <span class="help">The large block at the top of /blog. Only one.</span>
      </section>
      <section class="panel">
        <div class="seo-head">
          ${eyebrow("Search and sharing")}
          <span id="seo-badge" class="badge">${seoAutomatic ? "Automatic" : "Customised"}</span>
        </div>
        <p class="help">This is how the note appears on Google and when shared on WhatsApp or Facebook.</p>
        <div class="field">
          <label for="seoTitle">Search title</label>
          <input id="seoTitle" name="seoTitle" type="text" maxlength="200" value="${esc(seoTitleValue)}">
          <div class="actions tight">
            <button type="button" class="secondary" id="reset-seo-title">Reset to automatic</button>
          </div>
          <span class="help">The blue Google link and the browser tab. About 60 characters.</span>
          <span id="seo-title-hint" class="warn"></span>
        </div>
        <div class="field">
          <label for="seoDescription">Search description</label>
          <textarea id="seoDescription" class="short" name="seoDescription" maxlength="300" rows="3">${esc(seoDescriptionValue)}</textarea>
          <div class="actions tight">
            <button type="button" class="secondary" id="reset-seo-description">Reset to automatic</button>
          </div>
          <span class="help">The grey line under that link. About 160 characters.</span>
          <span id="seo-description-hint" class="warn"></span>
        </div>
        <div class="seo-preview" aria-live="polite">
          <div class="google-result">
            <p id="seo-google-title" class="google-title"></p>
            <p id="seo-google-url" class="google-url"></p>
            <p id="seo-google-description" class="google-description"></p>
          </div>
          <div class="share-card">
            <div id="seo-share-empty" class="frame card blank"${cover ? " hidden" : ""}></div>
            <img id="seo-share-cover" class="frame card" alt="" width="${COVER_WIDTH}" height="${COVER_HEIGHT}"${cover ? ` src="${esc(cover)}"` : " hidden"}>
            <div>
              <p id="seo-share-title" class="share-title"></p>
              <p id="seo-share-description" class="share-description"></p>
            </div>
          </div>
        </div>
      </section>
      <section class="panel">
        ${eyebrow("Before you publish")}
        <label class="check switch">
          <input id="includesStudent" name="includesStudent" type="checkbox" role="switch" aria-checked="${form.includesStudent ? "true" : "false"}" aria-controls="consent-fields" aria-expanded="${form.includesStudent ? "true" : "false"}"${form.includesStudent ? " checked" : ""}>
          This note shows a child's photo or name
        </label>
        <span class="help">Turn on if any child can be recognised or is named. You will then confirm permission.</span>
        <div id="consent-fields"${form.includesStudent ? "" : " hidden"}>
          <label class="check"><input id="photoConsent" name="photoConsent" type="checkbox"${form.photoConsent ? " checked" : ""}> Photo is allowed</label>
          <span class="help">Tick if a parent has agreed, or if no child’s face can be recognised.</span>
          <label class="check"><input id="nameConsent" name="nameConsent" type="checkbox"${form.nameConsent ? " checked" : ""}> Names are allowed</label>
          <span class="help">Tick if no child is named, or if a named child’s parent has agreed. If they have not, write “a child in Grade 3”.</span>
        </div>
        <div class="publish-bar">
          <div class="actions">
            <button class="secondary" type="submit" name="intent" value="draft" id="draft-button">Save draft</button>
            <button id="publish-button" class="primary" type="submit" name="intent" value="publish">${form.savedStatus === "published" ? "Update" : "Publish"}</button>
            ${form.id ? `<a id="preview-link" class="button secondary" href="/admin/notes/${esc(form.id)}/preview">Preview</a>` : `<a id="preview-link" class="button secondary" href="/admin/notes">Preview</a>`}
          </div>
          <p id="publish-line" class="warn" data-server="${esc(publishError)}">${esc(publishError)}</p>
          <p id="preview-note" class="help"></p>
        </div>
      </section>
    </form>
    <aside class="rail">
      ${eyebrow("On the website")}
      <p class="help">The card parents see. Save the draft before previewing the full article.</p>
      <article class="note-card live-card">
        <div class="note-card-media">
          <div id="live-empty" class="frame card blank${form.pillar ? ` tint-${form.pillar}` : ""}"${cover ? " hidden" : ""}></div>
          <img id="live-cover" class="frame card" alt="" width="${COVER_WIDTH}" height="${COVER_HEIGHT}"${cover ? ` src="${esc(cover)}"` : " hidden"}>
        </div>
        <div class="note-card-body">
          <p id="live-pillar" class="tag ${form.pillar ?? "quiet"}"><span class="dot" aria-hidden="true"></span><span id="live-pillar-label">${esc(pillarLabel)}</span></p>
          <h2 id="live-title"${form.title ? "" : ` class="is-empty"`}>${esc(form.title || "The headline appears here")}</h2>
          <p id="live-excerpt" class="excerpt${form.excerpt ? "" : " is-empty"}">${esc(form.excerpt || "The short summary appears here.")}</p>
          <div class="note-card-foot"><span id="live-date" class="meta">${esc(form.dateLabel || "School date")}</span></div>
        </div>
      </article>
    </aside>
    </div>
    ${
      form.id
        ? `<div class="danger-zone actions">${
            form.savedStatus === "published"
              ? `<form method="post" action="/admin/notes/${esc(form.id)}/unpublish" data-confirm="${esc(COPY.unpublish)}"><button class="secondary" type="submit">Unpublish</button></form>`
              : ""
          }<form method="post" action="/admin/notes/${esc(form.id)}/delete" data-confirm="${esc(deleteConfirm)}"><button class="secondary" type="submit">Delete</button></form></div>`
        : ""
    }
  </main>
    <script nonce="${esc(nonce)}">${editorScript(Boolean(form.id))}</script>
    <script nonce="${esc(nonce)}">${autosaveScript("note-form", "note", "data-note-id", "explicit")}</script>`;
}

export function previewPage(note: NoteRow, more: NoteRow[]): string {
  const cover = note.cover_image && COVER_PATH.test(note.cover_image) ? note.cover_image : "";
  const paragraphs = note.body
    .map(
      (paragraph, index) =>
        `<p class="${index === 0 ? "lede" : ""}">${esc(paragraph)}</p>`,
    )
    .join("");
  const others = more.map((item) => noteCard(item, `/admin/notes/${item.id}/preview`, true)).join("");
  return `<div class="preview-bar">${esc(COPY.previewBar)}</div>
    <article>
      <div class="article-top">
        <a class="back" href="/admin/notes/${esc(note.id)}"><svg class="arrow" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M13 8H3M7 4L3 8l4 4" fill="none" stroke="currentColor" stroke-width="1.6"></path></svg> Back to the editor</a>
        ${tag(note.pillar)}
        <h1>${esc(note.title)}</h1>
        <p class="byline meta">${esc(note.date_label)}${note.author ? ` · ${esc(note.author)}` : ""}</p>
      </div>
      <div class="article-photo">
        ${cover ? `<img class="frame wide" src="${esc(cover)}" alt="${esc(note.image_alt)}"${sizeAttrs(note)} fetchpriority="high">` : frame(note, "wide")}
        ${note.caption ? `<p class="caption">${esc(note.caption)}</p>` : ""}
      </div>
      <div class="article-body">
        ${paragraphs}
        ${note.author ? `<p class="byline-end meta">${esc(note.author)}</p>` : ""}
      </div>
    </article>
    ${others ? `<section class="more-wrap"><div class="sheet">${eyebrow("More notes")}<div class="more">${others}</div></div></section>` : ""}`;
}

function tag(pillar: NoteRow["pillar"]): string {
  if (!pillar) return "";
  const label = pillar[0].toUpperCase() + pillar.slice(1);
  return `<p class="tag ${pillar}"><span class="dot" aria-hidden="true"></span>${label}</p>`;
}

function frame(note: NoteRow, kind: "wide" | "card", lazy = false): string {
  const cover = note.cover_image && COVER_PATH.test(note.cover_image) ? note.cover_image : "";
  if (!cover) return `<div class="frame ${kind} blank${note.pillar ? ` tint-${note.pillar}` : ""}"></div>`;
  return `<img class="frame ${kind}" src="${esc(cover)}" alt="${esc(note.image_alt)}"${sizeAttrs(note)}${lazy ? ` loading="lazy" decoding="async"` : ""}>`;
}

function chips(row: NoteRow): string {
  const label = row.status === "published" ? "Published" : "Draft";
  const week = row.featured ? `<span class="chip week">This week</span>` : "";
  return `<span class="chips">${week}<span class="chip ${row.status}">${label}</span></span>`;
}

function noteCard(row: NoteRow, href = `/admin/notes/${row.id}`, lazy = false): string {
  const link = esc(href);
  return `<article class="note-card">
    <a class="note-card-media" href="${link}">${frame(row, "card", lazy)}${chips(row)}</a>
    <div class="note-card-body">
      ${tag(row.pillar)}
      <h2><a href="${link}">${esc(row.title || "Untitled")}</a></h2>
      <p class="excerpt${row.excerpt ? "" : " is-empty"}">${esc(row.excerpt || "No summary yet.")}</p>
      <div class="note-card-foot">
        <span class="meta">${row.date_label ? esc(row.date_label) : "No school date"}</span>
        <span class="card-links"><a href="/admin/notes/${esc(row.id)}">Edit</a><a href="/admin/notes/${esc(row.id)}/preview">Preview</a></span>
      </div>
    </div>
  </article>`;
}

function featureCard(row: NoteRow): string {
  return `<a class="feature" href="/admin/notes/${esc(row.id)}">
    <div class="feature-media">${frame(row, "wide")}${chips(row)}</div>
    <div class="feature-copy">
      ${tag(row.pillar)}
      <h2>${esc(row.title)}</h2>
      <p>${esc(row.excerpt)}</p>
      <div class="feature-foot">
        <span class="meta">${esc(row.date_label)}${row.author ? ` · ${esc(row.author)}` : ""}</span>
        <span class="read">Open the note ${arrow}</span>
      </div>
    </div>
  </a>`;
}

function pillarCards(current: NoteRow["pillar"]): string {
  const items = [
    ["think", "Think", "Mind"],
    ["build", "Build", "Body"],
    ["belong", "Belong", "Heart"],
  ] as const;
  return `<div class="pillar-pick" role="group" aria-label="Think, Build, or Belong">${items
    .map(
      ([value, label, hint]) =>
        `<button type="button" class="pillar-card ${value}${current === value ? " is-on" : ""}" data-pillar="${value}" aria-pressed="${current === value ? "true" : "false"}"><span class="dot" aria-hidden="true"></span><strong>${label}</strong><span>${hint}</span></button>`,
    )
    .join("")}</div>`;
}

function editorScript(hasSavedNote: boolean): string {
  const copy = JSON.stringify({
    addHeadline: COPY.addHeadline,
    addSummary: COPY.addSummary,
    addNote: COPY.addNote,
    addPillar: COPY.addPillar,
    addDate: COPY.addDate,
    addDesignation: COPY.addDesignation,
    addFirstName: COPY.addFirstName,
    addCover: COPY.addCover,
    coverSize: COPY.coverSize,
    addAlt: COPY.addAlt,
    addSlug: COPY.addSlug,
    slugChars: COPY.slugChars,
    tickPhoto: COPY.tickPhoto,
    tickNames: COPY.tickNames,
    tickBoth: COPY.tickBoth,
    paragraphCap: COPY.paragraphCap,
    paragraphCount: COPY.paragraphCount,
    cardCut: COPY.cardCut,
    about60: COPY.about60,
    about160: COPY.about160,
    longHeadlineSeo: COPY.longHeadlineSeo,
    photoRejected: COPY.photoRejected,
    photoSize: COPY.photoSize,
    photoTooLarge: COPY.photoTooLarge,
    photoShape: COPY.photoShape,
    previewDirty: COPY.previewDirty,
  });
  const coverUpload = JSON.stringify(COVER_UPLOAD);
  return `(() => {
    const copy = ${copy};
    const coverUpload = ${coverUpload};
    const form = document.getElementById("note-form");
    if (!form) return;
    const title = document.getElementById("title");
    const excerpt = document.getElementById("excerpt");
    const body = document.getElementById("body");
    const pillar = document.getElementById("pillar");
    const dateLabel = document.getElementById("dateLabel");
    const termSelect = document.getElementById("termSelect");
    const weekSelect = document.getElementById("weekSelect");
    const term1Weeks = document.getElementById("term1-weeks");
    const term2Weeks = document.getElementById("term2-weeks");
    const author = document.getElementById("author");
    const authorTitle = document.getElementById("authorTitle");
    const authorDesignation = document.getElementById("authorDesignation");
    const authorFirstName = document.getElementById("authorFirstName");
    const authorLastName = document.getElementById("authorLastName");
    const authorGrade = document.getElementById("authorGrade");
    const imageAlt = document.getElementById("imageAlt");
    const slug = document.getElementById("slug");
    const coverImage = document.getElementById("coverImage");
    const coverWidth = document.getElementById("coverWidth");
    const coverHeight = document.getElementById("coverHeight");
    const coverFile = document.getElementById("coverFile");
    const coverPreview = document.getElementById("coverPreview");
    const coverEmpty = document.getElementById("coverEmpty");
    const photoError = document.getElementById("photoError");
    const includesStudent = document.getElementById("includesStudent");
    const consentFields = document.getElementById("consent-fields");
    const photoConsent = document.getElementById("photoConsent");
    const nameConsent = document.getElementById("nameConsent");
    const seoTitle = document.getElementById("seoTitle");
    const seoDescription = document.getElementById("seoDescription");
    const seoBadge = document.getElementById("seo-badge");
    const resetSeoTitle = document.getElementById("reset-seo-title");
    const resetSeoDescription = document.getElementById("reset-seo-description");
    const seoGoogleTitle = document.getElementById("seo-google-title");
    const seoGoogleUrl = document.getElementById("seo-google-url");
    const seoGoogleDescription = document.getElementById("seo-google-description");
    const seoShareTitle = document.getElementById("seo-share-title");
    const seoShareDescription = document.getElementById("seo-share-description");
    const seoShareCover = document.getElementById("seo-share-cover");
    const seoShareEmpty = document.getElementById("seo-share-empty");
    const publishButton = document.getElementById("publish-button");
    const draftButton = document.getElementById("draft-button");
    const publishLine = document.getElementById("publish-line");
    const formStatus = document.getElementById("form-status");
    const titleCount = document.getElementById("title-count");
    const excerptCount = document.getElementById("excerpt-count");
    const seoTitleHint = document.getElementById("seo-title-hint");
    const seoDescriptionHint = document.getElementById("seo-description-hint");
    const previewLink = document.getElementById("preview-link");
    const previewNote = document.getElementById("preview-note");
    const liveTitle = document.getElementById("live-title");
    const liveExcerpt = document.getElementById("live-excerpt");
    const liveDate = document.getElementById("live-date");
    const livePillar = document.getElementById("live-pillar");
    const livePillarLabel = document.getElementById("live-pillar-label");
    const liveCover = document.getElementById("live-cover");
    const liveEmpty = document.getElementById("live-empty");
    const pillarButtons = form.querySelectorAll("[data-pillar]");
    const titleWarn = Number(form.dataset.titleWarn);
    const excerptWarn = Number(form.dataset.excerptWarn);
    const neededWidth = Number(form.dataset.coverWidth);
    const neededHeight = Number(form.dataset.coverHeight);
    let slugDirty = form.dataset.slugDirty === "1";
    const slugLocked = form.dataset.slugLocked === "1";
    let noteId = form.dataset.noteId || "";
    let saving = false;
    let dirty = false;
    let hasSavedNote = ${hasSavedNote ? "true" : "false"};

    function slugify(value) {
      return value.normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/g, "");
    }
    function paragraphs(value) {
      return value.replace(/\\r\\n/g, "\\n").replace(/\\r/g, "\\n").split(/\\n\\s*\\n/).map((part) => part.replace(/\\s*\\n\\s*/g, " ").trim()).filter(Boolean);
    }
    function autoTitle(value) {
      return (value.trim() + " — Notes from school | Wellsprings Academy").slice(0, 200);
    }
    function autoDescription(value) {
      return value.trim().slice(0, 300);
    }
    let seoTitleCustom = seoTitle.value.trim() !== autoTitle(title.value);
    let seoDescriptionCustom = seoDescription.value.trim() !== autoDescription(excerpt.value);
    function cut(value, max) {
      const text = value.trim();
      return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
    }
    function syncDateLabel() {
      if (!termSelect.value) {
        weekSelect.disabled = true;
        weekSelect.value = "";
        term1Weeks.hidden = true;
        term2Weeks.hidden = true;
        if (form.dataset.legacyDate !== "1") dateLabel.value = "";
        return;
      }
      weekSelect.disabled = false;
      term1Weeks.hidden = termSelect.value !== "1";
      term2Weeks.hidden = termSelect.value !== "2";
      if (!weekSelect.value) {
        if (form.dataset.legacyDate !== "1") dateLabel.value = "";
        return;
      }
      dateLabel.value = "Term " + termSelect.value + " · Week " + weekSelect.value;
      form.dataset.legacyDate = "0";
      const legacy = document.getElementById("date-legacy");
      if (legacy) legacy.hidden = true;
    }
    function reason() {
      const text = paragraphs(body.value);
      const address = slug.value.trim().toLowerCase();
      const structured = Boolean(authorTitle.value || authorFirstName.value.trim() || authorLastName.value.trim() || authorDesignation.value || authorGrade.value);
      if (!title.value.trim()) return copy.addHeadline;
      if (!excerpt.value.trim()) return copy.addSummary;
      if (!text.length) return copy.addNote;
      if (!pillar.value) return copy.addPillar;
      if (!dateLabel.value.trim()) return copy.addDate;
      if (structured || form.dataset.legacyAuthor !== "1") {
        if (!authorDesignation.value) return copy.addDesignation;
        if (!authorFirstName.value.trim()) return copy.addFirstName;
      }
      if (!coverImage.value) return copy.addCover;
      if (Number(coverWidth.value) !== neededWidth || Number(coverHeight.value) !== neededHeight) return copy.coverSize;
      if (!imageAlt.value.trim()) return copy.addAlt;
      if (!address) return copy.addSlug;
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(address)) return copy.slugChars;
      if (includesStudent.checked) {
        if (!photoConsent.checked && !nameConsent.checked) return copy.tickBoth;
        if (!photoConsent.checked) return copy.tickPhoto;
        if (!nameConsent.checked) return copy.tickNames;
      }
      return "";
    }
    function cap() {
      const text = paragraphs(body.value);
      if (text.length > 8) return copy.paragraphCount;
      if (text.some((part) => part.length > 1000)) return copy.paragraphCap;
      return "";
    }
    function setBusy(busy) {
      saving = busy;
      draftButton.disabled = busy || Boolean(cap());
      publishButton.disabled = busy || Boolean(cap() || reason() || (slug.dataset.checked === "1" ? "" : (publishLine.dataset.server || "")));
    }
    function refreshSeoPreview() {
      const titleText = seoTitle.value.trim() || autoTitle(title.value);
      const descriptionText = seoDescription.value.trim() || autoDescription(excerpt.value);
      const path = "/blog/" + (slug.value.trim() || "your-note");
      seoGoogleTitle.textContent = cut(titleText, 60);
      seoGoogleUrl.textContent = "localhost:8080" + path;
      seoGoogleDescription.textContent = cut(descriptionText, 160);
      seoShareTitle.textContent = cut(titleText, 60);
      seoShareDescription.textContent = cut(descriptionText, 160);
      if (coverImage.value) {
        seoShareCover.src = coverImage.value;
        seoShareCover.hidden = false;
        seoShareEmpty.hidden = true;
      } else {
        seoShareCover.hidden = true;
        seoShareEmpty.hidden = false;
      }
      const autoNow = seoTitle.value.trim() === autoTitle(title.value) && seoDescription.value.trim() === autoDescription(excerpt.value);
      seoBadge.textContent = autoNow ? "Automatic" : "Customised";
    }
    function refresh() {
      const titleLength = title.value.trim().length;
      const excerptLength = excerpt.value.trim().length;
      titleCount.textContent = titleLength + " characters" + (titleLength > titleWarn ? ". " + copy.cardCut : "");
      excerptCount.textContent = excerptLength + " characters" + (excerptLength > excerptWarn ? ". " + copy.cardCut : "");
      titleCount.classList.toggle("warn", titleLength > titleWarn);
      excerptCount.classList.toggle("warn", excerptLength > excerptWarn);
      if (!seoTitleCustom) seoTitle.value = autoTitle(title.value);
      if (!seoDescriptionCustom) seoDescription.value = autoDescription(excerpt.value);
      const titleHint = [];
      if (seoTitle.value.trim().length > 60) titleHint.push(copy.about60);
      if (!seoTitleCustom && seoTitle.value.trim().length > 60) titleHint.push(copy.longHeadlineSeo);
      seoTitleHint.textContent = titleHint.join(" ");
      seoDescriptionHint.textContent = seoDescription.value.trim().length > 160 ? copy.about160 : "";
      refreshSeoPreview();
      const overCap = cap();
      const gate = reason();
      const server = slug.dataset.checked === "1" ? "" : (publishLine.dataset.server || "");
      publishLine.textContent = overCap || gate || server;
      if (!saving) {
        draftButton.disabled = Boolean(overCap);
        publishButton.disabled = Boolean(overCap || gate || server);
      }
      coverPreview.alt = imageAlt.value;
      const pillarValue = pillar.value;
      for (const button of pillarButtons) {
        const on = button.getAttribute("data-pillar") === pillarValue;
        button.classList.toggle("is-on", on);
        button.setAttribute("aria-pressed", on ? "true" : "false");
      }
      if (livePillar && livePillarLabel) {
        livePillar.className = "tag " + (pillarValue || "quiet");
        livePillarLabel.textContent = pillarValue ? pillarValue.charAt(0).toUpperCase() + pillarValue.slice(1) : "Pillar";
      }
      if (liveTitle) {
        const titleText = title.value.trim();
        liveTitle.textContent = titleText || "The headline appears here";
        liveTitle.classList.toggle("is-empty", !titleText);
      }
      if (liveExcerpt) {
        const excerptText = excerpt.value.trim();
        liveExcerpt.textContent = excerptText || "The short summary appears here.";
        liveExcerpt.classList.toggle("is-empty", !excerptText);
      }
      if (liveDate) liveDate.textContent = dateLabel.value.trim() || "School date";
      if (liveCover && liveEmpty) {
        if (coverImage.value) {
          liveCover.src = coverImage.value;
          liveCover.hidden = false;
          liveEmpty.hidden = true;
        } else {
          liveCover.hidden = true;
          liveEmpty.hidden = false;
          liveEmpty.className = "frame card blank" + (pillarValue ? " tint-" + pillarValue : "");
        }
      }
      coverEmpty.className = "frame wide blank" + (pillarValue ? " tint-" + pillarValue : "");
      includesStudent.setAttribute("aria-checked", includesStudent.checked ? "true" : "false");
      includesStudent.setAttribute("aria-expanded", includesStudent.checked ? "true" : "false");
      consentFields.hidden = !includesStudent.checked;
    }
    function payload(status) {
      return {
        title: title.value,
        excerpt: excerpt.value,
        bodyText: body.value,
        pillar: pillar.value,
        dateLabel: dateLabel.value,
        author: author.value,
        authorTitle: authorTitle.value,
        authorFirstName: authorFirstName.value,
        authorLastName: authorLastName.value,
        authorDesignation: authorDesignation.value,
        authorGrade: authorGrade.value,
        imageAlt: imageAlt.value,
        caption: document.getElementById("caption").value,
        slug: slug.value,
        publishDate: document.getElementById("publishDate").value,
        featured: document.getElementById("featured").checked,
        includesStudent: includesStudent.checked,
        photoConsent: photoConsent.checked,
        nameConsent: nameConsent.checked,
        seoTitle: seoTitle.value,
        seoDescription: seoDescription.value,
        coverImage: coverImage.value,
        status,
      };
    }
    title.addEventListener("input", () => {
      if (!slugLocked && !slugDirty) slug.value = slugify(title.value);
      refresh();
    });
    excerpt.addEventListener("input", refresh);
    seoTitle.addEventListener("input", () => { seoTitleCustom = true; refresh(); });
    seoDescription.addEventListener("input", () => { seoDescriptionCustom = true; refresh(); });
    resetSeoTitle.addEventListener("click", () => { seoTitleCustom = false; seoTitle.value = autoTitle(title.value); refresh(); });
    resetSeoDescription.addEventListener("click", () => { seoDescriptionCustom = false; seoDescription.value = autoDescription(excerpt.value); refresh(); });
    slug.addEventListener("input", () => {
      slugDirty = true;
      slug.dataset.checked = "1";
      publishLine.dataset.server = "";
      refresh();
    });
    termSelect.addEventListener("change", () => {
      weekSelect.value = "";
      syncDateLabel();
      dirty = true;
      refresh();
    });
    weekSelect.addEventListener("change", () => {
      syncDateLabel();
      dirty = true;
      refresh();
    });
    includesStudent.addEventListener("change", () => {
      if (!includesStudent.checked) {
        photoConsent.checked = false;
        nameConsent.checked = false;
      }
      refresh();
    });
    for (const field of [body, pillar, authorTitle, authorDesignation, authorFirstName, authorLastName, authorGrade, imageAlt, photoConsent, nameConsent]) {
      field.addEventListener("input", refresh);
      field.addEventListener("change", () => {
        if (field === authorTitle || field === authorDesignation || field === authorFirstName || field === authorLastName || field === authorGrade) {
          form.dataset.legacyAuthor = "0";
          const legacy = document.getElementById("author-legacy");
          if (legacy) legacy.hidden = true;
        }
        refresh();
      });
    }
    for (const button of pillarButtons) {
      button.addEventListener("click", () => {
        pillar.value = button.getAttribute("data-pillar") || "";
        dirty = true;
        refresh();
      });
    }
    // Quick check in the browser so the admin hears at once; the server checks again.
    async function coverUploadProblem(file) {
      if (!/^image\\/(jpeg|png|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) return copy.photoRejected;
      if (typeof createImageBitmap !== "function") return null;
      let size;
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        size = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
      } catch {
        return null;
      }
      if (!size.width || !size.height) return null;
      const ratio = size.width / size.height;
      if (ratio < coverUpload.minRatio || ratio > coverUpload.maxRatio) return copy.photoShape;
      if (size.width < coverUpload.minWidth || size.height < coverUpload.minHeight) return copy.photoSize;
      if (size.width > coverUpload.maxWidth || size.height > coverUpload.maxHeight) return copy.photoTooLarge;
      return null;
    }
    coverFile.addEventListener("change", async () => {
      const file = coverFile.files && coverFile.files[0];
      if (!file) return;
      photoError.textContent = "";
      const early = await coverUploadProblem(file);
      if (early) {
        photoError.textContent = early;
        coverFile.value = "";
        return;
      }
      try {
        const data = new FormData();
        data.append("file", file);
        const response = await fetch("/api/admin/uploads", { method: "POST", body: data, credentials: "same-origin" });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.coverImage) {
          photoError.textContent = json.error || copy.photoRejected;
          coverFile.value = "";
          return;
        }
        coverImage.value = json.coverImage;
        coverWidth.value = String(json.width || neededWidth);
        coverHeight.value = String(json.height || neededHeight);
        coverPreview.src = json.coverImage;
        coverPreview.hidden = false;
        coverEmpty.hidden = true;
        dirty = true;
        refresh();
      } catch {
        photoError.textContent = copy.photoRejected;
        coverFile.value = "";
      }
    });
    form.addEventListener("input", () => { dirty = true; });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (saving) return;
      const submitter = event.submitter;
      const intent = submitter && submitter.value === "publish" ? "published" : "draft";
      if (intent === "published" && reason()) {
        publishLine.textContent = reason();
        return;
      }
      if (cap()) {
        publishLine.textContent = cap();
        return;
      }
      setBusy(true);
      formStatus.textContent = "";
      formStatus.className = "notice";
      try {
        const url = noteId ? "/api/admin/posts/" + noteId : "/api/admin/posts";
        const method = noteId ? "PATCH" : "POST";
        const response = await fetch(url, {
          method,
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload(intent)),
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = json.error || "Something went wrong.";
          formStatus.textContent = message;
          formStatus.className = "error";
          if (copy.slugTaken === message || copy.slugChars === message || copy.addSlug === message || copy.coverSize === message || copy.photoSize === message || copy.addDate === message || copy.addDesignation === message || copy.addFirstName === message || copy.tickPhoto === message || copy.tickNames === message || copy.tickBoth === message || copy.addCover === message || copy.addAlt === message || copy.addHeadline === message || copy.addSummary === message || copy.addNote === message || copy.addPillar === message) {
            publishLine.dataset.server = message;
            publishLine.textContent = message;
          }
          setBusy(false);
          refresh();
          return;
        }
        noteId = json.id || noteId;
        form.dataset.noteId = noteId;
        form.action = "/admin/notes/" + noteId;
        hasSavedNote = true;
        dirty = false;
        if (window.wsaAutosaveClear) window.wsaAutosaveClear();
        window.location.assign("/admin/notes/" + noteId + "?notice=" + (intent === "published" ? "published" : "draft"));
      } catch {
        formStatus.textContent = "Something went wrong.";
        formStatus.className = "error";
        setBusy(false);
      }
    });
    if (previewLink) {
      previewLink.addEventListener("click", (event) => {
        if (dirty || !hasSavedNote) {
          event.preventDefault();
          previewNote.textContent = copy.previewDirty;
        }
      });
    }
    for (const confirmForm of document.querySelectorAll("[data-confirm]")) {
      confirmForm.addEventListener("submit", (event) => {
        if (!window.confirm(confirmForm.getAttribute("data-confirm"))) event.preventDefault();
      });
    }
    syncDateLabel();
    refresh();
  })();`;
}

function sizeAttrs(note: NoteRow): string {
  if (!note.cover_width || !note.cover_height) return "";
  return ` width="${note.cover_width}" height="${note.cover_height}"`;
}

export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
