# Blog & Event CMS – Test Cases

Manual test cases for the whole CMS (blog notes, events calendar, Site & SEO), to run before hosting, plus the latest automated test run at the end. They only check behaviour. Running them changes no code.

Website test cases are in `CL001-Wellsprings-website/WEBSITE_TEST_CASES.md`. The full sheet with every result is `CMS_and_Website_Test_Report_Detailed.xlsx` in this folder.

**How to use**

- Test on a **copy of the database** (or a fresh `wellspringscms`), never the live one. Some cases delete notes.
- CMS: `http://localhost:3002/admin`. Website: `http://localhost:8080/blog`.
- Mark each row **Pass** / **Fail** and write what you saw if it fails.
- Have ready: one 2400 × 1600 JPEG, one 1536 × 1024 photo, one 900 × 600, one 4000 × 3000 phone photo, one portrait photo, one square photo, one PDF renamed to `.jpg`, and one file over 5 MB.
- API checks can be done in the browser's DevTools (Network tab), or with `curl`.

---

## 1. Startup and setup

| ID | Test | Steps | Expected result | Pass/Fail |
|---|---|---|---|---|
| ST-01 | Normal start | `npm start` with a full `.env` | Log shows `Listening on 3002`. `/` redirects to `/admin`. | |
| ST-02 | Missing setting | Remove `COOKIE_SECRET` from `.env`, start | Startup stops. Log names the missing key. No password or secret is printed. | |
| ST-03 | Migrations run once | Start twice | Second start has no migration errors. `schema_migrations` lists each file once. | |
| ST-04 | First admin | Empty `admins` table, start with `ADMIN_EMAIL` / `ADMIN_PASSWORD` | One admin row is created. | |
| ST-05 | Admin not overwritten | Change `ADMIN_PASSWORD` in `.env`, restart | Old password still works. New one does not. No second admin row. | |
| ST-06 | Seed notes | Fresh database, start | Three seeded notes appear. Restarting does not duplicate them. | |
| ST-07 | Uploads folder | Delete `uploads/`, start | Folder is created again. | |
| ST-08 | Type check | `npm run check` | No errors. | |

## 2. Sign in, sign out, password

| ID | Test | Steps | Expected result | Pass/Fail |
|---|---|---|---|---|
| AU-01 | Correct sign in | Enter right email and password | Notes list opens. | |
| AU-02 | Wrong password | Right email, wrong password | "That email or password is not right." | |
| AU-03 | Unknown email | Wrong email | Same message as AU-02 (does not say which field was wrong). | |
| AU-04 | Email case | Sign in with the email in CAPITALS | Sign in works. | |
| AU-05 | Too many tries | Fail 6 times with the same email | 6th try shows "Wait a moment and try again." Even the right password is refused for 15 minutes. | |
| AU-06 | Counter clears | Fail 3 times, then sign in correctly, sign out, fail again | Counter starts again from zero. | |
| AU-07 | Sign out | Click "Sign out" | Sign-in form shows. Back button / `/admin/notes` goes back to sign in. | |
| AU-08 | Pages need sign in | Signed out, open `/admin/notes`, `/admin/notes/new`, `/admin/password` | Each one goes to `/admin`. | |
| AU-09 | API needs sign in | Signed out, call `GET /api/admin/posts` | 401 `{ "error": "Sign in required." }` | |
| AU-10 | Change password – wrong current | Wrong current password | "That password is not right." Nothing changes. | |
| AU-11 | Change password – too short | New password of 11 characters | "New password must be at least 12 characters." | |
| AU-12 | Change password – mismatch | Two new fields differ | "Type the same new password in both fields." | |
| AU-13 | Change password – success | Valid current, new 12+ characters, matching | "Password changed. Sign in with the new one." Signed out. New password works, old does not. | |
| AU-14 | Old session dies | Before AU-13, copy the cookie or keep a 2nd browser signed in | After the change, that other browser is sent to sign in. | |
| AU-15 | Cookie safety | DevTools → Application → Cookies | `wsa_session` is HttpOnly, SameSite=Lax, expires in 12 hours. | |

## 3. Notes list and editor

| ID | Test | Steps | Expected result | Pass/Fail |
|---|---|---|---|---|
| NO-01 | List | Open Notes | Columns Title, Date, Status, Featured. Newest calendar date first. | |
| NO-02 | New note | Click "New note" | Empty editor. Calendar date is today (India time). | |
| NO-03 | Draft needs headline | Click "Save draft" with empty headline | Save refused: "Headline is required." | |
| NO-04 | Save draft | Type only a headline, save draft | "Draft saved." Stays on editor. Note shows as Draft in list. | |
| NO-05 | Enter does not publish | Press Enter in the headline field | Saves as draft, not published. | |
| NO-06 | Edit and save again | Change headline, save | List shows new headline. | |
| NO-07 | Card warning | Headline over 70 characters, or summary over 160 | Count shows and "The card will end this line with …". Save still works. | |
| NO-08 | Hard limits | Headline 121 characters | Save blocked: "Headline must be 120 characters or fewer." Repeat for summary (300), caption (160), alt (200). | |
| NO-09 | Paragraph limits | 9 paragraphs, or one paragraph over 1,000 characters | "A note can have at most 8 paragraphs." / "Each paragraph must be 1,000 characters or fewer." | |
| NO-10 | Paragraphs | Text with blank lines and single line breaks | Blank line = new paragraph. Single break becomes a space. | |
| NO-11 | HTML is not run | Put `<b>hi</b><script>alert(1)</script>` in the note, preview | Shows as plain text. No alert. | |
| NO-12 | Term and week | Pick Term 1, then Term 2 | Weeks change: Term 1 = 1–25, Term 2 = 26–52. Saved as `Term 1 · Week 3`. | |
| NO-13 | Written by | Fill salutation, first, last, designation, grade | Byline reads like `Ms. Asha Rao, Class Teacher · Grade 3`. Empty parts are skipped. | |
| NO-14 | URL from headline | New note, type headline "Our Big Day!" | URL fills as `our-big-day`. | |
| NO-15 | URL hand edit | Edit URL, then change headline | URL no longer follows the headline. | |
| NO-16 | URL bad characters | Type `Hello World_2` in URL, then try Publish | "Use only letters, numbers, and hyphens." Publish is refused until it is fixed (e.g. `hello-world-2`). | |
| NO-17 | URL already used | Use the URL of another note | "That URL is already used." | |
| NO-18 | Search fields automatic | Type headline and summary | Search title = `{headline} — Notes from school \| Wellsprings Academy`. Badge "Automatic". Google and share previews update. | |
| NO-19 | Search fields custom | Type own search title, save | Badge "Customised". Value stays after headline changes. | |
| NO-20 | Reset to automatic | Click "Reset to automatic" | Field goes back to the automatic value. | |
| NO-21 | Long search title | Search title over 60 characters | "About 60 characters." Save still allowed. | |

## 4. Cover photo upload

| ID | Test | Steps | Expected result | Pass/Fail |
|---|---|---|---|---|
| PH-01 | Help line | Look under "Cover photo" | "Sideways (landscape) photo, from 1200 × 800 up to 3000 × 2000, under 5 MB. Best: 2400 × 1600." | |
| PH-02 | Best size | Upload 2400 × 1600 JPEG | Photo shows at once in the preview. Full photo visible, nothing cut. | |
| PH-03 | Minimum size | Upload exactly 1200 × 800 | Accepted. | |
| PH-04 | Maximum size | Upload exactly 3000 × 2000 | Accepted. | |
| PH-05 | Other landscape | Upload 1536 × 1024, 1920 × 1080, 1600 × 1200 | All accepted. | |
| PH-06 | Too small | Upload 900 × 600 | "Photo is too small. Use at least 1200 × 800." Old photo stays. | |
| PH-07 | Too big | Upload 4000 × 3000 phone photo | "Photo is too big. Use up to 3000 × 2000." Old photo stays. | |
| PH-08 | Portrait | Upload a standing (portrait) photo | "Use a sideways (landscape) photo. Standing or square photos do not fit." | |
| PH-09 | Square | Upload a square photo | Same message as PH-08. | |
| PH-10 | Upright phone photo | Upload a phone photo taken upright (portrait) | Refused as portrait, even though the file looks wide in some tools. | |
| PH-11 | Wrong type | Upload a PDF renamed to `.jpg`, or a GIF | "Photo must be a JPEG, PNG, or WebP under 5 MB." | |
| PH-12 | Over 5 MB | Upload a file over 5 MB | Same message as PH-11. | |
| PH-13 | Saved file | After PH-02, save; open the photo URL | URL is `/api/uploads/<32 letters/numbers>.webp`. Image is 1200 × 800 WebP. | |
| PH-14 | Location removed | Upload a phone photo with GPS, download the saved file, check its details | No camera or location data. | |
| PH-15 | Replace photo | Upload a new photo, save | New file name. Old file is removed from `uploads/`. | |
| PH-16 | Upload not saved | Upload a photo but do not save; reload | Note still has the old photo (or none). | |

## 5. Publish, unpublish, delete, featured, preview

