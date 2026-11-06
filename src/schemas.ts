import { z } from "zod";

export const CARD_TITLE_CHARS = 70;
export const CARD_EXCERPT_CHARS = 160;

export const DESIGNATIONS = [
  "Class Teacher",
  "Subject Teacher",
  "Head of Department",
  "Coordinator",
  "Counsellor",
  "Librarian",
  "Sports Coach",
  "Vice Principal",
  "Principal",
] as const;

export type Designation = (typeof DESIGNATIONS)[number];

export const SALUTATIONS = ["Mr.", "Ms.", "Mrs.", "Miss", "Dr."] as const;

export type Salutation = (typeof SALUTATIONS)[number];

export const DATE_LABEL_PATTERN =
  /^(Term 1 · Week (?:[1-9]|1[0-9]|2[0-5])|Term 2 · Week (?:2[6-9]|3[0-9]|4[0-9]|5[0-2]))$/;

export const COPY = {
  headlineRequired: "Headline is required.",
  titleCap: "Headline must be 120 characters or fewer.",
  excerptCap: "Short summary must be 300 characters or fewer.",
  paragraphCap: "Each paragraph must be 1,000 characters or fewer.",
  paragraphCount: "A note can have at most 8 paragraphs.",
  dateCap: "School date must be 40 characters or fewer.",
  authorCap: "Written by must be 100 characters or fewer.",
  firstNameCap: "First name must be 24 characters or fewer.",
  lastNameCap: "Last name must be 24 characters or fewer.",
  altCap: "What is in the photo must be 200 characters or fewer.",
  captionCap: "Caption must be 160 characters or fewer.",
  slugCap: "URL must be 80 characters or fewer.",
  seoTitleCap: "Search title must be 200 characters or fewer.",
  seoDescriptionCap: "Search description must be 300 characters or fewer.",
  addHeadline: "Add the headline before publishing.",
  addSummary: "Add the summary before publishing.",
  addNote: "Add the note before publishing.",
  addPillar: "Choose Think, Build, or Belong before publishing.",
  addDate: "Choose the term and week before publishing.",
  addDesignation: "Choose a designation before publishing.",
  addFirstName: "Add the first name before publishing.",
  addCover: "Add a cover photo before publishing.",
  coverSize: "Cover photo must be 1200 × 800 pixels. Upload it again.",
  addAlt: "Describe what is in the photo before publishing.",
  addSlug: "Add a URL before publishing.",
  slugChars: "Use only letters, numbers, and hyphens.",
  slugTaken: "That URL is already used.",
  tickPhoto: "Tick photo before publishing.",
  tickNames: "Tick names before publishing.",
  tickBoth: "Tick photo and names before publishing.",
  photoRejected: "Photo must be a JPEG, PNG, or WebP under 5 MB.",
  photoSize: "Photo is too small. Use at least 1200 × 800.",
  photoTooLarge: "Photo is too big. Use up to 3000 × 2000.",
  photoShape: "Use a sideways (landscape) photo. Standing or square photos do not fit.",
  cardCut: "The card will end this line with …",
  about60: "About 60 characters.",
  about160: "About 160 characters.",
  longHeadlineSeo: "Long headline: Google may cut the title. Write a shorter search title.",
  badLogin: "That email or password is not right.",
  wait: "Wait a moment and try again.",
  badPassword: "That password is not right.",
  passwordChanged: "Password changed. Sign in with the new one.",
  passwordShort: "New password must be at least 12 characters.",
  passwordLong: "New password must be 72 bytes or fewer.",
  passwordMatch: "Type the same new password in both fields.",
  draftSaved: "Draft saved.",
  published: "Published.",
  deleteDraft: "Delete this draft? This cannot be undone.",
  deletePublishedNote: "Delete this note? It comes off the website at once. This cannot be undone.",
  unpublish: "Unpublish this note? The page comes off the site. The URL is kept so you can publish it again.",
  previewDirty: "Save the draft to preview.",
  previewBar: "Only you can see this.",
  signInRequired: "Sign in required.",
  notFound: "Not found.",
  badDate: "Use a real calendar date.",
  badDateLabel: "Choose a term and week from the lists.",
  badDesignation: "Choose a designation from the list.",
  badSalutation: "Choose a salutation from the list.",
  badGrade: "Choose a grade from the list.",
} as const;

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const COVER_PATH = /^\/api\/uploads\/[a-f0-9]{32}\.webp$/;
export const COVER_WIDTH = 1200;
export const COVER_HEIGHT = 800;

