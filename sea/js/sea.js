let seaData = [];

const searchInput = document.getElementById("searchInput");
const yearFilter = document.getElementById("yearFilter");
const typeFilter = document.getElementById("typeFilter");
const modeFilter = document.getElementById("modeFilter");
const seaRecords = document.getElementById("seaRecords");
const resultCount = document.getElementById("resultCount");

function uniqSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

function populateSelect(select, values, label) {
  for (const value of values) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    select.appendChild(opt);
  }
}

function buildSearchBlob(item) {
  return [
    item.title,
    item.date,
    item.type,
    item.mode,
    item.mapping,
    item.source_object,
    item.notes,
    (item.harmonics || []).join(" ")
  ].join(" ").toLowerCase();
}

function renderRecords(records) {
  seaRecords.innerHTML = "";
  resultCount.textContent = `${records.length} record${records.length === 1 ? "" : "s"} shown`;

  if (!records.length) {
    seaRecords.innerHTML = `<div class="sea-card"><p>No records matched the current filters.</p></div>`;
    return;
  }

  for (const item of records) {
    const card = document.createElement("article");
    card.className = "sea-card";

    const tags = [
      item.type,
      item.mode,
      item.mapping,
      item.anchor_hz ? `${item.anchor_hz} Hz` : "",
      (item.harmonics && item.harmonics.length) ? `Harmonics: ${item.harmonics.join(", ")}` : ""
    ].filter(Boolean);

    const files = item.files || {};
    const base = `/${item.relative_url}`;

    const links = [];
    if (files.record) links.push(`<a href="${base}${files.record}" target="_blank">Record</a>`);
    if (files.audio) links.push(`<a href="${base}${files.audio}" target="_blank">Audio</a>`);
    if (files.notes) links.push(`<a href="${base}${files.notes}" target="_blank">Notes</a>`);
    links.push(`<a href="${base}metadata.json" target="_blank">Metadata</a>`);

    card.innerHTML = `
      <div class="sea-card-header">
        <div>
          <h2>${item.title || "SEA Record"}</h2>
        </div>
        <div class="sea-date">${item.date || ""}</div>
      </div>

      <div class="sea-tags">
        ${tags.map(tag => `<span class="sea-tag">${tag}</span>`).join("")}
      </div>

      <div class="sea-meta">
        <div><strong>Source:</strong> ${item.source_object || "—"}</div>
        <div><strong>ID:</strong> ${item.id || "—"}</div>
        <div><strong>Notes:</strong> ${item.notes || "—"}</div>
      </div>

      <div class="sea-links">
        ${links.join("")}
      </div>
    `;

    seaRecords.appendChild(card);
  }
}

function applyFilters() {
  const q = searchInput.value.trim().toLowerCase();
  const year = yearFilter.value;
  const type = typeFilter.value;
  const mode = modeFilter.value;

  const filtered = seaData.filter(item => {
    if (year && String(item.year) !== year) return false;
    if (type && item.type !== type) return false;
    if (mode && item.mode !== mode) return false;
    if (q && !buildSearchBlob(item).includes(q)) return false;
    return true;
  });

  filtered.sort((a, b) => {
    const da = a.date || "";
    const db = b.date || "";
    if (da !== db) return da.localeCompare(db);
    return (a.id || "").localeCompare(b.id || "");
  });

  renderRecords(filtered);
}

async function initSEA() {
  try {
    const res = await fetch("/sea/data/sea_index.json");
    seaData = await res.json();

    populateSelect(yearFilter, uniqSorted(seaData.map(x => String(x.year))));
    populateSelect(typeFilter, uniqSorted(seaData.map(x => x.type)));
    populateSelect(modeFilter, uniqSorted(seaData.map(x => x.mode)));

    applyFilters();
  } catch (err) {
    resultCount.textContent = "Failed to load archive.";
    seaRecords.innerHTML = `<div class="sea-card"><p>Could not load SEA archive data.</p></div>`;
    console.error(err);
  }
}

searchInput.addEventListener("input", applyFilters);
yearFilter.addEventListener("change", applyFilters);
typeFilter.addEventListener("change", applyFilters);
modeFilter.addEventListener("change", applyFilters);

initSEA();
