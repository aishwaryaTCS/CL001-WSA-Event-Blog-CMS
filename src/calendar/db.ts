import type pg from "pg";
import { getPool } from "../db.ts";
import type { ColorKey, EventStatus } from "./schemas.ts";

export type YearRow = {
  id: string;
  label: string;
  theme_name: string;
  first_month: string;
  last_month: string;
  month_lines: Record<string, string>;
  is_current: boolean;
  seo_title: string;
  seo_description: string;
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

export type FilterRow = {
  id: string;
  year_id: string;
  parent_id: string | null;
  name: string;
  is_main: boolean;
  show_on_site: boolean;
  color_key: ColorKey | null;
  sort: number;
  active: boolean;
};

export type EventRow = {
  id: string;
  year_id: string;
  uid: string;
  slug: string;
  slug_locked: boolean;
  title: string;
  subtitle: string;
  start_date: string;
  end_date: string | null;
  moved_from: string | null;
  strand_id: string;
  option_ids: string[];
  grades_label: string;
  body: string;
  highlights: string[];
  recap: string;
  recap_published: boolean;
  photo_consent: boolean;
  seo_title: string;
  seo_description: string;
  seo_keywords: string;
  seo_noindex: boolean;
  seo_canonical: string;
  seo_schema_type: string;
  seo_schema_json: string;
  status: EventStatus;
  updated_at: Date;
};

export type PhotoRow = {
  id: string;
  event_id: string;
  file: string;
  thumb: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
  sort: number;
};

export type RhythmRow = {
  id: string;
  year_id: string;
  strand_id: string;
  when_label: string;
  title: string;
  body: string;
  caption: string;
  photo: string | null;
  photo_alt: string;
  sort: number;
  active: boolean;
};

export type Db = pg.Pool | pg.PoolClient;

function db(client?: Db): Db {
  return client ?? getPool();
}

export async function withTx<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

// ---- Years -------------------------------------------------------------

export async function currentYear(client?: Db): Promise<YearRow | null> {
  const result = await db(client).query<YearRow>("select * from cal_years where is_current limit 1");
  return result.rows[0] ?? null;
}

export async function yearById(id: string, client?: Db): Promise<YearRow | null> {
  const result = await db(client).query<YearRow>("select * from cal_years where id = $1", [id]);
  return result.rows[0] ?? null;
}

export async function listYears(): Promise<YearRow[]> {
  const result = await getPool().query<YearRow>("select * from cal_years order by first_month desc");
  return result.rows;
}

export async function yearCount(): Promise<number> {
  const result = await getPool().query<{ n: string }>("select count(*)::text as n from cal_years");
  return Number(result.rows[0]?.n ?? 0);
}

export async function updateYearTheme(id: string, themeName: string): Promise<void> {
  await getPool().query("update cal_years set theme_name = $2, updated_at = now() where id = $1", [id, themeName]);
}

export async function updateYearSeo(
  id: string,
  values: {
    seoTitle: string;
    seoDescription: string;
    shareImageAlt: string;
    keywords: string;
    canonical: string;
    noindex: boolean;
    author: string;
    schemaType: string;
    schemaJson: string;
  },
): Promise<void> {
  await getPool().query(
    `update cal_years set seo_title = $2, seo_description = $3, share_image_alt = $4,
       seo_keywords = $5, seo_canonical = $6, seo_noindex = $7, seo_author = $8,
       seo_schema_type = $9, seo_schema_json = $10, updated_at = now()
     where id = $1`,
    [
      id,
      values.seoTitle,
      values.seoDescription,
      values.shareImageAlt,
      values.keywords,
      values.canonical,
      values.noindex,
      values.author,
      values.schemaType,
      values.schemaJson,
    ],
  );
}

/** How much a year holds, for the delete confirmation. */
export async function yearUsage(id: string): Promise<{ events: number; rhythm: number }> {
  const result = await getPool().query<{ events: string; rhythm: string }>(
    `select (select count(*) from cal_events where year_id = $1)::text as events,
            (select count(*) from cal_rhythm where year_id = $1)::text as rhythm`,
    [id],
  );
  return { events: Number(result.rows[0]?.events ?? 0), rhythm: Number(result.rows[0]?.rhythm ?? 0) };
}

/**
 * Deletes a year that is not on the site, with its events, photos, filters and rhythm cards.
 * Returns the photo paths it held (the caller removes files nothing else uses), or a reason.
 */
export async function deleteYear(id: string): Promise<{ ok: true; paths: string[] } | { ok: false; reason: "missing" | "current" }> {
  return withTx(async (client) => {
    const locked = await client.query<YearRow>("select * from cal_years where id = $1 for update", [id]);
    const year = locked.rows[0];
    if (!year) return { ok: false, reason: "missing" };
    if (year.is_current) return { ok: false, reason: "current" };
    const photos = await client.query<{ file: string; thumb: string }>(
      "select p.file, p.thumb from cal_photos p join cal_events e on e.id = p.event_id where e.year_id = $1",
      [id],
    );
    const rhythm = await client.query<{ photo: string | null }>("select photo from cal_rhythm where year_id = $1", [id]);
    // Children first: events and rhythm cards point at filters, options point at groups.
    await client.query("delete from cal_events where year_id = $1", [id]);
    await client.query("delete from cal_rhythm where year_id = $1", [id]);
    await client.query("delete from cal_filters where year_id = $1 and parent_id is not null", [id]);
    await client.query("delete from cal_filters where year_id = $1", [id]);
    await client.query("delete from cal_years where id = $1", [id]);
    const paths = [
      ...photos.rows.flatMap((row) => [row.file, row.thumb]),
      ...rhythm.rows.map((row) => row.photo).filter((path): path is string => Boolean(path)),
      ...(year.share_image ? [year.share_image] : []),
    ];
    return { ok: true, paths };
  });
}

/** Changes a year's label and months. The caller checks that no event falls outside them. */
export async function updateYearSpan(id: string, values: { label: string; firstMonth: string; lastMonth: string }): Promise<void> {
  await getPool().query(
    "update cal_years set label = $2, first_month = $3, last_month = $4, updated_at = now() where id = $1",
    [id, values.label, `${values.firstMonth}-01`, `${values.lastMonth}-01`],
  );
}

/** Every year parents can pick on the website, newest first. Only published events ever show. */
export async function publicYears(): Promise<YearRow[]> {
  const result = await getPool().query<YearRow>("select * from cal_years order by first_month desc");
  return result.rows;
}

export async function yearByLabel(label: string): Promise<YearRow | null> {
  const result = await getPool().query<YearRow>("select * from cal_years where label = $1", [label]);
  return result.rows[0] ?? null;
}

export async function updateMonthLines(id: string, lines: Record<string, string>): Promise<void> {
  await getPool().query("update cal_years set month_lines = $2::jsonb, updated_at = now() where id = $1", [
    id,
    JSON.stringify(lines),
  ]);
}

/** Sets the year's share image and returns the previous path, if any. */
export async function setShareImage(id: string, path: string | null): Promise<string | null> {
  return withTx(async (client) => {
    const old = await client.query<{ share_image: string | null }>(
      "select share_image from cal_years where id = $1 for update",
      [id],
    );
    if (!old.rowCount) return null;
    await client.query("update cal_years set share_image = $2, updated_at = now() where id = $1", [id, path]);
    return old.rows[0].share_image;
  });
}

export async function makeCurrent(id: string): Promise<void> {
  await withTx(async (client) => {
    await client.query("update cal_years set is_current = false, updated_at = now() where is_current and id <> $1", [id]);
    await client.query("update cal_years set is_current = true, updated_at = now() where id = $1", [id]);
  });
}

/** Creates a year and copies filters and rhythm cards from `fromYearId`. Events are not copied. */
export async function createYearFrom(
  fromYearId: string | null,
  values: { label: string; themeName: string; firstMonth: string; lastMonth: string },
): Promise<string> {
  return withTx(async (client) => {
    const source = fromYearId ? await yearById(fromYearId, client) : null;
    const inserted = await client.query<{ id: string }>(
      `insert into cal_years (label, theme_name, first_month, last_month, seo_title, seo_description)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [
        values.label,
        values.themeName,
        `${values.firstMonth}-01`,
        `${values.lastMonth}-01`,
        source ? source.seo_title.replaceAll(source.theme_name, values.themeName) : `Theme of the Year — ${values.themeName} | Wellsprings Academy`,
        source?.seo_description ?? "",
      ],
    );
    const yearId = inserted.rows[0].id;
    if (!source) return yearId;
    const filters = await filtersForYear(source.id, client);
    const map = new Map<string, string>();
    for (const group of filters.filter((row) => row.parent_id === null)) {
      const row = await client.query<{ id: string }>(
        `insert into cal_filters (year_id, name, is_main, show_on_site, sort, active)
         values ($1, $2, $3, $4, $5, $6) returning id`,
        [yearId, group.name, group.is_main, group.show_on_site, group.sort, group.active],
      );
      map.set(group.id, row.rows[0].id);
    }
    for (const option of filters.filter((row) => row.parent_id !== null)) {
      const parent = map.get(option.parent_id as string);
      if (!parent) continue;
      const row = await client.query<{ id: string }>(
        `insert into cal_filters (year_id, parent_id, name, color_key, sort, active)
         values ($1, $2, $3, $4, $5, $6) returning id`,
        [yearId, parent, option.name, option.color_key, option.sort, option.active],
      );
      map.set(option.id, row.rows[0].id);
    }
    for (const card of await rhythmForYear(source.id, client)) {
      const strand = map.get(card.strand_id);
      if (!strand) continue;
      await client.query(
        `insert into cal_rhythm (year_id, strand_id, when_label, title, body, caption, photo, photo_alt, sort, active)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [yearId, strand, card.when_label, card.title, card.body, card.caption, card.photo, card.photo_alt, card.sort, card.active],
      );
    }
    return yearId;
  });
}

