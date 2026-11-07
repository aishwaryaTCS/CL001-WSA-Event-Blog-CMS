// Shared "More search settings" for every page that has its own search details:
// blog notes, the /blog page, the calendar page and each event's pop-up link.
//
//  • Google visibility (meta robots)   • Keywords (meta keywords)   • Author (meta author)
//  • Canonical link (<link rel="canonical">)
//  • Structured data (schema markup, JSON-LD): the admin picks what kind of page it is
//    (blog post, event…). The website builds the markup from the page's own fields, so it
//    stays correct when the page changes. Experts can switch to "Custom JSON-LD" and write
//    the whole block themselves; it then replaces the automatic one.

export const SITE_ORIGIN = "https://www.wellspringsacademy.in";
export const SCHOOL_NAME = "Wellsprings Academy";

export type SeoExtras = {
  keywords: string;
  canonical: string;
  noindex: boolean;
  author: string;
  /** "" = the default type for this kind of page. */
  schemaType: string;
  /** "" = automatic markup. Otherwise a validated JSON-LD object, pretty-printed. */
  schemaJson: string;
};

export const BLANK_EXTRAS: SeoExtras = { keywords: "", canonical: "", noindex: false, author: "", schemaType: "", schemaJson: "" };

/** Which schema.org types make sense for each kind of page. The first is the default. */
export const SCHEMA_TYPES = {
  note: [
    ["BlogPosting", "Blog post"],
    ["Article", "Article"],
    ["NewsArticle", "School news"],
  ],
  blogPage: [
    ["Blog", "Blog (list of posts)"],
    ["CollectionPage", "Collection page"],
    ["WebPage", "Plain web page"],
  ],
  calendarPage: [
    ["CollectionPage", "Collection of events"],
    ["WebPage", "Plain web page"],
  ],
  event: [
    ["Event", "Event"],
    ["EducationEvent", "Learning event (talk, workshop, exam)"],
    ["ChildrensEvent", "Children’s event"],
    ["SportsEvent", "Sports event"],
    ["Festival", "Festival or celebration"],
    ["SocialEvent", "Social event (meet, gathering)"],
    ["ExhibitionEvent", "Exhibition or showcase"],
  ],
} as const satisfies Record<string, ReadonlyArray<readonly [string, string]>>;

export type SchemaKind = keyof typeof SCHEMA_TYPES;

export function schemaTypeOf(kind: SchemaKind, chosen: string): string {
  const list = SCHEMA_TYPES[kind] as ReadonlyArray<readonly [string, string]>;
  return list.some(([value]) => value === chosen) ? chosen : list[0][0];
}

function escHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function raw(body: unknown, key: string): string {
  const source = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const value = source[key];
  return typeof value === "string" ? value : "";
}

function ticked(body: unknown, key: string): boolean {
  const source = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const value = source[key];
  return value === "on" || value === true || value === "1" || value === "true";
}

/** "a, b ,, A" -> "a, b". */
export function normaliseKeywords(value: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of value.split(/[,\n]/)) {
    const word = part.replace(/\s+/g, " ").trim();
    if (!word || seen.has(word.toLowerCase())) continue;
    seen.add(word.toLowerCase());
    out.push(word);
  }
  return out.join(", ");
}

/** Empty, or a full http(s) link with no spaces. */
export function canonicalProblem(value: string): string | null {
  if (!value) return null;
  if (value.length > 300) return "Canonical link must be 300 characters or fewer.";
  if (/\s/.test(value)) return "Canonical link can't contain spaces.";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "Canonical link must start with https://";
    if (url.username || url.password) return "Canonical link can't contain a user name or password.";
  } catch {
    return "Canonical link must be a full link, such as https://www.wellspringsacademy.in/blog";
  }
  return null;
}

