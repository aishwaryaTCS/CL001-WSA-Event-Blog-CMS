// Draft autosave for the note and event editors.
// While the admin types, a copy of the form is kept in this browser (localStorage).
// If the tab closes or the sign-in expires before saving, reopening the editor offers Restore / Discard.
// Nothing is sent to the server and nothing is published by this script.
//
// clearOn: "explicit" — the editor calls window.wsaAutosaveClear() after a confirmed save (notes, saved by fetch).
//          "notice"   — a normal form POST; the copy is cleared when the next page shows a ?notice= (events).

export function autosaveScript(formId: string, kind: "note" | "event", idAttr: string, clearOn: "explicit" | "notice"): string {
  return `(() => {
  const form = document.getElementById(${JSON.stringify(formId)});
  if (!form) return;
  const id = form.getAttribute(${JSON.stringify(idAttr)}) || "new";
  const key = "wsa-autosave:${kind}:" + id;
  const newKey = "wsa-autosave:${kind}:new";
  const PENDING = "wsa-autosave-pending";
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  const get = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const drop = (k) => { try { localStorage.removeItem(k); } catch {} };

  const fields = () => Array.from(form.elements).filter((el) =>
    el.name && !el.disabled && !["file", "submit", "button", "reset", "password"].includes(el.type));
  const snapshot = () => fields().map((el) => [el.name, el.type === "checkbox" || el.type === "radio" ? (el.checked ? "1" : "") : el.value]);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  window.wsaAutosaveClear = () => { drop(key); drop(newKey); };

  // A save from the previous page succeeded: forget the copy it was made from.
  const params = new URLSearchParams(location.search);
  ${clearOn === "notice" ? `try {
    const pending = sessionStorage.getItem(PENDING);
    if (pending && params.has("notice")) { drop(pending); drop(key); }
    sessionStorage.removeItem(PENDING);
  } catch {}
  form.addEventListener("submit", () => { try { sessionStorage.setItem(PENDING, key); } catch {} });` : ""}

  const initial = snapshot();
  let restoring = false;

  const saved = get(key);
  if (saved && (Date.now() - saved.at > WEEK || same(saved.values, initial))) drop(key);
  else if (saved) offer(saved);

  let timer = 0;
  function remember() {
    if (restoring) return;
    const now = snapshot();
    if (same(now, initial)) { drop(key); return; }
    set(key, { at: Date.now(), values: now });
  }
  const later = () => { clearTimeout(timer); timer = setTimeout(remember, 1200); };
  form.addEventListener("input", later);
  form.addEventListener("change", later);
  window.addEventListener("pagehide", remember);

  function offer(copy) {
    const when = new Date(copy.at).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    const box = document.createElement("div");
    box.className = "banner notice autosave-offer";
    box.setAttribute("role", "status");
    box.innerHTML = '<span></span><span class="actions tight"><button type="button" class="secondary" data-act="restore">Restore</button><button type="button" class="secondary" data-act="discard">Discard</button></span>';
    box.firstChild.textContent = "You have unsaved changes from " + when + ".";
    const anchor = form.closest(".studio") || form;
    anchor.parentNode.insertBefore(box, anchor);
    box.addEventListener("click", (event) => {
      const act = event.target && event.target.getAttribute("data-act");
      if (act === "discard") { drop(key); box.remove(); }
      if (act === "restore") { restore(copy.values); box.remove(); }
    });
  }

  function restore(values) {
    restoring = true;
    const list = fields();
    const changed = [];
    values.forEach(([name, value], index) => {
      const el = list[index] && list[index].name === name ? list[index] : list.find((item) => item.name === name);
      if (!el) return;
      if (el.type === "checkbox" || el.type === "radio") {
        if (el.checked !== (value === "1")) { el.checked = value === "1"; changed.push(el); }
      } else if (el.value !== value) { el.value = value; changed.push(el); }
    });
    // Show a restored, not yet saved photo in the note editor's preview.
    const cover = form.querySelector("[name=coverImage]");
    const preview = document.getElementById("coverPreview");
    const empty = document.getElementById("coverEmpty");
    if (cover && preview && cover.value) { preview.src = cover.value; preview.hidden = false; if (empty) empty.hidden = true; }
    for (const el of changed) {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    restoring = false;
    remember();
  }
})();`;
}