export async function eventsOutside(yearId: string, first: string, last: string): Promise<number> {
  const result = await getPool().query<{ n: string }>(
    `select count(*)::text as n from cal_events where year_id = $1
       and (start_date < $2::date or start_date >= ($3::date + interval '1 month'))`,
    [yearId, first, last],
  );
  return Number(result.rows[0]?.n ?? 0);
}

// ---- Filters -----------------------------------------------------------

export async function filtersForYear(yearId: string, client?: Db): Promise<FilterRow[]> {
  const result = await db(client).query<FilterRow>(
    "select * from cal_filters where year_id = $1 order by parent_id nulls first, sort, name",
    [yearId],
  );
  return result.rows;
}

export async function filterById(id: string, client?: Db): Promise<FilterRow | null> {
  const result = await db(client).query<FilterRow>("select * from cal_filters where id = $1", [id]);
  return result.rows[0] ?? null;
}

export async function nextSort(table: "cal_filters" | "cal_rhythm", where: string, values: unknown[], client?: Db): Promise<number> {
  const result = await db(client).query<{ n: number }>(`select coalesce(max(sort), -1) + 1 as n from ${table} where ${where}`, values);
  return Number(result.rows[0]?.n ?? 0);
}

export async function insertFilter(values: {
  yearId: string;
  parentId: string | null;
  name: string;
  colorKey: ColorKey | null;
  showOnSite: boolean;
}): Promise<void> {
  const sort = values.parentId
    ? await nextSort("cal_filters", "parent_id = $1", [values.parentId])
    : await nextSort("cal_filters", "year_id = $1 and parent_id is null", [values.yearId]);
  await getPool().query(
    `insert into cal_filters (year_id, parent_id, name, color_key, show_on_site, sort) values ($1, $2, $3, $4, $5, $6)`,
    [values.yearId, values.parentId, values.name, values.colorKey, values.showOnSite, sort],
  );
}

