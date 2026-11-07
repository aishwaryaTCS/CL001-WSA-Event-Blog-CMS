import { readFileSync } from "node:fs";
import type { EventRow, FilterRow, PhotoRow, RhythmRow, YearRow } from "./db.ts";
import { autosaveScript } from "../autosave.ts";
import { absolute, keywordList, SCHOOL_NAME, schemaTypeOf, SEO_EXTRAS_SCRIPT, seoExtrasHtml } from "../seo-fields.ts";
import {
  CAL_COPY,
  COLOR_KEYS,
  MAX_PHOTOS,
  MONTH_NAMES,
  STATE_LABEL,
  autoEventSeoDescription,
  autoEventSeoTitle,
  eventState,
  monthKeys,
  type EventInput,
  type EventState,
} from "./schemas.ts";

const css = readFileSync(new URL("./calendar.css", import.meta.url), "utf8");

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function shortDate(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTH_SHORT[Number(iso.slice(5, 7)) - 1]}`;
}

export function dateRange(start: string, end: string | null): string {
  if (!end || end === start) return shortDate(start);
  if (start.slice(0, 7) === end.slice(0, 7)) return `${Number(start.slice(8, 10))}–${shortDate(end)}`;
  return `${shortDate(start)} – ${shortDate(end)}`;
}

export function monthLong(key: string): string {
  return `${MONTH_LONG[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
}

function monthShort(key: string): string {
  return `${MONTH_SHORT[Number(key.slice(5, 7)) - 1]} <span class="muted">’${key.slice(2, 4)}</span>`;
}

function eyebrow(text: string): string {
  return `<p class="eyebrow"><span class="rule" aria-hidden="true"></span>${esc(text)}</p>`;
}

function banner(error: string, notice: string): string {
  return `<p class="banner ${error ? "error" : "notice"}" role="status" aria-live="polite">${esc(error || notice)}</p>`;
}

function colorClass(key: string | null | undefined): string {
  return `c-${key && (COLOR_KEYS as readonly string[]).includes(key) ? key : "grey"}`;
}

export function pill(strand: FilterRow | undefined): string {
  return `<span class="pill ${colorClass(strand?.color_key)}"><i aria-hidden="true"></i>${esc(strand?.name ?? "No strand")}</span>`;
}

function stateTag(state: EventState, photos = 0): string {
  const label = state === "completed" ? `Photos · ${photos}` : STATE_LABEL[state];
  return `<span class="state ${state}">${esc(label)}</span>`;
}

const COMMON_SCRIPT = `
document.documentElement.classList.add("js");
document.addEventListener("submit", function (event) {
  var submitter = event.submitter;
  var message = (submitter && submitter.getAttribute("data-confirm")) || event.target.getAttribute("data-confirm");
  if (message && !window.confirm(message)) event.preventDefault();
}, true);

// "Show more" on dashboard lists: reveal the next batch of hidden rows.
Array.prototype.forEach.call(document.querySelectorAll("button[data-more]"), function (button) {
  var list = document.getElementById(button.getAttribute("data-more"));
  var step = Number(button.getAttribute("data-step")) || 5;
  var count = button.querySelector(".more-count");
  button.addEventListener("click", function () {
    var hidden = list.querySelectorAll("li[hidden]");
    var first = null;
    for (var i = 0; i < hidden.length && i < step; i++) {
      hidden[i].hidden = false;
      if (!first) first = hidden[i];
    }
    var left = list.querySelectorAll("li[hidden]").length;
    if (count) count.textContent = String(left);
    if (!left) button.hidden = true;
    var link = first && first.querySelector("a");
    if (link) link.focus();
  });
});

// Events grid: show only the cards that sit beside the month rail, then "Show more".
(function () {
  var grid = document.getElementById("event-grid");
  var button = document.getElementById("events-more");
  var rail = document.querySelector(".month-rail");
  if (!grid || !button || !rail) return;
  var cards = Array.prototype.slice.call(grid.children);
  var expanded = false;
  var batch = cards.length;
  function columns() {
    return window.getComputedStyle(grid).gridTemplateColumns.split(" ").length || 1;
  }
  function update(shown) {
    cards.forEach(function (card, index) { card.hidden = index >= shown; });
    var left = cards.filter(function (card) { return card.hidden; }).length;
    button.hidden = left === 0;
    button.querySelector(".more-count").textContent = String(left);
  }
  function fit() {
    if (expanded) return;
    cards.forEach(function (card) { card.hidden = false; });
    if (window.matchMedia("(max-width: 860px)").matches) {
      batch = 6;
    } else {
      // The last month button marks the end of the rail (the rail box itself can stretch).
      var last = rail.lastElementChild || rail;
      var bottom = last.getBoundingClientRect().bottom;
      var fits = cards.filter(function (card) { return card.getBoundingClientRect().bottom <= bottom + 1; }).length;
      var cols = columns();
      batch = Math.max(fits - (fits % cols), cols * 2);
    }
    update(batch);
  }
  button.addEventListener("click", function () {
    expanded = true;
    var shown = cards.filter(function (card) { return !card.hidden; }).length;
    update(shown + batch);
    var next = cards[shown];
    if (next) next.focus();
  });
  fit();
  var timer = 0;
  window.addEventListener("resize", function () {
    window.clearTimeout(timer);
    timer = window.setTimeout(fit, 150);
  });
})();

// Preview photos: a sideways strip; the arrows move one photo at a time.
Array.prototype.forEach.call(document.querySelectorAll("[data-carousel]"), function (box) {
  var strip = box.querySelector(".preview-photos");
  var buttons = box.querySelectorAll("button[data-dir]");
  if (!strip || !buttons.length) return;
  function step() { var first = strip.querySelector("img"); return first ? first.getBoundingClientRect().width + 8 : strip.clientWidth; }
  function update() {
    buttons[0].disabled = strip.scrollLeft <= 1;
    buttons[1].disabled = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1;
  }
  Array.prototype.forEach.call(buttons, function (button) {
    button.addEventListener("click", function () { strip.scrollBy({ left: Number(button.getAttribute("data-dir")) * step(), behavior: "smooth" }); });
  });
  strip.addEventListener("scroll", update, { passive: true });
  update();
});

// Filters / rhythm: a card named in the address (#opt-… after a save) is never left folded away.
(function () {
  var id = window.location.hash.slice(1);
  if (!/^opt-[0-9a-f-]{36}$/i.test(id)) return;
  var card = document.getElementById(id);
  if (!card) return;
  if (card.hidden) {
    var list = card.parentElement;
    Array.prototype.forEach.call(list.querySelectorAll("li[hidden]"), function (li) { li.hidden = false; });
    var more = document.querySelector('[data-more="' + list.id + '"]');
    if (more) more.hidden = true;
  }
  card.scrollIntoView({ block: "center" });
})();

// Dashboard: rename the theme in place.
(function () {
  var toggle = document.getElementById("theme-edit-toggle");
  var form = document.getElementById("theme-edit");
  if (!toggle || !form) return;
  function show(open) {
    form.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) form.querySelector("input").focus();
  }
  toggle.addEventListener("click", function () { show(form.hidden); });
  document.getElementById("theme-edit-cancel").addEventListener("click", function () { form.reset(); show(false); });
})();

// Year dropdown on Events: switching year opens that year straight away (strands differ per year).
Array.prototype.forEach.call(document.querySelectorAll("select[data-autosubmit]"), function (select) {
  select.addEventListener("change", function () {
    var form = select.form;
    ["month", "strand"].forEach(function (name) { var field = form.elements[name]; if (field) field.disabled = true; });
    form.submit();
  });
});

// Filter groups: remember which groups are open while moving between saves.
(function () {
  var groups = document.querySelectorAll("details[data-group-id]");
  if (!groups.length) return;
  var key = "wsa-cal-open-groups";
  var open = [];
  try { open = JSON.parse(window.sessionStorage.getItem(key) || "[]"); } catch (error) { open = []; }
  Array.prototype.forEach.call(groups, function (details) {
    var id = details.getAttribute("data-group-id");
    if (open.indexOf(id) !== -1) details.open = true;
    details.addEventListener("toggle", function () {
      var ids = Array.prototype.filter.call(groups, function (item) { return item.open; }).map(function (item) { return item.getAttribute("data-group-id"); });
      try { window.sessionStorage.setItem(key, JSON.stringify(ids)); } catch (error) { /* storage blocked: nothing to remember */ }
    });
  });
})();
`;

const LIST_STEP = 5;

/** A todo list that shows 5 rows, with a "Show more" button for the next 5. */
function pagedList(id: string, rows: string[], empty: string): string {
  if (!rows.length) return `<p class="help">${empty}</p>`;
  const items = rows.map((row, index) => (index >= LIST_STEP ? row.replace(/^<li>/, "<li hidden>") : row)).join("");
  const extra = rows.length - LIST_STEP;
  const more =
    extra > 0
      ? `<button class="secondary more-btn" type="button" data-more="${id}" data-step="${LIST_STEP}" aria-controls="${id}">Show more <span class="muted">(<span class="more-count">${extra}</span> more)</span></button>`
      : "";
  return `<ul class="todo" id="${id}">${items}</ul>${more}`;
}

function countBadge(n: number): string {
  return n ? ` <span class="head-count">${n}</span>` : "";
}

export type Section = "dashboard" | "events" | "months" | "filters" | "rhythm" | "settings" | "years" | "home";

export function calendarShell(
  nonce: string,
  section: Section,
  year: YearRow | null,
  body: string,
  script = "",
): string {
  const links: Array<[Section, string, string]> = [
    ["dashboard", "/admin/calendar", "Dashboard"],
    ["events", "/admin/calendar/events", "Events"],
    ["months", "/admin/calendar/months", "Months"],
    ["filters", "/admin/calendar/filters", "Strands"],
    ["rhythm", "/admin/calendar/rhythm", "All-year rhythm"],
    ["years", "/admin/calendar/years", "Years"],
  ];
  const subnav =
    section === "home"
      ? ""
      : `<nav class="subnav" aria-label="Calendar">${links
          .map(([key, href, label]) => `<a href="${href}"${key === section ? ' aria-current="page"' : ""}>${label}</a>`)
          .join("")}${
          year
            ? `<a class="year-pill" href="/admin/calendar/years" title="Change the year you are editing">${esc(year.label)}${year.is_current ? " · on the site" : " · not on the site"}</a>`
            : ""
        }</nav>`;
  return `<style nonce="${esc(nonce)}">${css}</style>
  <main class="sheet">${subnav}${body}</main>
  <script nonce="${esc(nonce)}">${COMMON_SCRIPT}${script}</script>`;
}

// ---- Home --------------------------------------------------------------

export function homeBody(notes: { published: number; drafts: number }, calendar: { label: string; needsPhotos: number; drafts: number } | null): string {
  const calStatus = calendar
    ? `${esc(calendar.label)} · ${calendar.needsPhotos} need${calendar.needsPhotos === 1 ? "s" : ""} photos · ${calendar.drafts} draft${calendar.drafts === 1 ? "" : "s"}`
    : "No calendar year yet.";
  return `<header class="page-head">
      ${eyebrow("School desk")}
      <h1>What are we doing today?</h1>
      <p class="intro">Notes tell parents what the week was like. The calendar shows the year ahead, then proves it with photos.</p>
    </header>
    <div class="home-cards">
      <a class="home-card" href="/admin/notes">
        ${eyebrow("Notes from school")}
        <h2>Notes</h2>
        <p class="status">${notes.published} published · ${notes.drafts} draft${notes.drafts === 1 ? "" : "s"}</p>
      </a>
      <a class="home-card" href="/admin/calendar">
        ${eyebrow("Theme of the Year")}
        <h2>Calendar</h2>
        <p class="status">${calStatus}</p>
      </a>
    </div>`;
}

// ---- Dashboard ---------------------------------------------------------

type ListedEvent = { row: EventRow; state: EventState; photos: number };

function todoItem(item: ListedEvent, strands: Map<string, FilterRow>, action: string): string {
  return `<li><div><a href="/admin/calendar/events/${esc(item.row.id)}"><strong>${esc(item.row.title)}</strong></a>
    <div class="when">${esc(dateRange(item.row.start_date, item.row.end_date))} · ${esc(strands.get(item.row.strand_id)?.name ?? "")}</div></div>
    ${action}</li>`;
}

export function dashboardBody(
  year: YearRow,
  events: ListedEvent[],
  strands: Map<string, FilterRow>,
  today: string,
  notice: string,
): string {
  const needs = events.filter((item) => item.state === "needs-photos").sort((a, b) => a.row.start_date.localeCompare(b.row.start_date));
  const horizon = addDays(today, 14);
  const coming = events.filter(
    (item) => (item.state === "upcoming" || item.state === "today") && item.row.start_date <= horizon,
  );
  const drafts = events.filter((item) => item.state === "draft");
  const keys = monthKeys(year.first_month, year.last_month);
  const states: EventState[] = ["draft", "upcoming", "needs-photos", "completed", "cancelled"];
  const rows = keys
    .map((key) => {
      const inMonth = events.filter((item) => item.row.start_date.startsWith(key));
      const cells = states
        .map((state) => {
          const n = inMonth.filter((item) => (state === "upcoming" ? item.state === "upcoming" || item.state === "today" : item.state === state)).length;
          return `<td>${n || '<span class="muted">·</span>'}</td>`;
        })
        .join("");
      return `<tr><td><a href="/admin/calendar/events?month=${key}">${esc(monthLong(key))}</a></td>${cells}<td>${inMonth.length}</td></tr>`;
    })
    .join("");
  return `<header class="page-head">
      <div class="page-head-row">
        <div>
          ${eyebrow(`Theme of the Year · ${year.label}`)}
          <div class="theme-title">
            <h1>${esc(year.theme_name)}</h1>
            <button class="inline-link" type="button" id="theme-edit-toggle" aria-expanded="false" aria-controls="theme-edit">Rename theme</button>
          </div>
          <form class="inline-form theme-edit" id="theme-edit" method="post" action="/admin/calendar/settings" hidden>
            <div class="field grow"><label for="themeName">Theme name</label>
              <input id="themeName" name="themeName" type="text" maxlength="40" required value="${esc(year.theme_name)}"></div>
            <button class="primary" type="submit">Save</button>
            <button class="secondary" type="button" id="theme-edit-cancel">Cancel</button>
          </form>
          <p class="intro">Plan the event, publish it, then add photos once it is done.</p>
        </div>
        <a class="button" href="/admin/calendar/events/new">New event</a>
      </div>
    </header>
    ${banner("", notice)}
    <form class="filters-row" method="get" action="/admin/calendar/events" role="search">
      <div class="field"><label for="d-q">Search events</label>
        <input id="d-q" name="q" type="search" maxlength="80" autocomplete="off" placeholder="Title, grade, plan…" required></div>
      <button class="secondary" type="submit">Search</button>
    </form>
    <div class="dash">
      <section class="panel">
        <h2>Needs photos${countBadge(needs.length)}</h2>
        <p class="help">Past events without a published recap, oldest first.</p>
        ${pagedList("list-needs", needs.map((item) => todoItem(item, strands, `<a class="button" href="/admin/calendar/events/${esc(item.row.id)}?tab=after">Add photos</a>`)), "Nothing waiting. Every past event has its photos.")}
      </section>
      <section class="panel">
        <h2>Coming up${countBadge(coming.length)}</h2>
        <p class="help">Published events in the next 14 days.</p>
        ${pagedList("list-coming", coming.map((item) => todoItem(item, strands, stateTag(item.state))), "Nothing in the next 14 days.")}
      </section>
      <section class="panel wide">
        <h2>Drafts${countBadge(drafts.length)}</h2>
        ${pagedList("list-drafts", drafts.map((item) => todoItem(item, strands, `<a class="button secondary" href="/admin/calendar/events/${esc(item.row.id)}">Open</a>`)), "No drafts.")}
      </section>
      <section class="panel wide">
        <h2>Events by month</h2>
        <div class="table-wrap"><table class="counts">
          <thead><tr><th>Month</th>${states.map((state) => `<th>${esc(STATE_LABEL[state])}</th>`).join("")}<th>All</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </section>
    </div>`;
}

export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// ---- Events list -------------------------------------------------------

export function eventsBody(
  year: YearRow,
  month: string,
  events: ListedEvent[],
  allEvents: ListedEvent[],
  strands: FilterRow[],
  filter: { strand: string; state: string; q?: string },
  notice: string,
  strandLabel = "Strand",
  years: YearRow[] = [],
): string {
  const keys = monthKeys(year.first_month, year.last_month);
  const byId = new Map(strands.map((row) => [row.id, row]));
  const searching = Boolean(filter.q);
  // Month links leave the search and open that month (keeping strand and state).
  const query = (key: string): string => {
    const params = new URLSearchParams({ month: key });
    if (filter.strand) params.set("strand", filter.strand);
    if (filter.state) params.set("state", filter.state);
    return params.toString();
  };
  const matches = (item: ListedEvent): boolean =>
    (!filter.strand || item.row.strand_id === filter.strand) &&
    (!filter.state || item.state === filter.state || (filter.state === "upcoming" && item.state === "today"));
  const rail = keys
    .map((key) => {
      const n = allEvents.filter((item) => item.row.start_date.startsWith(key) && matches(item)).length;
      return `<a href="/admin/calendar/events?${esc(query(key))}"${key === month && !searching ? ' aria-current="true"' : ""}><span>${monthShort(key)}</span>${n ? `<span class="n">${n}</span>` : ""}</a>`;
    })
    .join("");
  const cards = events
    .map((item) => {
      const strand = byId.get(item.row.strand_id);
      return `<a class="event-card ${colorClass(strand?.color_key)}${item.state === "cancelled" ? " is-cancelled" : ""}" href="/admin/calendar/events/${esc(item.row.id)}">
        <span class="bar" aria-hidden="true"></span>
        <span class="inner">
          <span class="top">${pill(strand)}${stateTag(item.state, item.photos)}</span>
          <span class="date">${esc(dateRange(item.row.start_date, item.row.end_date))}${item.row.grades_label ? ` · ${esc(item.row.grades_label)}` : ""}</span>
          ${item.row.moved_from ? `<span class="moved">Moved from ${esc(shortDate(item.row.moved_from))}</span>` : ""}
          <h3>${esc(item.row.title)}</h3>
          ${item.row.subtitle ? `<p>${esc(item.row.subtitle)}</p>` : ""}
        </span>
      </a>`;
    })
    .join("");
  const stateOptions: Array<[string, string]> = [
    ["", "All states"],
    ["draft", "Draft"],
    ["upcoming", "Upcoming"],
    ["needs-photos", "Needs photos"],
    ["completed", "Completed"],
    ["cancelled", "Cancelled"],
  ];
  return `<header class="page-head">
      <div class="page-head-row">
        <div>${eyebrow("Events")}<h1>The year, month by month.</h1></div>
        <a class="button" href="/admin/calendar/events/new?month=${esc(month)}">New event</a>
      </div>
    </header>
    ${banner("", notice)}
    <form class="filters-row events-filters" method="get" action="/admin/calendar/events" role="search">
      <input type="hidden" name="month" value="${esc(month)}">
      <div class="field search-field"><label for="f-q">Search</label>
        <span class="search-box"><svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <input id="f-q" name="q" type="search" maxlength="80" autocomplete="off" placeholder="Title, grade, plan…" value="${esc(filter.q ?? "")}"></span></div>
      ${
        years.length > 1
          ? `<div class="field"><label for="f-year">Year</label>
        <select id="f-year" name="year" data-autosubmit>${years
          .map((row) => `<option value="${esc(row.id)}"${row.id === year.id ? " selected" : ""}>${esc(row.label)}${row.is_current ? " (on site)" : ""}</option>`)
          .join("")}</select></div>`
          : ""
      }
      <div class="field"><label for="f-strand">${esc(strandLabel)}</label>
        <select id="f-strand" name="strand"><option value="">All</option>${strands
          .map((row) => `<option value="${esc(row.id)}"${row.id === filter.strand ? " selected" : ""}>${esc(row.name)}${row.active ? "" : " (hidden)"}</option>`)
          .join("")}</select></div>
      <div class="field"><label for="f-state">State</label>
        <select id="f-state" name="state">${stateOptions
          .map(([value, label]) => `<option value="${value}"${value === filter.state ? " selected" : ""}>${label}</option>`)
          .join("")}</select></div>
      <div class="filters-actions">
        <button class="secondary" type="submit">${searching ? "Search" : "Filter"}</button>
        ${searching || filter.strand || filter.state ? `<a class="button secondary" href="/admin/calendar/events?month=${esc(month)}">Clear</a>` : ""}
      </div>
    </form>
    <div class="cal-layout">
      <nav class="month-rail" aria-label="Months">${rail}</nav>
      <section>
        <div class="month-head">
          ${
            searching
              ? `<div><h2>Search: “${esc(filter.q ?? "")}”</h2><p>Results from the whole school year, by date.</p></div>`
              : `<div><h2>${esc(monthLong(month))}</h2><p>${esc(year.month_lines[month] ?? "")}</p></div>`
          }
          <span class="slots">${events.length} ${events.length === 1 ? "event" : "events"}</span>
        </div>
        ${events.length ? `<div class="event-grid" id="event-grid">${cards}</div><button class="secondary more-btn" type="button" id="events-more" aria-controls="event-grid" hidden>Show more <span class="muted">(<span class="more-count">0</span> more)</span></button>` : searching ? `<p class="empty-month">No events match that search${filter.strand || filter.state ? " and filter" : ""}.</p>` : `<p class="empty-month">No events this month${filter.strand || filter.state ? " for this filter" : ""}.</p>`}
      </section>
    </div>`;
}

// ---- Event editor ------------------------------------------------------

export type EditorModel = {
  event: EventRow | null;
  values: EventInput;
  year: YearRow;
  strands: FilterRow[];
  groups: Array<{ group: FilterRow; options: FilterRow[] }>;
  photos: PhotoRow[];
  today: string;
  error: string;
  notice: string;
  tab: "plan" | "after" | "seo";
  /** Name of the main filter group (renamed by the admin under Filters). */
  strandLabel: string;
};

export function editorValuesFromRow(row: EventRow): EventInput {
  return {
    title: row.title,
    subtitle: row.subtitle,
    startDate: row.start_date,
    endDate: row.end_date,
    strandId: row.strand_id,
    optionIds: row.option_ids,
    gradesLabel: row.grades_label,
    body: row.body,
    highlights: row.highlights,
    recap: row.recap,
    photoConsent: row.photo_consent,
    showMoved: row.moved_from !== null,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    seoKeywords: row.seo_keywords,
    seoNoindex: row.seo_noindex,
    slug: row.slug,
    seoCanonical: row.seo_canonical,
    seoSchemaType: row.seo_schema_type,
    seoSchemaJson: row.seo_schema_json,
    seoSchemaProblem: "",
    intent: "save",
  };
}

export function blankValues(startDate: string): EventInput {
  return {
    title: "",
    subtitle: "",
    startDate,
    endDate: null,
    strandId: "",
    optionIds: [],
    gradesLabel: "",
    body: "",
    highlights: [],
    recap: "",
    photoConsent: false,
    showMoved: false,
    seoTitle: "",
    seoDescription: "",
    seoKeywords: "",
    seoNoindex: false,
    slug: "",
    seoCanonical: "",
    seoSchemaType: "",
    seoSchemaJson: "",
    seoSchemaProblem: "",
    intent: "save",
  };
}

/** The Event markup the website adds when the event's pop-up link is opened. */
function eventJsonLd(values: EventInput, slug: string, title: string, description: string, image: string): Record<string, unknown> {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": schemaTypeOf("event", values.seoSchemaType),
    name: values.title || title,
    description,
    startDate: values.startDate,
    endDate: values.endDate || values.startDate,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    url: absolute(`/theme-of-the-year?event=${slug || "…"}`),
    mainEntityOfPage: values.seoCanonical || absolute(`/theme-of-the-year?event=${slug || "…"}`),
    location: { "@type": "Place", name: SCHOOL_NAME, address: "Bengaluru, Karnataka, IN" },
    organizer: { "@type": "EducationalOrganization", name: SCHOOL_NAME, url: absolute("/") },
  };
  if (image) data.image = absolute(image);
  const keywords = keywordList(values.seoKeywords);
  if (keywords.length) data.keywords = keywords.join(", ");
  return data;
}

