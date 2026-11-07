// Help: one plain-language page for the admin, linked from the CMS menu.
import { randomBytes } from "node:crypto";
import type { Express } from "express";
import { requireAdmin } from "./auth.ts";
import { csp, eyebrow, page } from "./html.ts";

function helpBody(): string {
  return `<main class="sheet narrow help-page">
    ${eyebrow("Help")}
    <h1>How to use the CMS</h1>
    <p class="intro">Short answers to the things that come up most. Press a title to open it. Nothing here changes the website.</p>

    <div class="panel help-list">

      <details class="help-item" name="help" id="help-mandatory-fields">
        <summary><span>Mandatory fields</span><svg class="help-chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></summary>
        <div class="help-body">
      <ul>
        <li>A red <strong><span class="req" aria-hidden="true">*</span></strong> after a field's title means it must be filled in.</li>
        <li>Some of these are needed only to <strong>publish</strong>: you can still save a draft without them. For a note, only the headline is needed for a draft; for an event, the title, start date and strand.</li>
        <li>If something is missing, the message at the top or under the buttons names it.</li>
      </ul>
        </div>
      </details>

      <details class="help-item" name="help" id="help-photos">
        <summary><span>Photos</span><svg class="help-chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></summary>
        <div class="help-body">
      <ul>
        <li><strong>Use sideways (landscape) photos.</strong> Standing (portrait) and square photos are refused.</li>
        <li><strong>Size:</strong> from 1200 × 800 up to 3000 × 2000 pixels, JPEG, PNG or WebP, under 5 MB. Best: 2400 × 1600.</li>
        <li><strong>Phone photos are usually too big</strong> (about 4000 × 3000). Make them smaller first, or send them to yourself on WhatsApp and use that copy.</li>
        <li><strong>Keep faces and the main subject in the middle.</strong> The large “This week's note” block on the website is wide, so the top and bottom of the photo are cut there.</li>
        <li>The same rules apply to blog photos, event photos, calendar card photos and share images.</li>
        <li>Location and camera details are removed from every photo when it is uploaded.</li>
      </ul>
        </div>
      </details>

      <details class="help-item" name="help" id="help-notes-the-blog">
        <summary><span>Notes (the blog)</span><svg class="help-chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></summary>
        <div class="help-body">
      <ul>
        <li><strong>Save draft</strong> keeps your work. Nobody outside can see a draft.</li>
        <li><strong>Preview</strong> shows the saved note as parents will see it. Save first, then preview.</li>
        <li><strong>Publish</strong> puts the note on the website. If something is missing, the line under the button says what.</li>
        <li><strong>Calendar date</strong> decides the order. A future date keeps the note hidden until that day.</li>
        <li><strong>This week's note</strong> is the large block at the top of /blog. Only one note can be it; choosing a new one replaces the old.</li>
        <li><strong>Child's photo or name:</strong> if any child can be recognised or is named, turn the switch on and tick both permissions before publishing.</li>
        <li><strong>The URL</strong> is fixed after the first publish, so shared links keep working.</li>
        <li><strong>The Blogs page</strong> shows this week's note first, then <strong>Published notes</strong> and <strong>Drafts</strong> separately. Each shows 6 notes; press <strong>Show more</strong> for the next 6. Searching looks through all notes.</li>
      </ul>
        </div>
      </details>

      <details class="help-item" name="help" id="help-unpublish-or-delete">
        <summary><span>Unpublish or delete?</span><svg class="help-chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></summary>
        <div class="help-body">
      <ul>
        <li><strong>Unpublish</strong> takes a note off the website but keeps it here as a draft, with its URL. You can publish it again later.</li>
        <li><strong>Delete</strong> removes the note and its photo for good. It cannot be undone.</li>
        <li>For events: <strong>Cancel event</strong> keeps it on the site marked “Cancelled”; <strong>Unpublish</strong> takes it off; <strong>Delete</strong> is only for drafts.</li>
      </ul>
        </div>
      </details>

      <details class="help-item" name="help" id="help-google-and-sharing">
        <summary><span>Google and sharing</span><svg class="help-chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></summary>
        <div class="help-body">
      <ul>
        <li>Each note and each event has its own <strong>Search and sharing / SEO</strong> section. It fills itself from the headline and summary (“Automatic”). Type your own text to change it (“Customised”).</li>
        <li><strong>Site &amp; SEO</strong> in the menu sets the same details for whole pages: the <strong>Blog</strong> tab for /blog, the <strong>Calendar</strong> tab for /theme-of-the-year (one set per school year).</li>
        <li>For an event, an empty search title or description is <strong>filled in on save</strong>, from the title and subtitle. The count beside it shows the length; about 60 characters for a title and 155 for a description fit on Google.</li>
        <li><strong>Event link</strong> is the end of the address that opens the event's pop-up, after <code>/theme-of-the-year?event=</code>. Change it only before you share the event: old shared links stop opening it.</li>
        <li><strong>Structured data (schema markup)</strong> tells Google what kind of page it is. Pick the type under “This page is a…” and leave it on <strong>Automatic</strong>; it is built from the page's own details. <strong>Custom JSON-LD</strong> is for experts only. Once the page is published, <strong>Rich Results Test ↗</strong> checks it with Google.</li>
        <li>Changes show on the website within about a minute.</li>
      </ul>
        </div>
      </details>

      <details class="help-item" name="help" id="help-calendar">
        <summary><span>Calendar</span><svg class="help-chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></summary>
        <div class="help-body">
      <ul>
        <li><strong>Theme of the year:</strong> change it under <strong>Site &amp; SEO → Calendar</strong>, or with <strong>Rename theme</strong> beside the theme on the calendar Dashboard. It is the large title on /theme-of-the-year.</li>
        <li><strong>Events:</strong> search the whole year, or narrow the list with <strong>Year</strong>, <strong>Strand</strong> and <strong>State</strong>. Choosing another year in the <strong>Year</strong> dropdown switches the whole calendar section to that year; the year you are editing shows at the top right.</li>
        <li><strong>Preview</strong> of an event shows its photos side by side; scroll sideways or use the arrows to see them all. Photos show only once the recap is published.</li>
        <li><strong>Strands:</strong> add a new option in the card at the top; a colour is required. The list shows 6 options at a time; press <strong>Show more</strong> for the rest. An option in use cannot be deleted; untick <strong>Shown</strong> to hide it from the website.</li>
        <li><strong>All-year rhythm:</strong> 4 cards show at first; press <strong>Show more</strong> for the rest. Only one card opens for editing at a time; opening another closes the first without saving it, so press <strong>Save card</strong> first.</li>
        <li><strong>Years:</strong> only one “Change months” or “Delete” panel is open at a time.</li>
        <li><strong>On the website</strong>, each month shows the events that fit beside the month list, then a <strong>Show more</strong> button. Parents can filter by year and by strand.</li>
      </ul>
        </div>
      </details>

      <details class="help-item" name="help" id="help-forgot-your-password">
        <summary><span>Forgot your password?</span><svg class="help-chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></summary>
        <div class="help-body">
      <ul>
        <li>For safety, the CMS cannot email a reset link. Ask the person who looks after the website server; it takes them a minute.</li>
        <li>They sign in to the server, go to the CMS folder and run <code>npm run reset-password</code>. It asks for your email and a new password (at least 12 characters), typed twice.</li>
        <li>Then sign in at <strong>/admin</strong> with the new password. Anyone still signed in to that account is signed out.</li>
        <li>If the sign-in page says to wait 15 minutes after wrong tries, they can restart the CMS to clear it, or you can wait.</li>
        <li>If you <strong>do</strong> know your password and just want a new one, use <strong>Password</strong> in the menu instead.</li>
      </ul>
        </div>
      </details>

      <details class="help-item" name="help" id="help-if-something-goes-wrong">
        <summary><span>If something goes wrong</span><svg class="help-chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></summary>
        <div class="help-body">
      <ul>
        <li><strong>Unsaved work is kept in this browser.</strong> If the tab closes or you are signed out, open the note or event again and press <strong>Restore</strong>.</li>
        <li>Sign-in lasts 12 hours. After that, sign in again; your unsaved work can still be restored.</li>
        <li>After 6 wrong passwords, wait 15 minutes before trying again.</li>
        <li>Change your password under <strong>Password</strong> in the menu.</li>
      </ul>
        </div>
      </details>
    </div>
  </main>`;
}

const HELP_SCRIPT = `
(function () {
  var items = Array.prototype.slice.call(document.querySelectorAll("details.help-item"));
  items.forEach(function (item) {
    item.addEventListener("toggle", function () {
      if (!item.open) return;
      items.forEach(function (other) { if (other !== item) other.open = false; });
    });
  });
  var target = window.location.hash && document.getElementById(window.location.hash.slice(1));
  if (target && target.tagName === "DETAILS") { target.open = true; target.scrollIntoView({ block: "start" }); }
})();
`;

export function mountHelp(app: Express): void {
  app.get("/admin/help", requireAdmin, (_req, res) => {
    const nonce = randomBytes(16).toString("base64url");
    res.setHeader("Content-Security-Policy", csp(nonce));
    res.status(200).type("html").send(page("Help", `${helpBody()}<script nonce="${nonce}">${HELP_SCRIPT}</script>`, true, nonce));
  });
}
