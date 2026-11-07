import type { NoteRow } from "./db.ts";
import { seoIsAutomatic } from "./schemas.ts";

const PILLAR_LABEL = { think: "Think", build: "Build", belong: "Belong" } as const;

/** "<uid>-<slug>" as used in /blog/… links (null while the note has no URL yet). */
export function publicSlug(row: Pick<NoteRow, "uid" | "slug">): string | null {
  return row.slug ? (row.uid ? `${row.uid}-${row.slug}` : row.slug) : null;
}

export function toPublic(row: NoteRow, featured: boolean) {
  return {
    id: row.id,
    title: row.title,
    // Public link: the unique id goes before the title, so two notes never share a URL.
    slug: publicSlug(row),
    excerpt: row.excerpt,
    body: row.body,
    pillar: row.pillar ? PILLAR_LABEL[row.pillar] : null,
    dateLabel: row.date_label,
    author: row.author,
    coverImage: row.cover_image,
    imageAlt: row.image_alt,
    caption: row.caption,
    coverWidth: row.cover_width,
    coverHeight: row.cover_height,
    publishDate: row.publish_date,
    featured,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    seoKeywords: row.seo_keywords,
    seoCanonical: row.seo_canonical,
    seoRobots: row.seo_noindex ? "noindex, nofollow" : "index, follow",
    seoSchemaType: row.seo_schema_type,
    seoSchemaJson: row.seo_schema_json,
  };
}

export function toAdmin(row: NoteRow) {
  return {
    ...toPublic(row, row.featured),
    slug: row.slug,
    uid: row.uid,
    includesStudent: row.includes_student,
    photoConsent: row.photo_consent,
    nameConsent: row.name_consent,
    authorTitle: row.author_title,
    authorFirstName: row.author_first_name,
    authorLastName: row.author_last_name,
    authorDesignation: row.author_designation,
    authorGrade: row.author_grade,
    seoAutomatic: seoIsAutomatic(row.seo_title, row.seo_description, row.title, row.excerpt),
    slugLocked: row.slug_locked,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
