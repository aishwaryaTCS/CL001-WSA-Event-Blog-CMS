import type { Express } from "express";
import {
  currentYear,
  filtersForYear,
  photosForEvents,
  publicEvents,
  publicYears,
  rhythmForYear,
  type FilterRow,
  type YearRow,
} from "./db.ts";
import { fileFor } from "./photos.ts";
import { CAL_COPY, PHOTO_NAME, eventState, kolkataToday, monthKeys } from "./schemas.ts";

export async function publicCalendar(year: YearRow, years: YearRow[] = []): Promise<Record<string, unknown>> {
  const today = kolkataToday();
  const [filters, events, rhythm] = await Promise.all([
    filtersForYear(year.id),
    publicEvents(year.id),
    rhythmForYear(year.id),
  ]);
  const byId = new Map(filters.map((row) => [row.id, row]));
  const main = filters.find((row) => row.is_main && row.parent_id === null);
  const strandOptions = filters.filter((row) => main && row.parent_id === main.id);
  const visibleGroups = filters.filter((row) => row.parent_id === null && !row.is_main && row.active && row.show_on_site);
  const visibleOptionIds = new Set<string>();
  const filterGroups = visibleGroups
    .map((group) => {
      const options = filters.filter((row) => row.parent_id === group.id && row.active);
      for (const option of options) visibleOptionIds.add(option.id);
      return { id: group.id, name: group.name, options: options.map((row) => ({ id: row.id, name: row.name })) };
    })
    .filter((group) => group.options.length > 0);

  const recapIds = events.filter((row) => row.status === "published" && row.recap_published).map((row) => row.id);
  const photos = await photosForEvents(recapIds);
  const strandOf = (id: string): { name: string; color: string } => {
    const row: FilterRow | undefined = byId.get(id);
    return { name: row?.name ?? "", color: row?.color_key ?? "grey" };
  };

  return {
    year: {
      label: year.label,
      theme: year.theme_name,
      seoTitle: year.seo_title,
      seoDescription: year.seo_description,
      shareImage: year.share_image,
      shareImageAlt: year.share_image_alt,
      keywords: year.seo_keywords,
      canonical: year.seo_canonical,
      robots: year.seo_noindex ? "noindex, nofollow" : "index, follow",
      author: year.seo_author || "Wellsprings Academy",
      schemaType: year.seo_schema_type,
      schemaJson: year.seo_schema_json,
      current: year.is_current,
      firstMonth: year.first_month.slice(0, 7),
      lastMonth: year.last_month.slice(0, 7),
    },
    // Years parents can switch between: the one on the site and earlier years with events.
    years: years.map((row) => ({ label: row.label, theme: row.theme_name, current: row.is_current })),
    // The main filter group's name, as the admin last saved it (for "Filter by …").
    strandLabel: main?.name ?? "Strand",
    today,
    months: monthKeys(year.first_month, year.last_month).map((key) => ({ key, line: year.month_lines[key] ?? "" })),
    strands: strandOptions
      .filter((row) => row.active)
      .map((row) => ({ id: row.id, name: row.name, color: row.color_key ?? "grey" })),
    filters: filterGroups,
    events: events.map((row) => {
      const showRecap = row.status === "published" && row.recap_published;
      const strand = strandOf(row.strand_id);
      return {
        // Pop-up link: the unique id goes before the title, so two events never share a URL.
        slug: `${row.uid}-${row.slug}`,
        title: row.title,
        subtitle: row.subtitle,
        start: row.start_date,
        end: row.end_date,
        movedFrom: row.moved_from,
        strandId: row.strand_id,
        strandName: strand.name,
        strandColor: strand.color,
        optionIds: row.option_ids.filter((id) => visibleOptionIds.has(id)),
        grades: row.grades_label,
        body: row.body,
        highlights: row.highlights,
        state: eventState(row, today),
        seoTitle: row.seo_title,
        seoDescription: row.seo_description,
        seoKeywords: row.seo_keywords,
        seoRobots: row.seo_noindex ? "noindex, nofollow" : "index, follow",
        seoCanonical: row.seo_canonical,
        seoSchemaType: row.seo_schema_type,
        seoSchemaJson: row.seo_schema_json,
        recap: showRecap ? row.recap : "",
        photos: showRecap
          ? (photos.get(row.id) ?? []).map((photo) => ({
              src: photo.file,
              thumb: photo.thumb,
              width: photo.width,
              height: photo.height,
              alt: photo.alt,
              caption: photo.caption,
            }))
          : [],
      };
    }),
    rhythm: rhythm
      .filter((row) => row.active)
      .map((row) => {
        const strand = strandOf(row.strand_id);
        return {
          strandId: row.strand_id,
          strandName: strand.name,
          strandColor: strand.color,
          when: row.when_label,
          title: row.title,
          body: row.body,
          caption: row.caption,
          photo: row.photo,
          photoAlt: row.photo_alt,
        };
      }),
  };
}

export function mountCalendarPublic(app: Express): void {
  app.get("/api/calendar", async (req, res, next) => {
    try {
      const years = await publicYears();
      const asked = typeof req.query.year === "string" ? req.query.year.trim().slice(0, 20) : "";
      // Only years in the public list can be opened: never a future or empty year.
      const year = asked ? years.find((row) => row.label === asked) ?? null : (years.find((row) => row.is_current) ?? (await currentYear()));
      if (!year) {
        res.status(404).json({ error: CAL_COPY.notFound });
        return;
      }
      // no-cache + Express's default ETag: a repeat request with nothing changed gets a 304.
      res.setHeader("Cache-Control", "no-cache");
      res.json(await publicCalendar(year, years));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/calendar/photos/:name", (req, res) => {
    const name = String(req.params.name);
    const full = PHOTO_NAME.test(name) ? fileFor(name) : null;
    if (!full) {
      res.status(404).json({ error: CAL_COPY.notFound });
      return;
    }
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.sendFile(full, { dotfiles: "deny" }, (error) => {
      if (error && !res.headersSent) res.status(404).json({ error: CAL_COPY.notFound });
    });
  });
}