/** Uploaded cover photo limits, before it is cropped to COVER_WIDTH × COVER_HEIGHT. */
export const COVER_UPLOAD = {
  minWidth: 1200,
  minHeight: 800,
  maxWidth: 3000,
  maxHeight: 2000,
  /** Width ÷ height. 4:3 is 1.333, 16:9 is 1.778; a little slack for photos cropped by hand. */
  minRatio: 1.3,
  maxRatio: 1.8,
} as const;

export type CoverUploadProblem = "small" | "large" | "shape";

/** Checks the photo as it will be shown, after any rotation. */
export function checkCoverUpload(width: number, height: number): CoverUploadProblem | null {
  const ratio = width / height;
  if (ratio < COVER_UPLOAD.minRatio || ratio > COVER_UPLOAD.maxRatio) return "shape";
  if (width < COVER_UPLOAD.minWidth || height < COVER_UPLOAD.minHeight) return "small";
  if (width > COVER_UPLOAD.maxWidth || height > COVER_UPLOAD.maxHeight) return "large";
  return null;
}

export type Pillar = "think" | "build" | "belong";
export type NoteStatus = "draft" | "published";

export type NoteInput = {
  title: string;
  excerpt: string;
  body: string[];
  bodyText: string;
  pillar: Pillar | null;
  dateLabel: string;
  author: string;
  authorTitle: Salutation | null;
  authorFirstName: string;
  authorLastName: string;
  authorDesignation: Designation | null;
  authorGrade: number | null;
  imageAlt: string;
  caption: string;
  slug: string | null;
  publishDate: string;
  featured: boolean;
  includesStudent: boolean;
  photoConsent: boolean;
  nameConsent: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  coverImage: string | null;
  status: NoteStatus;
};

export type PublishContext = {
  previousDateLabel?: string;
  previousAuthor?: string;
  coverWidth?: number | null;
  coverHeight?: number | null;
};

export function kolkataToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export function autoSeoTitle(headline: string): string {
  return `${headline} — Notes from school | Wellsprings Academy`.slice(0, 200);
}

export function autoSeoDescription(summary: string): string | null {
  const trimmed = summary.trim();
  return trimmed ? trimmed.slice(0, 300) : null;
}

export function composeAuthor(
  title: string | null,
  firstName: string,
  lastName: string,
  designation: string | null,
  grade: number | null,
): string {
  const name = [title ?? "", firstName.trim(), lastName.trim()].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const parts: string[] = [];
  if (name && designation) parts.push(`${name}, ${designation}`);
  else if (name) parts.push(name);
  else if (designation) parts.push(designation);
  let result = parts.join("");
  if (grade != null) result = `${result} · Grade ${grade}`;
  return result.replace(/\s+/g, " ").trim().slice(0, 100);
}

export function authorIsStructured(
  input: Pick<NoteInput, "authorTitle" | "authorFirstName" | "authorLastName" | "authorDesignation" | "authorGrade">,
): boolean {
  return Boolean(
    input.authorTitle ||
      input.authorFirstName.trim() ||
      input.authorLastName.trim() ||
      input.authorDesignation ||
      input.authorGrade != null,
  );
}

export function dateLabelIsValid(value: string): boolean {
  return DATE_LABEL_PATTERN.test(value);
}