export async function updateFilter(
  id: string,
  values: { name: string; active: boolean; showOnSite: boolean; colorKey: ColorKey | null },
): Promise<void> {
  await getPool().query(
    `update cal_filters set name = $2, active = $3, show_on_site = $4, color_key = $5, updated_at = now() where id = $1`,
    [id, values.name, values.active, values.showOnSite, values.colorKey],
  );
}

/**
 * Deletes an option, or a group together with all its options, in one transaction.
 * Refuses while any event or rhythm card uses one of them, and names those options.
 */
export async function deleteFilter(id: string): Promise<{ main: true } | { inUse: string[] } | null> {
  return withTx(async (client) => {
    const row = (await client.query<FilterRow>("select * from cal_filters where id = $1 for update", [id])).rows[0];
    if (!row) return null;
    if (row.is_main) return { main: true };
    // A group covers itself and its options; an option covers only itself.
    const scope = row.parent_id === null ? "f.parent_id = $1" : "f.id = $1";
    await client.query(`select f.id from cal_filters f where ${scope} for update`, [id]);
    const used = await client.query<{ name: string }>(
      `select f.name from cal_filters f
       where ${scope}
         and (exists (select 1 from cal_events e where e.strand_id = f.id or f.id = any(e.option_ids))
           or exists (select 1 from cal_rhythm r where r.strand_id = f.id))
       order by f.sort, f.name`,
      [id],
    );
    if (used.rowCount) return { inUse: used.rows.map((option) => option.name) };
    if (row.parent_id === null) await client.query("delete from cal_filters where parent_id = $1", [id]);
    await client.query("delete from cal_filters where id = $1", [id]);
    return null;
  });
}

