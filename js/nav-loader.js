document.addEventListener("DOMContentLoaded", async () => {
  const mount = document.getElementById("nav-placeholder");
  if (!mount) return;

  const candidates = [
    "/partials/nav.html",
    "/includes/nav.html",
    "/nav.html"
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      mount.innerHTML = await res.text();
      return;
    } catch (e) {}
  }

  console.error("[nav-loader] Could not load nav from:", candidates);
});