export function parseDateLabel(value: string): { term: "1" | "2"; week: string } | null {
  const match = value.match(/^Term ([12]) · Week (\d+)$/);
  if (!match) return null;
  const term = match[1] === "1" ? "1" : "2";
  const week = match[2];
  if (!dateLabelIsValid(value)) return null;
  return { term, week };
}

export function resolveSeoFields(
  incomingTitle: string,
  incomingDescription: string,
  headline: string,
  summary: string,
  previous: { title: string; excerpt: string; seo_title: string | null; seo_description: string | null } | null,
): { seoTitle: string | null; seoDescription: string | null } {
  const newAutoTitle = autoSeoTitle(headline);
  const newAutoDescription = autoSeoDescription(summary);
  const titleTrim = incomingTitle.trim();
  const descriptionTrim = incomingDescription.trim();

  // A field counts as automatic when it is empty, or still holds the automatic text for the
  // old or the new headline/summary. Anything else the admin typed is kept as a custom value.
  const previousAutoTitle = previous ? autoSeoTitle(previous.title) : null;
  const titleIsAuto = !titleTrim || titleTrim === newAutoTitle || titleTrim === previousAutoTitle;
  const seoTitle: string | null = titleIsAuto ? (headline ? newAutoTitle : null) : titleTrim.slice(0, 200);

  const previousAutoDescription = previous ? autoSeoDescription(previous.excerpt) : null;
  const descriptionIsAuto =
    !descriptionTrim || descriptionTrim === newAutoDescription || descriptionTrim === previousAutoDescription;
  const seoDescription: string | null = descriptionIsAuto ? newAutoDescription : descriptionTrim.slice(0, 300);

  return { seoTitle, seoDescription };
}

export function seoIsAutomatic(
  title: string | null,
  description: string | null,
  headline: string,
  summary: string,
): boolean {
  const autoTitle = headline ? autoSeoTitle(headline) : null;
  const autoDescription = autoSeoDescription(summary);
  return title === autoTitle && description === autoDescription;
}

const PUBLISH_MESSAGES: ReadonlySet<string> = new Set([
  COPY.addHeadline,
  COPY.addSummary,
  COPY.addNote,
  COPY.addPillar,
  COPY.addDate,
  COPY.addDesignation,
  COPY.addFirstName,
  COPY.addCover,
  COPY.coverSize,
  COPY.addAlt,
  COPY.addSlug,
  COPY.slugChars,
  COPY.slugTaken,
  COPY.tickPhoto,
  COPY.tickNames,
  COPY.tickBoth,
]);

export function isPublishMessage(error: string): boolean {
  return PUBLISH_MESSAGES.has(error);
}

