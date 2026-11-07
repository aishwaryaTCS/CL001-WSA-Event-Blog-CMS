import { getPool } from "../db.ts";
import { insertEvent, uniqueSlug, withTx } from "./db.ts";
import {
  autoEventSeoDescription,
  autoEventSeoTitle,
  isIsoDate,
  slugBase,
  type ColorKey,
} from "./schemas.ts";
import { SEED_EVENTS, SEED_MONTH_LINES, SEED_RHYTHM } from "./seed-data.ts";

// CALENDAR_SPEC.md §12. Runs only while cal_years is empty, in one transaction.

const YEAR = {
  label: "2026–27", // Confirm with the school (spec §16.1).
  theme: "Roots to Wings",
  firstMonth: "2026-05-01",
  lastMonth: "2027-04-01",
  seoTitle: "Theme of the Year — Roots to Wings | Wellsprings Academy",
  seoDescription:
    "The Wellsprings year, on one calendar. Roots to Wings — the theme, the monthly rhythm, and every event that turns it into a real year at school.",
};

const STRANDS: Array<[string, ColorKey]> = [
  ["Field Visits & Stay Over", "sage"],
  ["Important Academic Days", "coral"],
  ["Holidays", "grey"],
  ["Major Events", "sun"],
  ["Celebration", "slate"],
];

const GRADES = ["Nursery", "K1", "K2", ...Array.from({ length: 8 }, (_, i) => `Grade ${i + 1}`), "Staff", "Parents"];

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** `15–23 July · …` on a 15 July event gives 23 July. Anything else stays single-day. */
export function seedEndDate(start: string, subtitle: string): string | null {
  const match = subtitle.match(/^(\d{1,2})–(\d{1,2}) ([A-Za-z]+)/);
  if (!match) return null;
  const [, from, to, monthName] = match;
  const month = MONTHS.indexOf(monthName.toLowerCase()) + 1;
  if (month !== Number(start.slice(5, 7)) || Number(from) !== Number(start.slice(8, 10))) return null;
  const end = `${start.slice(0, 8)}${String(Number(to)).padStart(2, "0")}`;
  return isIsoDate(end) && end > start ? end : null;
}

export async function seedCalendar(): Promise<void> {
  const existing = await getPool().query("select 1 from cal_years limit 1");
  if (existing.rowCount) return;

  let current = "";
  try {
    await withTx(async (client) => {
      const year = await client.query<{ id: string }>(
        `insert into cal_years (label, theme_name, first_month, last_month, month_lines, is_current, seo_title, seo_description)
         values ($1, $2, $3, $4, $5::jsonb, true, $6, $7) returning id`,
        [YEAR.label, YEAR.theme, YEAR.firstMonth, YEAR.lastMonth, JSON.stringify(SEED_MONTH_LINES), YEAR.seoTitle, YEAR.seoDescription],
      );
      const yearId = year.rows[0].id;

      const strandGroup = await client.query<{ id: string }>(
        "insert into cal_filters (year_id, name, is_main, show_on_site, sort) values ($1, 'Strand', true, true, 0) returning id",
        [yearId],
      );
      const strandIds = new Map<string, string>();
      for (const [index, [name, color]] of STRANDS.entries()) {
        const row = await client.query<{ id: string }>(
          "insert into cal_filters (year_id, parent_id, name, color_key, sort) values ($1, $2, $3, $4, $5) returning id",
          [yearId, strandGroup.rows[0].id, name, color, index],
        );
        strandIds.set(name, row.rows[0].id);
      }

      const gradeGroup = await client.query<{ id: string }>(
        "insert into cal_filters (year_id, name, show_on_site, sort) values ($1, 'Grade', false, 1) returning id",
        [yearId],
      );
      for (const [index, name] of GRADES.entries()) {
        await client.query("insert into cal_filters (year_id, parent_id, name, sort) values ($1, $2, $3, $4)", [
          yearId,
          gradeGroup.rows[0].id,
          name,
          index,
        ]);
      }

      for (const event of SEED_EVENTS) {
        current = event.title;
        const strandId = strandIds.get(event.category);
        if (!strandId) throw new Error(`Unknown strand ${event.category}`);
        const slug = await uniqueSlug(client, yearId, slugBase(event.date, event.title), null);
        await insertEvent(client, {
          year_id: yearId,
          slug,
          slug_locked: true,
          title: event.title,
          subtitle: event.subtitle,
          start_date: event.date,
          end_date: seedEndDate(event.date, event.subtitle),
          moved_from: null,
          strand_id: strandId,
          option_ids: [],
          grades_label: event.grades ?? "",
          body: event.body,
          highlights: event.highlights ?? [],
          recap: "",
          recap_published: false,
          photo_consent: false,
          seo_title: autoEventSeoTitle(event.title, YEAR.theme),
          seo_description: autoEventSeoDescription(event.subtitle, event.body),
          seo_keywords: "",
          seo_noindex: false,
          seo_canonical: "",
          seo_schema_type: "",
          seo_schema_json: "",
          status: "published",
        });
      }

      for (const [index, card] of SEED_RHYTHM.entries()) {
        current = card.title;
        const strandId = strandIds.get(card.category);
        if (!strandId) throw new Error(`Unknown strand ${card.category}`);
        await client.query(
          `insert into cal_rhythm (year_id, strand_id, when_label, title, body, caption, sort)
           values ($1, $2, $3, $4, $5, $6, $7)`,
          [yearId, strandId, card.when, card.title, card.body, card.caption, index],
        );
      }
    });
  } catch (error) {
    console.error(`Calendar seed failed at "${current}". Nothing was written.`);
    throw error;
  }
  console.log(`Calendar seeded: ${SEED_EVENTS.length} events, ${SEED_RHYTHM.length} rhythm cards.`);
}