/** Checks a custom JSON-LD block. Returns the tidy text, or a message for the admin. */
export function checkSchemaJson(text: string): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "Custom schema is empty. Paste JSON-LD, or switch back to Automatic." };
  if (trimmed.length > 5000) return { ok: false, error: "Custom schema must be 5,000 characters or fewer." };
  // No HTML at all inside the block: it is printed inside a <script> tag on the website.
  if (/[<>]/.test(trimmed)) return { ok: false, error: "Custom schema can't contain < or > characters." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "Custom schema is not valid JSON. Check commas and quotes." };
  }
  const items = Array.isArray(parsed) ? parsed : [parsed];
  if (!items.length || items.length > 5) return { ok: false, error: "Custom schema must be one object (or up to 5 in a list)." };
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return { ok: false, error: "Custom schema must be a JSON object { … }." };
    const record = item as Record<string, unknown>;
    const context = record["@context"];
    if (typeof context !== "string" || !/^https?:\/\/schema\.org\/?$/.test(context)) {
      return { ok: false, error: "Custom schema needs \"@context\": \"https://schema.org\"." };
    }
    if (typeof record["@type"] !== "string" || !record["@type"]) return { ok: false, error: "Custom schema needs an \"@type\", such as \"Event\"." };
  }
  return { ok: true, value: JSON.stringify(parsed, null, 2) };
}

/**
 * Reads the extra fields from a form or JSON body.
 * Names: seoKeywords, seoCanonical, seoHidden, seoAuthor, seoSchemaType, seoSchemaMode, seoSchemaJson.
 */
export function readSeoExtras(
  body: unknown,
  options: { canonical: boolean; author: boolean; kind: SchemaKind },
): { ok: true; value: SeoExtras } | { ok: false; error: string; value: SeoExtras } {
  const typeRaw = raw(body, "seoSchemaType").trim();
  const custom = raw(body, "seoSchemaMode") === "custom";
  const value: SeoExtras = {
    keywords: normaliseKeywords(raw(body, "seoKeywords")),
    canonical: options.canonical ? raw(body, "seoCanonical").trim() : "",
    noindex: ticked(body, "seoHidden"),
    author: options.author ? raw(body, "seoAuthor").replace(/\s+/g, " ").trim() : "",
    schemaType: schemaTypeOf(options.kind, typeRaw) === typeRaw ? typeRaw : "",
    schemaJson: custom ? raw(body, "seoSchemaJson") : "",
  };
  const fail = (error: string) => ({ ok: false as const, error, value });
  const words = value.keywords ? value.keywords.split(", ") : [];
  if (words.length > 10) return fail("Use at most 10 keywords.");
  if (words.some((word) => word.length > 40)) return fail("Each keyword must be 40 characters or fewer.");
  if (value.keywords.length > 200) return fail("Keywords must be 200 characters or fewer in total.");
  const canonical = canonicalProblem(value.canonical);
  if (canonical) return fail(canonical);
  if (value.author.length > 100) return fail("Author must be 100 characters or fewer.");
  if (custom) {
    const checked = checkSchemaJson(value.schemaJson);
    if (!checked.ok) return fail(checked.error);
    value.schemaJson = checked.value;
  }
  return { ok: true, value };
}

type ExtrasOptions = {
  kind: SchemaKind;
  /** The page's own address, used when the canonical field is empty. */
  autoCanonical: string;
  /** Show the author field. Notes take the author from "Written by" instead. */
  author: boolean;
  /** Placeholder / automatic author text. */
  autoAuthor: string;
  /** The automatic markup, built from the page as saved. The preview updates as fields change. */
  jsonLd: Record<string, unknown>;
  /** Where the page lives, for the help lines ("this note's page"). */
  pageLabel: string;
};

