import { readFileSync } from "node:fs";
import type { EventRow, FilterRow, PhotoRow, RhythmRow, YearRow } from "./db.ts";
import { autosaveScript } from "../autosave.ts";
import {
  CAL_COPY,
  COLOR_KEYS,
  MAX_PHOTOS,
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
    ["filters", "/admin/calendar/filters", "Filters"],
    ["rhythm", "/admin/calendar/rhythm", "All-year rhythm"],
    ["settings", "/admin/calendar/settings", "Page & SEO"],
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
          <h1>${esc(year.theme_name)}</h1>
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
    <form class="filters-row" method="get" action="/admin/calendar/events">
      <input type="hidden" name="month" value="${esc(month)}">
      <div class="field"><label for="f-q">Search the year</label>
        <input id="f-q" name="q" type="search" maxlength="80" autocomplete="off" placeholder="Title, grade, plan…" value="${esc(filter.q ?? "")}"></div>
      <div class="field"><label for="f-strand">Strand</label>
        <select id="f-strand" name="strand"><option value="">All strands</option>${strands
          .map((row) => `<option value="${esc(row.id)}"${row.id === filter.strand ? " selected" : ""}>${esc(row.name)}${row.active ? "" : " (hidden)"}</option>`)
          .join("")}</select></div>
      <div class="field"><label for="f-state">State</label>
        <select id="f-state" name="state">${stateOptions
          .map(([value, label]) => `<option value="${value}"${value === filter.state ? " selected" : ""}>${label}</option>`)
          .join("")}</select></div>
      <button class="secondary" type="submit">${searching ? "Search" : "Filter"}</button>
      ${searching || filter.strand || filter.state ? `<a class="button secondary" href="/admin/calendar/events?month=${esc(month)}">Clear</a>` : ""}
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
    intent: "save",
  };
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
      <legend class="label">Strand</legend>
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
        <label for="body">The plan</label>
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

  const seo = `<section class="tab-panel" id="tab-seo" role="tabpanel" aria-labelledby="t-seo">
    <div class="panel">
      <div class="field">
        <label for="seoTitle">Search title</label>
        <input id="seoTitle" name="seoTitle" type="text" maxlength="200" value="${esc(values.seoTitle)}" placeholder="${esc(autoEventSeoTitle(values.title || "Title", year.theme_name))}">
        ${counter("seoTitle", 200, 60)}
        <span class="help">Leave empty and it is filled in on save. Used when someone shares this event.</span>
      </div>
      <div class="field">
        <label for="seoDescription">Search description</label>
        <textarea id="seoDescription" class="short" name="seoDescription" maxlength="300" rows="3" placeholder="Filled from the subtitle on save">${esc(values.seoDescription)}</textarea>
        ${counter("seoDescription", 300, 155)}
      </div>
      <div class="google-result">
        <p class="google-url">wellspringsacademy.in › theme-of-the-year</p>
        <p class="google-title" id="g-title">${esc(seoTitle)}</p>
        <p class="google-description" id="g-desc">${esc(seoDescription)}</p>
      </div>
      ${event ? `<p class="help">Link: <code>/theme-of-the-year?event=${esc(event.slug)}</code>${event.slug_locked ? " (locked, so shared links keep working)" : " (set from the date and title until the first publish)"}</p>` : ""}
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
              ? `<div class="preview-photos">${shownPhotos.map((photo) => `<img src="${esc(photo.thumb)}" alt="${esc(photo.alt)}" width="${photo.width}" height="${photo.height}" loading="lazy">`).join("")}</div>${event.recap ? `<p class="body">${esc(event.recap)}</p>` : ""}`
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

export function filtersBody(groups: Array<{ group: FilterRow; options: FilterRow[] }>, usage: Map<string, number>, error: string, notice: string): string {
  const sections = groups
    .map(({ group, options }) => {
      const main = group.is_main;
      const optionRows = options
        .map((option) => {
          const used = usage.get(option.id) ?? 0;
          return `<form class="row-form${option.active ? "" : " row-hidden"}" method="post" action="/admin/calendar/filters/${esc(option.id)}">
            <div class="row-line">
              <div class="field grow"><label for="o-${esc(option.id)}">Option</label>
                <input id="o-${esc(option.id)}" name="name" type="text" maxlength="40" required value="${esc(option.name)}"></div>
              <label class="check"><input type="checkbox" name="active"${option.active ? " checked" : ""}> Shown</label>
            </div>
            ${main ? swatchPicker("colorKey", option.color_key, `c-${option.id}`) : ""}
            <div class="row-line">
              <button class="secondary" type="submit">Save</button>
              <button class="secondary" type="submit" name="dir" value="up" formaction="/admin/calendar/filters/${esc(option.id)}/move" aria-label="Move ${esc(option.name)} up">↑</button>
              <button class="secondary" type="submit" name="dir" value="down" formaction="/admin/calendar/filters/${esc(option.id)}/move" aria-label="Move ${esc(option.name)} down">↓</button>
              <button class="secondary danger" type="submit" formaction="/admin/calendar/filters/${esc(option.id)}/delete" data-confirm="Delete “${esc(option.name)}”?"${used ? " disabled title=\"In use. Hide it instead.\"" : ""}>Delete</button>
              <span class="help">${used ? `Used by ${used}` : "Not used"}</span>
            </div>
          </form>`;
        })
        .join("");
      const inner = `
        <form method="post" action="/admin/calendar/filters/${esc(group.id)}">
          ${main ? `<div class="group-head"><h2>${esc(group.name)} <span class="badge">Main · colours the cards</span></h2></div>` : ""}
          <div class="row-line mt">
            <div class="field grow"><label for="g-${esc(group.id)}">Group name</label>
              <input id="g-${esc(group.id)}" name="name" type="text" maxlength="40" required value="${esc(group.name)}"></div>
            ${main ? "" : `<label class="check"><input type="checkbox" name="showOnSite"${group.show_on_site ? " checked" : ""}> Show as a filter row on the site</label>
            <label class="check"><input type="checkbox" name="active"${group.active ? " checked" : ""}> Active</label>`}
          </div>
          <div class="row-line mt mb">
            <button class="secondary" type="submit">Save group</button>
            ${main ? "" : `<button class="secondary" type="submit" name="dir" value="up" formaction="/admin/calendar/filters/${esc(group.id)}/move">↑</button>
            <button class="secondary" type="submit" name="dir" value="down" formaction="/admin/calendar/filters/${esc(group.id)}/move">↓</button>
            <button class="secondary danger" type="submit" formaction="/admin/calendar/filters/${esc(group.id)}/delete" data-confirm="${options.length ? `Delete the group “${esc(group.name)}” and its ${options.length} option${options.length === 1 ? "" : "s"}? This cannot be undone.` : `Delete the group “${esc(group.name)}”?`}">Delete group</button>`}
          </div>
        </form>
        ${optionRows}
        <form class="row-form" method="post" action="/admin/calendar/filters/${esc(group.id)}/options">
          <div class="row-line">
            <div class="field grow"><label for="new-${esc(group.id)}">New option</label>
              <input id="new-${esc(group.id)}" name="name" type="text" maxlength="40" required placeholder="${main ? "Sports" : "Grade 9"}"></div>
          </div>
          ${main ? swatchPicker("colorKey", null, `n-${group.id}`) : ""}
          <div class="row-line"><button class="primary" type="submit">Add option</button></div>
        </form>`;
      if (main) return `<section class="panel">${inner}</section>`;
      const shown = options.filter((option) => option.active).length;
      return `<section class="panel group-panel${group.active ? "" : " row-hidden"}">
        <details class="group-details" data-group-id="${esc(group.id)}">
          <summary class="group-summary">
            <span class="group-title"><span class="group-name">${esc(group.name)}</span>
              <span class="help">${options.length} option${options.length === 1 ? "" : "s"}${options.length !== shown ? ` · ${shown} shown` : ""} · ${group.show_on_site ? "filter row on the site" : "not on the site"}${group.active ? "" : " · inactive"}</span></span>
            <svg class="chevron" viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6"></path></svg>
          </summary>
          <div class="group-body">${inner}</div>
        </details>
      </section>`;
    })
    .join("");
  return `<header class="page-head">${eyebrow("Filters")}<h1>How parents filter the year.</h1>
      <p class="intro">Strand is required on every event and paints its card. Other groups add extra filter rows on the site when shown. An option in use can't be deleted, only hidden.</p></header>
    ${banner(error, notice)}
    ${sections}
    <form class="panel" method="post" action="/admin/calendar/filters/groups">
      <h2>New group</h2>
      <div class="row-line mt">
        <div class="field grow"><label for="new-group">Group name</label>
          <input id="new-group" name="name" type="text" maxlength="40" required placeholder="House"></div>
      </div>
      <div class="row-line mb"><button class="primary" type="submit">Add group</button></div>
    </form>`;
}

// ---- Rhythm ------------------------------------------------------------

function strandSelect(name: string, id: string, strands: FilterRow[], selected: string): string {
  return `<select id="${id}" name="${name}" required>${strands
    .filter((row) => row.active || row.id === selected)
    .map((row) => `<option value="${esc(row.id)}"${row.id === selected ? " selected" : ""}>${esc(row.name)}</option>`)
    .join("")}</select>`;
}

export function rhythmBody(cards: RhythmRow[], strands: FilterRow[], error: string, notice: string): string {
  const rows = cards
    .map(
      (card) => `<section class="panel${card.active ? "" : " row-hidden"}">
      <form method="post" action="/admin/calendar/rhythm/${esc(card.id)}">
        <div class="field-row">
          <div class="field"><label for="rs-${esc(card.id)}">Strand</label>${strandSelect("strandId", `rs-${card.id}`, strands, card.strand_id)}</div>
          <div class="field"><label for="rw-${esc(card.id)}">When</label><input id="rw-${esc(card.id)}" name="whenLabel" type="text" maxlength="40" required value="${esc(card.when_label)}"></div>
        </div>
        <div class="field"><label for="rt-${esc(card.id)}">Title</label><input id="rt-${esc(card.id)}" name="title" type="text" maxlength="60" required value="${esc(card.title)}"></div>
        <div class="field"><label for="rb-${esc(card.id)}">Text</label><textarea id="rb-${esc(card.id)}" class="short" name="body" maxlength="300" required rows="3">${esc(card.body)}</textarea></div>
        <div class="field-row">
          <div class="field"><label for="rc-${esc(card.id)}">Photo caption</label><input id="rc-${esc(card.id)}" name="caption" type="text" maxlength="60" value="${esc(card.caption)}"></div>
          <div class="field"><label for="ra-${esc(card.id)}">Photo alt text</label><input id="ra-${esc(card.id)}" name="photoAlt" type="text" maxlength="160" value="${esc(card.photo_alt)}"></div>
        </div>
        <label class="check"><input type="checkbox" name="active"${card.active ? " checked" : ""}> Shown on the site</label>
        <div class="row-line mt mb">
          <button class="primary" type="submit">Save card</button>
          <button class="secondary" type="submit" name="dir" value="up" formaction="/admin/calendar/rhythm/${esc(card.id)}/move" aria-label="Move up">↑</button>
          <button class="secondary" type="submit" name="dir" value="down" formaction="/admin/calendar/rhythm/${esc(card.id)}/move" aria-label="Move down">↓</button>
          <button class="secondary danger" type="submit" formaction="/admin/calendar/rhythm/${esc(card.id)}/delete" data-confirm="Delete this card?">Delete</button>
          ${card.photo ? `<button class="secondary" type="submit" formaction="/admin/calendar/rhythm/${esc(card.id)}/photo/remove" data-confirm="Remove the photo?">Remove photo</button>` : ""}
        </div>
      </form>
      <div class="field rhythm-photo">
        ${card.photo ? `<img src="${esc(card.photo)}" alt="" width="120" height="90" loading="lazy">` : ""}
        <div><label for="rp-${esc(card.id)}">${card.photo ? "Replace photo" : "Add a photo"} <span class="muted">(optional, landscape 1200 × 800 to 3000 × 2000, cropped to 4:3)</span></label>
        <input id="rp-${esc(card.id)}" class="rhythm-file" type="file" accept="image/jpeg,image/png,image/webp" data-id="${esc(card.id)}">
        <p class="help" role="status"></p></div>
      </div>
    </section>`,
    )
    .join("");
  return `<header class="page-head">${eyebrow("All-year rhythm")}<h1>The parts of the year without a date.</h1></header>
    ${banner(error, notice)}
    ${rows}
    <form class="panel" method="post" action="/admin/calendar/rhythm">
      <h2>New card</h2>
      <div class="field-row">
        <div class="field"><label for="n-strand">Strand</label>${strandSelect("strandId", "n-strand", strands, "")}</div>
        <div class="field"><label for="n-when">When</label><input id="n-when" name="whenLabel" type="text" maxlength="40" required placeholder="Every morning"></div>
      </div>
      <div class="field"><label for="n-title">Title</label><input id="n-title" name="title" type="text" maxlength="60" required></div>
      <div class="field"><label for="n-body">Text</label><textarea id="n-body" class="short" name="body" maxlength="300" required rows="3"></textarea></div>
      <div class="field-row">
        <div class="field"><label for="n-caption">Photo caption</label><input id="n-caption" name="caption" type="text" maxlength="60"></div>
        <div class="field"><label for="n-alt">Photo alt text</label><input id="n-alt" name="photoAlt" type="text" maxlength="160"></div>
      </div>
      <div class="publish-bar"><button class="primary" type="submit">Add card</button></div>
    </form>`;
}

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

// ---- Settings ----------------------------------------------------------

export function settingsBody(
  year: YearRow,
  error: string,
  notice: string,
  values?: { themeName: string; label: string; seoTitle: string; seoDescription: string; shareImageAlt: string },
): string {
  const v = values ?? {
    themeName: year.theme_name,
    label: year.label,
    seoTitle: year.seo_title,
    seoDescription: year.seo_description,
    shareImageAlt: year.share_image_alt,
  };
  return `<header class="page-head">${eyebrow("Page & SEO")}<h1>The page itself.</h1>
      <p class="intro">The theme name and year label show in the hero. Search and share text is used for /theme-of-the-year.</p></header>
    ${banner(error, notice)}
    <form class="panel" method="post" action="/admin/calendar/settings">
      <div class="field-row">
        <div class="field"><label for="themeName">Theme name</label><input id="themeName" name="themeName" type="text" maxlength="40" required value="${esc(v.themeName)}"></div>
        <div class="field"><label for="label">Year label</label><input id="label" name="label" type="text" maxlength="20" required value="${esc(v.label)}"><span class="help">Shown as “Theme of the Year · ${esc(v.label)}”.</span></div>
      </div>
      <div class="field"><label for="seoTitle">Search title</label><input id="seoTitle" name="seoTitle" type="text" maxlength="200" required value="${esc(v.seoTitle)}">${counter("seoTitle", 200, 60)}</div>
      <div class="field"><label for="seoDescription">Search description</label><textarea id="seoDescription" class="short" name="seoDescription" maxlength="300" required rows="3">${esc(v.seoDescription)}</textarea>${counter("seoDescription", 300, 155)}</div>
      <div class="google-result">
        <p class="google-url">wellspringsacademy.in › theme-of-the-year</p>
        <p class="google-title">${esc(v.seoTitle)}</p>
        <p class="google-description">${esc(v.seoDescription)}</p>
      </div>
      <div class="field mt"><label for="shareImageAlt">Share image alt text</label><input id="shareImageAlt" name="shareImageAlt" type="text" maxlength="160" value="${esc(v.shareImageAlt)}"></div>
      <div class="publish-bar"><button class="primary" type="submit">Save</button></div>
    </form>
    <section class="panel">
      <h2>Share image</h2>
      <p class="help">Shown when the page link is shared. Sideways (landscape) photo, from 1200 × 800 up to 3000 × 2000, under 5 MB. Cropped to 1200 × 630. Without one, the hero image is used.</p>
      ${year.share_image ? `<img class="share-preview" src="${esc(year.share_image)}" alt="" width="1200" height="630">` : ""}
      <div class="field mt"><label for="share-file">${year.share_image ? "Replace" : "Upload"} share image</label>
        <input id="share-file" type="file" accept="image/jpeg,image/png,image/webp" data-url="/api/admin/calendar/settings/share-image">
        <p class="help" role="status"></p></div>
      ${year.share_image ? `<form method="post" action="/admin/calendar/settings/share-image/remove" data-confirm="Remove the share image?"><button class="secondary danger" type="submit">Remove share image</button></form>` : ""}
      <div class="spacer"></div>
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

