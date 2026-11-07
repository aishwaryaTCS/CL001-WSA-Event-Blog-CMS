import { randomBytes } from "node:crypto";
import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth.ts";
import { listNotes } from "../db.ts";
import { csp, page } from "../html.ts";
import {
  createYearFrom,
  currentYear,
  deleteDraftEvent,
  deleteFilter,
  deleteYear,
  yearUsage,
  deleteRhythm,
  eventById,
  eventsForYear,
  filterById,
  filtersForYear,
  insertEvent,
  insertFilter,
  insertRhythm,
  listYears,
  lockEvent,
  makeCurrent,
  moveRow,
  photoById,
  photoCounts,
  photosForEvent,
  rhythmById,
  rhythmForYear,
  setRhythmPhoto,
  setShareImage,
  uniqueSlug,
  updateEvent,
  updateFilter,
  updateMonthLines,
  updatePhotoMeta,
  updateRhythm,
  updateYearSpan,
  updateYearTheme,
  eventsOutside,
  withTx,
  yearById,
  type EventRow,
  type EventWrite,
  type FilterRow,
  type YearRow,
} from "./db.ts";
import {
  COUNTER_SCRIPT,
  EDITOR_SCRIPT,
  EVENT_SEO_SCRIPT,
  RHYTHM_SCRIPT,
  YEARS_SCRIPT,
  UPLOAD_SCRIPT,
  blankValues,
  calendarShell,
  dashboardBody,
  editorBody,
  editorValuesFromRow,
  eventsBody,
  filtersBody,
  homeBody,
  monthsBody,
  noYearBody,
  previewBody,
  rhythmBody,
  settingsBody,
  yearsBody,
  type EditorModel,
  type Section,
} from "./html.ts";
import { CalendarPhotoError, readUpload, removeUnreferenced, saveCropped, saveEventPhoto } from "./photos.ts";
import {
  CAL_COPY,
  COLOR_KEYS,
  MAX_PHOTOS,
  MONTH_KEY,
  UUID,
  autoEventSeoDescription,
  autoEventSeoTitle,
  eventFormValues,
  eventShapeProblem,
  eventState,
  filterNameSchema,
  firstIssue,
  formText,
  formTick,
  kolkataToday,
  lastDayOfMonth,
  monthKeys,
  photoMetaSchema,
  photoOrderSchema,
  rhythmSchema,
  themeSchema,
  newYearThemeSchema,
  yearSpan,
  slugBase,
  type ColorKey,
  type EventInput,
} from "./schemas.ts";

const YEAR_COOKIE = "wsa_cal_year";

class Rejection extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// ---- Shared helpers ----------------------------------------------------