/** The "More search settings" block. Same-size controls in a two-column grid. */
export function seoExtrasHtml(values: SeoExtras, options: ExtrasOptions): string {
  const custom = Boolean(values.schemaJson);
  const types = SCHEMA_TYPES[options.kind] as ReadonlyArray<readonly [string, string]>;
  const chosenType = schemaTypeOf(options.kind, values.schemaType);
  const testUrl = `https://search.google.com/test/rich-results?url=${encodeURIComponent(values.canonical || options.autoCanonical)}`;
  const authorField = options.author
    ? `<input id="seoAuthor" name="seoAuthor" type="text" maxlength="100" value="${escHtml(values.author)}" placeholder="${escHtml(options.autoAuthor)}">
       <span class="help">Empty uses “${escHtml(options.autoAuthor)}”.</span>`
    : `<input id="seoAuthorAuto" type="text" readonly value="${escHtml(options.autoAuthor || "From “Written by”")}">
       <span class="help">Taken from “Written by”.</span>`;
  return `<div class="seo-box" data-seo-kind="${escHtml(options.kind)}" data-seo-base="${escHtml(JSON.stringify(options.jsonLd))}" data-seo-url="${escHtml(options.autoCanonical)}">
      <div class="seo-group">
        <div class="seo-group-head"><h4>On Google</h4><span class="help">Should people find ${escHtml(options.pageLabel)} in search?</span></div>
        <div class="segmented" role="radiogroup" aria-label="On Google">
          <label><input type="radio" name="seoHidden" value=""${values.noindex ? "" : " checked"}><span>Show in search<code>index, follow</code></span></label>
          <label><input type="radio" name="seoHidden" value="on"${values.noindex ? " checked" : ""}><span>Hide from search<code>noindex, nofollow</code></span></label>
        </div>
      </div>

      <div class="seo-group">
        <div class="seo-group-head"><h4>Search details</h4><span class="help">Optional.</span></div>
        <div class="seo-grid">
          <div class="field">
            <label for="seoKeywords">Keywords</label>
            <input id="seoKeywords" name="seoKeywords" type="text" maxlength="200" value="${escHtml(values.keywords)}" placeholder="science, grade 5, field trip">
            <span class="help">Comma between each. Up to 10.</span>
          </div>
          <div class="field">
            <label for="${options.author ? "seoAuthor" : "seoAuthorAuto"}">Author</label>
            ${authorField}
          </div>
          <div class="field span-2">
            <label for="seoCanonical">Canonical link</label>
            <input id="seoCanonical" name="seoCanonical" type="text" inputmode="url" maxlength="300" spellcheck="false" autocapitalize="off" value="${escHtml(values.canonical)}" placeholder="${escHtml(options.autoCanonical)}">
            <span class="help">Empty uses <code>${escHtml(options.autoCanonical)}</code>. Change only if this page also lives at another address.</span>
          </div>
        </div>
      </div>

      <div class="seo-group seo-schema-group">
        <div class="seo-group-head seo-schema-head">
          <div>
            <h4>Structured data <span class="muted">(schema markup · JSON-LD)</span></h4>
            <span class="help">Tells Google what kind of page this is.</span>
          </div>
          <a class="seo-test-link" href="${escHtml(testUrl)}" target="_blank" rel="noopener noreferrer" title="Works once the page is published">Rich Results Test ↗</a>
        </div>
        <div class="seo-grid seo-schema-grid">
          <div class="field">
            <label for="seoSchemaType">1. This page is a…</label>
            <select id="seoSchemaType" name="seoSchemaType">${types
              .map(([value, label]) => `<option value="${escHtml(value)}"${value === chosenType ? " selected" : ""}>${escHtml(label)}</option>`)
              .join("")}</select>
            <span class="help">schema.org type: <code id="seo-type-code">${escHtml(chosenType)}</code></span>
          </div>
          <div class="field">
            <span class="label" id="seo-mode-label">2. How the markup is made</span>
            <div class="segmented full" role="radiogroup" aria-labelledby="seo-mode-label">
              <label><input type="radio" name="seoSchemaMode" value="auto"${custom ? "" : " checked"}><span>Automatic</span></label>
              <label><input type="radio" name="seoSchemaMode" value="custom"${custom ? " checked" : ""}><span>Custom JSON-LD</span></label>
            </div>
            <span class="help">Automatic is right for almost every page.</span>
          </div>
        </div>
        <div class="seo-auto"${custom ? " hidden" : ""}>
          <details class="seo-code-box">
            <summary><span>See the automatic markup</span><span class="help">Updates as you type.</span></summary>
            <pre class="seo-code"><code id="seo-preview">${escHtml(JSON.stringify(options.jsonLd, null, 2))}</code></pre>
          </details>
        </div>
        <div class="seo-custom"${custom ? "" : " hidden"}>
          <div class="field">
            <div class="seo-custom-head">
              <label for="seoSchemaJson">Custom JSON-LD</label>
              <button type="button" class="secondary sm" id="seo-copy-auto">Start from the automatic markup</button>
            </div>
            <textarea id="seoSchemaJson" class="code" name="seoSchemaJson" rows="12" maxlength="5000" spellcheck="false">${escHtml(values.schemaJson)}</textarea>
            <span class="help" id="seo-json-status" role="status">Replaces the automatic markup on the website. Must include "@context": "https://schema.org" and an "@type".</span>
          </div>
        </div>
      </div>
    </div>`;
}