function counter(id: string, max: number, warn: number): string {
  return `<span class="count" id="${id}-count" data-max="${max}" data-warn="${warn}"></span>`;
}

export function editorBody(model: EditorModel): string {
  const { event, values, year, strands, groups, photos, today } = model;
  const id = event?.id ?? "";
  const status = event?.status ?? "draft";
  const state = event ? eventState(event, today) : "draft";
  const action = event ? `/admin/calendar/events/${esc(id)}` : "/admin/calendar/events";
  const minDate = year.first_month;
  const maxDate = lastDay(year.last_month);
  const visibleStrands = strands.filter((row) => row.active || row.id === values.strandId);
  const seoTitle = values.seoTitle || autoEventSeoTitle(values.title || "Event title", year.theme_name);
  const seoDescription = values.seoDescription || autoEventSeoDescription(values.subtitle, values.body);

  const strandField = `<fieldset>
      <legend class="label">${esc(model.strandLabel)}<span class="req" aria-hidden="true">*</span></legend>
      <div class="swatches">${visibleStrands
        .map(
          (row) => `<label class="swatch ${colorClass(row.color_key)}"><input type="radio" name="strandId" value="${esc(row.id)}"${row.id === values.strandId ? " checked" : ""} required><span><i aria-hidden="true"></i>${esc(row.name)}${row.active ? "" : " (hidden)"}</span></label>`,
        )
        .join("")}</div>
      <span class="help">Paints the card. Required.</span>
    </fieldset>`;

  const optionFields = groups
    .map(({ group, options }) => {
      const shown = options.filter((row) => row.active || values.optionIds.includes(row.id));
      if (!shown.length) return "";
      return `<fieldset class="optgroup" data-group="${esc(group.name)}">
        <legend>${esc(group.name)}${group.show_on_site ? "" : ' <span class="muted">· not shown on the site yet</span>'}</legend>
        <div class="checks">${shown
          .map(
            (row) => `<label><input type="checkbox" name="optionIds" value="${esc(row.id)}" data-name="${esc(row.name)}"${values.optionIds.includes(row.id) ? " checked" : ""}> ${esc(row.name)}</label>`,
          )
          .join("")}</div>
      </fieldset>`;
    })
    .join("");

  const movedVisible = status === "published";
  const movedBox = movedVisible
    ? `<label class="check" id="moved-box"${values.showMoved || values.startDate !== event?.start_date ? "" : " hidden"}><input type="checkbox" name="showMoved"${values.showMoved ? " checked" : ""}> Show “Moved from ${esc(shortDate(event?.moved_from ?? event?.start_date ?? values.startDate))}” on the site</label>`
    : "";

  const plan = `<section class="tab-panel" id="tab-plan" role="tabpanel" aria-labelledby="t-plan">
    <div class="panel">
      <div class="field">
        <label for="title">Title</label>
        <input id="title" name="title" type="text" maxlength="90" required value="${esc(values.title)}">
        ${counter("title", 90, 90)}
      </div>
      <div class="field">
        <label for="subtitle">Subtitle</label>
        <input id="subtitle" name="subtitle" type="text" maxlength="120" value="${esc(values.subtitle)}">
        <span class="help">One line under the title on the card.</span>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="startDate">Start date</label>
          <input id="startDate" name="startDate" type="date" required min="${esc(minDate)}" max="${esc(maxDate)}" value="${esc(values.startDate)}" data-saved="${esc(event?.start_date ?? "")}">
        </div>
        <div class="field">
          <label for="endDate">End date <span class="muted">(optional)</span></label>
          <input id="endDate" name="endDate" type="date" min="${esc(minDate)}" max="${esc(maxDate)}" value="${esc(values.endDate ?? "")}">
          <span class="help">For events over several days. The card shows 15–23 Jul.</span>
        </div>
      </div>
      ${movedBox}
      ${strandField}
      ${optionFields}
      <div class="field">
        <label for="gradesLabel">Who it is for</label>
        <input id="gradesLabel" name="gradesLabel" type="text" maxlength="40" value="${esc(values.gradesLabel)}" placeholder="Whole school">
        <span class="help">Shown as typed, such as “Nursery – Grade 2”.</span>
        ${groups.some(({ group }) => group.name.toLowerCase() === "grade") ? `<button class="inline-link" type="button" id="suggest-grades">Suggest from the Grade options</button>` : ""}
      </div>
      <div class="field">
        <label for="body">The plan<span class="req" aria-hidden="true">*</span></label>
        <textarea id="body" name="body" maxlength="1200" rows="8">${esc(values.body)}</textarea>
        ${counter("body", 1200, 1200)}
        <span class="help">What parents read before the event. A blank line starts a new paragraph. Required to publish.</span>
      </div>
      <div class="field">
        <label for="highlights">What happens</label>
        <textarea id="highlights" class="short" name="highlights" rows="5">${esc(values.highlights.join("\n"))}</textarea>
        <span class="help">One point per line. Up to 6 points, 140 characters each.</span>
      </div>
    </div>
  </section>`;

  const canRecap = Boolean(event) && status === "published" && values.startDate <= today;
  const photoItems = photos
    .map(
      (photo) => `<li class="photo-item" draggable="true" data-id="${esc(photo.id)}">
        <img src="${esc(photo.thumb)}" alt="" width="120" height="90" loading="lazy">
        <div>
          <div class="field"><label for="alt-${esc(photo.id)}">Alt text</label>
            <input id="alt-${esc(photo.id)}" class="photo-alt" type="text" maxlength="160" value="${esc(photo.alt)}"></div>
          <div class="field"><label for="cap-${esc(photo.id)}">Caption <span class="muted">(optional)</span></label>
            <input id="cap-${esc(photo.id)}" class="photo-caption" type="text" maxlength="120" value="${esc(photo.caption)}">
            <span class="help">Don't write children's full names.</span></div>
          <p class="photo-status help" role="status"></p>
        </div>
        <div class="photo-tools">
          <button class="secondary handle" type="button" data-act="up" aria-label="Move photo up">↑ Up</button>
          <button class="secondary" type="button" data-act="down" aria-label="Move photo down">↓ Down</button>
          <button class="secondary" type="button" data-act="save">Save text</button>
          <button class="secondary danger" type="button" data-act="delete">Delete</button>
        </div>
      </li>`,
    )
    .join("");

  const after = `<section class="tab-panel" id="tab-after" role="tabpanel" aria-labelledby="t-after">
    <div class="panel">
      <h2>Event photos</h2>
      ${
        event
          ? `<p class="help">Up to ${MAX_PHOTOS} photos. Sideways (landscape) photos, from 1200 × 800 up to 3000 × 2000, JPEG, PNG or WebP under 5 MB each. Best: 2400 × 1600. We remove location data.</p>
        <div class="field">
          <label for="photo-files">Add photos <span class="slots" id="slots">${photos.length} of ${MAX_PHOTOS}</span></label>
          <input id="photo-files" type="file" accept="image/jpeg,image/png,image/webp" multiple${photos.length >= MAX_PHOTOS ? " disabled" : ""}>
          <p id="photo-message" class="help" role="status" aria-live="polite"></p>
          <ul id="upload-log" class="upload-log" aria-live="polite"></ul>
        </div>
        <ul id="photo-list" class="photo-list">${photoItems}</ul>
        <p class="help">Drag to reorder, or use Up and Down. The first photo is the share image.</p>`
          : `<p class="help">Save the event first. Then you can add photos here.</p>`
      }
      <div class="field">
        <label for="recap">Recap <span class="muted">(optional)</span></label>
        <textarea id="recap" class="short" name="recap" maxlength="600" rows="4">${esc(values.recap)}</textarea>
        ${counter("recap", 600, 600)}
      </div>
      <label class="check"><input type="checkbox" id="photoConsent" name="photoConsent"${values.photoConsent ? " checked" : ""}> Every child shown has photo consent on file with the school.</label>
      <span class="help">Adding a photo clears this tick, so each new photo is checked.</span>
      ${
        event
          ? `<div class="bar-actions mt">${
              event.recap_published
                ? `<button class="secondary" type="submit" name="intent" value="recap-unpublish">Hide recap</button><span class="state completed">Recap is on the site</span>`
                : `<button class="primary" type="submit" name="intent" value="recap-publish"${canRecap ? "" : " disabled"}>Publish recap</button>${canRecap ? "" : `<span class="help">${status !== "published" ? esc(CAL_COPY.recapNotPublished) : esc(CAL_COPY.recapEarly)}</span>`}`
            }</div>`
          : ""
      }
    </div>
  </section>`;

  const slugValue = values.slug || event?.slug || "";
  // Unique id (given on first save, never edited) goes before the title in the pop-up link.
  const uidPrefix = event?.uid ? `${event.uid}-` : "";
  const publicSlug = slugValue ? uidPrefix + slugValue : "";
  const popupPath = `/theme-of-the-year?event=${publicSlug || "…"}`;
  const seo = `<section class="tab-panel" id="tab-seo" role="tabpanel" aria-labelledby="t-seo">
    <div class="panel">
      <h2 class="seo-sub">Search and sharing <span class="muted">(meta title &amp; description)</span></h2>
      <p class="help seo-lead">How this event’s link looks on Google and WhatsApp.</p>
      <div class="seo-grid event-seo-grid">
        <div class="field span-2">
          <label for="slug">Event link <span class="muted">(opens this event’s pop-up)</span></label>
          <div class="slug event-slug"><span title="https://www.wellspringsacademy.in/theme-of-the-year?event=">/theme-of-the-year?event=</span><span id="slug-uid" class="slug-uid" title="Unique id: set once, cannot be changed">${esc(uidPrefix)}</span><input id="slug" name="slug" type="text" maxlength="100" spellcheck="false" autocapitalize="off" autocomplete="off" value="${esc(slugValue)}" placeholder="2026-06-12-sports-day"></div>
          <span class="help">${
            event?.slug_locked
              ? "Small letters, numbers and hyphens. Changing it breaks links already shared."
              : "Small letters, numbers and hyphens. Fills itself in until you publish."
          } ${uidPrefix ? "The id before it is unique to this event and cannot be changed." : "A unique id is put before it on first save."}</span>
        </div>
        <div class="field">
          <label for="seoTitle">Search title</label>
          <input id="seoTitle" name="seoTitle" type="text" maxlength="200" value="${esc(values.seoTitle)}" placeholder="${esc(autoEventSeoTitle(values.title || "Title", year.theme_name))}">
          <div class="field-foot"><span class="help">Empty = filled in on save.</span>${counter("seoTitle", 200, 60)}</div>
        </div>
        <div class="field">
          <label for="seoDescription">Search description</label>
          <input id="seoDescription" name="seoDescription" type="text" maxlength="300" value="${esc(values.seoDescription)}" placeholder="Filled from the subtitle">
          <div class="field-foot"><span class="help">Empty = the subtitle.</span>${counter("seoDescription", 300, 155)}</div>
        </div>
      </div>
      <div class="google-result">
        <p class="google-url" id="g-url">wellspringsacademy.in › theme-of-the-year?event=${esc(publicSlug)}</p>
        <p class="google-title" id="g-title">${esc(seoTitle)}</p>
        <p class="google-description" id="g-desc">${esc(seoDescription)}</p>
      </div>
      <h3 class="seo-sub">More search settings</h3>
      ${seoExtrasHtml(
        {
          keywords: values.seoKeywords,
          canonical: values.seoCanonical,
          noindex: values.seoNoindex,
          author: "",
          schemaType: values.seoSchemaType,
          schemaJson: values.seoSchemaJson,
        },
        {
          kind: "event",
          autoCanonical: absolute(popupPath),
          author: false,
          autoAuthor: SCHOOL_NAME,
          pageLabel: "this event",
          jsonLd: eventJsonLd(values, publicSlug, seoTitle, seoDescription, photos[0]?.thumb ?? ""),
        },
      )}
    </div>
  </section>`;

  const primary =
    status === "draft"
      ? `<button class="secondary" type="submit" name="intent" value="save">Save draft</button>
         <button class="primary" type="submit" name="intent" value="publish">Publish</button>`
      : status === "published"
        ? `<button class="primary" type="submit" name="intent" value="save">Save</button>
           <button class="secondary" type="submit" name="intent" value="unpublish" data-confirm="Unpublish this event? It comes off the site.">Unpublish</button>
           <button class="secondary danger" type="submit" name="intent" value="cancel" data-confirm="Cancel this event? It stays on the site, marked Cancelled.">Cancel event</button>`
        : `<button class="primary" type="submit" name="intent" value="save">Save</button>
           <button class="secondary" type="submit" name="intent" value="publish">Restore as published</button>
           <button class="secondary" type="submit" name="intent" value="unpublish">Move to drafts</button>`;

  return `<header class="page-head editor-head">
      <a class="back" href="/admin/calendar/events?month=${esc(values.startDate.slice(0, 7))}">← All events</a>
      ${eyebrow(event ? STATE_LABEL[state] : "New event")}
      <h1>${esc(values.title || "New event")}</h1>
      <p class="intro">${status === "draft" ? "Nothing is public until you publish." : status === "published" ? "This event is on the site." : "This event shows on the site as cancelled."}</p>
    </header>
    ${banner(model.error, model.notice)}
    <div class="tabs" role="tablist">
      <button type="button" role="tab" id="t-plan" aria-controls="tab-plan" data-tab="plan">The plan</button>
      <button type="button" role="tab" id="t-after" aria-controls="tab-after" data-tab="after">After the event</button>
      <button type="button" role="tab" id="t-seo" aria-controls="tab-seo" data-tab="seo">SEO</button>
    </div>
    <form id="event-form" method="post" action="${action}" novalidate data-id="${esc(id)}" data-status="${esc(status)}" data-tab="${esc(model.tab)}" data-theme="${esc(year.theme_name)}" data-count="${photos.length}" data-max="${MAX_PHOTOS}">
      ${plan}
      ${after}
      ${seo}
      <div class="publish-bar">
        <div class="bar-actions">
          ${primary}
          ${event ? `<a class="button secondary" id="preview-link" href="/admin/calendar/events/${esc(id)}/preview">Preview</a>` : ""}
          ${event && status === "draft" ? `<button class="secondary danger" type="submit" form="delete-form" data-confirm="Delete this draft and its photos? This cannot be undone.">Delete</button>` : ""}
        </div>
        <p id="missing-line" class="warn" role="status"></p>
      </div>
    </form>
    ${event && status === "draft" ? `<form id="delete-form" method="post" action="/admin/calendar/events/${esc(id)}/delete" hidden></form>` : ""}`;
}

