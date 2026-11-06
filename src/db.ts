import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { ROOT } from "./root.ts";
import { SEED_NOTES } from "./seed/notes.ts";
import type { Designation, NoteInput, Pillar, Salutation } from "./schemas.ts";
import { DESIGNATIONS, SALUTATIONS } from "./schemas.ts";

const { Pool, types } = pg;
types.setTypeParser(1082, (value: string) => value);

export type NoteRow = {
  id: string;
  title: string;
  slug: string | null;
  excerpt: string;
  body: string[];
  pillar: Pillar | null;
  date_label: string;
  author: string;
  author_title: Salutation | null;
  author_first_name: string;
  author_last_name: string;
  author_designation: Designation | null;
  author_grade: number | null;
  cover_image: string | null;
  cover_width: number | null;
  cover_height: number | null;
  image_alt: string;
  caption: string;
  publish_date: string;
  status: "draft" | "published";
  featured: boolean;
  includes_student: boolean;
  photo_consent: boolean;
  name_consent: boolean;
  seo_title: string | null;
  seo_description: string | null;
  slug_locked: boolean;
  created_at: Date;
  updated_at: Date;
};

export type Admin = {
  id: string;
  email: string;
  password_hash: string;
  updated_at: Date;
};

let pool: pg.Pool;

export function getPool(): pg.Pool {
  return pool;
}

export async function openDatabase(connectionString: string): Promise<void> {
  pool = new Pool({ connectionString, max: 5, statement_timeout: 10000 });
  await pool.query("select 1");
}