export function publishBlock(
  input: Pick<
    NoteInput,
    | "title"
    | "excerpt"
    | "body"
    | "pillar"
    | "dateLabel"
    | "author"
    | "authorTitle"
    | "authorFirstName"
    | "authorLastName"
    | "authorDesignation"
    | "authorGrade"
    | "coverImage"
    | "imageAlt"
    | "slug"
    | "includesStudent"
    | "photoConsent"
    | "nameConsent"
  >,
  context: PublishContext = {},
): string | null {
  if (!input.title) return COPY.addHeadline;
  if (!input.excerpt) return COPY.addSummary;
  if (input.body.length === 0) return COPY.addNote;
  if (!input.pillar) return COPY.addPillar;
  if (!input.dateLabel) return COPY.addDate;
  if (!dateLabelIsValid(input.dateLabel) && input.dateLabel !== (context.previousDateLabel ?? "")) {
    return COPY.addDate;
  }

  const structured = authorIsStructured(input);
  const legacyAuthor =
    !structured && Boolean(input.author) && input.author === (context.previousAuthor ?? input.author) && Boolean(context.previousAuthor);
  if (!structured && !legacyAuthor) {
    if (!input.authorDesignation) return COPY.addDesignation;
    if (!input.authorFirstName.trim()) return COPY.addFirstName;
  }
  if (structured) {
    if (!input.authorDesignation) return COPY.addDesignation;
    if (!input.authorFirstName.trim()) return COPY.addFirstName;
  }

  if (!input.coverImage) return COPY.addCover;
  if (context.coverWidth !== COVER_WIDTH || context.coverHeight !== COVER_HEIGHT) return COPY.coverSize;
  if (!input.imageAlt) return COPY.addAlt;
  if (!input.slug) return COPY.addSlug;
  if (!SLUG_PATTERN.test(input.slug)) return COPY.slugChars;
  if (input.includesStudent) {
    if (!input.photoConsent && !input.nameConsent) return COPY.tickBoth;
    if (!input.photoConsent) return COPY.tickPhoto;
    if (!input.nameConsent) return COPY.tickNames;
  }
  return null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function checked(value: unknown): boolean {
  return value === true || value === "on" || value === "true" || value === "1";
}

function realDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parseGrade(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(text(value));
  if (!Number.isInteger(number) || number < 1 || number > 10) return null;
  return number;
}

function parseSalutation(value: unknown): Salutation | null {
  const raw = text(value).trim();
  return (SALUTATIONS as readonly string[]).includes(raw) ? (raw as Salutation) : null;
}

function parseDesignation(value: unknown): Designation | null {
  const raw = text(value).trim();
  return (DESIGNATIONS as readonly string[]).includes(raw) ? (raw as Designation) : null;
}

const bodyRecord = z.record(z.unknown());

export function noteFromBody(
  body: unknown,
  source: "form" | "json",
  previous: {
    date_label: string;
    author: string;
    title: string;
    excerpt: string;
    seo_title: string | null;
    seo_description: string | null;
  } | null = null,
): { ok: true; value: NoteInput } | { ok: false; error: string } {
  const parsed = bodyRecord.safeParse(body);
  if (!parsed.success) return { ok: false, error: COPY.headlineRequired };
  const data = parsed.data;

  const title = text(data.title);
  if (title.trim().length > 120) return { ok: false, error: COPY.titleCap };

  const excerpt = text(data.excerpt);
  if (excerpt.trim().length > 300) return { ok: false, error: COPY.excerptCap };

  const dateLabel = text(data.dateLabel).trim();
  if (dateLabel.length > 40) return { ok: false, error: COPY.dateCap };
  if (
    dateLabel &&
    !dateLabelIsValid(dateLabel) &&
    !(previous && dateLabel === previous.date_label)
  ) {
    return { ok: false, error: COPY.badDateLabel };
  }

  const titleRaw = text(data.authorTitle).trim();
  const authorTitle = parseSalutation(titleRaw);
  if (titleRaw && !authorTitle) return { ok: false, error: COPY.badSalutation };

  const authorFirstName = text(data.authorFirstName).trim();
  const authorLastName = text(data.authorLastName).trim();
  if (authorFirstName.length > 24) return { ok: false, error: COPY.firstNameCap };
  if (authorLastName.length > 24) return { ok: false, error: COPY.lastNameCap };

  const designationRaw = text(data.authorDesignation).trim();
  const authorDesignation = parseDesignation(designationRaw);
  if (designationRaw && !authorDesignation) return { ok: false, error: COPY.badDesignation };

  const gradeRaw = text(data.authorGrade).trim();
  const authorGrade = parseGrade(data.authorGrade);
  if (gradeRaw && authorGrade == null) return { ok: false, error: COPY.badGrade };

  const structured = Boolean(authorTitle || authorFirstName || authorLastName || authorDesignation || authorGrade != null);
  let author = text(data.author).trim();
  if (structured) {
    author = composeAuthor(authorTitle, authorFirstName, authorLastName, authorDesignation, authorGrade);
  } else if (previous && previous.author) {
    author = previous.author;
  }
  if (author.length > 100) return { ok: false, error: COPY.authorCap };

  const imageAlt = text(data.imageAlt);
  if (imageAlt.trim().length > 200) return { ok: false, error: COPY.altCap };

  const caption = text(data.caption);
  if (caption.trim().length > 160) return { ok: false, error: COPY.captionCap };

  const slugRaw = text(data.slug).trim().toLowerCase();
  if (slugRaw.length > 80) return { ok: false, error: COPY.slugCap };
  if (slugRaw && !SLUG_PATTERN.test(slugRaw)) return { ok: false, error: COPY.slugChars };

  const seoResolved = resolveSeoFields(
    text(data.seoTitle),
    text(data.seoDescription),
    title.trim(),
    excerpt.trim(),
    previous,
  );
  if (seoResolved.seoTitle && seoResolved.seoTitle.length > 200) return { ok: false, error: COPY.seoTitleCap };
  if (seoResolved.seoDescription && seoResolved.seoDescription.length > 300) {
    return { ok: false, error: COPY.seoDescriptionCap };
  }

  let bodyText = "";
  if (typeof data.bodyText === "string") bodyText = data.bodyText;
  else if (typeof data.body === "string") bodyText = data.body;
  else if (Array.isArray(data.body)) {
    bodyText = data.body.filter((item): item is string => typeof item === "string").join("\n\n");
  }
  const paragraphs = splitParagraphs(bodyText);
  if (paragraphs.length > 8) return { ok: false, error: COPY.paragraphCount };
  if (paragraphs.some((paragraph) => paragraph.length > 1000)) return { ok: false, error: COPY.paragraphCap };

  const pillarRaw = text(data.pillar).trim().toLowerCase();
  const pillar: Pillar | null =
    pillarRaw === "think" || pillarRaw === "build" || pillarRaw === "belong" ? pillarRaw : null;
  if (pillarRaw && !pillar) return { ok: false, error: COPY.addPillar };

  const coverRaw = text(data.coverImage).trim();
  if (coverRaw && !COVER_PATH.test(coverRaw)) return { ok: false, error: COPY.photoRejected };

  const publishDate = text(data.publishDate).trim() || kolkataToday();
  if (!realDate(publishDate)) return { ok: false, error: COPY.badDate };

  const status: NoteStatus =
    source === "form"
      ? text(data.intent) === "publish"
        ? "published"
        : "draft"
      : data.status === "published"
        ? "published"
        : "draft";

  const includesStudent = checked(data.includesStudent);
  const photoConsent = includesStudent ? checked(data.photoConsent) : false;
  const nameConsent = includesStudent ? checked(data.nameConsent) : false;

  const value: NoteInput = {
    title: title.trim(),
    excerpt: excerpt.trim(),
    body: paragraphs,
    bodyText,
    pillar,
    dateLabel,
    author,
    authorTitle,
    authorFirstName,
    authorLastName,
    authorDesignation,
    authorGrade,
    imageAlt: imageAlt.trim(),
    caption: caption.trim(),
    slug: slugRaw || null,
    publishDate,
    featured: checked(data.featured),
    includesStudent,
    photoConsent,
    nameConsent,
    seoTitle: seoResolved.seoTitle,
    seoDescription: seoResolved.seoDescription,
    coverImage: coverRaw || null,
    status,
  };

  if (value.status === "published") {
    const blocked = publishBlock(value, {
      previousDateLabel: previous?.date_label,
      previousAuthor: previous?.author,
    });
    if (blocked && blocked !== COPY.coverSize) return { ok: false, error: blocked };
  } else if (!value.title) {
    return { ok: false, error: COPY.headlineRequired };
  }

  return { ok: true, value };
}

export const loginSchema = z
  .object({
    email: z.string(),
    password: z.string(),
  })
  .strip();

export const passwordSchema = z
  .object({
    currentPassword: z.string(),
    newPassword: z.string(),
    confirmPassword: z.string().optional(),
  })
  .strip();

export function passwordProblem(next: string, confirm: string | undefined, checkConfirm: boolean): string | null {
  if (next.length < 12) return COPY.passwordShort;
  if (Buffer.byteLength(next, "utf8") > 72) return COPY.passwordLong;
  if (checkConfirm && next !== (confirm ?? "")) return COPY.passwordMatch;
  return null;
}