export async function moveRow(table: "cal_filters" | "cal_rhythm", id: string, direction: "up" | "down"): Promise<void> {
  await withTx(async (client) => {
    const scope =
      table === "cal_filters"
        ? "year_id = (select year_id from cal_filters where id = $1) and parent_id is not distinct from (select parent_id from cal_filters where id = $1)"
        : "year_id = (select year_id from cal_rhythm where id = $1)";
    const rows = (
      await client.query<{ id: string }>(`select id from ${table} where ${scope} order by sort, created_at for update`, [id])
    ).rows.map((row) => row.id);
    const index = rows.indexOf(id);
    const swap = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swap < 0 || swap >= rows.length) return;
    [rows[index], rows[swap]] = [rows[swap], rows[index]];
    for (let i = 0; i < rows.length; i++) {
      await client.query(`update ${table} set sort = $2, updated_at = now() where id = $1`, [rows[i], i]);
    }
  });
}

// ---- Events ------------------------------------------------------------

export async function eventsForYear(yearId: string, client?: Db): Promise<EventRow[]> {
  const result = await db(client).query<EventRow>(
    "select * from cal_events where year_id = $1 order by start_date, created_at",
    [yearId],
  );
  return result.rows;
}

export async function publicEvents(yearId: string): Promise<EventRow[]> {
  const result = await getPool().query<EventRow>(
    "select * from cal_events where year_id = $1 and status in ('published', 'cancelled') order by start_date, created_at",
    [yearId],
  );
  return result.rows;
}

export async function eventById(id: string, client?: Db): Promise<EventRow | null> {
  const result = await db(client).query<EventRow>("select * from cal_events where id = $1", [id]);
  return result.rows[0] ?? null;
}

export async function lockEvent(client: pg.PoolClient, id: string): Promise<EventRow | null> {
  const result = await client.query<EventRow>("select * from cal_events where id = $1 for update", [id]);
  return result.rows[0] ?? null;
}

export async function uniqueSlug(client: Db, yearId: string, base: string, exceptId: string | null): Promise<string> {
  const trimmed = base.slice(0, 94).replace(/-+$/g, "");
  const result = await client.query<{ slug: string }>(
    "select slug from cal_events where year_id = $1 and (slug = $2 or slug like $3) and id is distinct from $4",
    [yearId, trimmed, `${trimmed}-%`, exceptId],
  );
  const taken = new Set(result.rows.map((row) => row.slug));
  if (!taken.has(trimmed)) return trimmed;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${trimmed}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error("No free slug.");
}

export type EventWrite = Omit<EventRow, "id" | "uid" | "updated_at">;

const EVENT_COLUMNS = [
  "year_id",
  "slug",
  "slug_locked",
  "title",
  "subtitle",
  "start_date",
  "end_date",
  "moved_from",
  "strand_id",
  "option_ids",
  "grades_label",
  "body",
  "highlights",
  "recap",
  "recap_published",
  "photo_consent",
  "seo_title",
  "seo_description",
  "seo_keywords",
  "seo_noindex",
  "seo_canonical",
  "seo_schema_type",
  "seo_schema_json",
  "status",
] as const;

export async function insertEvent(client: Db, row: EventWrite): Promise<EventRow> {
  const values = EVENT_COLUMNS.map((column) => row[column]);
  const placeholders = EVENT_COLUMNS.map((_, i) => `$${i + 1}`).join(", ");
  const result = await client.query<EventRow>(
    `insert into cal_events (${EVENT_COLUMNS.join(", ")}) values (${placeholders}) returning *`,
    values,
  );
  return result.rows[0];
}

export async function updateEvent(client: Db, id: string, row: EventWrite): Promise<EventRow> {
  const sets = EVENT_COLUMNS.map((column, i) => `${column} = $${i + 2}`).join(", ");
  const result = await client.query<EventRow>(
    `update cal_events set ${sets}, updated_at = now() where id = $1 returning *`,
    [id, ...EVENT_COLUMNS.map((column) => row[column])],
  );
  return result.rows[0];
}

export async function deleteDraftEvent(id: string): Promise<string[] | null> {
  return withTx(async (client) => {
    const event = await lockEvent(client, id);
    if (!event || event.status !== "draft") return null;
    const photos = await photosForEvent(id, client);
    await client.query("delete from cal_events where id = $1", [id]);
    return photos.flatMap((photo) => [photo.file, photo.thumb]);
  });
}

