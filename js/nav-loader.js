document.addEventListener("DOMContentLoaded", () => {
  fetch("/components/nav.html")
    .then(res => res.text())
    .then(html => {
      document.getElementById("nav-placeholder").innerHTML = html;
    });
});
