# Notes from school

Build spec for the local demo. One admin publishes notes. Parents read them on the current website blog.

The CMS is built only in `CL001-WSA-Blog-CMS`. The website at `../CL001-Wellsprings-website` gets one read-only change, listed in [Files](#15-files). No second spec, no README, no UI kit, no sample passwords.

Hosting stays out until this demo is agreed. The cover is stored as a URL. A later host changes where the file is uploaded. The pages stay as they are.

Build order: data and seed, API, admin screens, then the website loader.

---

## 1. Purpose

Staff publish “Notes from school” without a developer. Parents and visitors read published notes on the existing `/blog` pages. One admin signs in. Everyone else does not.

## 2. Words

| Word | Meaning |
| --- | --- |
| Note | One row in `blog_posts`. |
| School date | The printed label, such as `Term 1 · Week 3`. It is not used for order or visibility. |
| Calendar date | `publish_date`. It orders notes and hides a note until that day. |
| This week’s note | The single featured note. The large block at the top of `/blog`. |
| Visible | `status` is `published` and `publish_date` is today or earlier, in `Asia/Kolkata`. The school is in Bengaluru, so that zone is the clock. |
| Card | A note in the grid on `/blog`. The box height is fixed. The writing inside may be short. |
| Article | The page at `/blog/:slug`. Full headline and full note. |

## 3. People

| Who | What they do |
| --- | --- |
| Parent or visitor | Opens `/blog` and `/blog/:slug` on the website. No login. Sees visible notes only. |
| School admin | Signs in at the CMS `/admin`. Writes, edits, previews, and publishes every note. Types the teacher’s name in the byline. |

Teachers have no account.

## 4. Included

- Admin sign in, sign out, and change password.
- List of notes: title, school date, Draft or Published, and which one is this week’s note.
- Create, edit, save draft, preview, publish, unpublish.
- Delete a draft or a published note, after one confirmation.
- One cover photo per note.
- One featured note. Choosing a new one clears the old one. Unpublish clears it too.
- Search title and search description, filled from the headline and summary. The admin changes them only when the headline is too long for Google.
- Two confirmation ticks before publish: photo, and child’s name.

## 5. Left out

Teacher logins, comments, likes, a newsletter, extra categories, revision history, a page builder, keyword fields, and a separate share-title field.

The blog hero, the motto strip, and “Get the next note” stay in the website code. This work does not edit their copy.

Also left out: a second admin, registration, password reset by email, roles, image crops in the browser, a gallery, draft autosave, and any host, CDN, or object-storage setup.

## 6. How it runs on the machine

Two processes.

| Process | Where | Port |
| --- | --- | --- |
| Website | `CL001-Wellsprings-website` | `8080` |
| CMS | `CL001-WSA-Blog-CMS` | `3002` |

The website’s existing lead API stays on `3001`. The CMS does not use that process.

Postgres is already installed and running. Create an empty database named `wellspringscms` once, in pgAdmin, before the first boot. The app does not create the database.

Photos for this demo go in `CL001-WSA-Blog-CMS/uploads`, which is gitignored. The process creates that directory if it is missing.

The admin browser talks only to `http://localhost:3002`. The cookie belongs to that origin. The website server calls `http://localhost:3002` for public reads. The browser does not call port 3002 to render `/blog`.

Startup order:

1. Create `uploads` if it is missing.
2. Run SQL files in `db/migrations` once, recorded in `schema_migrations`.
3. If `admins` is empty, create the first admin from the environment.
4. Insert any seed note whose slug is not already in `blog_posts`.
5. Listen on `3002`.

A missing `DATABASE_URL`, `COOKIE_SECRET`, or, when `admins` is empty, `ADMIN_EMAIL` or `ADMIN_PASSWORD`, stops startup. The log names the missing key. It never prints a password, a hash, or the cookie secret.

## 7. Stack

The CMS is one Node server. It serves the admin HTML and the API. No second frontend app.

| Part | Use |
| --- | --- |
| CMS server | Express, TypeScript, Zod. |
| Admin screens | HTML rendered by that server. Same paper, Lora, Inter, ink, sage, and coral as the website. Copy those tokens into the CMS. Do not import the website package. |
| Data | Postgres. SQL files in `db/migrations`. No ORM. |
| Password | Argon2id. |
| Photos | Sharp. WebP, camera data removed. |
| Login | Signed HttpOnly cookie. |
| Website | Existing TanStack Start. It only gains a loader that reads the public API. |

New CMS packages are limited to `pg`, `argon2`, `sharp`, and `cookie-parser`, plus their type packages. No CORS package, no UI kit, no test runner.

## 8. Requirements

### Accounts

**FR-1 Sign in.** A signed-out person at `/admin` sees email, password, and “Sign in”. Success sets the cookie and opens the notes list. Failure shows “That email or password is not right.” The message is the same when the email is unknown and when the password is wrong.

**FR-2 Wait.** The sixth failed attempt for the same email and address inside 15 minutes, and further attempts during the next 15 minutes, shows “Wait a moment and try again.” A success clears that counter. The counter is in memory for this process. A restart clears it.

**FR-3 Sign out.** Signed-in screens have “Sign out”. It clears the cookie and shows the sign-in form.

**FR-4 Change password.** Current password, new password, confirm new password. The new password is at least 12 characters and at most 72 UTF-8 bytes, and the two new fields match. Success updates the hash and `updated_at`, clears the cookie, and shows “Password changed. Sign in with the new one.” A wrong current password shows “That password is not right.” Older cookies stop working because `updated_at` changed.

**FR-5 One admin.** No registration route. The environment creates the first row only when `admins` is empty. Later changes to those variables do not add or overwrite a row.

**FR-6 Gate.** A signed-out request to any admin page except sign-in goes to `/admin`. A signed-out call to `/api/admin`, other than login, returns 401 and `{ "error": "Sign in required." }`.

The cookie is `wsa_session`, HttpOnly, `SameSite=Lax`, `Path=/`, max-age 12 hours. `Secure` is set only when `NODE_ENV` is `production`. The value is the admin id and that row’s `updated_at`, signed with `COOKIE_SECRET`. There is no session table.

### Notes

**FR-7 List.** Newest calendar date first, then `created_at`. Columns: Title, Date, Status, Featured. Date is the school date, or an em dash when it is empty. Actions: “New note”, “Edit”, and “Preview” after the note has been saved.

**FR-8 Save draft.** “Save draft” is always available and is the default submit. Enter in a one-line field does not publish. The headline is required. Everything else may be empty. Status becomes `draft`. The first save creates the row and stays on its editor. A draft is never on the public site.

**FR-9 Publish.** “Publish” saves and sets `status` to `published`. On an already published note the button reads “Update”. The first successful publish sets `slug_locked`.

Publish is allowed only when all of these are true:

1. Headline, summary, and at least one paragraph are present, inside the caps.
2. Pillar is Think, Build, or Belong.
3. School date is present (Term and Week from the lists, or an unchanged legacy `date_label`).
4. Written by has a designation and first name, or an unchanged legacy `author` string.
5. A cover is stored at exactly 1200 × 800 pixels and it has alt text.
6. The URL is present, matches the slug rules, and is unique.
7. When “This note shows a child's photo or name” is on, both consent ticks are on. When it is off, consent is ignored and both consent columns are saved as false.

The line under the button names the first failure, in that order. “Add the headline before publishing.” “Add the summary before publishing.” “Add the note before publishing.” “Choose Think, Build, or Belong before publishing.” “Choose the term and week before publishing.” “Choose a designation before publishing.” “Add the first name before publishing.” “Add a cover photo before publishing.” “Cover photo must be 1200 × 800 pixels. Upload it again.” “Describe what is in the photo before publishing.” “Add a URL before publishing.” “Use only letters, numbers, and hyphens.” “That URL is already used.” “Tick photo before publishing.” “Tick names before publishing.” “Tick photo and names before publishing.”

**FR-10 Unpublish.** Confirmation: “Unpublish this note? The page comes off the site. The URL is kept so you can publish it again.” Confirm sets `status` to `draft` on the saved row and clears `featured`. The slug, the lock, and the photo stay. The form is not saved by this action.

**FR-11 Delete.** Offered on every saved note, draft or published, with one confirmation. Draft: “Delete this draft? This cannot be undone.” Published: “Delete this note? It comes off the website at once. This cannot be undone.” If `slug_locked` is true, add “The URL /blog/{slug} will be given up.” Confirm deletes the row and its file under `uploads`; a deleted featured note leaves no featured note. If the photo file cannot be removed, the delete still succeeds and the server logs it. The API returns 204.

**FR-12 Preview.** `/admin/notes/:id/preview` shows the last saved note, including a draft or a future date, in the article layout described in FR-21. Bar: “Only you can see this.” The page sends `noindex`. Signed-out visitors go to `/admin`. Unsaved editor changes are not previewed. The editor shows “Save the draft to preview.”

**FR-13 Featured.** “This week’s note” sets `featured` on this row and clears it on every other row, in one transaction. Turning it off clears this row only. The public large block renders only when that row is visible. Unpublish clears the flag, so a hidden note does not return to the top on its own.

### Fields

**FR-14 Helpers.** Each label has the helper sentence in [Admin screens](#9-admin-screens) as visible text.

**FR-15 URL.** The admin label is “URL”. The column and API field stay `slug`. While unlocked, it fills from the headline until the admin edits it. After a hand edit, the headline no longer replaces it. Lowercase ASCII. Any other character becomes a hyphen. Hyphens collapse and trim. At most 80 characters. Pattern `^[a-z0-9]+(-[a-z0-9]+)*$`. If the result is already used, the field shows “That URL is already used.” The admin changes it. The app does not invent a `-2` suffix. After lock, the field is read-only. The input sets `spellcheck="false"`, `autocapitalize="off"`, and `autocomplete="off"`.

**FR-16 Search and sharing.** Always visible. Helper: “This is how the note appears on Google and when shared on WhatsApp or Facebook.” Badge: “Automatic” or “Customised”. Search title and search description are prefilled with stored values. Auto title is `{headline} — Notes from school | Wellsprings Academy`. Auto description is the summary. After every save, `seo_title` and `seo_description` hold real values, not null, except a null description when the summary is empty. Empty incoming fields store the auto values. Custom text is stored trimmed. If the previously stored value equalled the auto value from the previous headline or summary, the save stores the auto value from the new headline or summary. Otherwise a custom value is left alone. “Reset to automatic” restores the auto value for that field. While Automatic, the fields follow live headline and summary edits. Longer than 60 or 160 shows “About 60 characters.” or “About 160 characters.” and does not block save. When the title is Automatic and over 60, also show “Long headline: Google may cut the title. Write a shorter search title.” A live Google-style result and a compact share card preview the fields.

**FR-17 Note text.** Plain text. A blank line starts a paragraph. A single line break becomes a space. Empty paragraphs are dropped. HTML is escaped. No markdown.

**FR-18 Cover.** One file. JPEG, PNG, or WebP, maximum 5 MB, checked before decode. Sharp rotates from the camera, then centre-crops and resizes any size to exactly 1200 × 800 (`fit: cover`, `position: centre`). Photos smaller than 1200 × 800 are enlarged and may look soft. It encodes WebP at quality 80 and writes no metadata. The saved name is 16 random bytes in hex plus `.webp`. A rejected type or size shows “Photo must be a JPEG, PNG, or WebP under 5 MB.” A rejected upload keeps the previous cover. Choosing a file uploads it at once and shows it. The next save stores the URL. Replacing a cover deletes the previous file when it lives under `uploads`.

### Public site

**FR-19 Read.** The website `/blog` and `/blog/:slug` keep their current layout. They load visible notes only. Newest calendar date first, then `created_at`. Hero, motto, and “Get the next note” stay as they are.

**FR-20 Featured and cards.** A visible featured note is the large block and is not repeated as a card. Other visible notes are cards. If none is featured, there is no large block. Zero visible notes leaves the shell and shows “No notes yet.”

**FR-21 Article.** Full headline, school date, teacher and class, cover, caption, and every paragraph. The first paragraph keeps the existing larger style. Up to two other visible notes sit at the bottom, newest first, excluding this note. The block is omitted when there are none.

The article and the cards use a 3:2 frame, the same shape as the stored file, so the whole photo shows. The featured block on the website `/blog` keeps its original wide 21:9 frame, so about 18% of the photo's top and bottom is cut there. The same file is used in all three, cropped by the frame with `object-fit: cover`. A missing photo is an empty paper frame, not a broken image. Seeded notes have no photo, so they use that frame until an admin adds one.

**FR-22 Missing address.** A slug that is absent, draft, or still in the future sends the browser to `/blog` with a temporary redirect, status 302. It must not use 301. The public API returns 404 `{ "error": "Not found." }`.

**FR-23 Titles and share.** The website uses `seoTitle` and `seoDescription` for the document title, `og:title`, `og:description`, and `twitter:*`. When a value is empty or null, it falls back to the headline for the document title (`{headline} — Notes from school | Wellsprings Academy`) and the headline for `og:title`, and to the summary for the description fields. `og:image` is the absolute cover URL when a cover exists. The share card is `summary_large_image`. The blog index keeps its current title and description. Admin and preview send `noindex`.

**FR-24 Card box.** Same photo frame, two reserved headline lines, three reserved summary lines, school date on the bottom edge. CSS does this. A short summary still fills the box. The article does not clamp.

**FR-25 Card warning.** The editor shows the character count under the headline and the summary. Past 70 characters on the headline, or 160 on the summary, it also shows “The card will end this line with …”. Save and publish stay available inside the hard caps. Those two numbers live in one place so a visual check can change them without hunting.

**FR-26 Hard caps.** These block save. There is no minimum length beyond what FR-9 requires to publish.

| Field | Maximum |
| --- | --- |
| Headline | 120 |
| Summary | 300 |
| Each paragraph | 1,000 |
| Paragraphs | 8 |
| School date | 40 |
| Written by (`author`) | 100 |
| First name | 24 |
| Last name | 24 |
| Alt text | 200 |
| Caption | 160 |
| URL (`slug`) | 80 |
| Search title | 200 |
| Search description | 300 |

Over-cap copy: “{Label} must be {n} characters or fewer.” For the note: “Each paragraph must be 1,000 characters or fewer.” and “A note can have at most 8 paragraphs.”

### Security and performance

**FR-27 Writes.** Every JSON write is parsed with Zod. Unknown fields are stripped. Public routes accept no write.

**FR-28 Public payload.** `id`, `title`, `slug`, `excerpt`, `body`, `pillar`, `dateLabel`, `author`, `coverImage`, `imageAlt`, `caption`, `coverWidth`, `coverHeight`, `publishDate`, `featured`, `seoTitle`, `seoDescription`. No consent flags, status, email, or hash. `pillar` in JSON is `Think`, `Build`, or `Belong`.

**FR-29 Files.** Covers are served only at `GET /api/uploads/:name`. The name matches `^[a-f0-9]{32}\.webp$`. Any other path is 404. No directory listing.

**FR-30 Admin not indexed.** Admin HTML sets `noindex`. Admin API responses send `Cache-Control: no-store` and `X-Robots-Tag: noindex`.

**FR-31 Cache.** Public `GET /api/blog` and `GET /api/blog/:slug` send `Cache-Control: public, max-age=60`. Upload files send `Cache-Control: public, max-age=31536000, immutable`. A replaced cover uses a new name.

**FR-32 Server HTML.** Headline, summary, and paragraphs are in the first HTML of `/blog` and `/blog/:slug`.

**FR-33 Images.** Featured and article covers use `loading="eager"` and `fetchpriority="high"`. Card images use `loading="lazy"` and `decoding="async"`. Every cover `img` sets the stored width and height and the alt text. A frame with no file is a div, not an img.

**FR-34 Website bundle.** The website does not import the CMS admin. Admin code never ships to parents.

**FR-35 Same origin.** Admin forms post to port 3002. State-changing admin requests whose `Origin` is some other site are rejected with 403.

## 9. Admin screens

Signed-out chrome is the sign-in form only.

Signed-in chrome: “Notes”, “Change password”, “Sign out”.

Page titles: “Sign in”, “Notes”, “New note”, “Edit note”, “Change password”, “Preview”.

### Sign in

Email, password, “Sign in”.

### Notes

The table from FR-7. Empty copy, which the seed makes unlikely: “No notes yet.”

### Editor

**The note.** Beside the heading: “This is what a parent reads.”

| Label | Publish | Helper |
| --- | --- | --- |
| Headline | Required | Title on the article, the featured note, and each card. |
| Short summary | Required | Under the title on /blog. Also used for search and sharing when those fields stay automatic. |
| The note | Required | A blank line starts a new paragraph. The first paragraph is larger on the article. |
| Think, Build, or Belong | Required. One of the three. | The coloured tag. |
| School date | Required. Two linked selects: Term (1 or 2) and Week (Term 1: 1–25; Term 2: 26–52). Stored as `Term 1 · Week 3`. | Printed on the card and under the title. |
| Written by | Required to publish: Designation and First name. Salutation, Last name and Grade optional. Composed into `author` as `{Salutation} {First} {Last}, {Designation} · Grade {n}`, skipping empty parts. | Shown on the featured note and the article. Cards show the school date only. |

**Photograph.**

| Label | Publish | Helper |
| --- | --- | --- |
| Cover photo | Required. Stored at exactly 1200 × 800. | Sideways (landscape) photo, from 1200 × 800 up to 3000 × 2000, under 5 MB. Best: 2400 × 1600. (Upload is refused outside these limits; shape check allows width ÷ height 1.3–1.8.) |
| What is in the photo | Required when a cover is stored | For screen readers. Describe the scene. |
| Caption | Optional | One line under the photo. |

**Publishing.**

| Label | Publish | Helper |
| --- | --- | --- |
| URL | Required. The UI shows `/blog/` in front. | Becomes /blog/this-text. Change it only before the first publish. After that it stays, so shared links keep working. |
| Calendar date | Required. Defaults to today in `Asia/Kolkata`. | Orders the notes. A future date stays hidden until that day. |
| This week’s note | Optional | The large block at the top of /blog. Only one. |

**Search and sharing.** Always visible. Badge: Automatic or Customised.

| Label | Helper |
| --- | --- |
| Search title | The blue Google link and the browser tab. About 60 characters. |
| Search description | The grey line under that link. About 160 characters. |

**Before you publish.**

| Label | Helper |
| --- | --- |
| This note shows a child's photo or name | Turn on if any child can be recognised or is named. You will then confirm permission. |
| Photo is allowed | Tick if a parent has agreed, or if no child’s face can be recognised. Shown only when the switch is on. |
| Names are allowed | Tick if no child is named, or if a named child’s parent has agreed. If they have not, write “a child in Grade 3”. Shown only when the switch is on. |

Buttons: “Save draft”, then “Publish” or “Update”. The FR-9 line sits under Publish. A successful save shows “Draft saved.” or “Published.” and stays on the editor. “Unpublish” sits away from “Delete”. “Delete” is rendered for every saved note.

### Change password

Current password, new password, confirm new password, “Change password”.

### Site & SEO

Menu item “Site & SEO” at `/admin/site`. Search and sharing details for whole public pages (notes and events keep their own section in their editors). Stored in `site_pages` (migration `005_site_pages.sql`), seeded with the wording the website used before.

- **Blog page · /blog:** Search title (required, ≤ 200, about 60), Search description (required, ≤ 300, about 160), Share title and Share description (optional; empty uses the search fields), What is in the share image (≤ 160; required once a share image exists).
- **Share image · /blog:** same photo rules as a note cover; cropped to 1200 × 630 WebP. Upload, replace, remove. Without one, the website uses its own blog photo.
- **Calendar page:** link to Calendar → Page & SEO, where each school year keeps its own details.

The website `/blog` head reads `page` from `GET /api/blog`; if the CMS is down it uses its original wording. Every admin tab shows the school icon and “{Page} · Wellsprings CMS”.

### Preview

The article layout from FR-21, plus “Only you can see this.”

## 10. Data

### `schema_migrations`

`filename text primary key`, `applied_at timestamptz not null default now()`.

### `admins`

| Column | Rule |
| --- | --- |
| `id` | uuid, primary key, `gen_random_uuid()`. |
| `email` | Unique, stored lowercase. |
| `password_hash` | Argon2id hash only. |
| `created_at` | `timestamptz`, default `now()`. |
| `updated_at` | `timestamptz`, default `now()`, bumped on password change. |

### `blog_posts`

| Column | Rule |
| --- | --- |
| `id` | uuid, primary key, `gen_random_uuid()`. |
| `title` | 1–120 characters. |
| `slug` | Null until there is an address. Unique. Format in FR-15. Many nulls are allowed. |
| `excerpt` | Default `''`. Length ≤ 300. |
| `body` | `text[]`, default `'{}'`. At most 8 items. Each item’s length is checked by Zod. |
| `pillar` | Null on a draft, or `think`, `build`, `belong`. |
| `date_label` | Default `''`. Length ≤ 40. Printed school date from the Term and Week selects. |
| `author` | Default `''`. Length ≤ 100. Composed from the Written by fields for the public site. |
| `author_title` | Null, or one of: Mr., Ms., Mrs., Miss, Dr. |
| `author_first_name` | Default `''`. Length ≤ 24. |
| `author_last_name` | Default `''`. Length ≤ 24. |
| `author_designation` | Null, or one of: Class Teacher, Subject Teacher, Head of Department, Coordinator, Counsellor, Librarian, Sports Coach, Vice Principal, Principal. |
| `author_grade` | Null, or 1 to 10. |
| `cover_image` | Null or a URL path `/api/uploads/<hex>.webp`. |
| `cover_width`, `cover_height` | Null, or the pixel size Sharp wrote. Publish requires 1200 × 800. |
| `image_alt` | Default `''`. Length ≤ 200. |
| `caption` | Default `''`. Length ≤ 160. |
| `publish_date` | `date`, not null. |
| `status` | `draft` or `published`. Default `draft`. |
| `featured` | Boolean, default false. At most one true row. |
| `includes_student` | Boolean, default false. When false, consent ticks are hidden and both consent columns save as false. |
| `photo_consent`, `name_consent` | Boolean, default false. |
| `seo_title` | Stored auto or custom text. Length ≤ 200. |
| `seo_description` | Stored auto or custom text, or null when the summary is empty. Length ≤ 300. |
| `slug_locked` | Boolean, default false. Set on the first successful publish. Unpublish does not clear it. |
| `created_at`, `updated_at` | `timestamptz`. `updated_at` bumps on every saved edit and status change. |

Indexes: unique `slug`, unique partial index on `featured` where `featured` is true, index on `(status, publish_date desc)`.

Public read:

```sql
select id, title, slug, excerpt, body, pillar, date_label, author,
       cover_image, cover_width, cover_height, image_alt, caption,
       publish_date, featured, seo_title, seo_description
from blog_posts
where status = 'published'
  and publish_date <= (now() at time zone 'Asia/Kolkata')::date
order by publish_date desc, created_at desc;
```

The article query adds `slug = $1`. The two more notes use the same filter, `id <> $1`, `limit 2`.

### Migration

`db/migrations/001_blog_and_admin.sql` creates both tables, the checks, and the indexes. `db/migrations/002_blog_editor_changes.sql` adds the Written by columns, `includes_student`, raises the search title length to 200, and backfills SEO and consent. `db/migrations/003_author_salutation.sql` adds `author_title` and raises the `author` length to 100. The runner creates `schema_migrations` if needed, then runs pending files in name order.

## 11. API

JSON errors are `{ "error": "..." }`. No stack traces. Validation is 400. A wrong sign-in is 401. A wait is 429. Camel case in JSON. Snake case in SQL.

### Public

No cookie. The website server calls these.

| Method and path | Result |
| --- | --- |
| `GET /api/blog` | `{ "featured": PublicNote or null, "posts": PublicNote[], "page": { seoTitle, seoDescription, shareTitle, shareDescription, shareImage, shareImageAlt } }`. `posts` excludes the featured note. `page` is the /blog page's search and sharing details from Site & SEO (empty share fields already fall back to the search fields). |
| `GET /api/blog/:slug` | `{ "post": PublicNote, "more": PublicNote[] }` or 404. |
| `GET /api/uploads/:name` | The WebP bytes, or 404. |

`PublicNote` is the FR-28 object. On a card row, `featured` is false. On the article, `post.featured` is the real flag.

### Admin

All send `Cache-Control: no-store`. All except login require the cookie.

| Method and path | Result |
| --- | --- |
| `POST /api/admin/login` | `{ "email", "password" }`. Success sets the cookie. |
| `POST /api/admin/logout` | Clears the cookie. |
| `POST /api/admin/password` | `{ "currentPassword", "newPassword" }`. Success clears the cookie. |
| `GET /api/admin/posts` | `id`, `title`, `dateLabel`, `publishDate`, `status`, `featured`, `slug`, `slugLocked`. |
| `POST /api/admin/posts` | Create. `status` of `draft` or `published`. Published runs FR-9. |
| `GET /api/admin/posts/:id` | Admin note, including consent and `slugLocked`. |
| `PATCH /api/admin/posts/:id` | Save. Slug is ignored when `slug_locked` is true. |
| `POST /api/admin/posts/:id/unpublish` | Sets draft and clears featured. Does not apply form fields. |
| `DELETE /api/admin/posts/:id` | Draft or published. 204. |
| `POST /api/admin/uploads` | Multipart field `file`. Success `{ "coverImage", "width", "height" }`. |

Admin note JSON adds `includesStudent`, `photoConsent`, `nameConsent`, `authorTitle`, `authorFirstName`, `authorLastName`, `authorDesignation`, `authorGrade`, `seoAutomatic`, `slugLocked`, `status`, `createdAt`, `updatedAt`.

A slug conflict on an unlocked slug is 409 `{ "error": "That URL is already used." }`.

## 12. Security

- The cookie is HttpOnly. Page scripts cannot read it.
- No password is stored or logged in clear text.
- Every write is checked with Zod. The public API returns visible notes only.
- Login is rate-limited. The error does not say which field was wrong.
- Photos are re-encoded, so camera location is removed.
- Admin sends `noindex`.
- `.env` and `uploads` stay out of git.

`.env.example` in the CMS folder:

```
PORT=3002
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/wellspringscms
ADMIN_EMAIL=
ADMIN_PASSWORD=
COOKIE_SECRET=
```

`YOUR_PASSWORD` in the example is a placeholder, not a real password. The real `.env` is gitignored.

## 13. Performance

Target Lighthouse above 90 on the website’s `/blog` and on one article, for performance, accessibility, best practices, and SEO.

- The note text is in the first HTML response.
- Covers are WebP, with width and height set, so the page does not jump.
- The featured image loads first. Card images load as they enter the screen.
- The website does not download the admin.
- A replaced photo has a new name, so the old cached file is not reused.

Every admin control has its visible label. Sign-in and publish errors sit in a live region. The cover alt is the “What is in the photo” field.

## 14. Seed

Copy the three notes verbatim from `../CL001-Wellsprings-website/src/data/blog-posts.ts` into `src/seed/notes.ts`. Do not rewrite the prose. The website file stays. The website does not render from it after the loader change.

| Column | Value |
| --- | --- |
| `title`, `slug`, `excerpt`, `author`, `body` | Copied from that file. |
| `pillar` | `think`, `build`, or `belong` from the current tag. |
| `date_label` | The current school-date string. |
| `cover_image`, `cover_width`, `cover_height`, `image_alt`, `caption` | Null or empty. That file has no per-note photo. |
| `publish_date` | `2026-01-01` for all three. The file has no calendar date. |
| `status` | `published`. |
| `featured` | True only for `moon-flipbook`. That is the note the current `/blog` page treats as the large block. |
| `photo_consent`, `name_consent` | `true`. |
| `seo_title`, `seo_description` | Null. |
| `slug_locked` | `true`. |

Insert a row only when its slug is absent. Later boots do not update a slug that already exists.

## 15. Files

Inside `CL001-WSA-Blog-CMS` only:

| File | What it is |
| --- | --- |
| `db/migrations/001_blog_and_admin.sql` | Tables, checks, indexes. |
| `src/index.ts` and route modules | Login, password, public reads, admin writes, upload, rate limit, migrate, seed. |
| `src/schemas.ts` | Zod for a note, login, and password change. |
| `src/seed/notes.ts` | The three copied notes. |
| Admin templates | Sign in, notes, editor, preview, change password, and the small brand stylesheet. |
| `.env.example`, `.gitignore` | The keys above. Ignore `.env` and `uploads/`. |

One change outside this folder, in `CL001-Wellsprings-website`:

- `/blog` and `/blog/:slug` load `GET /api/blog` and `GET /api/blog/:slug` from `CMS_API_URL`, default `http://localhost:3002`, on the server.
- Card line clamps and reserved line heights, on the current card markup.
- A down API shows “Notes are not available right now.” and does not read `src/data/blog-posts.ts`.
- `CMS_API_URL` added to the website `.env.example` only as that key.

Do not add a README, a docs folder, sample passwords, a component kit, or a second router.

## 16. Done when

Run the CMS against the migrated `wellspringscms` database, with the website on port 8080.

1. **A parent can read the notes.** Signed out, open `/blog`. The three seeded notes are there, plus a fourth the admin published with a real cover. The featured note is the large block. Cards match in height. A short summary still fills the card. The article shows the full headline and the full note, and up to two other notes at the bottom. The tab title of a seeded note ends with `Notes from school | Wellsprings Academy`.
2. **An admin can run a note.** Sign in on port 3002. Save a draft with a headline longer than 70 characters and see the card warning. Preview shows the article layout and “Only you can see this.” With either tick off, or with no pillar or no photo, Publish stays off and the line names the gap. Turn the ticks on, add the missing fields, and publish. Change password refuses a wrong current password, accepts a new one, and asks for sign-in again. The old cookie no longer opens the notes list.
3. **Hidden notes stay hidden.** A draft does not appear on `/blog` or at its slug. A published note with tomorrow’s Kolkata date does not appear. Unpublish removes it and clears “this week’s note”. The address can be published again. Delete works on drafts and published notes with one confirmation.
4. **Search and share.** When the search fields are filled, the document title and the share title are the search title, and the share image is the cover.
5. **Git.** `git status` in the CMS folder does not list `.env` or anything under `uploads`.