function lastDay(monthStart: string): string {
  const [year, month] = monthStart.slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/** Live pop-up link in the Google preview, plus the shared SEO block's script. */
export const EVENT_SEO_SCRIPT = `
(function () {
  var slug = document.getElementById("slug");
  var url = document.getElementById("g-url");
  if (slug && url) slug.addEventListener("input", function () {
    var clean = slug.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-");
    if (clean !== slug.value) slug.value = clean;
    var uid = document.getElementById("slug-uid");
    url.textContent = "wellspringsacademy.in › theme-of-the-year?event=" + (uid ? uid.textContent : "") + clean;
  });
})();
` + SEO_EXTRAS_SCRIPT;

export const EDITOR_SCRIPT = `
(function () {
  var form = document.getElementById("event-form");
  if (!form) return;
  var eventId = form.getAttribute("data-id");
  var theme = form.getAttribute("data-theme");
  var dirty = false;
  // Choosing photos is not an edit to the form (they upload on their own).
  form.addEventListener("input", function (event) { if (event.target && event.target.type === "file") return; dirty = true; });

  // Tabs
  var tabs = Array.prototype.slice.call(document.querySelectorAll("[data-tab]")).filter(function (el) { return el.tagName === "BUTTON"; });
  function show(name) {
    tabs.forEach(function (tab) {
      var on = tab.getAttribute("data-tab") === name;
      tab.setAttribute("aria-selected", on ? "true" : "false");
      tab.tabIndex = on ? 0 : -1;
      var panel = document.getElementById(tab.getAttribute("aria-controls"));
      if (panel) panel.setAttribute("data-hidden", on ? "false" : "true");
    });
  }
  tabs.forEach(function (tab, index) {
    tab.addEventListener("click", function () { show(tab.getAttribute("data-tab")); });
    tab.addEventListener("keydown", function (event) {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      var next = tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      next.focus();
      show(next.getAttribute("data-tab"));
    });
  });
  show(form.getAttribute("data-tab") || "plan");

  // Counters
  Array.prototype.forEach.call(document.querySelectorAll(".count[data-max]"), function (el) {
    var input = document.getElementById(el.id.replace(/-count$/, ""));
    if (!input) return;
    var warn = Number(el.getAttribute("data-warn"));
    var max = Number(el.getAttribute("data-max"));
    function update() {
      var n = input.value.length;
      el.textContent = n + " / " + (warn < max ? "about " + warn : max);
      el.classList.toggle("warn", n > warn);
    }
    input.addEventListener("input", update);
    update();
  });

  // Google preview
  var title = document.getElementById("title");
  var subtitle = document.getElementById("subtitle");
  var body = document.getElementById("body");
  var seoTitle = document.getElementById("seoTitle");
  var seoDescription = document.getElementById("seoDescription");
  function preview() {
    var t = seoTitle.value.trim() || ((title.value.trim() || "Event title") + " — " + theme + " | Wellsprings Academy");
    var d = seoDescription.value.trim() || subtitle.value.trim() || body.value.replace(/\\s+/g, " ").trim().slice(0, 155);
    document.getElementById("g-title").textContent = t;
    document.getElementById("g-desc").textContent = d;
    seoTitle.placeholder = (title.value.trim() || "Title") + " — " + theme + " | Wellsprings Academy";
  }
  [title, subtitle, body, seoTitle, seoDescription].forEach(function (el) { el.addEventListener("input", preview); });

  // Moved from
  var start = document.getElementById("startDate");
  var moved = document.getElementById("moved-box");
  if (moved) {
    start.addEventListener("change", function () {
      if (start.value !== start.getAttribute("data-saved")) {
        moved.hidden = false;
        moved.querySelector("input").checked = true;
      }
    });
  }

  // Grade suggestion
  var suggest = document.getElementById("suggest-grades");
  if (suggest) {
    suggest.addEventListener("click", function () {
      var group = Array.prototype.slice.call(document.querySelectorAll("fieldset[data-group]")).filter(function (el) {
        return el.getAttribute("data-group").toLowerCase() === "grade";
      })[0];
      if (!group) return;
      var names = Array.prototype.slice.call(group.querySelectorAll("input:checked")).map(function (el) { return el.getAttribute("data-name"); });
      if (!names.length) return;
      var label = names.length === 1 ? names[0] : names[0] + " – " + names[names.length - 1];
      document.getElementById("gradesLabel").value = label.slice(0, 40);
      dirty = true;
    });
  }

  // Missing fields before publish
  var line = document.getElementById("missing-line");
  form.addEventListener("submit", function (event) {
    var submitter = event.submitter;
    var intent = submitter ? submitter.value : "save";
    if (submitter && submitter.getAttribute("form") === "delete-form") return;
    var missing = [];
    if (!title.value.trim()) missing.push("a title");
    if (!start.value) missing.push("a start date");
    if (!form.querySelector("input[name=strandId]:checked")) missing.push("a strand");
    var publishing = intent === "publish" || (intent === "save" && form.getAttribute("data-status") === "published");
    if (publishing && !body.value.trim()) missing.push("the plan");
    if (missing.length) {
      event.preventDefault();
      line.textContent = "Add " + missing.join(", ") + (publishing ? " before publishing." : ".");
      show("plan");
      return;
    }
    dirty = false;
  });

  // Photos
  var list = document.getElementById("photo-list");
  var files = document.getElementById("photo-files");
  if (!list || !files || !eventId) return;
  var max = Number(form.getAttribute("data-max"));
  var message = document.getElementById("photo-message");
  var log = document.getElementById("upload-log");

  function api(method, url, body, isJson) {
    var options = { method: method, credentials: "same-origin", headers: { Accept: "application/json" } };
    if (body) {
      if (isJson) { options.headers["Content-Type"] = "application/json"; options.body = JSON.stringify(body); }
      else options.body = body;
    }
    return fetch(url, options).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (json) { return { ok: response.ok, status: response.status, json: json }; });
    });
  }

  files.addEventListener("change", function () {
    var selected = Array.prototype.slice.call(files.files || []);
    if (!selected.length) return;
    if (dirty && !window.confirm("You have unsaved changes. Uploading reloads the page; after it, press Restore to get your changes back. Continue?")) {
      files.value = "";
      return;
    }
    var free = Math.max(0, max - list.children.length);
    var take = selected.slice(0, free);
    var skipped = selected.length - take.length;
    message.textContent = skipped > 0 ? max + " photos per event. " + skipped + (skipped === 1 ? " was" : " were") + " not uploaded." : "";
    files.disabled = true;
    log.innerHTML = "";
    var uploaded = 0;
    var recapHidden = false;
    var chain = Promise.resolve(true);
    take.forEach(function (file) {
      chain = chain.then(function (keepGoing) {
        if (!keepGoing) return false;
        var item = document.createElement("li");
        item.textContent = file.name + " — uploading…";
        log.appendChild(item);
        var data = new FormData();
        data.append("file", file);
        return api("POST", "/api/admin/calendar/events/" + eventId + "/photos", data, false).then(function (result) {
          if (result.ok) {
            uploaded += 1;
            if (result.json.recapHidden) recapHidden = true;
            item.className = "ok";
            item.textContent = file.name + " — uploaded";
            return true;
          }
          item.className = "fail";
          item.textContent = file.name + " — " + (result.json.error || "not uploaded");
          return result.status !== 409;
        }).catch(function () {
          item.className = "fail";
          item.textContent = file.name + " — not uploaded";
          return true;
        });
      });
    });
    chain.then(function () {
      if (uploaded > 0) {
        var notice = recapHidden ? "photos-recap" : "photos";
        var extra = skipped > 0 ? "&skipped=" + skipped : "";
        window.location.assign("/admin/calendar/events/" + eventId + "?tab=after&notice=" + notice + extra);
      } else {
        files.disabled = false;
        files.value = "";
      }
    });
  });

  function ids() {
    return Array.prototype.map.call(list.children, function (li) { return li.getAttribute("data-id"); });
  }
  function saveOrder(status) {
    return api("POST", "/api/admin/calendar/events/" + eventId + "/photos/order", { ids: ids() }, true).then(function (result) {
      if (status) status.textContent = result.ok ? "Order saved." : (result.json.error || "Order not saved.");
    });
  }

  list.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-act]");
    if (!button) return;
    var li = button.closest("li");
    var status = li.querySelector(".photo-status");
    var act = button.getAttribute("data-act");
    var id = li.getAttribute("data-id");
    if (act === "up" && li.previousElementSibling) { list.insertBefore(li, li.previousElementSibling); button.focus(); saveOrder(status); }
    if (act === "down" && li.nextElementSibling) { list.insertBefore(li.nextElementSibling, li); button.focus(); saveOrder(status); }
    if (act === "save") {
      var alt = li.querySelector(".photo-alt").value.trim();
      var caption = li.querySelector(".photo-caption").value.trim();
      api("PATCH", "/api/admin/calendar/photos/" + id, { alt: alt, caption: caption }, true).then(function (result) {
        status.textContent = result.ok ? "Saved." : (result.json.error || "Not saved.");
        status.className = "photo-status help " + (result.ok ? "notice" : "error");
      });
    }
    if (act === "delete") {
      if (!window.confirm("Delete this photo? This cannot be undone.")) return;
      api("DELETE", "/api/admin/calendar/photos/" + id, null, false).then(function (result) {
        if (!result.ok) { status.textContent = result.json.error || "Not deleted."; return; }
        li.remove();
        document.getElementById("slots").textContent = list.children.length + " of " + max;
        files.disabled = list.children.length >= max;
        if (result.json.recapHidden) window.location.assign("/admin/calendar/events/" + eventId + "?tab=after&notice=recap-hidden");
      });
    }
  });

  var dragged = null;
  list.addEventListener("dragstart", function (event) {
    dragged = event.target.closest("li");
    if (dragged) dragged.classList.add("dragging");
  });
  list.addEventListener("dragend", function () {
    if (dragged) dragged.classList.remove("dragging");
    Array.prototype.forEach.call(list.children, function (li) { li.classList.remove("drop-target"); });
    dragged = null;
  });
  list.addEventListener("dragover", function (event) {
    var over = event.target.closest("li");
    if (!dragged || !over || over === dragged) return;
    event.preventDefault();
    Array.prototype.forEach.call(list.children, function (li) { li.classList.toggle("drop-target", li === over); });
  });
  list.addEventListener("drop", function (event) {
    var over = event.target.closest("li");
    if (!dragged || !over || over === dragged) return;
    event.preventDefault();
    var items = Array.prototype.slice.call(list.children);
    if (items.indexOf(dragged) < items.indexOf(over)) list.insertBefore(dragged, over.nextElementSibling);
    else list.insertBefore(dragged, over);
    saveOrder(dragged.querySelector(".photo-status"));
  });
})();
` + autosaveScript("event-form", "event", "data-id", "notice");

// ---- Preview -----------------------------------------------------------

export function previewBody(event: EventRow, strand: FilterRow | undefined, photos: PhotoRow[], today: string): string {
  const state = eventState(event, today);
  const cls = colorClass(strand?.color_key);
  const paragraphs = event.body
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p class="body">${esc(part)}</p>`)
    .join("");
  const shownPhotos = event.recap_published ? photos : [];
  return `<p class="preview-bar">Only you can see this.${event.recap_published ? "" : photos.length ? " Photos stay hidden until the recap is published." : ""}</p>
  <div class="preview-wrap">
    <a class="back" href="/admin/calendar/events/${esc(event.id)}">← Back to the editor</a>
    <div class="event-card preview-card ${cls}${state === "cancelled" ? " is-cancelled" : ""}">
      <span class="bar" aria-hidden="true"></span>
      <span class="inner">
        <span class="top">${pill(strand)}${state === "draft" ? "" : stateTag(state, shownPhotos.length)}</span>
        <span class="date">${esc(dateRange(event.start_date, event.end_date))}${event.grades_label ? ` · ${esc(event.grades_label)}` : ""}</span>
        ${event.moved_from ? `<span class="moved">Moved from ${esc(shortDate(event.moved_from))}</span>` : ""}
        <h3>${esc(event.title)}</h3>
        ${event.subtitle ? `<p>${esc(event.subtitle)}</p>` : ""}
      </span>
    </div>
    <article class="overlay-box ${cls}">
      <header class="overlay-head">
        ${pill(strand)} <span class="date muted">${esc(dateRange(event.start_date, event.end_date))}${event.grades_label ? ` · ${esc(event.grades_label)}` : ""}</span>
        <h1>${esc(event.title)}</h1>
        ${event.subtitle ? `<p class="sub">${esc(event.subtitle)}</p>` : ""}
      </header>
      <div class="overlay-cols">
        <div>
          <p class="kicker">The plan</p>
          ${paragraphs || '<p class="body muted">No plan yet.</p>'}
          ${event.highlights.length ? `<p class="kicker mt grey">What happens</p><ul>${event.highlights.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>` : ""}
        </div>
        <div>
          <p class="kicker">Event photos <span class="muted">· After the event</span></p>
          ${
            shownPhotos.length
              ? `<div class="photo-carousel" data-carousel>
                  <div class="preview-photos" tabindex="0" aria-label="Event photos, scroll sideways">${shownPhotos.map((photo) => `<img src="${esc(photo.thumb)}" alt="${esc(photo.alt)}" width="${photo.width}" height="${photo.height}" loading="lazy">`).join("")}</div>
                  ${shownPhotos.length > 3 ? `<div class="carousel-nav"><button class="secondary sm icon" type="button" data-dir="-1" aria-label="Previous photos">←</button><span class="carousel-count muted">${shownPhotos.length} photos</span><button class="secondary sm icon" type="button" data-dir="1" aria-label="Next photos">→</button></div>` : ""}
                </div>${event.recap ? `<p class="body">${esc(event.recap)}</p>` : ""}`
              : `<p class="body muted">Photos will be added after the event.</p>`
          }
        </div>
      </div>
    </article>
  </div>`;
}

// ---- Months ------------------------------------------------------------

export function monthsBody(year: YearRow, error: string, notice: string, values?: Record<string, string>): string {
  const lines = values ?? year.month_lines;
  const fields = monthKeys(year.first_month, year.last_month)
    .map(
      (key) => `<div class="field"><label for="m-${key}">${esc(monthLong(key))}</label>
        <input id="m-${key}" name="m-${key}" type="text" maxlength="80" value="${esc(lines[key] ?? "")}" placeholder="Strong Roots · Integrity"></div>`,
    )
    .join("");
  return `<header class="page-head">${eyebrow("Months")}<h1>The line for each month.</h1>
      <p class="intro">Shown under the month name on the calendar.</p></header>
    ${banner(error, notice)}
    <form class="panel" method="post" action="/admin/calendar/months">
      <div class="months-grid">${fields}</div>
      <div class="publish-bar"><button class="primary" type="submit">Save months</button></div>
    </form>`;
}

// ---- Filters -----------------------------------------------------------

function swatchPicker(name: string, selected: string | null, idPrefix: string): string {
  return `<div class="swatches" role="radiogroup" aria-label="Colour">${COLOR_KEYS.map(
    (key) => `<label class="swatch c-${key}"><input type="radio" name="${name}" value="${key}" id="${idPrefix}-${key}"${selected === key ? " checked" : ""}><span><i aria-hidden="true"></i>${key}</span></label>`,
  ).join("")}</div>`;
}

const OPT_STEP = 6;

export function filtersBody(groups: Array<{ group: FilterRow; options: FilterRow[] }>, usage: Map<string, number>, error: string, notice: string): string {
  const entry = groups.find(({ group }) => group.is_main);
  if (!entry) {
    return `<header class="page-head">${eyebrow("Strands")}<h1>How parents filter the year.</h1></header>${banner(error, notice)}`;
  }
  const { group, options } = entry;
  const gid = esc(group.id);
  const cards = options
    .map((option, index) => {
      const oid = esc(option.id);
      const used = usage.get(option.id) ?? 0;
      return `<li class="opt-card ${colorClass(option.color_key)}${option.active ? "" : " row-hidden"}" id="opt-${oid}"${index >= OPT_STEP ? " hidden" : ""}>
        <form method="post" action="/admin/calendar/filters/${oid}">
          <div class="opt-top">
            <div class="field grow"><label for="o-${oid}">Name</label>
              <input id="o-${oid}" name="name" type="text" maxlength="40" required value="${esc(option.name)}"></div>
            <div class="field opt-shown-field"><span class="label">On the site</span>
              <label class="check opt-shown"><input type="checkbox" name="active"${option.active ? " checked" : ""}> Shown</label></div>
          </div>
          <span class="label opt-colour-label">Colour<span class="req" aria-hidden="true">*</span></span>
          ${swatchPicker("colorKey", option.color_key, `c-${option.id}`)}
          <div class="opt-actions">
            <div class="opt-actions-left">
              <button class="primary sm" type="submit">Save</button>
              <button class="secondary sm icon" type="submit" name="dir" value="up" formaction="/admin/calendar/filters/${oid}/move" aria-label="Move ${esc(option.name)} up"${index === 0 ? " disabled" : ""}>↑</button>
              <button class="secondary sm icon" type="submit" name="dir" value="down" formaction="/admin/calendar/filters/${oid}/move" aria-label="Move ${esc(option.name)} down"${index === options.length - 1 ? " disabled" : ""}>↓</button>
            </div>
            <div class="opt-actions-right">
              <span class="opt-used">${used ? `Used by ${used}` : "Not used"}</span>
              <button class="secondary sm danger" type="submit" formaction="/admin/calendar/filters/${oid}/delete" data-confirm="Delete “${esc(option.name)}”?"${used ? ' disabled title="In use. Untick Shown to hide it instead."' : ""}>Delete</button>
            </div>
          </div>
        </form>
      </li>`;
    })
    .join("");
  const shown = options.filter((option) => option.active).length;
  const extra = Math.max(0, options.length - OPT_STEP);
  return `<header class="page-head">${eyebrow("Strands")}<h1>How parents filter the year.</h1>
      <p class="intro">Every event and rhythm card has one “${esc(group.name)}”. It colours the card and is the filter row on the website. An option in use can’t be deleted — untick Shown to hide it.</p></header>
    ${banner(error, notice)}
    <section class="panel filter-head">
      <form class="inline-form" method="post" action="/admin/calendar/filters/${gid}">
        <div class="field grow"><label for="g-${gid}">Group name <span class="muted">(shown as “Filter by …” on the website)</span></label>
          <input id="g-${gid}" name="name" type="text" maxlength="40" required value="${esc(group.name)}"></div>
        <button class="secondary" type="submit">Rename</button>
      </form>
      <p class="help">${options.length} option${options.length === 1 ? "" : "s"} · ${shown} shown on the site</p>
    </section>
    <div class="opt-new-wrap">
      <form class="opt-card opt-new" method="post" action="/admin/calendar/filters/${gid}/options">
        <div class="opt-top">
          <div class="field grow"><label for="new-${gid}">New option</label>
            <input id="new-${gid}" name="name" type="text" maxlength="40" required placeholder="Sports"></div>
          <button class="primary opt-add" type="submit">+ Add option</button>
        </div>
        <span class="label opt-colour-label">Colour<span class="req" aria-hidden="true">*</span> <span class="muted">(pick one)</span></span>
        ${swatchPicker("colorKey", null, `n-${group.id}`)}
      </form>
    </div>
    <ul class="opt-grid" id="opt-list">
      ${cards}
    </ul>
    ${extra ? `<button class="secondary more-btn" type="button" data-more="opt-list" data-step="${OPT_STEP}" aria-controls="opt-list">Show more <span class="muted">(<span class="more-count">${extra}</span> more)</span></button>` : ""}`;
}

// ---- Rhythm ------------------------------------------------------------

function strandSelect(name: string, id: string, strands: FilterRow[], selected: string): string {
  return `<select id="${id}" name="${name}" required>${strands
    .filter((row) => row.active || row.id === selected)
    .map((row) => `<option value="${esc(row.id)}"${row.id === selected ? " selected" : ""}>${esc(row.name)}</option>`)
    .join("")}</select>`;
}

const RHYTHM_STEP = 4;

export function rhythmBody(
  cards: RhythmRow[],
  strands: FilterRow[],
  error: string,
  notice: string,
  strandLabel = "Strand",
  open = "",
  draft?: Record<string, string>,
): string {
  const byId = new Map(strands.map((row) => [row.id, row]));
  const shown = cards.filter((card) => card.active).length;
  const n = draft ?? {};
  // Show the first few cards; the rest open with "Show more". A card being edited is never folded away.
  const openIndexVisible = cards.findIndex((card) => card.id === open) >= RHYTHM_STEP;
  const extra = openIndexVisible ? 0 : Math.max(0, cards.length - RHYTHM_STEP);
  const items = cards
    .map((card, index) => {
      const cid = esc(card.id);
      const strand = byId.get(card.strand_id);
      const editOpen = open === card.id;
      const folded = index >= RHYTHM_STEP && !openIndexVisible;
      return `<li class="r-card${card.active ? "" : " row-hidden"} ${colorClass(strand?.color_key)}" id="r-${cid}"${folded ? " hidden" : ""}>
        <div class="r-main">
          ${card.photo ? `<img class="r-thumb" src="${esc(card.photo)}" alt="" width="96" height="72" loading="lazy">` : `<span class="r-thumb blank" aria-hidden="true"></span>`}
          <div class="r-text">
            <div class="r-meta">${pill(strand)}<span class="r-when">${esc(card.when_label)}</span>${card.active ? "" : `<span class="state draft">Hidden</span>`}</div>
            <h3>${esc(card.title)}</h3>
            <p class="r-body">${esc(card.body)}</p>
          </div>
        </div>
        <div class="r-actions">
          <button class="secondary sm" type="button" data-edit="${cid}" aria-expanded="${editOpen ? "true" : "false"}" aria-controls="re-${cid}">Edit</button>
          <form method="post" action="/admin/calendar/rhythm/${cid}/move"><input type="hidden" name="dir" value="up"><button class="secondary sm icon" type="submit" aria-label="Move ${esc(card.title)} up"${index === 0 ? " disabled" : ""}>↑</button></form>
          <form method="post" action="/admin/calendar/rhythm/${cid}/move"><input type="hidden" name="dir" value="down"><button class="secondary sm icon" type="submit" aria-label="Move ${esc(card.title)} down"${index === cards.length - 1 ? " disabled" : ""}>↓</button></form>
          <form class="r-delete" method="post" action="/admin/calendar/rhythm/${cid}/delete" data-confirm="Delete the card “${esc(card.title)}”?"><button class="secondary sm danger" type="submit">Delete</button></form>
        </div>
        <div class="r-edit" id="re-${cid}"${editOpen ? "" : " hidden"}>
          <form method="post" action="/admin/calendar/rhythm/${cid}">
            <div class="r-grid">
              <div class="field"><label for="rs-${cid}">${esc(strandLabel)}</label>${strandSelect("strandId", `rs-${card.id}`, strands, card.strand_id)}</div>
              <div class="field"><label for="rw-${cid}">When</label><input id="rw-${cid}" name="whenLabel" type="text" maxlength="40" required value="${esc(card.when_label)}"></div>
              <div class="field span2"><label for="rt-${cid}">Title</label><input id="rt-${cid}" name="title" type="text" maxlength="60" required value="${esc(card.title)}"></div>
              <div class="field span2"><label for="rb-${cid}">Text</label><textarea id="rb-${cid}" class="short" name="body" maxlength="300" required rows="3">${esc(card.body)}</textarea></div>
              <div class="field"><label for="rc-${cid}">Photo caption</label><input id="rc-${cid}" name="caption" type="text" maxlength="60" value="${esc(card.caption)}"></div>
              <div class="field"><label for="ra-${cid}">Photo alt text</label><input id="ra-${cid}" name="photoAlt" type="text" maxlength="160" value="${esc(card.photo_alt)}"></div>
            </div>
            <div class="r-save">
              <label class="check"><input type="checkbox" name="active"${card.active ? " checked" : ""}> Shown on the site</label>
              <div class="bar-actions">
                <button class="secondary sm" type="button" data-edit="${cid}">Close</button>
                <button class="primary sm" type="submit">Save card</button>
              </div>
            </div>
          </form>
          <div class="r-photo">
            <label for="rp-${cid}">${card.photo ? "Replace photo" : "Add a photo"} <span class="muted">(landscape, cropped to 4:3)</span></label>
            <div class="r-photo-row">
              <input id="rp-${cid}" class="rhythm-file" type="file" accept="image/jpeg,image/png,image/webp" data-id="${cid}">
              ${card.photo ? `<form method="post" action="/admin/calendar/rhythm/${cid}/photo/remove" data-confirm="Remove the photo?"><button class="secondary sm" type="submit">Remove photo</button></form>` : ""}
            </div>
            <p class="help" role="status"></p>
          </div>
        </div>
      </li>`;
    })
    .join("");
  const newOpen = open === "new" || !cards.length;
  return `<header class="page-head r-head">
      <div>${eyebrow("All-year rhythm")}<h1>The parts of the year without a date.</h1>
        <p class="intro">${cards.length} card${cards.length === 1 ? "" : "s"} · ${shown} shown on the site. Use ↑ ↓ to set the order parents see.</p></div>
      <button class="primary" type="button" id="r-new-toggle" aria-expanded="${newOpen ? "true" : "false"}" aria-controls="r-new">+ New card</button>
    </header>
    ${banner(error, notice)}
    <form class="panel r-new" id="r-new" method="post" action="/admin/calendar/rhythm"${newOpen ? "" : " hidden"}>
      <div class="r-new-head"><h2>New card</h2><span class="help">Add a photo after you save.</span></div>
      <div class="r-grid four">
        <div class="field"><label for="n-strand">${esc(strandLabel)}</label>${strandSelect("strandId", "n-strand", strands, n.strandId ?? "")}</div>
        <div class="field"><label for="n-when">When</label><input id="n-when" name="whenLabel" type="text" maxlength="40" required placeholder="Every morning" value="${esc(n.whenLabel ?? "")}"></div>
        <div class="field span2"><label for="n-title">Title</label><input id="n-title" name="title" type="text" maxlength="60" required value="${esc(n.title ?? "")}"></div>
        <div class="field span4"><label for="n-body">Text</label><textarea id="n-body" class="short" name="body" maxlength="300" required rows="2">${esc(n.body ?? "")}</textarea></div>
        <div class="field span2"><label for="n-caption">Photo caption <span class="muted">(optional)</span></label><input id="n-caption" name="caption" type="text" maxlength="60" value="${esc(n.caption ?? "")}"></div>
        <div class="field span2"><label for="n-alt">Photo alt text <span class="muted">(optional)</span></label><input id="n-alt" name="photoAlt" type="text" maxlength="160" value="${esc(n.photoAlt ?? "")}"></div>
      </div>
      <div class="r-save"><span></span><div class="bar-actions">
        ${cards.length ? `<button class="secondary sm" type="button" id="r-new-cancel">Cancel</button>` : ""}
        <button class="primary sm" type="submit">Add card</button></div></div>
    </form>
    ${
      cards.length
        ? `<ul class="r-list" id="r-list">${items}</ul>${
            extra
              ? `<button class="secondary more-btn" type="button" data-more="r-list" data-step="${RHYTHM_STEP}" aria-controls="r-list">Show more <span class="muted">(<span class="more-count">${extra}</span> more)</span></button>`
              : ""
          }`
        : `<p class="empty-month">No cards yet. Add the first one above.</p>`
    }`;
}

export const RHYTHM_SCRIPT = `
(function () {
  function toggle(id, force) {
    var box = document.getElementById("re-" + id);
    if (!box) return;
    var show = typeof force === "boolean" ? force : box.hidden;
    // Only one card is open for editing at a time: opening this one puts the others back as they were.
    if (show) {
      Array.prototype.forEach.call(document.querySelectorAll(".r-edit:not([hidden])"), function (other) {
        if (other !== box) toggle(other.id.replace(/^re-/, ""), false);
      });
      showNew(false);
    }
    box.hidden = !show;
    var card = document.getElementById("r-" + id);
    if (card) card.classList.toggle("is-editing", show);
    Array.prototype.forEach.call(document.querySelectorAll('[data-edit="' + id + '"][aria-expanded]'), function (b) { b.setAttribute("aria-expanded", show ? "true" : "false"); });
    if (show) { var first = box.querySelector("select, input, textarea"); if (first) first.focus(); }
  }
  document.addEventListener("click", function (event) {
    var button = event.target.closest && event.target.closest("[data-edit]");
    if (button) toggle(button.getAttribute("data-edit"));
  });
  Array.prototype.forEach.call(document.querySelectorAll(".r-edit:not([hidden])"), function (box) {
    var card = box.closest(".r-card");
    if (card) { card.classList.add("is-editing"); card.scrollIntoView({ block: "start" }); }
  });
  var newForm = document.getElementById("r-new");
  var newToggle = document.getElementById("r-new-toggle");
  function showNew(show) {
    if (!newForm) return;
    if (show) Array.prototype.forEach.call(document.querySelectorAll(".r-edit:not([hidden])"), function (other) { toggle(other.id.replace(/^re-/, ""), false); });
    newForm.hidden = !show;
    if (newToggle) newToggle.setAttribute("aria-expanded", show ? "true" : "false");
    if (show) { var f = document.getElementById("n-when"); if (f) f.focus(); }
  }
  if (newToggle) newToggle.addEventListener("click", function () { showNew(newForm.hidden); });
  var cancel = document.getElementById("r-new-cancel");
  if (cancel) cancel.addEventListener("click", function () { showNew(false); });
  var hash = window.location.hash.replace(/^#r-/, "");
  if (hash && /^[0-9a-f-]{36}$/i.test(hash)) {
    var target = document.getElementById("r-" + hash);
    if (target && target.hidden) {
      Array.prototype.forEach.call(document.querySelectorAll("#r-list > li[hidden]"), function (li) { li.hidden = false; });
      var more = document.querySelector('[data-more="r-list"]');
      if (more) more.hidden = true;
    }
    if (target) { target.classList.add("r-flash"); target.scrollIntoView({ block: "center" }); }
  }
})();
`;

export const UPLOAD_SCRIPT = `
Array.prototype.forEach.call(document.querySelectorAll("input[type=file][data-url], input.rhythm-file"), function (input) {
  input.addEventListener("change", function () {
    var file = input.files && input.files[0];
    if (!file) return;
    var status = input.parentElement.querySelector("[role=status]");
    var url = input.getAttribute("data-url") || ("/api/admin/calendar/rhythm/" + input.getAttribute("data-id") + "/photo");
    var data = new FormData();
    data.append("file", file);
    input.disabled = true;
    if (status) status.textContent = "Uploading…";
    fetch(url, { method: "POST", body: data, credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(function (response) { return response.json().catch(function () { return {}; }).then(function (json) { return { ok: response.ok, json: json }; }); })
      .then(function (result) {
        if (result.ok) { window.location.assign(window.location.pathname + "?notice=photo"); return; }
        if (status) status.textContent = result.json.error || "Not uploaded.";
        input.disabled = false;
        input.value = "";
      })
      .catch(function () {
        if (status) status.textContent = "Not uploaded.";
        input.disabled = false;
      });
  });
});
`;

// ---- Settings (theme) --------------------------------------------------

export function settingsBody(year: YearRow, error: string, notice: string, values?: { themeName: string }): string {
  const v = values ?? { themeName: year.theme_name };
  return `<header class="page-head">${eyebrow("Theme")}<h1>The theme of the year.</h1>
      <p class="intro">Shown large in the hero of /theme-of-the-year, as “Theme of the Year · ${esc(year.label)}”.</p></header>
    ${banner(error, notice)}
    <form class="panel" method="post" action="/admin/calendar/settings">
      <div class="inline-form">
        <div class="field grow"><label for="themeName">Theme name</label><input id="themeName" name="themeName" type="text" maxlength="40" required value="${esc(v.themeName)}" placeholder="Roots to Wings"></div>
        <button class="primary" type="submit">Save</button>
      </div>
      <p class="help">The year label and months are set on <a href="/admin/calendar/years">Years</a>.</p>
      <div class="spacer"></div>
    </form>
    <section class="panel link-panel">
      <div>
        <h2>Search &amp; sharing</h2>
        <p class="help">Google title, description, keywords, canonical link and the share image for /theme-of-the-year now live in one place with the blog’s.</p>
      </div>
      <a class="button secondary" href="/admin/site?page=calendar">Open Site &amp; SEO · Calendar</a>
    </section>`;
}

export const COUNTER_SCRIPT = `
Array.prototype.forEach.call(document.querySelectorAll(".count[data-max]"), function (el) {
  var input = document.getElementById(el.id.replace(/-count$/, ""));
  if (!input) return;
  var warn = Number(el.getAttribute("data-warn"));
  function update() { el.textContent = input.value.length + " / about " + warn; el.classList.toggle("warn", input.value.length > warn); }
  input.addEventListener("input", update);
  update();
});
`;

// ---- Years -------------------------------------------------------------

function monthOptions(selected: number): string {
  return MONTH_NAMES.map((name, i) => `<option value="${i + 1}"${i + 1 === selected ? " selected" : ""}>${name}</option>`).join("");
}

function startYearOptions(selected: number): string {
  const now = new Date().getFullYear();
  const from = Math.max(2000, Math.min(now - 5, selected || now));
  const to = Math.min(2098, Math.max(now + 6, selected || now));
  let out = "";
  for (let y = from; y <= to; y++) out += `<option value="${y}"${y === selected ? " selected" : ""}>${y}</option>`;
  return out;
}

/** End year choices: the start year up to 5 years after it. */
function endYearOptions(startYear: number, selected: number): string {
  let out = "";
  for (let y = startYear; y <= startYear + 5; y++) out += `<option value="${y}"${y === selected ? " selected" : ""}>${y}</option>`;
  return out;
}

/** Last-month choices: from the first month to December of the end year. */
function lastMonthOptions(startYear: number, endYear: number, startMonth: number, selected: string): string {
  let out = "";
  for (let i = startYear * 12 + startMonth - 1; i <= endYear * 12 + 11; i++) {
    const key = `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
    out += `<option value="${key}"${key === selected ? " selected" : ""}>${MONTH_NAMES[i % 12]}</option>`;
  }
  return out;
}

/** Start year · End year (filled in as the next year, editable) · Start month · Last month. */
function yearFields(prefix: string, d: YearDraft): string {
  const sy = Number(d.startYear) || new Date().getFullYear();
  const eyRaw = Number(d.endYear);
  const ey = eyRaw >= sy && eyRaw <= sy + 5 ? eyRaw : sy + 1;
  const sm = Number(d.startMonth) || 4;
  return `<div class="field"><label for="${prefix}-sy">Start year</label><select id="${prefix}-sy" class="y-start-year" name="startYear">${startYearOptions(sy)}</select></div>
        <div class="field"><label for="${prefix}-ey">End year</label><select id="${prefix}-ey" class="y-end-year" name="endYear">${endYearOptions(sy, ey)}</select></div>
        <div class="field"><label for="${prefix}-sm">Start month</label><select id="${prefix}-sm" class="y-start" name="startMonth">${monthOptions(sm)}</select></div>
        <div class="field"><label for="${prefix}-lm">Last month</label><select id="${prefix}-lm" class="y-last" name="lastMonth">${lastMonthOptions(sy, ey, sm, d.lastMonth)}</select></div>`;
}

function draftOf(year: YearRow): YearDraft {
  return {
    startYear: year.first_month.slice(0, 4),
    endYear: year.last_month.slice(0, 4),
    startMonth: String(Number(year.first_month.slice(5, 7))),
    lastMonth: year.last_month.slice(0, 7),
    themeName: year.theme_name,
  };
}

function spanText(first: string, last: string): string {
  return `${monthLong(first.slice(0, 7))} → ${monthLong(last.slice(0, 7))}`;
}

export type YearDraft = { startYear: string; endYear: string; startMonth: string; lastMonth: string; themeName: string };

export function yearsBody(
  years: YearRow[],
  working: YearRow | null,
  error: string,
  notice: string,
  options: {
    draft?: YearDraft;
    editId?: string;
    editDraft?: YearDraft;
    deleteId?: string;
    usage?: Map<string, { events: number; rhythm: number }>;
  } = {},
): string {
  const next = suggestNext(years[0] ?? working);
  const draft = options.draft ?? { ...next, themeName: working?.theme_name ?? "" };
  const rows = years
    .map((year) => {
      const id = esc(year.id);
      const editing = options.editId === year.id;
      const ed = editing && options.editDraft ? options.editDraft : draftOf(year);
      return `<li class="y-row${working?.id === year.id ? " is-working" : ""}">
        <div class="y-info">
          <div class="y-title"><strong>${esc(year.label)}</strong><span class="y-theme">${esc(year.theme_name)}</span>
            ${year.is_current ? `<span class="state completed">On the site</span>` : ""}${working?.id === year.id ? `<span class="state upcoming">Editing</span>` : ""}</div>
          <div class="when">${esc(spanText(year.first_month, year.last_month))} · ${monthKeys(year.first_month, year.last_month).length} months</div>
        </div>
        <div class="bar-actions">
          <button class="secondary sm" type="button" data-year-edit="${id}" aria-expanded="${editing ? "true" : "false"}" aria-controls="ye-${id}">Change months</button>
          ${working?.id === year.id ? "" : `<form method="post" action="/admin/calendar/years/${id}/select"><button class="secondary sm" type="submit">Edit this year</button></form>`}
          ${year.is_current ? "" : `<form method="post" action="/admin/calendar/years/${id}/current" data-confirm="Make ${esc(year.label)} the year on the site? The other year comes off the site."><button class="primary sm" type="submit">Make current</button></form>`}
          ${year.is_current ? "" : `<button class="secondary sm danger" type="button" data-year-delete="${id}" aria-expanded="${options.deleteId === year.id ? "true" : "false"}" aria-controls="yd-${id}">Delete</button>`}
        </div>
        ${
          year.is_current
            ? ""
            : `<form class="y-delete" id="yd-${id}" method="post" action="/admin/calendar/years/${id}/delete"${options.deleteId === year.id ? "" : " hidden"}>
          <p><strong>Delete ${esc(year.label)} for good?</strong> This removes ${(() => {
            const u = options.usage?.get(year.id) ?? { events: 0, rhythm: 0 };
            return `${u.events} event${u.events === 1 ? "" : "s"} (with their photos), ${u.rhythm} rhythm card${u.rhythm === 1 ? "" : "s"}, its filters and its search details`;
          })()}. It cannot be undone.</p>
          <div class="field"><label for="ydc-${id}">Type <code>${esc(year.label)}</code> to confirm</label>
            <input id="ydc-${id}" name="confirmLabel" type="text" maxlength="20" autocomplete="off" required></div>
          <button class="secondary sm" type="button" data-year-delete="${id}">Keep it</button>
          <button class="primary sm danger-fill" type="submit">Delete year</button>
        </form>`
        }
        <form class="y-edit year-form" id="ye-${id}" method="post" action="/admin/calendar/years/${id}/span"${editing ? "" : " hidden"}>
          ${yearFields(`ye-${id}`, ed)}
          <div class="field y-span"><span class="label">Runs</span><p class="y-preview" aria-live="polite"></p></div>
          <button class="primary sm" type="submit">Save months</button>
          <p class="help y-wide">Every event must stay inside the new months. Month lines for months that drop out are kept, in case you change back.</p>
        </form>
      </li>`;
    })
    .join("");
  return `<header class="page-head">${eyebrow("Years")}<h1>One year on the site at a time.</h1>
      <p class="intro">A new year copies the filters and all-year rhythm cards from the year you are editing. Events are not copied. Old years with events stay listed for parents under “Year” on the website.</p></header>
    ${banner(error, notice)}
    <form class="panel year-create year-form" method="post" action="/admin/calendar/years">
      <div class="y-create-head"><h2>Create the next year</h2><span class="help">Pick the start year (the end year follows), then the first and last month.</span></div>
      <div class="y-create-row">
        ${yearFields("y", draft)}
        <div class="field grow"><label for="y-theme">Theme name</label><input id="y-theme" name="themeName" type="text" maxlength="40" required value="${esc(draft.themeName)}"></div>
        <button class="primary" type="submit">Create year</button>
      </div>
      <p class="y-preview y-create-preview" aria-live="polite"></p>
    </form>
    <section class="panel"><h2 class="y-list-head">All years</h2><ul class="y-list">${rows || "<li>No years yet.</li>"}</ul><div class="spacer"></div></section>`;
}

/** The year after the newest one: same start month, 12 months by default (the admin can change it). */
function suggestNext(year: YearRow | null): { startYear: string; endYear: string; startMonth: string; lastMonth: string } {
  const startYear = year ? Number(year.first_month.slice(0, 4)) + 1 : new Date().getFullYear();
  const startMonth = year ? Number(year.first_month.slice(5, 7)) : 4;
  const end = startYear * 12 + startMonth - 1 + 11;
  return {
    startYear: String(startYear),
    endYear: String(startYear + 1),
    startMonth: String(startMonth),
    lastMonth: `${Math.floor(end / 12)}-${String((end % 12) + 1).padStart(2, "0")}`,
  };
}

export const YEARS_SCRIPT = `
(function () {
  var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  // Start year -> End year is set to the next year (the admin can still change it).
  // Last month: from the first month to December of the end year.
  function preview(form, changed) {
    var sy = form.querySelector(".y-start-year");
    var ey = form.querySelector(".y-end-year");
    var start = form.querySelector(".y-start");
    var last = form.querySelector(".y-last");
    var out = form.querySelector(".y-preview");
    if (!sy || !start || !last) return;
    var y = Number(sy.value);
    var month = Number(start.value);
    var endY = ey ? Number(ey.value) : y + 1;
    if (ey && (changed === sy || endY < y || endY > y + 5)) {
      endY = y + 1;
      var years = "";
      for (var k = y; k <= y + 5; k++) years += '<option value="' + k + '">' + k + "</option>";
      ey.innerHTML = years;
      ey.value = String(endY);
    }
    var keep = last.value;
    var from = y * 12 + month - 1;
    var to = endY * 12 + 11;
    var html = "";
    for (var i = from; i <= to; i++) {
      var key = Math.floor(i / 12) + "-" + String((i % 12) + 1).padStart(2, "0");
      html += '<option value="' + key + '">' + MONTHS[i % 12] + "</option>";
    }
    last.innerHTML = html;
    if (keep && keep >= last.options[0].value && keep <= last.options[last.options.length - 1].value) last.value = keep;
    else last.selectedIndex = Math.min(11, last.options.length - 1);
    if (!out) return;
    var n = last.selectedIndex + 1;
    out.classList.remove("warn");
    out.textContent = MONTHS[month - 1] + " " + y + " → " + last.options[last.selectedIndex].text + " " + last.value.slice(0, 4) + " · " + n + " month" + (n === 1 ? "" : "s") + " · saved as " + (endY === y ? String(y) : y + "–" + String(endY % 100).padStart(2, "0"));
  }
  Array.prototype.forEach.call(document.querySelectorAll(".year-form"), function (form) {
    form.addEventListener("change", function (event) { preview(form, event.target); });
    preview(form);
  });
  // One year panel open at a time: opening "Change months" or "Delete" on a card closes any other.
  function closeOthers(keep) {
    Array.prototype.forEach.call(document.querySelectorAll('[id^="ye-"]:not([hidden]), [id^="yd-"]:not([hidden])'), function (panel) {
      if (panel === keep) return;
      panel.hidden = true;
      var id = panel.id.slice(3);
      var attr = panel.id.indexOf("ye-") === 0 ? "data-year-edit" : "data-year-delete";
      Array.prototype.forEach.call(document.querySelectorAll("[" + attr + '="' + id + '"][aria-expanded]'), function (x) { x.setAttribute("aria-expanded", "false"); });
    });
  }
  document.addEventListener("click", function (event) {
    var d = event.target.closest && event.target.closest("[data-year-delete]");
    if (d) {
      var form = document.getElementById("yd-" + d.getAttribute("data-year-delete"));
      if (form) {
        if (form.hidden) closeOthers(form);
        form.hidden = !form.hidden;
        Array.prototype.forEach.call(document.querySelectorAll('[data-year-delete="' + d.getAttribute("data-year-delete") + '"][aria-expanded]'), function (x) { x.setAttribute("aria-expanded", form.hidden ? "false" : "true"); });
        if (!form.hidden) form.querySelector("input").focus();
      }
      return;
    }
    var b = event.target.closest && event.target.closest("[data-year-edit]");
    if (!b) return;
    var box = document.getElementById("ye-" + b.getAttribute("data-year-edit"));
    if (!box) return;
    if (box.hidden) closeOthers(box);
    box.hidden = !box.hidden;
    b.setAttribute("aria-expanded", box.hidden ? "false" : "true");
    if (!box.hidden) { var f = box.querySelector("input"); if (f) f.focus(); }
  });
})();
`;

export function noYearBody(): string {
  return `<header class="page-head">${eyebrow("Calendar")}<h1>No calendar year yet.</h1>
    <p class="intro">Create the first year on the <a href="/admin/calendar/years">Years</a> screen.</p></header>`;
}