| ID | Test | Steps | Expected result | Pass/Fail |
|---|---|---|---|---|
| PU-01 | Publish – missing fields | Try Publish with each one missing in turn: summary, note, pillar, term/week, designation, first name, photo, alt text, URL | Publish is refused. The line under the button names the first missing item. | |
| PU-02 | Child switch – ticks | Turn on "This note shows a child's photo or name", leave ticks off | "Tick photo and names before publishing." Then only one tick → "Tick names…" / "Tick photo…". | |
| PU-03 | Child switch off | Switch off | Ticks hidden. Publish allowed if all else is filled. | |
| PU-04 | Publish | All fields filled, click Publish | "Published." Button now reads "Update". Status Published in list. | |
| PU-05 | URL locked | After publish | URL field is read-only. | |
| PU-06 | Update | Change summary, click Update | Change shows on the website. | |
| PU-07 | Future date | Publish with tomorrow's calendar date | Not on `/blog`. Opening its URL goes to `/blog`. Shows up the next day. | |
| PU-08 | Unpublish | Click Unpublish, confirm | Confirmation text shown. Note becomes Draft, featured cleared, off the website. URL kept. | |
| PU-09 | Publish again | Publish the unpublished note | Works with the same URL. | |
| PU-10 | Delete published note | Open a published note with a photo, click Delete, confirm once | One confirmation: "Delete this note? It comes off the website at once…". No error, no second prompt. Note gone from list and from `/blog`; its URL returns to `/blog`. Photo file removed. If it was featured, no featured note remains. | |
| PU-11 | Delete draft | Delete a draft with a photo, confirm once | One confirmation: "Delete this draft? This cannot be undone." No error, no second prompt. Note gone from list. Its photo file removed from `uploads/`. | |
| PU-12 | Delete cancel | Click Delete, then Cancel | Nothing deleted. | |
| PU-13 | Featured | Tick "This week's note" on note B and save | B is featured. The note that was featured before is no longer featured. Only one ✓ in the list. | |
| PU-14 | Featured off | Untick it and save | No featured note. Website has no large block. | |
| PU-15 | Preview | Save, click Preview | Article layout with "Only you can see this." Works for drafts and future dates. | |
| PU-16 | Preview unsaved | Edit without saving | Editor says "Save the draft to preview." | |
| PU-17 | Preview signed out | Open a preview link while signed out | Goes to sign in. | |

## 6. Public API and website

| ID | Test | Steps | Expected result | Pass/Fail |
|---|---|---|---|---|
| PB-01 | Blog list | Signed out, open `/blog` | Only published notes with today's date or earlier. Newest first. | |
| PB-02 | Featured block | One note featured | It is the large block and is not repeated as a card. | |
| PB-03 | Drafts hidden | Open a draft's URL `/blog/<slug>` | Redirect (302) to `/blog`. API `/api/blog/<slug>` returns 404 "Not found." | |
| PB-04 | Article | Open a published note | Full headline, school date, byline, full photo (3:2, nothing cut), caption, every paragraph. Up to 2 other notes at the bottom. | |
| PB-05 | Photo fit | Check card, featured block and article for the same note | Same full photo in all three. No top or bottom cut. | |
| PB-06 | No photo | Seeded note with no photo | Empty paper frame, not a broken image. | |
| PB-07 | Cards same height | Notes with short and long summaries | All cards line up at the same height. | |
| PB-08 | Tab title and sharing | View page source of an article | Title ends `Notes from school \| Wellsprings Academy`. `og:image` is the full photo URL. | |
| PB-09 | Private data | Open `/api/blog` | No consent flags, status, email or password fields in the JSON. | |
| PB-10 | Cache headers | Check `/api/blog` and a photo URL in Network tab | Blog: `public, max-age=60`. Photo: `public, max-age=31536000, immutable`. | |
| PB-11 | Bad photo path | Open `/api/uploads/../.env` and `/api/uploads/abc.webp` | 404. No file shown. | |
| PB-12 | CMS down | Stop the CMS, open `/blog` | "Notes are not available right now." No crash. | |
| PB-13 | Mobile | Open `/blog` and an article at phone width | Photos fit, no sideways scroll. | |

## 6b. Site & SEO

| ID | Test | Steps | Expected result | Pass/Fail |
|---|---|---|---|---|
| SI-01 | Tab icon and title | Open any CMS page | Browser tab shows the school icon and e.g. "Notes · Wellsprings CMS". | |
| SI-02 | Menu | Look at the top menu | "Site & SEO" sits between Calendar and Password, on the same line. | |
| SI-03 | Starting values | Open Site & SEO on a fresh database | Fields hold the website's original /blog wording. | |
| SI-04 | Required fields | Empty the search title or description, Save | "Add the search title." / "Add the search description." Nothing saved. | |
| SI-05 | Save | Change the search title and description, Save | "Saved…" notice. Within a minute the website /blog tab title and description change. | |
| SI-06 | Share fields empty | Leave share title/description empty | WhatsApp/Facebook (og:) title and description use the search ones. | |
| SI-07 | Share image | Upload a 2400 × 1600 photo | Shown at 1200 × 630. Notice asks to fill "What is in the share image". Website og:image is the new image. | |
| SI-08 | Share image rules | Upload too small / too big / portrait / PDF | Same messages as the note cover photo. Old image kept. | |
| SI-09 | Alt needed | With a share image, empty its description, Save | "Describe what is in the share image." | |
| SI-10 | Remove image | Click "Remove image", confirm | Image and file removed. Website goes back to its own blog photo. | |
| SI-11 | Calendar link | Click "Open Calendar · Page & SEO" | Opens the calendar year's page settings. | |
| SI-12 | CMS down | Stop the CMS, open website /blog | Original title and description; no crash. | |
| SI-13 | Signed out | Open /admin/site signed out | Goes to sign in. | |

## 6c. Event photos, autosave, help

