// /publications/js/publications.js
(() => {
  "use strict";

  // ---- Config ----
  const CATALOG_URL = "/publications/publications.json";
  const BASE_URL = "/publications/";

  // ---- Allowed file types (STRICT) ----
  const ALLOWED_EXT = new Set(["pdf", "epub"]);

  // ---- DOM ----
  const navMount = document.getElementById("nav-placeholder");
  const footerMount = document.getElementById("footer-placeholder");

  const elQ = document.getElementById("q");
  const elType = document.getElementById("type");
  const elOut = document.getElementById("out");
  const elStats = document.getElementById("stats");
  const elStatus = document.getElementById("status");

  const btnReload = document.getElementById("reload");
  const btnDownloadCatalog = document.getElementById("downloadCatalog");

  // ---- State ----
  let catalog = null;

  // ---- Helpers ----
  const norm = (s) => (s || "").toString().toLowerCase();
  const uniq = (arr) => Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b));

  const extOf = (path) => {
    const clean = (path || "").split("?")[0].split("#")[0];
    const m = clean.toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : "";
  };

  const escapeHtml = (str) =>
    (str ?? "").toString()
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const humanBytes = (n) => {
    if (n === 0) return "0 B";
    if (typeof n !== "number" || !isFinite(n)) return "";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(n) / Math.log(k));
    const v = n / Math.pow(k, i);
    return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
  };

  function showStatus(msg, kind = "info") {
    if (!elStatus) return;
    elStatus.style.display = "block";
    const icon = kind === "bad" ? "✖" : kind === "warn" ? "⚠" : "ℹ";
    const color = kind === "bad" ? "var(--bad)" : kind === "warn" ? "var(--warn)" : "var(--good)";
    elStatus.innerHTML = `
      <div style="display:flex; gap:.6rem; align-items:flex-start;">
        <div style="font-weight:800; color:${color};">${icon}</div>
        <div>${msg}</div>
      </div>
    `;
  }

  function clearStatus() {
    if (!elStatus) return;
    elStatus.style.display = "none";
    elStatus.innerHTML = "";
  }

  async function loadComponent(mount, url, label) {
    if (!mount) return;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`${label} HTTP ${res.status}`);
      mount.innerHTML = await res.text();
    } catch (e) {
      mount.innerHTML = "";
      console.warn(`${label} failed to load:`, e);
    }
  }

  // ---- Book grouping: combine PDF + EPUB into a single entry ----
  function canonicalBookTitle(it) {
    const raw = (it.title || it.relative_path.split("/").pop() || "").toString();

    // Remove extension if it sneaks into title
    let t = raw.replace(/\.(pdf|epub)\s*$/i, "");

    // Remove "(Book)" suffix used in your EPUB title
    t = t.replace(/\s*\(book\)\s*$/i, "");

    // Normalize spaces
    t = t.replace(/\s+/g, " ").trim();

    return t || raw.trim();
  }

  function passesFilters(it) {
    // HARD BLOCK: only PDFs + EPUBs
    if (!ALLOWED_EXT.has((it.ext || "").toLowerCase())) return false;

    const q = norm(elQ?.value).trim();
    const t = norm(elType?.value).trim();

    // type filter matches available formats later (handled after grouping),
    // but we keep this to reduce work early
    if (t && norm(it.ext) !== t) return false;

    if (!q) return true;

    const hay = norm(
      [
        it.title,
        it.relative_path,
        it.category,
        (it.tags || []).join(" "),
        it.ext,
        it.visibility,
        it.shop_url,
      ].join(" | ")
    );

    return hay.includes(q);
  }

  function groupItemsToBooks(items) {
    const map = new Map();

    for (const it of items) {
      const paidKey = (it.visibility === "paid" && it.shop_url) ? `PAID::${it.shop_url}` : null;
      const titleKey = `TITLE::${canonicalBookTitle(it)}`;
      const key = paidKey || titleKey;

      if (!map.has(key)) {
        map.set(key, {
          key,
          title: canonicalBookTitle(it),
          category: it.category || (it.relative_path.split("/")[0] || "Unsorted"),
          tags: Array.isArray(it.tags) ? it.tags : [],
          visibility: it.visibility || "public",
          shop_url: it.shop_url || null,
          formats: new Set(),
          pdf: null,
          epub: null,
          size_bytes: 0,
          updated_utc: null,
          items: [],
        });
      }

      const b = map.get(key);
      b.items.push(it);

      const e = (it.ext || "").toLowerCase();
      if (e) b.formats.add(e);

      if (e === "pdf") b.pdf = it;
      if (e === "epub") b.epub = it;

      if (typeof it.size_bytes === "number") b.size_bytes += it.size_bytes;
      if (it.updated_utc && (!b.updated_utc || it.updated_utc > b.updated_utc)) b.updated_utc = it.updated_utc;

      // If any item is paid with a URL, treat the whole book as paid
      if (it.visibility === "paid" && it.shop_url) {
        b.visibility = "paid";
        b.shop_url = it.shop_url;
      }
    }

    return Array.from(map.values());
  }

  function buildTypeOptionsFromBooks(books) {
    if (!elType) return;
    const types = uniq(
      books.flatMap((b) => Array.from(b.formats))
    ).filter(Boolean);

    elType.innerHTML =
      `<option value="">All types</option>` +
      types.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t.toUpperCase())}</option>`).join("");
  }

  function groupBooksByCategory(books) {
    const grouped = {};
    for (const b of books) {
      const cat = b.category || "Unsorted";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(b);
    }
    for (const k of Object.keys(grouped)) {
      grouped[k].sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    }
    return grouped;
  }

  function bookHref(book) {
    if (book.visibility === "paid" && book.shop_url) return book.shop_url;

    // Public: prefer PDF, then EPUB
    const pick = book.pdf || book.epub;
    if (!pick) return "#";
    return BASE_URL + pick.relative_path.replace(/^\/+/, "");
  }

  function bookTag(book) {
    if (book.visibility === "paid") return "PAID (Shop)";
    const fmts = Array.from(book.formats).sort().map((f) => f.toUpperCase()).join(", ");
    return fmts || "FILE";
  }

  function render() {
    if (!elOut || !elStats) return;

    if (!catalog || !Array.isArray(catalog.items)) {
      elOut.innerHTML = "";
      elStats.textContent = "0 books • 0 categories";
      return;
    }

    // Start with item-level filter (pdf/epub only + search)
    const rawItems = catalog.items.filter(passesFilters);

    // Merge into books (PDF+EPUB combined)
    let books = groupItemsToBooks(rawItems);

    // Apply type filter at book level (show books that include that format)
    const t = norm(elType?.value).trim();
    if (t) {
      books = books.filter((b) => b.formats.has(t));
    }

    const grouped = groupBooksByCategory(books);
    const cats = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

    elStats.textContent = `${books.length} books • ${cats.length} categories`;

    if (books.length === 0) {
      elOut.innerHTML = "";
      showStatus("No publications found. Only PDF and EPUB books are shown.", "warn");
      return;
    } else {
      clearStatus();
    }

    elOut.innerHTML = cats.map((cat) => {
      const list = grouped[cat];

      const rows = list.map((book) => {
        const href = bookHref(book);
        const label = book.title;

        const metaBits = [
          Array.from(book.formats).sort().map((f) => f.toUpperCase()).join(", "),
          book.size_bytes ? humanBytes(book.size_bytes) : null,
          book.updated_utc ? "updated " + book.updated_utc.slice(0, 10) : null,
        ].filter(Boolean).join(" • ");

        const parts = [];
        if (book.pdf) parts.push(`PDF: ${escapeHtml(book.pdf.relative_path)}`);
        if (book.epub) parts.push(`EPUB: ${escapeHtml(book.epub.relative_path)}`);
        const subPath = parts.join(" • ");

        return `
          <div class="item">
            <div style="min-width:0;">
              <a href="${escapeHtml(href)}" target="_blank" rel="noopener">
                ${escapeHtml(label)}${book.visibility === "paid" ? " →" : ""}
              </a>
              <div class="sub">${subPath}${metaBits ? " • " + escapeHtml(metaBits) : ""}</div>
            </div>
            <div class="tag">${escapeHtml(bookTag(book))}</div>
          </div>
        `;
      }).join("");

      return `
        <article class="card">
          <div class="cardHead">
            <h2><span>${escapeHtml(cat)}</span><span class="count">${list.length}</span></h2>
          </div>
          <div class="list">${rows}</div>
        </article>
      `;
    }).join("");
  }

  async function loadCatalog() {
    clearStatus();
    if (elStats) elStats.textContent = "Loading…";
    if (elOut) elOut.innerHTML = "";

    try {
      const res = await fetch(CATALOG_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      catalog = await res.json();

      // Normalize + hard filter to PDF/EPUB only
      catalog.items = (catalog.items || [])
        .map((it) => {
          const rp = (it.relative_path || it.path || "").replace(/^\/+/, "");
          const ext = (it.ext || extOf(rp) || "").toLowerCase();
          return {
            title: it.title || null,
            relative_path: rp,
            category: it.category || null,
            tags: Array.isArray(it.tags) ? it.tags : [],
            size_bytes: typeof it.size_bytes === "number" ? it.size_bytes : null,
            updated_utc: it.updated_utc || null,
            ext,
            visibility: it.visibility || "public",
            shop_url: it.shop_url || null,
          };
        })
        .filter((it) => it.relative_path && ALLOWED_EXT.has(it.ext));

      // Build types from BOOKS (not raw items), so it stays clean
      const books = groupItemsToBooks(catalog.items);
      buildTypeOptionsFromBooks(books);

      render();
    } catch (err) {
      catalog = null;
      if (elStats) elStats.textContent = "0 books • 0 categories";
      showStatus(
        `Could not load <span class="mono">${escapeHtml(CATALOG_URL)}</span>.`,
        "bad"
      );
      console.error(err);
    }
  }

  function wireEvents() {
    elQ?.addEventListener("input", render);
    elType?.addEventListener("change", render);
    btnReload?.addEventListener("click", loadCatalog);
    btnDownloadCatalog?.addEventListener("click", downloadCatalog);
  }

  async function downloadCatalog() {
    try {
      const res = await fetch(CATALOG_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("Catalog not available");

      const blob = new Blob([await res.text()], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "publications.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      showStatus("Catalog download failed.", "warn");
    }
  }

  // ---- Boot ----
  wireEvents();
  loadComponent(navMount, "/components/nav.html?v=5", "Nav");
  loadComponent(footerMount, "/components/footer.html?v=5", "Footer");
  loadCatalog();
})();
