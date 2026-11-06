// Help: one plain-language page for the admin, linked from the CMS menu.
import { randomBytes } from "node:crypto";
import type { Express } from "express";
import { requireAdmin } from "./auth.ts";
import { csp, eyebrow, page } from "./html.ts";

function helpBody(): string {
  return `<main class="sheet narrow help-page">
    ${eyebrow("Help")}
    <h1>How to use the CMS</h1>
    <p class="intro">Short answers to the things that come up most. Nothing here changes the website.</p>

    <section class="panel">
      ${eyebrow("Photos")}
      <ul>
        <li><strong>Use sideways (landscape) photos.</strong> Standing (portrait) and square photos are refused.</li>
        <li><strong>Size:</strong> from 1200 × 800 up to 3000 × 2000 pixels, JPEG, PNG or WebP, under 5 MB. Best: 2400 × 1600.</li>
        <li><strong>Phone photos are usually too big</strong> (about 4000 × 3000). Make them smaller first, or send them to yourself on WhatsApp and use that copy.</li>
        <li><strong>Keep faces and the main subject in the middle.</strong> The large “This week's note” block on the website is wide, so the top and bottom of the photo are cut there.</li>
        <li>The same rules apply to blog photos, event photos, calendar card photos and share images.</li>
        <li>Location and camera details are removed from every photo when it is uploaded.</li>
      </ul>
    </section>

    <section class="panel">
      ${eyebrow("Notes (the blog)")}
      <ul>
        <li><strong>Save draft</strong> keeps your work. Nobody outside can see a draft.</li>
        <li><strong>Preview</strong> shows the saved note as parents will see it. Save first, then preview.</li>
        <li><strong>Publish</strong> puts the note on the website. If something is missing, the line under the button says what.</li>
        <li><strong>Calendar date</strong> decides the order. A future date keeps the note hidden until that day.</li>
        <li><strong>This week's note</strong> is the large block at the top of /blog. Only one note can be it; choosing a new one replaces the old.</li>
        <li><strong>Child's photo or name:</strong> if any child can be recognised or is named, turn the switch on and tick both permissions before publishing.</li>
        <li><strong>The URL</strong> is fixed after the first publish, so shared links keep working.</li>
      </ul>
    </section>

    <section class="panel">
      ${eyebrow("Unpublish or delete?")}
      <ul>
        <li><strong>Unpublish</strong> takes a note off the website but keeps it here as a draft, with its URL. You can publish it again later.</li>
        <li><strong>Delete</strong> removes the note and its photo for good. It cannot be undone.</li>
        <li>For events: <strong>Cancel event</strong> keeps it on the site marked “Cancelled”; <strong>Unpublish</strong> takes it off; <strong>Delete</strong> is only for drafts.</li>
      </ul>
    </section>

    <section class="panel">
      ${eyebrow("Google and sharing")}
      <ul>
        <li>Each note and each event has its own <strong>Search and sharing / SEO</strong> section. It fills itself from the headline and summary (“Automatic”). Type your own text to change it (“Customised”).</li>
        <li><strong>Site &amp; SEO</strong> in the menu sets the same details for the whole blog page.</li>
        <li><strong>Calendar → Page &amp; SEO</strong> sets them for the calendar page of each school year.</li>
        <li>Changes show on the website within about a minute.</li>
      </ul>
    </section>

    <section class="panel">
      ${eyebrow("If something goes wrong")}
      <ul>
        <li><strong>Unsaved work is kept in this browser.</strong> If the tab closes or you are signed out, open the note or event again and press <strong>Restore</strong>.</li>
        <li>Sign-in lasts 12 hours. After that, sign in again; your unsaved work can still be restored.</li>
        <li>After 6 wrong passwords, wait 15 minutes before trying again.</li>
        <li>Change your password under <strong>Password</strong> in the menu.</li>
      </ul>
    </section>
  </main>`;
}

export function mountHelp(app: Express): void {
  app.get("/admin/help", requireAdmin, (_req, res) => {
    const nonce = randomBytes(16).toString("base64url");
    res.setHeader("Content-Security-Policy", csp(nonce));
    res.status(200).type("html").send(page("Help", helpBody(), true, nonce));
  });
}
