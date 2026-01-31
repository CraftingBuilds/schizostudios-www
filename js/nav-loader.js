// /js/nav-loader.js
document.addEventListener("DOMContentLoaded", async () => {
  const mount = document.getElementById("nav-placeholder");
  if (!mount) return;

const candidates = [
  "/components/nav.html",
  "/partials/nav.html",
  "/includes/nav.html",
  "/nav.html",
];

  const log = (...args) => console.log("[nav-loader]", ...args);
  const warn = (...args) => console.warn("[nav-loader]", ...args);
  const err  = (...args) => console.error("[nav-loader]", ...args);

  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store" });

      // Always log failures so we can see which one died
      if (!res.ok) {
        warn("skip", url, "HTTP", res.status);
        continue;
      }

      const ct = (res.headers.get("content-type") || "").toLowerCase();
      const text = await res.text();

      // Guard: sometimes you get an empty response or something not nav HTML
      if (!text || text.trim().length < 20) {
        warn("skip", url, "empty/too-short response", "content-type:", ct);
        continue;
      }

      // If /nav.html is being served with a weird content-type, we still inject it.
      mount.innerHTML = text;
      log("mounted nav from", url, "content-type:", ct, "bytes:", text.length);

      // Optional: mark mount as ready for CSS hooks/debugging
      mount.setAttribute("data-nav-loaded", "true");
      return;
    } catch (e) {
      warn("skip", url, "fetch error:", e);
    }
  }

  err("Could not load nav from candidates:", candidates);
  mount.setAttribute("data-nav-loaded", "false");
});