/** Keeps the schema preview in step with the form, and checks custom JSON as it is typed. */
export const SEO_EXTRAS_SCRIPT = `
(function () {
  var box = document.querySelector(".seo-box");
  if (!box) return;
  var base;
  try { base = JSON.parse(box.getAttribute("data-seo-base") || "{}"); } catch (e) { base = {}; }
  var pageUrl = box.getAttribute("data-seo-url") || "";
  var $ = function (id) { return document.getElementById(id); };
  var preview = $("seo-preview"), typeSelect = $("seoSchemaType"), typeCode = $("seo-type-code");
  var auto = box.querySelector(".seo-auto"), custom = box.querySelector(".seo-custom");
  var json = $("seoSchemaJson"), status = $("seo-json-status");
  function build() {
    var data = JSON.parse(JSON.stringify(base));
    if (typeSelect) data["@type"] = typeSelect.value;
    var kw = $("seoKeywords") && $("seoKeywords").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean).join(", ");
    if (kw) data.keywords = kw; else delete data.keywords;
    var canon = $("seoCanonical") && $("seoCanonical").value.trim();
    if ("mainEntityOfPage" in data) data.mainEntityOfPage = canon || pageUrl;
    else if ("url" in data && canon) data.url = canon;
    var author = $("seoAuthor") && $("seoAuthor").value.trim();
    if (author && data.author && typeof data.author === "object") data.author.name = author;
    // The page's name/headline stays the real title; only the description follows the search text.
    var desc = $("seoDescription") && $("seoDescription").value.trim();
    if (desc && "description" in data) data.description = desc;
    return data;
  }
  function refresh() {
    if (typeCode && typeSelect) typeCode.textContent = typeSelect.value;
    if (preview) preview.textContent = JSON.stringify(build(), null, 2);
  }
  function mode() {
    var picked = box.querySelector("input[name=seoSchemaMode]:checked");
    var isCustom = picked && picked.value === "custom";
    auto.hidden = isCustom;
    custom.hidden = !isCustom;
    if (isCustom && json && !json.value.trim()) json.value = JSON.stringify(build(), null, 2);
    check();
  }
  function check() {
    if (!json || custom.hidden) return;
    var text = json.value.trim();
    var msg = "Looks good. This replaces the automatic markup.", bad = false;
    try {
      if (/[<>]/.test(text)) throw new Error("No < or > characters.");
      var parsed = JSON.parse(text);
      var items = Array.isArray(parsed) ? parsed : [parsed];
      items.forEach(function (item) {
        if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Must be a JSON object { … }.");
        if (!/^https?:\\/\\/schema\\.org\\/?$/.test(item["@context"] || "")) throw new Error("Needs \\"@context\\": \\"https://schema.org\\".");
        if (!item["@type"]) throw new Error("Needs an \\"@type\\".");
      });
    } catch (e) {
      bad = true;
      msg = e instanceof SyntaxError ? "Not valid JSON yet. Check commas and quotes." : e.message;
    }
    status.textContent = msg;
    status.classList.toggle("warn", bad);
  }
  box.addEventListener("change", function (e) { if (e.target.name === "seoSchemaMode") mode(); refresh(); });
  document.addEventListener("input", function (e) { if (e.target === json) check(); else refresh(); });
  var copy = $("seo-copy-auto");
  if (copy) copy.addEventListener("click", function () { json.value = JSON.stringify(build(), null, 2); check(); json.focus(); });
  refresh();
  check();
})();
`;

export function absolute(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

export function keywordList(keywords: string): string[] {
  return keywords ? keywords.split(", ").filter(Boolean) : [];
}