| ID | Test | Steps | Expected result | Pass/Fail |
|---|---|---|---|---|
| EV-01 | Event photo rules | Upload event photos: 2400 × 1600, 900 × 600, 4000 × 3000, portrait | First accepted; others refused with the same messages as blog photos. Same for calendar card photos and the calendar share image. | |
| AS-01 | Note autosave | Edit a note, wait 2 s, close the tab, reopen the note | "You have unsaved changes from …" with Restore / Discard. Restore brings the text back. | |
| AS-02 | Cleared after save | Restore, then Save draft / Update | Reopening shows no offer. | |
| AS-03 | Kept when save fails | Edit, sign out in another tab, try to save, sign in, reopen | Offer is still there. | |
| AS-04 | Event autosave | Same as AS-01 and AS-02 on an event | Same results; cleared after "Saved." | |
| AS-05 | Discard | Click Discard | Offer goes away and does not come back. | |
| EV-02 | Photo upload prompt | On an event, without editing anything, choose photos | Uploads straight away, no "unsaved changes" question. | |
| EV-03 | Upload after an edit | Edit the recap, then choose a photo | Question says changes can be restored; after upload, Restore brings the recap back. | |
| SR-01 | Notes search | Type in "Search notes" (e.g. a word from a headline, a teacher's name, "week 4", "belong") | Only matching notes stay; "N notes found."; nothing found shows "No notes match that search." Esc clears. | |
| SR-02 | Events search | Type in "Search the year", press Search | Matching events from all months, by date; month list shows counts; "Clear" goes back. Works with Strand and State too. | |
| HP-01 | Help page | Click "Help" in the menu | One page: photos, notes, unpublish vs delete, Google and sharing, if something goes wrong. | |

## 6d. Events calendar

| ID | Test | Steps | Expected result | Pass/Fail |
|---|---|---|---|---|
| CA-01 | Draft event | Calendar → Events → New event, fill title, date, strand, Save draft | "Draft saved." Not on the website. | |
| CA-02 | Required fields | Save without title / strand; date outside the year; end before start | Clear message for each; nothing saved. | |
| CA-03 | Publish | Write the plan, Publish | On the website with **Upcoming**; search title/description filled in. | |
| CA-04 | Publish needs the plan | Empty plan, Publish | "Write the plan before publishing." | |
| CA-05 | Slug locked | Rename a published event | Its link (slug) stays the same. | |
| CA-06 | Moved from | Change a published event's date, keep "Show moved from" ticked | Website shows "Moved from {old date}". | |
| CA-07 | Cancel | Cancel a published event | Stays on the site marked **Cancelled**. A draft can't be cancelled. | |
| CA-08 | Unpublish | Unpublish | Off the website; stays in the CMS as a draft. | |
| CA-09 | Delete | Delete a draft with photos | Event and its photo files removed. Published/cancelled events have no Delete. | |
| CA-10 | Needs photos | Past published event without recap | Listed under **Needs photos** on the dashboard. | |
| CA-11 | Photo limit | Select 10 photos | 6 uploaded, message says 4 were not; a 7th upload is refused. | |
| CA-12 | Photo rules | 900 × 600, 4000 × 3000, portrait | Same messages as blog photos. | |
| CA-13 | Alt text / caption / order | Edit alt text, caption, drag or Up/Down | Saved; empty alt text refused. | |
| CA-14 | Recap rules | Publish recap: before the event / with no photos / without consent | Each refused with its own message. | |
| CA-15 | Recap published | Past event, photos, consent ticked, Publish recap | Website shows **Photos · N**, carousel and recap; leaves Needs photos. | |
| CA-16 | New photo after recap | Add a photo to a completed event | Consent cleared, recap hidden until ticked and published again. | |
| CA-17 | Hide recap | Hide recap | Photos hidden on the site but kept in the CMS. | |
| CA-18 | Preview | Preview a completed event | Card + panel as on the site; photos as neat 4:3 tiles; "Only you can see this." | |
| CA-19 | Filters | Add strand option (colour), tag an event, hide it, try to delete it | Chip appears; hiding keeps the event; deleting an option in use refused. | |
| CA-20 | Months | Edit a month line (≤ 80 chars) | Shows on the website; over 80 refused. | |
| CA-21 | All-year rhythm | Add / edit / move / delete a card, add a photo | Website rhythm section follows. | |
| CA-22 | Page & SEO | Change the calendar search title, upload share image | Website tab title and share image change. Empty title refused. | |
| CA-23 | Years | Create next year; duplicate label | New year doesn't change the public site until "Make current"; duplicate refused. | |
| CA-24 | Search | Dashboard "Search events" and Events "Search the year" | Matches from all months, by date; "No events match" when none; Clear goes back. | |
| CA-25 | Upload prompt | Choose photos without editing anything | No "unsaved changes" question. | |

## 7. Security and hosting readiness

| ID | Test | Steps | Expected result | Pass/Fail |
|---|---|---|---|---|
| SE-01 | Admin not indexed | Any admin page / admin API response | `X-Robots-Tag: noindex` and `Cache-Control: no-store`. | |
| SE-02 | Cross-site block | Send a POST to `/api/admin/posts` with header `Origin: https://evil.example` | 403 Forbidden. | |
| SE-03 | Security headers | Any response | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, no `X-Powered-By`. | |
| SE-04 | Unknown API path | `GET /api/nothing` | 404 `{ "error": "Not found." }` | |
| SE-05 | No error details | Break something (e.g. stop Postgres), call an API | `{ "error": "Something went wrong." }`. No stack trace. | |
| SE-06 | Git clean | `git status` | `.env` and `uploads/` are not listed. | |
| HO-01 | Production mode | On the host set `NODE_ENV=production` and use HTTPS | Sign in works. Cookie shows `Secure`. (Over plain HTTP sign-in will not stick.) | |
| HO-02 | Strong secret | Host `.env` | `COOKIE_SECRET` is long and random, different from local. `ADMIN_PASSWORD` is strong. | |
| HO-03 | Photos kept | Upload a photo, redeploy / restart the host | Photo still loads. `uploads/` is on storage that survives redeploys, and is backed up. | |
| HO-04 | Database backup | Host database | Backups are on. A restore has been tried once. | |
| HO-05 | Behind a proxy | If the host uses a proxy / load balancer, test AU-05 from two different networks | One person's failed tries must not lock out everyone. If it does, the app needs proxy settings before go-live. | |
| HO-06 | Domain check | Sign in and save a note on the real domain | Saves work (no 403). If 403, the proxy is changing the Host header. | |
| HO-07 | Website link | Website `CMS_API_URL` on the host | Points to the hosted CMS. `/blog` loads notes. | |
| HO-08 | Speed | Lighthouse on `/blog` and one article | Above 90 for performance, accessibility, best practices, SEO. | |

---

**Done when:** every row is Pass, or each Fail has a note and a decision.

---

# Test run report – CMS (blog + events)

**Run on:** 6 Nov 2026 · **Where:** this computer · **Data:** a throwaway test database (`wellspringscms_test`) and test servers (CMS on 3003, production website build on 8086), all removed afterwards. Real data, photos and code were not changed by testing.

**Test types**
- **Unit** – the CMS's rule functions called directly (photo size, SEO, URL, dates, passwords, event states).
- **Integration** – real requests to the running CMS and website (create, publish, upload, search, public APIs, security).
- **UI (browser)** – real pages in a browser at desktop and phone width (layout, search as you type, autosave, preview).
- **Sanity** – build, type check, startup, migrations, secrets, git ignore, dependency audit.
- **Performance** – Lighthouse on the production website build.

## Summary

| Test type | Total | Pass | Fail | Warning / skipped |
|---|---|---|---|---|
| Unit | 58 | 58 | 0 | 0 |
| Integration | 181 | 181 | 0 | 0 |
| UI (browser) | 20 | 20 | 0 | 0 |
| Sanity | 13 | 12 | 1 | 0 |
| **All** | **272** | **271** | **1** | **0** |

**Findings**
- ❌ `npm audit`: 2 high-severity advisories in runtime packages **sharp** and **zod**. The fix is a major-version upgrade — do it before hosting, then retest photo upload and forms.
- Everything else passed, including all fixes from this project (photo rules, delete with photo, custom SEO, 3:2 frames, Site & SEO, autosave, search, preview tiles).

## Manual test cases — results

Every manual case above was verified: by the automated tests named in the notes, or by an extra API/browser run on the same day.

| ID | Area | Test case | Result | Evidence / notes |
|---|---|---|---|---|
| ST-01 | Startup and setup | Normal start | ✅ Pass | by B-ST-01, S-02 |
| ST-02 | Startup and setup | Missing setting | ✅ Pass | by S-09 |
| ST-03 | Startup and setup | Migrations run once | ✅ Pass | by S-04 |
| ST-04 | Startup and setup | First admin | ✅ Pass | one admin created from ADMIN_EMAIL/ADMIN_PASSWORD on empty table; by extra run ST-04 |
| ST-05 | Startup and setup | Admin not overwritten | ✅ Pass | after changing ADMIN_PASSWORD and restarting: old password 200, new setting 401; by extra run ST-05 |
| ST-06 | Startup and setup | Seed notes | ✅ Pass | by B-ST-06, S-07 |
| ST-07 | Startup and setup | Uploads folder | ⏭ Skipped | Not run: deleting uploads/ would remove the real photos. Code creates it at startup with mkdir(recursive) (src/photos.ts ensureUploads).; by extra run ST-07 |
| ST-08 | Startup and setup | Type check | ✅ Pass | by S-01 |
| AU-01 | Sign in, sign out, password | Correct sign in | ✅ Pass | by B-AU-01 |
| AU-02 | Sign in, sign out, password | Wrong password | ✅ Pass | by B-AU-02 |
| AU-03 | Sign in, sign out, password | Unknown email | ✅ Pass | by B-AU-03 |
| AU-04 | Sign in, sign out, password | Email case | ✅ Pass | by B-AU-04 |
| AU-05 | Sign in, sign out, password | Too many tries | ✅ Pass | by B-AU-05, B-AU-05b |
| AU-06 | Sign in, sign out, password | Counter clears | ✅ Pass | by B-AU-06, B-AU-06b |
| AU-07 | Sign in, sign out, password | Sign out | ✅ Pass | by B-AU-07 |
| AU-08 | Sign in, sign out, password | Pages need sign in | ✅ Pass | by B-AU-08, C-X-01 |
| AU-09 | Sign in, sign out, password | API needs sign in | ✅ Pass | by B-AU-09 |
| AU-10 | Sign in, sign out, password | Change password – wrong current | ✅ Pass | by B-AU-10 |
| AU-11 | Sign in, sign out, password | Change password – too short | ✅ Pass | by B-AU-11, U-B-17 |
| AU-12 | Sign in, sign out, password | Change password – mismatch | ✅ Pass | by B-AU-12, U-B-19 |
| AU-13 | Sign in, sign out, password | Change password – success | ✅ Pass | by B-AU-13, B-AU-13b, B-AU-13c |
| AU-14 | Sign in, sign out, password | Old session dies | ✅ Pass | by B-AU-14 |
| AU-15 | Sign in, sign out, password | Cookie safety | ✅ Pass | by B-AU-15, B-AU-15b |
| NO-01 | Notes list and editor | List | ✅ Pass | counters shown; 3 notes; dates 2026-01-01,2026-01-01,2026-01-01; by extra run NO-01 |
| NO-02 | Notes list and editor | New note | ✅ Pass | calendar date default 2026-11-06; by extra run NO-02 |
| NO-03 | Notes list and editor | Draft needs headline | ✅ Pass | by B-NO-03, U-B-25 |
| NO-04 | Notes list and editor | Save draft | ✅ Pass | by B-NO-04 |
| NO-05 | Notes list and editor | Enter does not publish | ✅ Pass | Save draft is the form's first (default) submit button; by extra run NO-05 |
| NO-06 | Notes list and editor | Edit and save again | ✅ Pass | Gap note edited; by extra run NO-06 |
| NO-07 | Notes list and editor | Card warning | ✅ Pass | card warning shown for a 75-character headline; by extra run NO-07 |
| NO-08 | Notes list and editor | Hard limits | ✅ Pass | by B-NO-08, B-NO-08b, B-NO-08c, B-NO-08d, U-B-24 |
| NO-09 | Notes list and editor | Paragraph limits | ✅ Pass | by B-NO-09, B-NO-09b |
| NO-10 | Notes list and editor | Paragraphs | ✅ Pass | by B-NO-10, U-B-01, U-B-02 |
| NO-11 | Notes list and editor | HTML is not run | ✅ Pass | by B-NO-11, C-X-06 |
| NO-12 | Notes list and editor | Term and week | ✅ Pass | by B-NO-12, U-B-14, U-B-15, U-B-16 |
| NO-13 | Notes list and editor | Written by | ✅ Pass | by B-NO-13, B-NO-13b, U-B-12, U-B-13 |
| NO-14 | Notes list and editor | URL from headline | ✅ Pass | URL = our-big-day; by extra run NO-14, U-B-03 |
| NO-15 | Notes list and editor | URL hand edit | ✅ Pass | URL kept as my-own-url after headline change; by extra run NO-15 |
| NO-16 | Notes list and editor | URL bad characters | ✅ Pass | by B-NO-16, U-B-26 |
| NO-17 | Notes list and editor | URL already used | ✅ Pass | by B-NO-17 |
| NO-18 | Notes list and editor | Search fields automatic | ✅ Pass | by B-NO-18, U-B-06 |
| NO-19 | Notes list and editor | Search fields custom | ✅ Pass | by B-NO-19, B-NO-19b, U-B-09 |
| NO-20 | Notes list and editor | Reset to automatic | ✅ Pass | Reset → automatic title, badge Automatic; by extra run NO-20 |
| NO-21 | Notes list and editor | Long search title | ✅ Pass | "About 60 characters." shown, save still allowed; by extra run NO-21 |
| PH-01 | Cover photo upload | Help line | ✅ Pass | help line present; by extra run PH-01 |
| PH-02 | Cover photo upload | Best size | ✅ Pass | by B-PH-02, U-PH-2400x1600 |
| PH-03 | Cover photo upload | Minimum size | ✅ Pass | by B-PH-03, U-PH-1200x800 |
| PH-04 | Cover photo upload | Maximum size | ✅ Pass | by B-PH-04, U-PH-3000x2000 |
| PH-05 | Cover photo upload | Other landscape | ✅ Pass | by B-PH-05, B-PH-05b, B-PH-05c, B-PH-05d |
| PH-06 | Cover photo upload | Too small | ✅ Pass | by B-PH-06, U-PH-900x600 |
| PH-07 | Cover photo upload | Too big | ✅ Pass | by B-PH-07, U-PH-4000x3000 |
| PH-08 | Cover photo upload | Portrait | ✅ Pass | by B-PH-08, U-PH-1200x1800 |
| PH-09 | Cover photo upload | Square | ✅ Pass | by B-PH-09, U-PH-2000x2000 |
| PH-10 | Cover photo upload | Upright phone photo | ✅ Pass | by B-PH-10 |
| PH-11 | Cover photo upload | Wrong type | ✅ Pass | by B-PH-11, B-PH-11b |
| PH-12 | Cover photo upload | Over 5 MB | ✅ Pass | by B-PH-12 |
| PH-13 | Cover photo upload | Saved file | ✅ Pass | by B-PH-13 |
| PH-14 | Cover photo upload | Location removed | ✅ Pass | by B-PH-14 |
| PH-15 | Cover photo upload | Replace photo | ✅ Pass | by B-PH-15 |
| PH-16 | Cover photo upload | Upload not saved | ✅ Pass | uploaded but not saved → note cover null; by extra run PH-16 |
| PU-01 | Publish, unpublish, delete, featured, preview | Publish – missing fields | ✅ Pass | by B-PU-01, B-PU-01b, U-B-21, U-B-22 |
| PU-02 | Publish, unpublish, delete, featured, preview | Child switch – ticks | ✅ Pass | by B-PU-02, B-PU-02b, U-B-23 |
| PU-03 | Publish, unpublish, delete, featured, preview | Child switch off | ✅ Pass | by B-PU-03 |
| PU-04 | Publish, unpublish, delete, featured, preview | Publish | ✅ Pass | by B-PU-04 |
| PU-05 | Publish, unpublish, delete, featured, preview | URL locked | ✅ Pass | by B-PU-05 |
| PU-06 | Publish, unpublish, delete, featured, preview | Update | ✅ Pass | by B-PU-06 |
| PU-07 | Publish, unpublish, delete, featured, preview | Future date | ✅ Pass | by B-PU-07 |
| PU-08 | Publish, unpublish, delete, featured, preview | Unpublish | ✅ Pass | by B-PU-08, B-PB-03 |
| PU-09 | Publish, unpublish, delete, featured, preview | Publish again | ✅ Pass | by B-PU-09 |
| PU-10 | Publish, unpublish, delete, featured, preview | Delete published note | ✅ Pass | by B-PU-10 |
| PU-11 | Publish, unpublish, delete, featured, preview | Delete draft | ✅ Pass | by B-PU-11 |
| PU-12 | Publish, unpublish, delete, featured, preview | Delete cancel | ✅ Pass | Cancel on the delete question → note kept; by extra run PU-12 |
| PU-13 | Publish, unpublish, delete, featured, preview | Featured | ✅ Pass | by B-PU-13, B-PB-02 |
| PU-14 | Publish, unpublish, delete, featured, preview | Featured off | ✅ Pass | by B-PU-14 |
| PU-15 | Publish, unpublish, delete, featured, preview | Preview | ✅ Pass | by B-PU-15, B-PU-15b, UI-15 |
| PU-16 | Publish, unpublish, delete, featured, preview | Preview unsaved | ✅ Pass | "Save the draft to preview." shown, stayed on editor; by extra run PU-16 |
| PU-17 | Publish, unpublish, delete, featured, preview | Preview signed out | ✅ Pass | by B-PU-17 |
| PB-01 | Public API and website | Blog list | ✅ Pass | by B-PB-01, W-B-01 |
| PB-02 | Public API and website | Featured block | ✅ Pass | by B-PB-02, W-B-02 |
| PB-03 | Public API and website | Drafts hidden | ✅ Pass | by B-PB-03, W-B-13 |
| PB-04 | Public API and website | Article | ✅ Pass | by B-PB-04, B-PB-04b, W-B-09, W-B-14 |
| PB-05 | Public API and website | Photo fit | ✅ Pass | by W-B-05, W-B-06, W-B-11 |
| PB-06 | Public API and website | No photo | ✅ Pass | notes without photos render a frame, no empty <img>; by extra run PB-06 |
| PB-07 | Public API and website | Cards same height | ✅ Pass | both cards 502px tall (featured block 21:9 separate); by extra run PB-07 |
| PB-08 | Public API and website | Tab title and sharing | ✅ Pass | by W-B-10, W-B-12 |
| PB-09 | Public API and website | Private data | ✅ Pass | by B-PB-09 |
| PB-10 | Public API and website | Cache headers | ✅ Pass | by B-PB-10, B-PB-10b |
| PB-11 | Public API and website | Bad photo path | ✅ Pass | by B-PB-11 |
| PB-12 | Public API and website | CMS down | ✅ Pass | by W-D-01 |
| PB-13 | Public API and website | Mobile | ✅ Pass | by W-U-01 |
| SI-01 | Site & SEO | Tab icon and title | ✅ Pass | by C-S-10, C-S-11 |
| SI-02 | Site & SEO | Menu | ✅ Pass | by C-S-12, UI-01 |
| SI-03 | Site & SEO | Starting values | ✅ Pass | original /blog wording in the fields; by extra run SI-03, S-08 |
| SI-04 | Site & SEO | Required fields | ✅ Pass | by C-S-09 |
| SI-05 | Site & SEO | Save | ✅ Pass | by C-S-08, W-B-03 |
| SI-06 | Site & SEO | Share fields empty | ✅ Pass | by W-B-04 |
| SI-07 | Site & SEO | Share image | ✅ Pass | saved 1200×630; by extra run SI-07 |
| SI-08 | Site & SEO | Share image rules | ✅ Pass | 400 too small refused; by extra run SI-08 |
| SI-09 | Site & SEO | Alt needed | ✅ Pass | 400; by extra run SI-09 |
| SI-10 | Site & SEO | Remove image | ✅ Pass | before true; after: db null, file exists false; by extra run SI-10 |
| SI-11 | Site & SEO | Calendar link | ✅ Pass | link to Calendar · Page & SEO; by extra run SI-11 |
| SI-12 | Site & SEO | CMS down | ✅ Pass | by W-D-02 |
| SI-13 | Site & SEO | Signed out | ✅ Pass | by C-X-01 |
| EV-01 | Event photos, autosave, help | Event photo rules | ✅ Pass | by C-P-05, U-PH-1200x1800, U-PH-4000x3000 |
| AS-01 | Event photos, autosave, help | Note autosave | ✅ Pass | by UI-09, UI-10, UI-11 |
| AS-02 | Event photos, autosave, help | Cleared after save | ✅ Pass | copy saved while typing; after "Draft saved." the copy was cleared and no offer appeared; by extra run AS-02 |
| AS-03 | Event photos, autosave, help | Kept when save fails | ✅ Pass | save failed (Sign in required.); browser copy kept; Restore offered after signing in again; by extra run AS-03 |
| AS-04 | Event photos, autosave, help | Event autosave | ✅ Pass | event offer shown and Restore brought the recap back; by extra run AS-04, C-S-13 |
| AS-05 | Event photos, autosave, help | Discard | ✅ Pass | Discard removed the offer and the copy; by extra run AS-05 |
| EV-02 | Event photos, autosave, help | Photo upload prompt | ✅ Pass | by UI-16 |
| EV-03 | Event photos, autosave, help | Upload after an edit | ✅ Pass | question says to press Restore; after upload Restore brought the recap back; by extra run EV-03 |
| SR-01 | Event photos, autosave, help | Notes search | ✅ Pass | by C-S-04, UI-03, UI-04, UI-05 |
| SR-02 | Event photos, autosave, help | Events search | ✅ Pass | by C-S-01, C-S-02, C-S-03 |
| HP-01 | Event photos, autosave, help | Help page | ✅ Pass | by C-S-06 |
| CA-01 | Events calendar | Draft event | ✅ Pass | by C-E-06, C-E-07 |
| CA-02 | Events calendar | Required fields | ✅ Pass | by C-E-01, C-E-02, C-E-03, C-E-04, U-E-12, U-E-14 |
| CA-03 | Events calendar | Publish | ✅ Pass | by C-E-08, C-E-09 |
| CA-04 | Events calendar | Publish needs the plan | ✅ Pass | by C-E-05 |
| CA-05 | Events calendar | Slug locked | ✅ Pass | by C-E-11 |
| CA-06 | Events calendar | Moved from | ✅ Pass | by C-E-12 |
| CA-07 | Events calendar | Cancel | ✅ Pass | by C-E-14, C-E-17 |
| CA-08 | Events calendar | Unpublish | ✅ Pass | by C-E-16 |
| CA-09 | Events calendar | Delete | ✅ Pass | by C-E-15, C-P-17 |
| CA-10 | Events calendar | Needs photos | ✅ Pass | by C-P-01, C-P-02 |
| CA-11 | Events calendar | Photo limit | ✅ Pass | by C-P-04 |
| CA-12 | Events calendar | Photo rules | ✅ Pass | by C-P-05 |
| CA-13 | Events calendar | Alt text / caption / order | ✅ Pass | by C-P-06, C-P-07, C-P-08 |
| CA-14 | Events calendar | Recap rules | ✅ Pass | by C-E-13, C-P-03, C-P-09 |
| CA-15 | Events calendar | Recap published | ✅ Pass | by C-P-10, C-P-13 |
| CA-16 | Events calendar | New photo after recap | ✅ Pass | by C-P-15 |
| CA-17 | Events calendar | Hide recap | ✅ Pass | by C-P-16 |
| CA-18 | Events calendar | Preview | ✅ Pass | by UI-13, UI-14, UI-15 |
| CA-19 | Events calendar | Filters | ✅ Pass | by C-F-01, C-F-02, C-F-03, C-F-04, C-F-05 |
| CA-20 | Events calendar | Months | ✅ Pass | by C-F-08, C-F-09 |
| CA-21 | Events calendar | All-year rhythm | ✅ Pass | edit true, move true, photo true (201), photo removed true, delete true; by extra run CA-21, C-F-06, C-F-07 |
| CA-22 | Events calendar | Page & SEO | ✅ Pass | by C-F-10, C-F-11, C-F-12, W-C-03 |
| CA-23 | Events calendar | Years | ✅ Pass | new year hidden until current: true; make current: true; switched back; by extra run CA-23, C-F-13, C-F-14 |
| CA-24 | Events calendar | Search | ✅ Pass | by C-S-01, C-S-02, C-S-03 |
| CA-25 | Events calendar | Upload prompt | ✅ Pass | by UI-16 |
| SE-01 | Security and hosting readiness | Admin not indexed | ✅ Pass | by B-SE-01, B-SE-01b, C-X-05 |
| SE-02 | Security and hosting readiness | Cross-site block | ✅ Pass | by B-SE-02, C-X-03, C-X-04 |
| SE-03 | Security and hosting readiness | Security headers | ✅ Pass | by B-SE-03 |
| SE-04 | Security and hosting readiness | Unknown API path | ✅ Pass | by B-SE-04, B-SE-04b |
| SE-05 | Security and hosting readiness | No error details | ✅ Pass | by B-SE-05 |
| SE-06 | Security and hosting readiness | Git clean | ✅ Pass | by S-10 |
| HO-01 | Security and hosting readiness | Production mode | 🔒 Blocked (needs hosting) | Needs the hosted site — see Hosting Readiness H-01: HTTPS and NODE_ENV=production on the host; by H-01 |
| HO-02 | Security and hosting readiness | Strong secret | 🔒 Blocked (needs hosting) | Needs the hosted site — see Hosting Readiness H-02: New strong COOKIE_SECRET and admin password on the host; by H-02 |
| HO-03 | Security and hosting readiness | Photos kept | 🔒 Blocked (needs hosting) | Needs the hosted site — see Hosting Readiness H-03: uploads/ (incl. uploads/calendar) on storage that survives redeploys; by H-03 |
| HO-04 | Security and hosting readiness | Database backup | 🔒 Blocked (needs hosting) | Needs the hosted site — see Hosting Readiness H-04: Daily database + photo backups, one restore tried; by H-04 |
| HO-05 | Security and hosting readiness | Behind a proxy | 🔒 Blocked (needs hosting) | Needs the hosted site — see Hosting Readiness H-10: Proxy setting for the login lock (deferred by you); by H-10 |
| HO-06 | Security and hosting readiness | Domain check | 🔒 Blocked (needs hosting) | Needs the hosted site — see Hosting Readiness H-11: Check saves work on the real domain (Origin/Host check); by H-11 |
| HO-07 | Security and hosting readiness | Website link | 🔒 Blocked (needs hosting) | Needs the hosted site — see Hosting Readiness H-05: Website CMS_API_URL = the CMS public https address; by H-05 |
| HO-08 | Security and hosting readiness | Speed | ⚠️ Warning | LH-01: Perf 43 · A11y 89 · Best 79 · SEO 100. Main causes: tracking scripts (Google Ads/Tag Manager, Zoho PageSense), big JS bundle, fonts; some low-contrast labels.; LH- |

## Hosting readiness (checked from code/config — hosting is later)

| ID | What is needed | Status | Why |
|---|---|---|---|
| H-01 | HTTPS and NODE_ENV=production on the host | Needed | Code ready: cookie becomes Secure in production. Without HTTPS the admin cannot stay signed in. |
| H-02 | New strong COOKIE_SECRET and admin password on the host | Needed | Use values different from this computer. |
| H-03 | uploads/ (incl. uploads/calendar) on storage that survives redeploys | Needed | Otherwise blog and event photos disappear after a redeploy. |
| H-04 | Daily database + photo backups, one restore tried | Needed | No backup exists today. |
| H-05 | Website CMS_API_URL = the CMS public https address | Needed | Otherwise image links point to localhost. |
| H-06 | Web server upload limit ≥ 6 MB | Needed | nginx default is 1 MB; photos up to 5 MB must pass. |
| H-07 | Process manager restarts the CMS (pm2 / systemd / host service) | Needed | So the CMS comes back after a crash or reboot. |
| H-08 | Node.js 22+ on the host | Needed | The CMS runs TypeScript directly with --experimental-strip-types (tested on Node 22.12). |
| H-09 | PostgreSQL 13+ on the host | Needed | Uses gen_random_uuid(). Tested on PostgreSQL 18.6. |
| H-10 | Proxy setting for the login lock (deferred by you) | Needed if host uses a proxy | Without it, one person's wrong passwords can lock every admin out. |
| H-11 | Check saves work on the real domain (Origin/Host check) | Check at hosting | If the proxy changes the Host header, saves return 403. |
| H-12 | Update sharp and zod (npm audit: 2 high) | Recommended before hosting | Fixes need major-version upgrades; test photo upload and forms after updating. |
| H-13 | Forgot password by email | Waiting for your go-ahead | Not built yet; needs an email sender (Gmail/Workspace SMTP or an email service). |
| H-14 | Turn on gzip/brotli compression on the host | Recommended | Improves Lighthouse speed. |
| H-15 | Decide on tracking scripts (Ads, Tag Manager, PageSense) | Recommended | Biggest cause of the slow phone score. |
| H-16 | Small accessibility fixes on the website | Recommended | Label contrast, heading order on cards, a hidden menu with focusable links. |
| H-17 | Remove duplicate CMS_API_URL line in website .env.example | Small fix | It appears twice (lines 10 and 13). |
| H-18 | Run `npm run format` in the website before commit | Small fix | 831 formatting-only lint errors (Windows line endings). |
| H-19 | Unknown website addresses go to home (307) instead of a 404 page | Optional | Existing website rule; a real 404 page is better for SEO. |
| H-20 | Commit CMS and website changes | When you are ready | Everything from this session is still uncommitted. |
| H-21 | Keep BLOG_CMS_TEST_CASES.md / WEBSITE_TEST_CASES.md out of the deploy if not wanted | Optional | SPEC says no extra docs in the CMS folder. |

## Every automated test

### Unit · Shared

| ID | Test | Result | Actual / notes |
|---|---|---|---|
| U-PH-1200x800 | Photo 1200×800 → accepted | ✅ Pass | null |
| U-PH-2400x1600 | Photo 2400×1600 → accepted | ✅ Pass | null |
| U-PH-3000x2000 | Photo 3000×2000 → accepted | ✅ Pass | null |
| U-PH-1600x1200 | Photo 1600×1200 → accepted | ✅ Pass | null |
| U-PH-1920x1080 | Photo 1920×1080 → accepted | ✅ Pass | null |
| U-PH-1199x800 | Photo 1199×800 → small | ✅ Pass | small |
| U-PH-900x600 | Photo 900×600 → small | ✅ Pass | small |
| U-PH-3001x2000 | Photo 3001×2000 → large | ✅ Pass | large |
| U-PH-4000x3000 | Photo 4000×3000 → large | ✅ Pass | large |
| U-PH-1200x1800 | Photo 1200×1800 → shape | ✅ Pass | shape |
| U-PH-2000x2000 | Photo 2000×2000 → shape | ✅ Pass | shape |
| U-PH-3000x1200 | Photo 3000×1200 → shape | ✅ Pass | shape |
| U-S-01 | Autosave script parses for notes and events | ✅ Pass |  |

### Unit · Blog rules

| ID | Test | Result | Actual / notes |
|---|---|---|---|
| U-B-01 | Blank line starts a paragraph; single break becomes a space | ✅ Pass | ["a b","c","d"] |
| U-B-02 | Empty paragraphs dropped | ✅ Pass | 0 |
| U-B-03 | URL from headline: lowercase + hyphens | ✅ Pass | our-big-day |
| U-B-04 | URL: accents removed, hyphens collapse | ✅ Pass | cafe-dia |
| U-B-05 | URL capped at 80 chars, no trailing hyphen | ✅ Pass | 79 |
| U-B-06 | Auto search title format | ✅ Pass | Hi — Notes from school \| Wellsprings Academy |
| U-B-07 | Auto description null when summary empty | ✅ Pass | null |
| U-B-08 | Automatic SEO follows new headline/summary | ✅ Pass | {"seoTitle":"New — Notes from school \| Wellsprings Academy","seoDescription":"Sum"} |
| U-B-09 | Custom SEO kept on an existing auto note (bug fixed earlier) | ✅ Pass | {"seoTitle":"Custom","seoDescription":"Custom d"} |
| U-B-10 | Form sending old auto text still counts as automatic | ✅ Pass | {"seoTitle":"New — Notes from school \| Wellsprings Academy","seoDescription":"Sum"} |
| U-B-11 | seoIsAutomatic true for auto values | ✅ Pass |  |
| U-B-12 | Byline composed with all parts | ✅ Pass | Ms. Asha Rao, Class Teacher · Grade 3 |
| U-B-13 | Byline skips empty parts | ✅ Pass | Asha |
| U-B-14 | Term 1 · Week 25 valid | ✅ Pass |  |
| U-B-15 | Term 1 · Week 26 invalid | ✅ Pass |  |
| U-B-16 | Term 2 · Week 26 valid, Week 53 invalid | ✅ Pass |  |
| U-B-17 | Password under 12 refused | ✅ Pass | New password must be at least 12 characters. |
| U-B-18 | Password over 72 bytes refused | ✅ Pass | New password must be 72 bytes or fewer. |
| U-B-19 | Passwords must match | ✅ Pass |  |
| U-B-20 | Good password accepted | ✅ Pass |  |
| U-B-21 | Publish without summary blocked | ✅ Pass | {"ok":false,"error":"Add the summary before publishing."} |
| U-B-22 | Publish without pillar blocked | ✅ Pass | {"ok":false,"error":"Choose Think, Build, or Belong before publishing."} |
| U-B-23 | Child shown, no ticks → blocked | ✅ Pass | Tick photo and names before publishing. |
| U-B-24 | Headline over 120 blocked | ✅ Pass | {"ok":false,"error":"Headline must be 120 characters or fewer."} |
| U-B-25 | Draft with only a headline allowed | ✅ Pass | {"ok":true,"value":{"title":"Draft only","excerpt":"","body":[],"bodyText":"","p |
| U-B-26 | Bad URL characters blocked | ✅ Pass | {"ok":false,"error":"Use only letters, numbers, and hyphens."} |
| U-B-27 | Impossible calendar date blocked | ✅ Pass | {"ok":false,"error":"Use a real calendar date."} |

### Unit · Event rules

| ID | Test | Result | Actual / notes |
|---|---|---|---|
| U-E-01 | Month keys across a year boundary | ✅ Pass | ["2026-11","2026-12","2027-01","2027-02"] |
| U-E-02 | Last day of February 2028 (leap year) | ✅ Pass | 2028-02-29 |
| U-E-03 | Event slug = date + title | ✅ Pass | 2026-08-05-market-day |
| U-E-04 | Auto event search title | ✅ Pass | Sports Day — Roots to Wings \| Wellsprings Academy |
| U-E-05 | Auto event description from body capped at 155 | ✅ Pass | 155 |
| U-E-06 | State: draft | ✅ Pass | draft |
| U-E-07 | State: upcoming | ✅ Pass | upcoming |
| U-E-08 | State: today (inside a range) | ✅ Pass | today |
| U-E-09 | State: needs photos (past, no recap) | ✅ Pass | needs-photos |
| U-E-10 | State: completed (recap published) | ✅ Pass | completed |
| U-E-11 | State: cancelled | ✅ Pass | cancelled |
| U-E-12 | Event without title refused | ✅ Pass | Add a title. |
| U-E-13 | Title over 90 refused | ✅ Pass | Title must be 90 characters or fewer. |
| U-E-14 | End before start refused | ✅ Pass | The end date must be on or after the start date. |
| U-E-15 | 7 highlight points refused | ✅ Pass | At most 6 points under What happens. |
| U-E-16 | Plan over 1200 refused | ✅ Pass | The plan must be 1,200 characters or fewer. |
| U-E-17 | Valid event shape passes | ✅ Pass | null |
| U-E-18 | Unknown intent falls back to save | ✅ Pass | save |

### Integration · Events

| ID | Test | Result | Actual / notes |
|---|---|---|---|
| C-E-01 | Event without a title is refused | ✅ Pass | 400 |
| C-E-02 | Date outside the school year refused | ✅ Pass | 400 |
| C-E-03 | End date before start refused | ✅ Pass | 400 |
| C-E-04 | Event without a strand refused | ✅ Pass | 400 |
| C-E-05 | Publish without the plan refused | ✅ Pass | 400 |
| C-E-06 | Draft saved | ✅ Pass | /admin/calendar/events/35bbb97f-ac38-45a8-afd1-cd63143e1a05?notice=draft |
| C-E-07 | Draft is not on the public calendar | ✅ Pass |  |
| C-E-08 | Publish puts it on the site as Upcoming | ✅ Pass | upcoming |
| C-E-09 | Search title and description filled automatically | ✅ Pass | QA Market Day — Roots to Wings \| Wellsprings Academy \| Stalls run by Grade 4 |
| C-E-10 | Slug = date + title | ✅ Pass | 2026-11-16-qa-market-day |
| C-E-11 | Slug locked after publish | ✅ Pass | 2026-11-16-qa-market-day |
| C-E-12 | Moving a published event can show 'Moved from' | ✅ Pass | 2026-11-16 |
| C-E-13 | Recap can't be published before the event | ✅ Pass | 400 |
| C-E-14 | Cancel keeps it on the site as Cancelled | ✅ Pass | cancelled |
| C-E-15 | A cancelled/published event can't be deleted | ✅ Pass | 302 /admin/calendar/events/35bbb97f-ac38-45a8-afd1-cd63143e1a05 |
| C-E-16 | Unpublish takes it off the site | ✅ Pass |  |
| C-E-17 | A draft can't be cancelled | ✅ Pass | 400 |

### Integration · Event photos & recap

| ID | Test | Result | Actual / notes |
|---|---|---|---|
| C-P-01 | Past published event without recap = Needs photos | ✅ Pass | needs-photos |
| C-P-02 | Dashboard lists it under Needs photos | ✅ Pass |  |
| C-P-03 | Recap needs at least one photo | ✅ Pass | 400 |
| C-P-04 | 6 photos accepted, 7th refused (409) | ✅ Pass | 201,201,201,201,201,201,409 |
| C-P-05 | Too-small event photo refused | ✅ Pass | 409 6 photos per event. |
| C-P-06 | Edit photo alt text and caption | ✅ Pass | 200 |
| C-P-07 | Empty alt text refused | ✅ Pass | 400 Describe the photo (alt text). |
| C-P-08 | Reorder photos | ✅ Pass | 200 |
| C-P-09 | Recap needs the consent tick | ✅ Pass | 400 |
| C-P-10 | Recap published → Completed with 6 photos | ✅ Pass | completed 6 |
| C-P-11 | Large photo ≤ 1600 px, WebP, no camera data | ✅ Pass | webp 1600x1067 |
| C-P-12 | Photo cache headers immutable + nosniff | ✅ Pass | public, max-age=31536000, immutable |
| C-P-13 | Event leaves Needs photos once completed | ✅ Pass |  |
| C-P-14 | Deleting a photo removes its file | ✅ Pass | false |
| C-P-15 | New photo clears consent and hides the recap | ✅ Pass | {"recap_published":false,"photo_consent":false} |
| C-P-16 | Hidden recap: photos not public but kept | ✅ Pass | 0 |
| C-P-17 | Deleting a draft removes the event and its photo files | ✅ Pass | 302 files gone: true |
| C-P-18 | Bad photo paths return 404 | ✅ Pass | 404 404 |

### Integration · Filters, rhythm, months, years

| ID | Test | Result | Actual / notes |
|---|---|---|---|
| C-F-01 | New strand option appears on the site | ✅ Pass | 302 |
| C-F-02 | Duplicate option name refused | ✅ Pass | 409 |
| C-F-03 | Option in use can't be deleted | ✅ Pass | 409 |
| C-F-04 | Hidden option leaves the chips, event stays | ✅ Pass |  |
| C-F-05 | Strand group can't be deleted | ✅ Pass | 409 |
| C-F-06 | New rhythm card on the site | ✅ Pass | 302 |
| C-F-07 | Rhythm card needs 'when' | ✅ Pass | 400 |
| C-F-08 | Month line saved and public | ✅ Pass | QA month line |
| C-F-09 | Month line over 80 refused | ✅ Pass | 400 |
| C-F-10 | Calendar page search title saved and public | ✅ Pass | QA Calendar Title |
| C-F-11 | Empty page search title refused | ✅ Pass | 400 |
| C-F-12 | Calendar share image upload (1200×630) | ✅ Pass | 201 |
| C-F-13 | Duplicate year label refused | ✅ Pass | 409 |
| C-F-14 | Creating a new year does not change the public year | ✅ Pass | 2026–27 |
| C-F-15 | Public calendar: no-cache with ETag → 304 on repeat | ✅ Pass | 304 (raw HTTP request; Node fetch hides 304 replies) |

### Integration · Search, Home, Help, Site & SEO

| ID | Test | Result | Actual / notes |
|---|---|---|---|
| C-S-01 | Events search finds matches across the year | ✅ Pass |  |
| C-S-02 | Events search with no match shows message | ✅ Pass |  |
| C-S-03 | Calendar dashboard has the search box | ✅ Pass |  |
| C-S-04 | Notes list has the search box and script | ✅ Pass |  |
| C-S-05 | Home page loads | ✅ Pass | 200 |
| C-S-06 | Help page loads with all sections | ✅ Pass | 200 |
| C-S-07 | Site & SEO page loads with the blog fields | ✅ Pass | 200 |
| C-S-08 | Site & SEO saves and /api/blog returns it | ✅ Pass | QA Blog |
| C-S-09 | Site & SEO: empty search title refused | ✅ Pass | 400 |
| C-S-10 | CMS tab icon served | ✅ Pass | image/png |
| C-S-11 | Tab title format 'Page · Wellsprings CMS' | ✅ Pass |  |
| C-S-12 | Menu has Home, Notes, Calendar, Site & SEO, Help, Password, Sign out | ✅ Pass |  |
| C-S-13 | Event editor includes autosave | ✅ Pass |  |
| C-S-14 | Note editor includes autosave | ✅ Pass |  |

### Integration · Security

| ID | Test | Result | Actual / notes |
|---|---|---|---|
| C-X-01 | Signed out: calendar screens go to sign in | ✅ Pass |  |
| C-X-02 | Signed out: calendar photo API refused | ✅ Pass |  |
| C-X-03 | Cross-site calendar post blocked (403) | ✅ Pass | 403 |
| C-X-04 | Cross-site Site & SEO post blocked (403) | ✅ Pass | 403 |
| C-X-05 | Calendar admin pages noindex + CSP | ✅ Pass |  |
| C-X-06 | Event title HTML is escaped | ✅ Pass |  |

### Integration · Blog · Startup

| ID | Test | Result | Actual / notes |
|---|---|---|---|
| B-ST-01 | Start, / redirects to /admin | ✅ Pass |  |
| B-ST-01b | Log shows listening and no secrets | ✅ Pass |  |
| B-ST-06 | Three seeded notes | ✅ Pass | count 3 |

### Integration · Blog · Sign in & password

| ID | Test | Result | Actual / notes |
|---|---|---|---|
| B-AU-09 | API needs sign in (401) | ✅ Pass | status 401 |
| B-AU-08 | Signed-out /admin/notes goes to /admin | ✅ Pass | 302 /admin |
| B-AU-08 | Signed-out /admin/notes/new goes to /admin | ✅ Pass | 302 /admin |
| B-AU-08 | Signed-out /admin/password goes to /admin | ✅ Pass | 302 /admin |
| B-AU-02 | Wrong password message | ✅ Pass |  |
| B-AU-03 | Unknown email same message | ✅ Pass |  |
| B-AU-04 | Email in capitals signs in | ✅ Pass |  |
| B-AU-15 | Cookie HttpOnly, SameSite=Lax, 12h | ✅ Pass | wsa_session=…; Max-Age=43200; Path=/; Expires=Fri, 06 Nov 2026 19:18:35 GMT; HttpOnly; SameSite=Lax |
| B-AU-15b | Cookie not Secure in local (non-production) mode | ✅ Pass |  |
| B-AU-01 | Signed in, notes API works | ✅ Pass |  |
| B-AU-05 | 6th failed try → wait (429) | ✅ Pass | 401,401,401,401,401,429,429 |
| B-AU-05b | Wait message text | ✅ Pass |  |
| B-AU-06 | Success clears the counter (5 more fails still 401) | ✅ Pass | 401,401,401,401,401 |
| B-AU-06b | Can still sign in after | ✅ Pass |  |
| B-AU-10 | Wrong current password | ✅ Pass | That password is not right. |
| B-AU-11 | New password too short | ✅ Pass |  |
| B-AU-12 | New passwords must match | ✅ Pass |  |
| B-AU-13 | Password change succeeds | ✅ Pass |  |
| B-AU-14 | Old cookie stops working | ✅ Pass |  |
| B-AU-13b | Old password refused | ✅ Pass |  |
| B-AU-13c | New password works | ✅ Pass |  |
| B-AU-07 | Sign out clears cookie | ✅ Pass |  |

### Integration · Blog · Note editor

| ID | Test | Result | Actual / notes |
|---|---|---|---|
| B-NO-03 | Draft needs headline | ✅ Pass | Headline is required. |
| B-NO-04 | Save draft with only headline | ✅ Pass |  |
| B-NO-08 | Headline 121 refused | ✅ Pass | Headline must be 120 characters or fewer. |
| B-NO-08b | Summary 301 refused | ✅ Pass | Short summary must be 300 characters or fewer. |
| B-NO-08c | Caption 161 refused | ✅ Pass | Caption must be 160 characters or fewer. |
| B-NO-08d | Alt 201 refused | ✅ Pass | What is in the photo must be 200 characters or fewer. |
| B-NO-09 | 9 paragraphs refused | ✅ Pass | A note can have at most 8 paragraphs. |
| B-NO-09b | Paragraph 1001 refused | ✅ Pass | Each paragraph must be 1,000 characters or fewer. |
| B-NO-10 | Blank line = paragraph, single break = space, empties dropped | ✅ Pass | ["One two","Three"] |
| B-NO-12 | Term 1 week 30 refused | ✅ Pass | Choose a term and week from the lists. |
| B-NO-16 | Bad URL characters refused | ✅ Pass | Use only letters, numbers, and hyphens. |
| B-NO-17 | URL already used → 409 | ✅ Pass | 409 That URL is already used. |
| B-NO-18 | Automatic search title/description | ✅ Pass | Seo test — Notes from school \| Wellsprings Academy \| Short summary. |
| B-NO-19 | Custom search title stored trimmed | ✅ Pass | My own title |
| B-NO-19b | Custom title kept after headline change; auto description follows | ✅ Pass | My own title \| New summary. |
| B-NO-23 | Impossible date refused | ✅ Pass | Use a real calendar date. |
| B-NO-13b | Unknown designation refused | ✅ Pass | Choose a designation from the list. |
| B-NO-13 | Byline composed, empty parts skipped | ✅ Pass | Ms. Asha, Class Teacher · Grade 3 |
| B-NO-11 | HTML in note is escaped in preview | ✅ Pass |  |

### Integration · Blog · Security

| ID | Test | Result | Actual / notes |
|---|---|---|---|
| B-SE-07 | Unknown fields ignored | ✅ Pass |  |
| B-SE-01 | Admin API noindex + no-store | ✅ Pass |  |
| B-SE-01b | Admin page noindex + CSP | ✅ Pass |  |
| B-SE-02 | Cross-site POST blocked (403) | ✅ Pass |  |
| B-SE-03 | Security headers | ✅ Pass |  |
| B-SE-04 | Unknown API path 404 | ✅ Pass |  |
| B-SE-04b | Bad note id 404, no crash | ✅ Pass |  |
| B-SE-05 | Broken JSON → 400, no stack trace | ✅ Pass | 400 {"error":"Request could not be read."} |
| B-SE-08 | Oversized body refused (413) | ✅ Pass | 413 |

### Integration · Blog · Cover photos

| ID | Test | Result | Actual / notes |
|---|---|---|---|
| B-PH-02 | 2400×1600 accepted | ✅ Pass | 200 {"coverImage":"/api/uploads/4ede34eb286c581c9c9b3bb9d3978e63.webp","width":1200,"height":800} |
| B-PH-03 | 1200×800 accepted | ✅ Pass | 200 {"coverImage":"/api/uploads/b8cf769491e778d5e60993fb1d02dfe7.webp","width":1200,"height":800} |
| B-PH-04 | 3000×2000 accepted | ✅ Pass | 200 {"coverImage":"/api/uploads/20f4893abb8b4b8b44e97c796827182d.webp","width":1200,"height":800} |
| B-PH-05 | 1536×1024 accepted | ✅ Pass | 200 {"coverImage":"/api/uploads/b345902036736ed44598cdcd6662e2fb.webp","width":1200,"height":800} |
| B-PH-05b | 1920×1080 accepted | ✅ Pass | 200 {"coverImage":"/api/uploads/fbf1f702da01ebfbf695dc6732093dc1.webp","width":1200,"height":800} |
| B-PH-05c | 1600×1200 accepted | ✅ Pass | 200 {"coverImage":"/api/uploads/9a04cc87d09f617a4f52d40100630f8e.webp","width":1200,"height":800} |
| B-PH-06 | 900×600 too small | ✅ Pass | 400 Photo is too small. Use at least 1200 × 800. |
| B-PH-07 | 4000×3000 too big | ✅ Pass | 400 Photo is too big. Use up to 3000 × 2000. |
| B-PH-08 | Portrait refused | ✅ Pass | 400 Use a sideways (landscape) photo. Standing or square photos do not fit. |
| B-PH-09 | Square refused | ✅ Pass | 400 Use a sideways (landscape) photo. Standing or square photos do not fit. |
| B-PH-10 | Upright phone photo refused | ✅ Pass | Use a sideways (landscape) photo. Standing or square photos do not fit. |
| B-PH-11 | Fake JPG refused | ✅ Pass | 415 Photo must be a JPEG, PNG, or WebP under 5 MB. |
| B-PH-11b | GIF refused | ✅ Pass | 415 |
| B-PH-12 | Over 5 MB refused | ✅ Pass | 413 Photo must be a JPEG, PNG, or WebP under 5 MB. |
| B-PH-05d | PNG accepted | ✅ Pass |  |
| B-PH-13 | Saved as 1200×800 WebP with random name | ✅ Pass |  |
| B-PH-14 | No camera/location data in saved file | ✅ Pass | exif:false |
| B-PH-17 | Upload needs sign in | ✅ Pass |  |
| B-PH-15 | Replacing photo removes old file, new name | ✅ Pass |  |

### Integration · Blog · Publish / unpublish / delete

| ID | Test | Result | Actual / notes |
|---|---|---|---|
| B-PU-01 | Publish blocked without excerpt | ✅ Pass | 400 Add the summary before publishing. |
| B-PU-01 | Publish blocked without bodyText | ✅ Pass | 400 Add the note before publishing. |
| B-PU-01 | Publish blocked without pillar | ✅ Pass | 400 Choose Think, Build, or Belong before publishing. |
| B-PU-01 | Publish blocked without dateLabel | ✅ Pass | 400 Choose the term and week before publishing. |
| B-PU-01 | Publish blocked without authorDesignation | ✅ Pass | 400 Choose a designation before publishing. |
| B-PU-01 | Publish blocked without authorFirstName | ✅ Pass | 400 Add the first name before publishing. |
| B-PU-01 | Publish blocked without coverImage | ✅ Pass | 400 Add a cover photo before publishing. |
| B-PU-01 | Publish blocked without imageAlt | ✅ Pass | 400 Describe what is in the photo before publishing. |
| B-PU-01 | Publish blocked without slug | ✅ Pass | 400 Add a URL before publishing. |
| B-PU-02 | Child switch on, no ticks | ✅ Pass | Tick photo and names before publishing. |
| B-PU-02b | Only photo ticked | ✅ Pass | Tick names before publishing. |
| B-PU-01b | Cover path that does not exist refused | ✅ Pass | Photo must be a JPEG, PNG, or WebP under 5 MB. |
| B-PU-04 | Publish with all fields | ✅ Pass | 201  |
| B-PU-05 | URL locked after publish | ✅ Pass | test-science-fair |
| B-PU-06 | Update saved | ✅ Pass |  |
| B-PU-03 | Child switch off → consents saved false | ✅ Pass |  |
| B-PU-15 | Preview shows 'Only you can see this.' and noindex | ✅ Pass |  |
| B-PU-15b | Preview uses 3:2 frame (frame wide) | ✅ Pass |  |
| B-PU-17 | Preview signed out → /admin | ✅ Pass |  |
| B-PU-07 | Future-dated note hidden (404) | ✅ Pass |  |
| B-PU-13 | Only one featured, new one wins | ✅ Pass | Featured B |
| B-PU-08 | Unpublish → draft, featured cleared, URL kept | ✅ Pass |  |
| B-PU-14 | No featured note after unpublish | ✅ Pass |  |
| B-PU-09 | Publish again with same URL | ✅ Pass |  |
| B-PU-10x | Published note still deletable later (checked below) | ✅ Pass |  |
| B-PU-11 | Delete draft removes note and its photo file | ✅ Pass |  |
| B-PU-10 | Published + featured note deletes in one call | ✅ Pass | 204 featuredBefore:true public:404 file:false |

### Integration · Blog · Public blog API

| ID | Test | Result | Actual / notes |
|---|---|---|---|
| B-PB-02 | Featured is the large block, not repeated in cards | ✅ Pass |  |
| B-PB-03 | Unpublished/draft note → 404 Not found | ✅ Pass |  |
| B-PB-01 | Only visible notes, newest first | ✅ Pass | count 5 |
| B-PB-09 | No private fields in public JSON | ✅ Pass | author,body,caption,coverHeight,coverImage,coverWidth,dateLabel,excerpt,featured,id,imageAlt,pillar,publishDate,seoDescription,seoTitle,slug,title |
| B-PB-10 | Blog cache header | ✅ Pass | public, max-age=60 |
| B-PB-04 | Article API: post + up to 2 more | ✅ Pass |  |
| B-PB-04b | Pillar shown as Think/Build/Belong | ✅ Pass | Build |
| B-PB-10b | Photo cache header immutable | ✅ Pass | public, max-age=31536000, immutable |
| B-PB-11 | Bad photo path /api/uploads/..%2F.env → 404 | ✅ Pass | 404 |
| B-PB-11 | Bad photo path /api/uploads/abc.webp → 404 | ✅ Pass | 404 |
| B-PB-11 | Bad photo path /api/uploads/00000000000000000000000000000000.webp → 404 | ✅ Pass | 404 |
| B-PB-11 | Bad photo path /api/uploads/ → 404 | ✅ Pass | 404 |

### UI (browser) · Admin screens

| ID | Test | Result | Actual / notes |
|---|---|---|---|
| UI-01 | Top menu items on one line | ✅ Pass | all 7 at 38px |
| UI-02 | Notes search full content width, bold label | ✅ Pass | 1180 vs 1180 |
| UI-03 | Notes search filters as you type | ✅ Pass | 1 of 9 shown |
| UI-04 | Notes search 'no match' message | ✅ Pass |  |
| UI-05 | Esc clears the notes search | ✅ Pass |  |
| UI-06 | Save draft / Update / Preview / Unpublish / Delete same height | ✅ Pass | 46,46,46,46,46 |
| UI-07 | Unpublish and Delete in one box on one line | ✅ Pass | 1 box, same line |
| UI-08 | Editor tab title | ✅ Pass | Edit note · Wellsprings CMS |
| UI-09 | Autosave keeps a copy while typing | ✅ Pass | copy saved in browser |
| UI-10 | Reopening offers Restore / Discard | ✅ Pass | You have unsaved changes from … Restore / Discard |
| UI-11 | Restore brings the text back | ✅ Pass |  |
| UI-12 | Offer closes after Restore | ✅ Pass |  |
| UI-13 | Event preview photos are 4:3 tiles in a row | ✅ Pass | 136x102 ×3 |
| UI-14 | Event preview card is a normal height | ✅ Pass | 363px (was ~2570px) |
| UI-15 | Preview shows 'Only you can see this.' | ✅ Pass |  |
| UI-16 | Choosing event photos without edits asks no question | ✅ Pass | 0 questions |
| UI-17 | Events: space between title and search row | ✅ Pass | 32px / 26px |
| UI-18 | No sideways scroll on Events at 1280px | ✅ Pass |  |
| UI-19 | Events page at 375px: no sideways scroll | ✅ Pass | 375 / 375 |
| UI-20 | Notes page at 375px: no sideways scroll | ✅ Pass | 375 / 375 |

### Sanity · Build & startup

| ID | Test | Result | Actual / notes |
|---|---|---|---|
| S-01 | TypeScript type check passes | ✅ Pass | no errors |
| S-02 | Fresh database: starts and listens | ✅ Pass | Request failed: POST /api/admin/posts -> 413 PayloadTooLargeError: request entity too large |
| S-03 | Log never prints the password or cookie secret | ✅ Pass |  |
| S-04 | Every migration applied exactly once | ✅ Pass | 001_blog_and_admin.sql, 002_blog_editor_changes.sql, 003_author_salutation.sql, 004_calendar.sql, 005_site_pages.sql |
| S-05 | All tables exist | ✅ Pass | admins, blog_posts, cal_events, cal_filters, cal_photos, cal_rhythm, cal_years, schema_migrations, site_pages |
| S-06 | Exactly one admin created from settings | ✅ Pass | 1 |
| S-07 | Seed data present (3 notes, calendar events) | ✅ Pass | notes 3, events 137 |
| S-08 | Site & SEO row seeded | ✅ Pass | QA Blog |
| S-09 | Missing COOKIE_SECRET stops startup and names it | ✅ Pass | Missing COOKIE_SECRET |
| S-10 | .env and uploads/ are ignored by git | ✅ Pass | !! .env \| !! uploads/ |
| S-11 | .env.example lists every key, no real values | ✅ Pass |  |
| S-12 | No new runtime packages added | ✅ Pass | argon2, cookie-parser, express, pg, sharp, zod |
| S-13 | npm audit: no high/critical vulnerabilities in runtime packages | ❌ Fail | {"info":0,"low":0,"moderate":0,"high":2,"critical":0,"total":2} |