export function yearsBody(years: YearRow[], working: YearRow | null, error: string, notice: string): string {
  const rows = years
    .map(
      (year) => `<li><div><strong>${esc(year.label)}</strong> · ${esc(year.theme_name)}
        <div class="when">${esc(monthLong(year.first_month.slice(0, 7)))} – ${esc(monthLong(year.last_month.slice(0, 7)))}${year.is_current ? " · on the site" : ""}${working?.id === year.id ? " · editing" : ""}</div></div>
        <div class="bar-actions">
          ${working?.id === year.id ? "" : `<form method="post" action="/admin/calendar/years/${esc(year.id)}/select"><button class="secondary" type="submit">Edit this year</button></form>`}
          ${year.is_current ? "" : `<form method="post" action="/admin/calendar/years/${esc(year.id)}/current" data-confirm="Make ${esc(year.label)} the year on the site? The other year comes off the site."><button class="primary" type="submit">Make current</button></form>`}
        </div></li>`,
    )
    .join("");
  const next = suggestNext(working);
  return `<header class="page-head">${eyebrow("Years")}<h1>One year on the site at a time.</h1>
      <p class="intro">A new year copies the filters and all-year rhythm cards from the year you are editing. Events are not copied. Old years stay here but are not shown on the site.</p></header>
    ${banner(error, notice)}
    <section class="panel"><ul class="todo">${rows || "<li>No years yet.</li>"}</ul><div class="spacer"></div></section>
    <form class="panel" method="post" action="/admin/calendar/years">
      <h2>Create the next year</h2>
      <div class="field-row mt">
        <div class="field"><label for="y-label">Year label</label><input id="y-label" name="label" type="text" maxlength="20" required value="${esc(next.label)}"></div>
        <div class="field"><label for="y-theme">Theme name</label><input id="y-theme" name="themeName" type="text" maxlength="40" required value="${esc(working?.theme_name ?? "")}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="y-first">First month</label><input id="y-first" name="firstMonth" type="month" required value="${esc(next.first)}"></div>
        <div class="field"><label for="y-last">Last month</label><input id="y-last" name="lastMonth" type="month" required value="${esc(next.last)}"></div>
      </div>
      <div class="publish-bar"><button class="primary" type="submit">Create year</button></div>
    </form>`;
}

function suggestNext(year: YearRow | null): { label: string; first: string; last: string } {
  if (!year) return { label: "", first: "", last: "" };
  const shift = (iso: string): string => `${Number(iso.slice(0, 4)) + 1}${iso.slice(4, 7)}`;
  const match = year.label.match(/^(\d{4})[–-](\d{2})$/);
  const label = match ? `${Number(match[1]) + 1}–${String((Number(match[2]) + 1) % 100).padStart(2, "0")}` : "";
  return { label, first: shift(year.first_month), last: shift(year.last_month) };
}

export function noYearBody(): string {
  return `<header class="page-head">${eyebrow("Calendar")}<h1>No calendar year yet.</h1>
    <p class="intro">Create the first year on the <a href="/admin/calendar/years">Years</a> screen.</p></header>`;
}