// ---- Photos ------------------------------------------------------------

export async function photosForEvent(eventId: string, client?: Db): Promise<PhotoRow[]> {
  const result = await db(client).query<PhotoRow>(
    "select * from cal_photos where event_id = $1 order by sort, created_at",
    [eventId],
  );
  return result.rows;
}

export async function photosForEvents(eventIds: string[]): Promise<Map<string, PhotoRow[]>> {
  const map = new Map<string, PhotoRow[]>();
  if (!eventIds.length) return map;
  const result = await getPool().query<PhotoRow>(
    "select * from cal_photos where event_id = any($1::uuid[]) order by event_id, sort, created_at",
    [eventIds],
  );
  for (const row of result.rows) {
    const list = map.get(row.event_id) ?? [];
    list.push(row);
    map.set(row.event_id, list);
  }
  return map;
}

export async function photoCounts(yearId: string): Promise<Map<string, number>> {
  const result = await getPool().query<{ event_id: string; n: string }>(
    `select p.event_id, count(*)::text as n from cal_photos p join cal_events e on e.id = p.event_id
     where e.year_id = $1 group by p.event_id`,
    [yearId],
  );
  return new Map(result.rows.map((row) => [row.event_id, Number(row.n)]));
}

export async function photoById(id: string, client?: Db): Promise<PhotoRow | null> {
  const result = await db(client).query<PhotoRow>("select * from cal_photos where id = $1", [id]);
  return result.rows[0] ?? null;
}

export async function updatePhotoMeta(id: string, alt: string, caption: string): Promise<PhotoRow | null> {
  const result = await getPool().query<PhotoRow>(
    "update cal_photos set alt = $2, caption = $3 where id = $1 returning *",
    [id, alt, caption],
  );
  return result.rows[0] ?? null;
}

// ---- Rhythm ------------------------------------------------------------

export async function rhythmForYear(yearId: string, client?: Db): Promise<RhythmRow[]> {
  const result = await db(client).query<RhythmRow>(
    "select * from cal_rhythm where year_id = $1 order by sort, created_at",
    [yearId],
  );
  return result.rows;
}

export async function rhythmById(id: string): Promise<RhythmRow | null> {
  const result = await getPool().query<RhythmRow>("select * from cal_rhythm where id = $1", [id]);
  return result.rows[0] ?? null;
}

export async function insertRhythm(
  yearId: string,
  values: { strandId: string; whenLabel: string; title: string; body: string; caption: string; photoAlt: string },
): Promise<string> {
  const sort = await nextSort("cal_rhythm", "year_id = $1", [yearId]);
  const result = await getPool().query<{ id: string }>(
    `insert into cal_rhythm (year_id, strand_id, when_label, title, body, caption, photo_alt, sort)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [yearId, values.strandId, values.whenLabel, values.title, values.body, values.caption, values.photoAlt, sort],
  );
  return result.rows[0].id;
}

export async function updateRhythm(
  id: string,
  values: { strandId: string; whenLabel: string; title: string; body: string; caption: string; photoAlt: string; active: boolean },
): Promise<void> {
  await getPool().query(
    `update cal_rhythm set strand_id = $2, when_label = $3, title = $4, body = $5, caption = $6, photo_alt = $7,
       active = $8, updated_at = now() where id = $1`,
    [id, values.strandId, values.whenLabel, values.title, values.body, values.caption, values.photoAlt, values.active],
  );
}

export async function setRhythmPhoto(id: string, path: string | null): Promise<string | null> {
  return withTx(async (client) => {
    const old = await client.query<{ photo: string | null }>("select photo from cal_rhythm where id = $1 for update", [id]);
    if (!old.rowCount) return null;
    await client.query("update cal_rhythm set photo = $2, updated_at = now() where id = $1", [id, path]);
    return old.rows[0].photo;
  });
}

export async function deleteRhythm(id: string): Promise<string | null> {
  const result = await getPool().query<{ photo: string | null }>("delete from cal_rhythm where id = $1 returning photo", [id]);
  return result.rows[0]?.photo ?? null;
}

// ---- File references ---------------------------------------------------

/** Every calendar photo path still referenced by a row. */
export async function referencedPaths(): Promise<Set<string>> {
  const result = await getPool().query<{ path: string }>(
    `select file as path from cal_photos union select thumb from cal_photos
     union select share_image from cal_years where share_image is not null
     union select photo from cal_rhythm where photo is not null`,
  );
  return new Set(result.rows.map((row) => row.path));
}