export async function migrate(): Promise<void> {
  await pool.query(`
    create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `);
  const dir = path.join(ROOT, "db", "migrations");
  const files = (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const existing = await pool.query("select 1 from schema_migrations where filename = $1", [file]);
    if (existing.rowCount) continue;
    const sql = await readFile(path.join(dir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into schema_migrations (filename) values ($1)", [file]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}

export async function adminCount(): Promise<number> {
  const result = await pool.query("select count(*)::int as count from admins");
  return result.rows[0].count as number;
}

export async function createAdmin(email: string, passwordHash: string): Promise<void> {
  await pool.query("insert into admins (email, password_hash) values ($1, $2)", [email, passwordHash]);
}

export async function adminByEmail(email: string): Promise<Admin | null> {
  const result = await pool.query(
    "select id, email, password_hash, updated_at from admins where email = $1",
    [email],
  );
  return result.rows[0] ? mapAdmin(result.rows[0]) : null;
}

export async function adminById(id: string): Promise<Admin | null> {
  const result = await pool.query(
    "select id, email, password_hash, updated_at from admins where id = $1",
    [id],
  );
  return result.rows[0] ? mapAdmin(result.rows[0]) : null;
}

export async function updatePassword(id: string, passwordHash: string): Promise<Admin | null> {
  const result = await pool.query(
    `update admins set password_hash = $2, updated_at = now() where id = $1
     returning id, email, password_hash, updated_at`,
    [id, passwordHash],
  );
  return result.rows[0] ? mapAdmin(result.rows[0]) : null;
}

export async function seedNotes(): Promise<void> {
  for (const note of SEED_NOTES) {
    await pool.query(
      `insert into blog_posts (
         title, slug, excerpt, body, pillar, date_label, author,
         publish_date, status, featured, includes_student, photo_consent, name_consent, slug_locked,
         seo_title, seo_description, created_at, updated_at
       ) values (
         $1, $2, $3, $4, $5, $6, $7,
         '2026-01-01', 'published', $8, true, true, true, true,
         $9, $10, $11, $11
       )
       on conflict (slug) do nothing`,
      [
        note.title,
        note.slug,
        note.excerpt,
        note.body,
        note.pillar,
        note.date,
        note.author,
        note.featured,
        `${note.title} — Notes from school | Wellsprings Academy`.slice(0, 200),
        note.excerpt,
        note.createdAt,
      ],
    );
  }
}

const NOTE_COLUMNS = `
  id, title, slug, excerpt, body, pillar, date_label, author,
  author_title, author_first_name, author_last_name, author_designation, author_grade,
  cover_image, cover_width, cover_height, image_alt, caption,
  publish_date, status, featured, includes_student, photo_consent, name_consent,
  seo_title, seo_description, slug_locked, created_at, updated_at
`;

const LIST_COLUMNS = `
  id, title, slug, excerpt, pillar, date_label, author,
  cover_image, cover_width, cover_height, image_alt,
  publish_date, status, featured, created_at, updated_at,
  body, caption, includes_student, photo_consent, name_consent,
  seo_title, seo_description, slug_locked,
  author_title, author_first_name, author_last_name, author_designation, author_grade
`;

export async function listNotes(): Promise<NoteRow[]> {
  const result = await pool.query(
    `select ${LIST_COLUMNS} from blog_posts order by publish_date desc, created_at desc`,
  );
  return result.rows.map(mapNote);
}

export async function noteById(id: string): Promise<NoteRow | null> {
  const result = await pool.query(`select ${NOTE_COLUMNS} from blog_posts where id = $1`, [id]);
  return result.rows[0] ? mapNote(result.rows[0]) : null;
}

export async function slugTaken(slug: string, exceptId: string | null): Promise<boolean> {
  const result = await pool.query(
    "select 1 from blog_posts where slug = $1 and ($2::uuid is null or id <> $2::uuid)",
    [slug, exceptId],
  );
  return Boolean(result.rowCount);
}

export async function listVisible(): Promise<NoteRow[]> {
  const result = await pool.query(
    `select ${NOTE_COLUMNS}
     from blog_posts
     where status = 'published'
       and publish_date <= (now() at time zone 'Asia/Kolkata')::date
     order by publish_date desc, created_at desc`,
  );
  return result.rows.map(mapNote);
}

export async function saveNote(
  id: string | null,
  input: NoteInput,
  lockedSlug: string | null,
  size: { width: number; height: number } | null,
): Promise<NoteRow> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (input.featured) {
      await client.query("update blog_posts set featured = false where featured = true and ($1::uuid is null or id <> $1::uuid)", [
        id,
      ]);
    }
    const slug = lockedSlug ?? input.slug;
    const params = [
      input.title,
      slug,
      input.excerpt,
      input.body,
      input.pillar,
      input.dateLabel,
      input.author,
      input.authorFirstName,
      input.authorLastName,
      input.authorDesignation,
      input.authorGrade,
      input.coverImage,
      size?.width ?? null,
      size?.height ?? null,
      input.imageAlt,
      input.caption,
      input.publishDate,
      input.status,
      input.featured,
      input.includesStudent,
      input.photoConsent,
      input.nameConsent,
      input.seoTitle,
      input.seoDescription,
      input.authorTitle,
    ];
    const result = id
      ? await client.query(
          `update blog_posts set
             title = $1,
             slug = case when slug_locked then slug else $2 end,
             excerpt = $3,
             body = $4,
             pillar = $5,
             date_label = $6,
             author = $7,
             author_first_name = $8,
             author_last_name = $9,
             author_designation = $10,
             author_grade = $11,
             cover_image = $12,
             cover_width = $13,
             cover_height = $14,
             image_alt = $15,
             caption = $16,
             publish_date = $17,
             status = $18,
             featured = $19,
             includes_student = $20,
             photo_consent = $21,
             name_consent = $22,
             seo_title = $23,
             seo_description = $24,
             author_title = $25,
             slug_locked = slug_locked or $18 = 'published',
             updated_at = now()
           where id = $26
           returning ${NOTE_COLUMNS}`,
          [...params, id],
        )
      : await client.query(
          `insert into blog_posts (
             title, slug, excerpt, body, pillar, date_label, author,
             author_first_name, author_last_name, author_designation, author_grade,
             cover_image, cover_width, cover_height, image_alt, caption,
             publish_date, status, featured, includes_student, photo_consent, name_consent,
             seo_title, seo_description, slug_locked, author_title
           ) values (
             $1, $2, $3, $4, $5, $6, $7,
             $8, $9, $10, $11,
             $12, $13, $14, $15, $16,
             $17, $18, $19, $20, $21, $22,
             $23, $24, $18 = 'published', $25
           )
           returning ${NOTE_COLUMNS}`,
          params,
        );
    await client.query("commit");
    return mapNote(result.rows[0]);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function unpublishNote(id: string): Promise<NoteRow | null> {
  const result = await pool.query(
    `update blog_posts
     set status = 'draft', featured = false, updated_at = now()
     where id = $1
     returning ${NOTE_COLUMNS}`,
    [id],
  );
  return result.rows[0] ? mapNote(result.rows[0]) : null;
}

export async function deleteNote(id: string): Promise<NoteRow | null> {
  const result = await pool.query(`delete from blog_posts where id = $1 returning ${NOTE_COLUMNS}`, [id]);
  return result.rows[0] ? mapNote(result.rows[0]) : null;
}

function mapAdmin(row: pg.QueryResultRow): Admin {
  return {
    id: String(row.id),
    email: String(row.email),
    password_hash: String(row.password_hash),
    updated_at: row.updated_at instanceof Date ? row.updated_at : new Date(String(row.updated_at)),
  };
}

function mapNote(row: pg.QueryResultRow): NoteRow {
  const pillar = row.pillar === "think" || row.pillar === "build" || row.pillar === "belong" ? row.pillar : null;
  const designationRaw = row.author_designation ? String(row.author_designation) : "";
  const author_designation = (DESIGNATIONS as readonly string[]).includes(designationRaw)
    ? (designationRaw as Designation)
    : null;
  const titleRaw = row.author_title ? String(row.author_title) : "";
  const author_title = (SALUTATIONS as readonly string[]).includes(titleRaw) ? (titleRaw as Salutation) : null;
  const grade = row.author_grade == null ? null : Number(row.author_grade);
  return {
    id: String(row.id),
    title: String(row.title),
    slug: row.slug ? String(row.slug) : null,
    excerpt: String(row.excerpt ?? ""),
    body: Array.isArray(row.body) ? row.body.map(String) : [],
    pillar,
    date_label: String(row.date_label ?? ""),
    author: String(row.author ?? ""),
    author_title,
    author_first_name: String(row.author_first_name ?? ""),
    author_last_name: String(row.author_last_name ?? ""),
    author_designation,
    author_grade: grade != null && Number.isInteger(grade) && grade >= 1 && grade <= 10 ? grade : null,
    cover_image: row.cover_image ? String(row.cover_image) : null,
    cover_width: row.cover_width == null ? null : Number(row.cover_width),
    cover_height: row.cover_height == null ? null : Number(row.cover_height),
    image_alt: String(row.image_alt ?? ""),
    caption: String(row.caption ?? ""),
    publish_date: String(row.publish_date).slice(0, 10),
    status: row.status === "published" ? "published" : "draft",
    featured: row.featured === true,
    includes_student: row.includes_student === true,
    photo_consent: row.photo_consent === true,
    name_consent: row.name_consent === true,
    seo_title: row.seo_title ? String(row.seo_title) : null,
    seo_description: row.seo_description ? String(row.seo_description) : null,
    slug_locked: row.slug_locked === true,
    created_at: row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
    updated_at: row.updated_at instanceof Date ? row.updated_at : new Date(String(row.updated_at)),
  };
}