const MONTH_LABEL = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function monthName(iso: string): string {
  return `${MONTH_LABEL[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

function send(
  res: Response,
  status: number,
  title: string,
  section: Section,
  year: YearRow | null,
  render: () => string,
  script = "",
): void {
  const nonce = randomBytes(16).toString("base64url");
  res.setHeader("Content-Security-Policy", csp(nonce));
  res
    .status(status)
    .type("html")
    .send(page(title, calendarShell(nonce, section, year, render(), script), true, nonce));
}

function idParam(value: unknown): string | null {
  const text = String(value ?? "");
  return UUID.test(text) ? text : null;
}

export async function workingYear(req: Request): Promise<YearRow | null> {
  const chosen = idParam(req.signedCookies?.[YEAR_COOKIE]);
  if (chosen) {
    const year = await yearById(chosen);
    if (year) return year;
  }
  const current = await currentYear();
  if (current) return current;
  return (await listYears())[0] ?? null;
}

export function selectYear(res: Response, id: string): void {
  res.cookie(YEAR_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    signed: true,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

async function yearFilters(yearId: string): Promise<{
  all: FilterRow[];
  main: FilterRow | null;
  strands: FilterRow[];
  groups: Array<{ group: FilterRow; options: FilterRow[] }>;
  strandLabel: string;
}> {
  const all = await filtersForYear(yearId);
  const main = all.find((row) => row.is_main && row.parent_id === null) ?? null;
  const strands = main ? all.filter((row) => row.parent_id === main.id) : [];
  const groups = all
    .filter((row) => row.parent_id === null && !row.is_main)
    .map((group) => ({ group, options: all.filter((row) => row.parent_id === group.id) }));
  return { all, main, strands, groups, strandLabel: main?.name ?? "Strand" };
}

async function listed(yearId: string, today: string): Promise<Array<{ row: EventRow; state: ReturnType<typeof eventState>; photos: number }>> {
  const [events, counts] = await Promise.all([eventsForYear(yearId), photoCounts(yearId)]);
  return events.map((row) => ({ row, state: eventState(row, today), photos: counts.get(row.id) ?? 0 }));
}

const NOTICES: Record<string, string> = {
  draft: CAL_COPY.draftSaved,
  published: CAL_COPY.published,
  saved: CAL_COPY.saved,
  unpublished: CAL_COPY.unpublished,
  cancelled: CAL_COPY.cancelled,
  "recap-published": CAL_COPY.recapPublished,
  "recap-unpublished": CAL_COPY.recapUnpublished,
  photos: "Photos added. Check the alt text, tick consent and publish the recap.",
  "photos-recap": "Photos added. The recap is hidden until you tick consent and publish it again.",
  "recap-hidden": "The last photo was deleted, so the recap is hidden.",
  photo: "Photo saved.",
  deleted: "Deleted.",
  created: "Year created. You are now editing it.",
  current: "That year is now on the site.",
  "year-deleted": "Year deleted, with its events, photos and rhythm cards.",
  selected: "Now editing this year.",
  theme: "Theme saved. It shows in the calendar hero on the website.",
  "theme-invalid": "Theme not saved. Use 1 to 40 characters.",
};

function noticeFrom(req: Request): string {
  const key = typeof req.query.notice === "string" ? req.query.notice : "";
  let text = NOTICES[key] ?? "";
  const skipped = Number(req.query.skipped);
  if (Number.isInteger(skipped) && skipped > 0 && skipped < 1000) {
    text = `${MAX_PHOTOS} photos per event. ${skipped} ${skipped === 1 ? "was" : "were"} not uploaded. ${text}`.trim();
  }
  return text;
}

function photoFailure(res: Response, error: unknown): boolean {
  if (error instanceof CalendarPhotoError) {
    res.status(error.status).json({ error: error.message });
    return true;
  }
  return false;
}

function isUnique(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: string }).code === "23505");
}

// ---- Event save --------------------------------------------------------

type SaveResult = { event: EventRow; notice: string; tab: "plan" | "after" | "seo" };

async function saveEvent(existingId: string | null, year: YearRow, input: EventInput): Promise<SaveResult> {
  const shape = eventShapeProblem(input);
  if (shape) throw new Rejection(shape);
  const today = kolkataToday();
  const first = year.first_month;
  const last = lastDayOfMonth(year.last_month);
  if (input.startDate < first || input.startDate > last) throw new Rejection(CAL_COPY.dateOutside);
  if (input.endDate && input.endDate > last) throw new Rejection(CAL_COPY.dateOutside);

  return withTx(async (client) => {
    const existing = existingId ? await lockEvent(client, existingId) : null;
    if (existingId && !existing) throw new Rejection(CAL_COPY.notFound, 404);
    if (existing && existing.year_id !== year.id) throw new Rejection(CAL_COPY.notFound, 404);

    // Filters: strand must be an option of the main group; other options of non-main groups, same year.
    const filters = await filtersForYear(year.id, client);
    const byId = new Map(filters.map((row) => [row.id, row]));
    const main = filters.find((row) => row.is_main && row.parent_id === null);
    const strand = byId.get(input.strandId);
    if (!main || !strand || strand.parent_id !== main.id) throw new Rejection(CAL_COPY.strandRequired);
    if (!strand.active && strand.id !== existing?.strand_id) throw new Rejection(CAL_COPY.strandRequired);
    for (const id of input.optionIds) {
      const option = byId.get(id);
      const group = option?.parent_id ? byId.get(option.parent_id) : undefined;
      if (!option || !group || group.is_main) throw new Rejection(CAL_COPY.badOption);
      if (!option.active && !existing?.option_ids.includes(id)) throw new Rejection(CAL_COPY.badOption);
    }

    let status = existing?.status ?? "draft";
    let recapPublished = existing?.recap_published ?? false;
    let notice = status === "draft" ? "draft" : "saved";
    let tab: SaveResult["tab"] = "plan";
    switch (input.intent) {
      case "publish":
        status = "published";
        notice = "published";
        break;
      case "unpublish":
        status = "draft";
        recapPublished = false;
        notice = "unpublished";
        break;
      case "cancel":
        if (existing?.status !== "published") throw new Rejection("Only a published event can be cancelled.");
        status = "cancelled";
        recapPublished = false;
        notice = "cancelled";
        break;
      case "recap-publish": {
        tab = "after";
        if (!existing || status !== "published") throw new Rejection(CAL_COPY.recapNotPublished);
        if (input.startDate > today) throw new Rejection(CAL_COPY.recapEarly);
        const count = (await photosForEvent(existing.id, client)).length;
        if (count < 1) throw new Rejection(CAL_COPY.recapPhotos);
        if (!input.photoConsent) throw new Rejection(CAL_COPY.recapConsent);
        recapPublished = true;
        notice = "recap-published";
        break;
      }
      case "recap-unpublish":
        tab = "after";
        recapPublished = false;
        notice = "recap-unpublished";
        break;
      default:
        break;
    }
    if (status === "published" && !input.body) throw new Rejection(CAL_COPY.bodyRequired);
    // A recap stays public only while every rule still holds.
    if (recapPublished && (!input.photoConsent || status !== "published" || input.startDate > today)) recapPublished = false;

    // The pop-up link: the admin may type their own. Otherwise it follows the date and title
    // until the first publish, then stays so shared links keep working.
    let slug: string;
    let slugLocked = Boolean(existing?.slug_locked) || status !== "draft";
    if (input.slug && input.slug !== existing?.slug) {
      const taken = await client.query("select 1 from cal_events where year_id = $1 and slug = $2 and id is distinct from $3", [
        year.id,
        input.slug,
        existing?.id ?? null,
      ]);
      if (taken.rowCount) throw new Rejection("Another event this year already uses that pop-up link. Choose a different one.");
      slug = input.slug;
      slugLocked = true;
    } else if (existing?.slug_locked || (existing && input.slug === existing.slug && existing.slug_locked)) {
      slug = existing.slug;
    } else {
      slug = await uniqueSlug(client, year.id, slugBase(input.startDate, input.title), existing?.id ?? null);
    }

    let movedFrom = existing?.moved_from ?? null;
    if (existing && existing.status === "published") {
      if (existing.start_date !== input.startDate) movedFrom = input.showMoved ? (existing.moved_from ?? existing.start_date) : null;
      else if (!input.showMoved) movedFrom = null;
    }
    if (movedFrom === input.startDate) movedFrom = null;

    const row: EventWrite = {
      year_id: year.id,
      slug,
      slug_locked: slugLocked,
      title: input.title,
      subtitle: input.subtitle,
      start_date: input.startDate,
      end_date: input.endDate && input.endDate !== input.startDate ? input.endDate : null,
      moved_from: movedFrom,
      strand_id: strand.id,
      option_ids: input.optionIds,
      grades_label: input.gradesLabel,
      body: input.body,
      highlights: input.highlights,
      recap: input.recap,
      recap_published: recapPublished,
      photo_consent: input.photoConsent,
      seo_title: input.seoTitle || autoEventSeoTitle(input.title, year.theme_name),
      seo_description: input.seoDescription || autoEventSeoDescription(input.subtitle, input.body),
      seo_keywords: input.seoKeywords,
      seo_noindex: input.seoNoindex,
      seo_canonical: input.seoCanonical,
      seo_schema_type: input.seoSchemaType,
      seo_schema_json: input.seoSchemaJson,
      status,
    };
    const event = existing ? await updateEvent(client, existing.id, row) : await insertEvent(client, row);
    return { event, notice, tab };
  });
}

async function editorModel(
  year: YearRow,
  event: EventRow | null,
  values: EventInput,
  extra: Partial<Pick<EditorModel, "error" | "notice" | "tab">>,
): Promise<EditorModel> {
  const { strands, groups, strandLabel } = await yearFilters(year.id);
  return {
    strandLabel,
    event,
    values,
    year,
    strands,
    groups: groups.filter(({ group }) => group.active),
    photos: event ? await photosForEvent(event.id) : [],
    today: kolkataToday(),
    error: extra.error ?? "",
    notice: extra.notice ?? "",
    tab: extra.tab ?? "plan",
  };
}

// ---- Routes ------------------------------------------------------------

export function mountCalendarAdmin(app: Express): void {
  app.get("/admin/home", requireAdmin, async (req, res, next) => {
    try {
      const notes = await listNotes();
      const year = await currentYear();
      let calendar: { label: string; needsPhotos: number; drafts: number } | null = null;
      if (year) {
        const events = await listed(year.id, kolkataToday());
        calendar = {
          label: year.label,
          needsPhotos: events.filter((item) => item.state === "needs-photos").length,
          drafts: events.filter((item) => item.state === "draft").length,
        };
      }
      const published = notes.filter((row) => row.status === "published").length;
      send(res, 200, "Home", "home", null, () => homeBody({ published, drafts: notes.length - published }, calendar));
    } catch (error) {
      next(error);
    }
  });

  app.get("/admin/calendar", requireAdmin, async (req, res, next) => {
    try {
      const year = await workingYear(req);
      if (!year) {
        send(res, 200, "Calendar", "dashboard", null, noYearBody);
        return;
      }
      const today = kolkataToday();
      const [events, { strands }] = await Promise.all([listed(year.id, today), yearFilters(year.id)]);
      const map = new Map(strands.map((row) => [row.id, row]));
      send(res, 200, "Calendar", "dashboard", year, () => dashboardBody(year, events, map, today, noticeFrom(req)));
    } catch (error) {
      next(error);
    }
  });

  app.get("/admin/calendar/events", requireAdmin, async (req, res, next) => {
    try {
      const years = await listYears();
      // The Year dropdown in the filter row switches the year being edited.
      const askedYear = idParam(req.query.year);
      const pickedYear = askedYear ? years.find((row) => row.id === askedYear) ?? null : null;
      if (pickedYear) selectYear(res, pickedYear.id);
      const year = pickedYear ?? (await workingYear(req));
      if (!year) {
        res.redirect("/admin/calendar");
        return;
      }
      const today = kolkataToday();
      const keys = monthKeys(year.first_month, year.last_month);
      const asked = typeof req.query.month === "string" && MONTH_KEY.test(req.query.month) ? req.query.month : "";
      const month = keys.includes(asked) ? asked : keys.includes(today.slice(0, 7)) ? today.slice(0, 7) : keys[0];
      const askedStrand = idParam(req.query.strand) ?? "";
      const states = ["draft", "upcoming", "needs-photos", "completed", "cancelled"];
      const stateFilter = typeof req.query.state === "string" && states.includes(req.query.state) ? req.query.state : "";
      const search = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : "";
      const words = search.toLowerCase().split(/\s+/).filter(Boolean);
      const [all, { strands, strandLabel }] = await Promise.all([listed(year.id, today), yearFilters(year.id)]);
      const strandName = new Map(strands.map((row) => [row.id, row.name]));
      // Strands belong to one year: a strand from another year no longer filters.
      const strandFilter = strandName.has(askedStrand) ? askedStrand : "";
      // Search looks through the whole school year: title, subtitle, grades, plan, recap and strand.
      const found = (item: (typeof all)[number]): boolean => {
        if (!words.length) return true;
        const text = [item.row.title, item.row.subtitle, item.row.grades_label, item.row.body, item.row.recap, strandName.get(item.row.strand_id) ?? ""]
          .join(" ")
          .toLowerCase();
        return words.every((word) => text.includes(word));
      };
      const shown = all.filter(
        (item) =>
          (words.length ? true : item.row.start_date.startsWith(month)) &&
          found(item) &&
          (!strandFilter || item.row.strand_id === strandFilter) &&
          (!stateFilter || item.state === stateFilter || (stateFilter === "upcoming" && item.state === "today")),
      );
      send(res, 200, "Events", "events", year, () =>
        eventsBody(year, month, shown, all.filter(found), strands, { strand: strandFilter, state: stateFilter, q: search }, noticeFrom(req), strandLabel, years),
      );
    } catch (error) {
      next(error);
    }
  });

  app.get("/admin/calendar/events/new", requireAdmin, async (req, res, next) => {
    try {
      const year = await workingYear(req);
      if (!year) {
        res.redirect("/admin/calendar");
        return;
      }
      const keys = monthKeys(year.first_month, year.last_month);
      const today = kolkataToday();
      const asked = typeof req.query.month === "string" && keys.includes(req.query.month) ? req.query.month : "";
      const start = asked ? (today.startsWith(asked) ? today : `${asked}-01`) : today >= year.first_month && today <= lastDayOfMonth(year.last_month) ? today : year.first_month;
      const model = await editorModel(year, null, blankValues(start), {});
      send(res, 200, "New event", "events", year, () => editorBody(model), EDITOR_SCRIPT + EVENT_SEO_SCRIPT);
    } catch (error) {
      next(error);
    }
  });

  const writeEvent = async (req: Request, res: Response, id: string | null): Promise<void> => {
    const existing = id ? await eventById(id) : null;
    if (id && !existing) {
      res.redirect("/admin/calendar/events");
      return;
    }
    const year = existing ? await yearById(existing.year_id) : await workingYear(req);
    if (!year) {
      res.redirect("/admin/calendar");
      return;
    }
    const input = eventFormValues(req.body);
    try {
      const saved = await saveEvent(existing?.id ?? null, year, input);
      res.redirect(`/admin/calendar/events/${saved.event.id}?notice=${saved.notice}${saved.tab === "plan" ? "" : `&tab=${saved.tab}`}`);
    } catch (error) {
      if (!(error instanceof Rejection) && !isUnique(error)) throw error;
      const message = error instanceof Rejection ? error.message : "That slug is already used. Save again.";
      const fresh = existing ? await eventById(existing.id) : null;
      const tab = input.intent.startsWith("recap") ? "after" : "plan";
      const model = await editorModel(year, fresh, input, { error: message, tab });
      send(res, error instanceof Rejection ? error.status : 409, existing ? "Edit event" : "New event", "events", year, () => editorBody(model), EDITOR_SCRIPT + EVENT_SEO_SCRIPT);
    }
  };

  app.post("/admin/calendar/events", requireAdmin, async (req, res, next) => {
    try {
      await writeEvent(req, res, null);
    } catch (error) {
      next(error);
    }
  });

  app.get("/admin/calendar/events/:id", requireAdmin, async (req, res, next) => {
    try {
      const id = idParam(req.params.id);
      const event = id ? await eventById(id) : null;
      const year = event ? await yearById(event.year_id) : null;
      if (!event || !year) {
        res.redirect("/admin/calendar/events");
        return;
      }
      const tab = req.query.tab === "after" || req.query.tab === "seo" ? req.query.tab : "plan";
      const model = await editorModel(year, event, editorValuesFromRow(event), { notice: noticeFrom(req), tab });
      send(res, 200, "Edit event", "events", year, () => editorBody(model), EDITOR_SCRIPT + EVENT_SEO_SCRIPT);
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/calendar/events/:id", requireAdmin, async (req, res, next) => {
    try {
      const id = idParam(req.params.id);
      if (!id) {
        res.redirect("/admin/calendar/events");
        return;
      }
      await writeEvent(req, res, id);
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/calendar/events/:id/delete", requireAdmin, async (req, res, next) => {
    try {
      const id = idParam(req.params.id);
      const event = id ? await eventById(id) : null;
      if (!event) {
        res.redirect("/admin/calendar/events");
        return;
      }
      if (event.status !== "draft") {
        res.redirect(`/admin/calendar/events/${event.id}`);
        return;
      }
      const files = await deleteDraftEvent(event.id);
      if (files) await removeUnreferenced(files);
      res.redirect(`/admin/calendar/events?month=${event.start_date.slice(0, 7)}&notice=deleted`);
    } catch (error) {
      next(error);
    }
  });

  app.get("/admin/calendar/events/:id/preview", requireAdmin, async (req, res, next) => {
    try {
      const id = idParam(req.params.id);
      const event = id ? await eventById(id) : null;
      if (!event) {
        res.redirect("/admin/calendar/events");
        return;
      }
      const [strand, photos] = await Promise.all([filterById(event.strand_id), photosForEvent(event.id)]);
      const year = await yearById(event.year_id);
      send(res, 200, "Preview", "events", year, () => previewBody(event, strand ?? undefined, photos, kolkataToday()));
    } catch (error) {
      next(error);
    }
  });

  // ---- Photos (JSON) ----

  app.post("/api/admin/calendar/events/:id/photos", requireAdmin, async (req, res, next) => {
    try {
      const id = idParam(req.params.id);
      const event = id ? await eventById(id) : null;
      if (!event) {
        res.status(404).json({ error: CAL_COPY.notFound });
        return;
      }
      if ((await photosForEvent(event.id)).length >= MAX_PHOTOS) {
        req.resume();
        res.status(409).json({ error: CAL_COPY.photosFull });
        return;
      }
      const saved = await saveEventPhoto(await readUpload(req));
      const result = await withTx(async (client) => {
        const locked = await lockEvent(client, event.id);
        if (!locked) return { full: false, gone: true } as const;
        const count = await client.query<{ n: number; next: number }>(
          "select count(*)::int as n, coalesce(max(sort), -1) + 1 as next from cal_photos where event_id = $1",
          [event.id],
        );
        if (count.rows[0].n >= MAX_PHOTOS) return { full: true, gone: false } as const;
        const inserted = await client.query<{ id: string }>(
          `insert into cal_photos (event_id, file, thumb, width, height, alt, sort) values ($1, $2, $3, $4, $5, $6, $7) returning id`,
          [event.id, saved.file, saved.thumb, saved.width, saved.height, `Photo from ${locked.title}`.slice(0, 160), count.rows[0].next],
        );
        // A new photo has not been checked for consent yet.
        await client.query("update cal_events set photo_consent = false, recap_published = false, updated_at = now() where id = $1", [event.id]);
        return { full: false, gone: false, id: inserted.rows[0].id, recapHidden: locked.recap_published } as const;
      });
      if (result.full || result.gone) {
        await removeUnreferenced([saved.file, saved.thumb]);
        res.status(result.full ? 409 : 404).json({ error: result.full ? CAL_COPY.photosFull : CAL_COPY.notFound });
        return;
      }
      res.status(201).json({ id: result.id, thumb: saved.thumb, src: saved.file, recapHidden: result.recapHidden });
    } catch (error) {
      if (photoFailure(res, error)) return;
      next(error);
    }
  });

  app.patch("/api/admin/calendar/photos/:id", requireAdmin, async (req, res, next) => {
    try {
      const id = idParam(req.params.id);
      const parsed = photoMetaSchema.safeParse(req.body);
      if (!id) {
        res.status(404).json({ error: CAL_COPY.notFound });
        return;
      }
      if (!parsed.success) {
        res.status(400).json({ error: firstIssue(parsed.error) });
        return;
      }
      const saved = await updatePhotoMeta(id, parsed.data.alt, parsed.data.caption);
      if (!saved) {
        res.status(404).json({ error: CAL_COPY.notFound });
        return;
      }
      res.json({ id: saved.id, alt: saved.alt, caption: saved.caption });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/calendar/events/:id/photos/order", requireAdmin, async (req, res, next) => {
    try {
      const id = idParam(req.params.id);
      const parsed = photoOrderSchema.safeParse(req.body);
      if (!id || !parsed.success) {
        res.status(400).json({ error: "Send the photo ids in order." });
        return;
      }
      const ok = await withTx(async (client) => {
        if (!(await lockEvent(client, id))) return false;
        const current = (await photosForEvent(id, client)).map((photo) => photo.id).sort();
        const wanted = [...parsed.data.ids].sort();
        if (current.length !== wanted.length || current.some((value, i) => value !== wanted[i])) return false;
        for (const [index, photoId] of parsed.data.ids.entries()) {
          await client.query("update cal_photos set sort = $2 where id = $1 and event_id = $3", [photoId, index, id]);
        }
        return true;
      });
      if (!ok) {
        res.status(400).json({ error: "The photos changed. Reload the page." });
        return;
      }
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/admin/calendar/photos/:id", requireAdmin, async (req, res, next) => {
    try {
      const id = idParam(req.params.id);
      const photo = id ? await photoById(id) : null;
      if (!photo) {
        res.status(404).json({ error: CAL_COPY.notFound });
        return;
      }
      const recapHidden = await withTx(async (client) => {
        const event = await lockEvent(client, photo.event_id);
        await client.query("delete from cal_photos where id = $1", [photo.id]);
        const left = await client.query<{ n: number }>("select count(*)::int as n from cal_photos where event_id = $1", [photo.event_id]);
        if (event?.recap_published && left.rows[0].n === 0) {
          await client.query("update cal_events set recap_published = false, updated_at = now() where id = $1", [photo.event_id]);
          return true;
        }
        return false;
      });
      await removeUnreferenced([photo.file, photo.thumb]);
      res.json({ ok: true, recapHidden });
    } catch (error) {
      next(error);
    }
  });

  // ---- Months ----

  app.get("/admin/calendar/months", requireAdmin, async (req, res, next) => {
    try {
      const year = await workingYear(req);
      if (!year) {
        res.redirect("/admin/calendar");
        return;
      }
      send(res, 200, "Months", "months", year, () => monthsBody(year, "", noticeFrom(req)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/calendar/months", requireAdmin, async (req, res, next) => {
    try {
      const year = await workingYear(req);
      if (!year) {
        res.redirect("/admin/calendar");
        return;
      }
      const lines: Record<string, string> = {};
      for (const key of monthKeys(year.first_month, year.last_month)) {
        const value = formText(req.body, `m-${key}`).replace(/\s+/g, " ");
        if (value.length > 80) {
          send(res, 400, "Months", "months", year, () => monthsBody(year, "Each month line must be 80 characters or fewer.", "", lines));
          return;
        }
        if (value) lines[key] = value;
      }
      await updateMonthLines(year.id, lines);
      res.redirect("/admin/calendar/months?notice=saved");
    } catch (error) {
      next(error);
    }
  });

  // ---- Filters ----

  const filtersPage = async (req: Request, res: Response, year: YearRow, error: string, status = 200): Promise<void> => {
    const { all, main } = await yearFilters(year.id);
    const events = await eventsForYear(year.id);
    const rhythm = await rhythmForYear(year.id);
    const usage = new Map<string, number>();
    const bump = (id: string): void => {
      usage.set(id, (usage.get(id) ?? 0) + 1);
    };
    for (const event of events) {
      bump(event.strand_id);
      event.option_ids.forEach(bump);
    }
    for (const card of rhythm) bump(card.strand_id);
    // Strand only: other groups were removed and can't be added any more.
    const ordered = [
      ...(main ? [{ group: main, options: all.filter((row) => row.parent_id === main.id) }] : []),
    ];
    send(res, status, "Strands", "filters", year, () => filtersBody(ordered, usage, error, error ? "" : noticeFrom(req)));
  };

  app.get("/admin/calendar/filters", requireAdmin, async (req, res, next) => {
    try {
      const year = await workingYear(req);
      if (!year) {
        res.redirect("/admin/calendar");
        return;
      }
      await filtersPage(req, res, year, "");
    } catch (error) {
      next(error);
    }
  });

  const filterInYear = async (req: Request): Promise<{ year: YearRow; row: FilterRow } | null> => {
    const year = await workingYear(req);
    const id = idParam(req.params.id);
    const row = id ? await filterById(id) : null;
    if (!year || !row || row.year_id !== year.id) return null;
    return { year, row };
  };

  const colorFrom = (body: unknown): ColorKey | null => {
    const value = formText(body, "colorKey");
    return (COLOR_KEYS as readonly string[]).includes(value) ? (value as ColorKey) : null;
  };

  // New groups are no longer added from the CMS: the Strand group (and any group that
  // already exists) is managed in place. Old links answer with the Filters page.
  app.post("/admin/calendar/filters/groups", requireAdmin, (_req, res) => {
    res.redirect("/admin/calendar/filters");
  });

  app.post("/admin/calendar/filters/:id/options", requireAdmin, async (req, res, next) => {
    try {
      const found = await filterInYear(req);
      if (!found || found.row.parent_id !== null) {
        res.redirect("/admin/calendar/filters");
        return;
      }
      const name = filterNameSchema.safeParse(formText(req.body, "name"));
      if (!name.success) {
        await filtersPage(req, res, found.year, firstIssue(name.error), 400);
        return;
      }
      const color = found.row.is_main ? colorFrom(req.body) : null;
      if (found.row.is_main && !color) {
        await filtersPage(req, res, found.year, CAL_COPY.colorRequired, 400);
        return;
      }
      try {
        await insertFilter({ yearId: found.year.id, parentId: found.row.id, name: name.data, colorKey: color, showOnSite: true });
      } catch (error) {
        if (!isUnique(error)) throw error;
        await filtersPage(req, res, found.year, CAL_COPY.nameTaken, 409);
        return;
      }
      res.redirect("/admin/calendar/filters?notice=saved");
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/calendar/filters/:id", requireAdmin, async (req, res, next) => {
    try {
      const found = await filterInYear(req);
      if (!found) {
        res.redirect("/admin/calendar/filters");
        return;
      }
      const { row, year } = found;
      const name = filterNameSchema.safeParse(formText(req.body, "name"));
      if (!name.success) {
        await filtersPage(req, res, year, firstIssue(name.error), 400);
        return;
      }
      const parent = row.parent_id ? await filterById(row.parent_id) : null;
      const isStrand = Boolean(parent?.is_main);
      const color = isStrand ? colorFrom(req.body) : null;
      if (isStrand && !color) {
        await filtersPage(req, res, year, CAL_COPY.colorRequired, 400);
        return;
      }
      try {
        await updateFilter(row.id, {
          name: name.data,
          // The main group always stays active and on the site.
          active: row.is_main ? true : formTick(req.body, "active"),
          showOnSite: row.is_main ? true : row.parent_id ? row.show_on_site : formTick(req.body, "showOnSite"),
          colorKey: color,
        });
      } catch (error) {
        if (!isUnique(error)) throw error;
        await filtersPage(req, res, year, CAL_COPY.nameTaken, 409);
        return;
      }
      res.redirect(`/admin/calendar/filters?notice=saved#opt-${row.id}`);
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/calendar/filters/:id/move", requireAdmin, async (req, res, next) => {
    try {
      const found = await filterInYear(req);
      const dir = formText(req.body, "dir");
      if (found && !found.row.is_main && (dir === "up" || dir === "down")) await moveRow("cal_filters", found.row.id, dir);
      res.redirect(found ? `/admin/calendar/filters#opt-${found.row.id}` : "/admin/calendar/filters");
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/calendar/filters/:id/delete", requireAdmin, async (req, res, next) => {
    try {
      const found = await filterInYear(req);
      if (!found) {
        res.redirect("/admin/calendar/filters");
        return;
      }
      const problem = await deleteFilter(found.row.id);
      if (problem) {
        const isGroup = found.row.parent_id === null;
        let message: string = CAL_COPY.mainGroup;
        if ("inUse" in problem) {
          const names = problem.inUse.map((name) => `“${name}”`).join(", ");
          const verb = problem.inUse.length === 1 ? "is" : "are";
          message = isGroup
            ? `Can't delete the group “${found.row.name}”: ${names} ${verb} still used by events or rhythm cards. Untick ${problem.inUse.length === 1 ? "it" : "them"} on those first, or untick Active to hide the group.`
            : CAL_COPY.optionInUse;
        }
        await filtersPage(req, res, found.year, message, 409);
        return;
      }
      res.redirect("/admin/calendar/filters?notice=deleted");
    } catch (error) {
      next(error);
    }
  });

  // ---- Rhythm ----

  const rhythmPage = async (
    req: Request,
    res: Response,
    year: YearRow,
    error: string,
    status = 200,
    open = "",
    draft?: Record<string, string>,
  ): Promise<void> => {
    const [cards, { strands, strandLabel }] = await Promise.all([rhythmForYear(year.id), yearFilters(year.id)]);
    send(
      res,
      status,
      "All-year rhythm",
      "rhythm",
      year,
      () => rhythmBody(cards, strands, error, error ? "" : noticeFrom(req), strandLabel, open, draft),
      UPLOAD_SCRIPT + RHYTHM_SCRIPT,
    );
  };
  const rhythmDraft = (req: Request): Record<string, string> => ({
    strandId: formText(req.body, "strandId"),
    whenLabel: formText(req.body, "whenLabel"),
    title: formText(req.body, "title"),
    body: formText(req.body, "body"),
    caption: formText(req.body, "caption"),
    photoAlt: formText(req.body, "photoAlt"),
  });

  const rhythmValues = async (req: Request, year: YearRow): Promise<{ ok: true; value: ReturnType<typeof rhythmSchema.parse> } | { ok: false; error: string }> => {
    const parsed = rhythmSchema.safeParse({
      strandId: formText(req.body, "strandId"),
      whenLabel: formText(req.body, "whenLabel"),
      title: formText(req.body, "title"),
      body: formText(req.body, "body"),
      caption: formText(req.body, "caption"),
      photoAlt: formText(req.body, "photoAlt"),
    });
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const { strands } = await yearFilters(year.id);
    if (!strands.some((row) => row.id === parsed.data.strandId)) return { ok: false, error: CAL_COPY.strandRequired };
    return { ok: true, value: parsed.data };
  };

  const rhythmInYear = async (req: Request): Promise<{ year: YearRow; id: string } | null> => {
    const year = await workingYear(req);
    const id = idParam(req.params.id);
    const card = id ? await rhythmById(id) : null;
    if (!year || !card || card.year_id !== year.id) return null;
    return { year, id: card.id };
  };

  app.get("/admin/calendar/rhythm", requireAdmin, async (req, res, next) => {
    try {
      const year = await workingYear(req);
      if (!year) {
        res.redirect("/admin/calendar");
        return;
      }
      await rhythmPage(req, res, year, "");
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/calendar/rhythm", requireAdmin, async (req, res, next) => {
    try {
      const year = await workingYear(req);
      if (!year) {
        res.redirect("/admin/calendar");
        return;
      }
      const values = await rhythmValues(req, year);
      if (!values.ok) {
        await rhythmPage(req, res, year, values.error, 400, "new", rhythmDraft(req));
        return;
      }
      const id = await insertRhythm(year.id, values.value);
      res.redirect(`/admin/calendar/rhythm?notice=saved${typeof id === "string" ? `#r-${id}` : ""}`);
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/calendar/rhythm/:id", requireAdmin, async (req, res, next) => {
    try {
      const found = await rhythmInYear(req);
      if (!found) {
        res.redirect("/admin/calendar/rhythm");
        return;
      }
      const values = await rhythmValues(req, found.year);
      if (!values.ok) {
        await rhythmPage(req, res, found.year, values.error, 400, found.id);
        return;
      }
      await updateRhythm(found.id, { ...values.value, active: formTick(req.body, "active") });
      res.redirect(`/admin/calendar/rhythm?notice=saved#r-${found.id}`);
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/calendar/rhythm/:id/move", requireAdmin, async (req, res, next) => {
    try {
      const found = await rhythmInYear(req);
      const dir = formText(req.body, "dir");
      if (found && (dir === "up" || dir === "down")) await moveRow("cal_rhythm", found.id, dir);
      res.redirect(found ? `/admin/calendar/rhythm#r-${found.id}` : "/admin/calendar/rhythm");
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/calendar/rhythm/:id/delete", requireAdmin, async (req, res, next) => {
    try {
      const found = await rhythmInYear(req);
      if (found) await removeUnreferenced([await deleteRhythm(found.id)]);
      res.redirect("/admin/calendar/rhythm?notice=deleted");
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/calendar/rhythm/:id/photo/remove", requireAdmin, async (req, res, next) => {
    try {
      const found = await rhythmInYear(req);
      if (found) await removeUnreferenced([await setRhythmPhoto(found.id, null)]);
      res.redirect(found ? `/admin/calendar/rhythm?notice=saved#r-${found.id}` : "/admin/calendar/rhythm");
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/calendar/rhythm/:id/photo", requireAdmin, async (req, res, next) => {
    try {
      const found = await rhythmInYear(req);
      if (!found) {
        req.resume();
        res.status(404).json({ error: CAL_COPY.notFound });
        return;
      }
      const path = await saveCropped(await readUpload(req), 800, 600);
      const old = await setRhythmPhoto(found.id, path);
      await removeUnreferenced([old]);
      res.status(201).json({ photo: path });
    } catch (error) {
      if (photoFailure(res, error)) return;
      next(error);
    }
  });

  // ---- Settings ----

  app.get("/admin/calendar/settings", requireAdmin, async (req, res, next) => {
    try {
      const year = await workingYear(req);
      if (!year) {
        res.redirect("/admin/calendar");
        return;
      }
      // The theme now lives under Site & SEO · Calendar (and can be renamed on the dashboard).
      res.redirect("/admin/site?page=calendar#theme");
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/calendar/settings", requireAdmin, async (req, res, next) => {
    try {
      const year = await workingYear(req);
      if (!year) {
        res.redirect("/admin/calendar");
        return;
      }
      // "Rename theme" on the calendar dashboard.
      const parsed = themeSchema.safeParse({ themeName: formText(req.body, "themeName") });
      if (!parsed.success) {
        res.redirect("/admin/calendar?notice=theme-invalid");
        return;
      }
      await updateYearTheme(year.id, parsed.data.themeName);
      res.redirect("/admin/calendar?notice=theme");
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/calendar/settings/share-image", requireAdmin, async (req, res, next) => {
    try {
      const year = await workingYear(req);
      if (!year) {
        req.resume();
        res.status(404).json({ error: CAL_COPY.notFound });
        return;
      }
      const path = await saveCropped(await readUpload(req), 1200, 630);
      const old = await setShareImage(year.id, path);
      await removeUnreferenced([old]);
      res.status(201).json({ shareImage: path });
    } catch (error) {
      if (photoFailure(res, error)) return;
      next(error);
    }
  });

  app.post("/admin/calendar/settings/share-image/remove", requireAdmin, async (req, res, next) => {
    try {
      const year = await workingYear(req);
      if (year) await removeUnreferenced([await setShareImage(year.id, null)]);
      res.redirect("/admin/calendar/settings?notice=saved");
    } catch (error) {
      next(error);
    }
  });

  // ---- Years ----

  const yearsPage = async (
    req: Request,
    res: Response,
    error: string,
    status = 200,
    options: Parameters<typeof yearsBody>[4] = {},
  ): Promise<void> => {
    const [years, working] = await Promise.all([listYears(), workingYear(req)]);
    const usage = new Map(await Promise.all(years.map(async (year) => [year.id, await yearUsage(year.id)] as const)));
    send(
      res,
      status,
      "Years",
      "years",
      working,
      () => yearsBody(years, working, error, error ? "" : noticeFrom(req), { ...options, usage }),
      YEARS_SCRIPT,
    );
  };

  app.get("/admin/calendar/years", requireAdmin, async (req, res, next) => {
    try {
      await yearsPage(req, res, "");
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/calendar/years", requireAdmin, async (req, res, next) => {
    try {
      const working = await workingYear(req);
      const draft = {
        startYear: formText(req.body, "startYear"),
        endYear: formText(req.body, "endYear"),
        startMonth: formText(req.body, "startMonth"),
        lastMonth: formText(req.body, "lastMonth"),
        themeName: formText(req.body, "themeName"),
      };
      const span = yearSpan(draft.startYear, draft.endYear, draft.startMonth, draft.lastMonth);
      const theme = newYearThemeSchema.safeParse(draft.themeName);
      if (!span.ok || !theme.success) {
        await yearsPage(req, res, !span.ok ? span.error : firstIssue((theme as { error: import("zod").ZodError }).error), 400, { draft });
        return;
      }
      const overlap = (await listYears()).find((year) => {
        const first = year.first_month.slice(0, 7);
        const last = year.last_month.slice(0, 7);
        return span.firstMonth <= last && span.lastMonth >= first;
      });
      if (overlap) {
        await yearsPage(req, res, `These months overlap ${overlap.label}. Start the new year after ${monthName(overlap.last_month)}.`, 409, { draft });
        return;
      }
      try {
        const id = await createYearFrom(working?.id ?? null, {
          label: span.label,
          themeName: theme.data,
          firstMonth: span.firstMonth,
          lastMonth: span.lastMonth,
        });
        selectYear(res, id);
      } catch (error) {
        if (!isUnique(error)) throw error;
        await yearsPage(req, res, CAL_COPY.labelTaken, 409, { draft });
        return;
      }
      res.redirect("/admin/calendar/years?notice=created");
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/calendar/years/:id/span", requireAdmin, async (req, res, next) => {
    try {
      const id = idParam(req.params.id);
      const year = id ? await yearById(id) : null;
      if (!year) {
        res.redirect("/admin/calendar/years");
        return;
      }
      const editDraft = {
        startYear: formText(req.body, "startYear"),
        endYear: formText(req.body, "endYear"),
        startMonth: formText(req.body, "startMonth"),
        lastMonth: formText(req.body, "lastMonth"),
        themeName: year.theme_name,
      };
      const span = yearSpan(editDraft.startYear, editDraft.endYear, editDraft.startMonth, editDraft.lastMonth);
      if (!span.ok) {
        await yearsPage(req, res, span.error, 400, { editId: year.id, editDraft });
        return;
      }
      const overlap = (await listYears()).find((other) => {
        if (other.id === year.id) return false;
        return span.firstMonth <= other.last_month.slice(0, 7) && span.lastMonth >= other.first_month.slice(0, 7);
      });
      if (overlap) {
        await yearsPage(req, res, `These months overlap ${overlap.label}.`, 409, { editId: year.id, editDraft });
        return;
      }
      const outside = await eventsOutside(year.id, `${span.firstMonth}-01`, `${span.lastMonth}-01`);
      if (outside > 0) {
        await yearsPage(
          req,
          res,
          `${outside} event${outside === 1 ? " falls" : "s fall"} outside ${monthName(`${span.firstMonth}-01`)} – ${monthName(`${span.lastMonth}-01`)}. Move ${outside === 1 ? "it" : "them"} first.`,
          409,
          { editId: year.id, editDraft },
        );
        return;
      }
      try {
        await updateYearSpan(year.id, span);
      } catch (error) {
        if (!isUnique(error)) throw error;
        await yearsPage(req, res, CAL_COPY.labelTaken, 409, { editId: year.id, editDraft });
        return;
      }
      res.redirect("/admin/calendar/years?notice=saved");
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/calendar/years/:id/delete", requireAdmin, async (req, res, next) => {
    try {
      const id = idParam(req.params.id);
      const year = id ? await yearById(id) : null;
      if (!year) {
        res.redirect("/admin/calendar/years");
        return;
      }
      // The admin types the label to confirm, so a stray click can't remove a year.
      if (formText(req.body, "confirmLabel") !== year.label) {
        await yearsPage(req, res, `To delete ${year.label}, type its label exactly: ${year.label}`, 400, { deleteId: year.id });
        return;
      }
      const result = await deleteYear(year.id);
      if (!result.ok) {
        await yearsPage(
          req,
          res,
          result.reason === "current" ? `${year.label} is on the site. Make another year current first, then delete this one.` : CAL_COPY.notFound,
          409,
        );
        return;
      }
      await removeUnreferenced(result.paths);
      res.redirect("/admin/calendar/years?notice=year-deleted");
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/calendar/years/:id/select", requireAdmin, async (req, res, next) => {
    try {
      const id = idParam(req.params.id);
      if (id && (await yearById(id))) selectYear(res, id);
      res.redirect("/admin/calendar?notice=selected");
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/calendar/years/:id/current", requireAdmin, async (req, res, next) => {
    try {
      const id = idParam(req.params.id);
      if (id && (await yearById(id))) await makeCurrent(id);
      res.redirect("/admin/calendar/years?notice=current");
    } catch (error) {
      next(error);
    }
  });
}
