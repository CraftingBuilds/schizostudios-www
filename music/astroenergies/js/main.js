// js/main.js

// ==== Local studio player ====

// Add your local masters here as you create them.
// Just keep file paths in sync with /audio/.
const localTracks = [
  {
    title: "Run",
    release: "2025-08-13",
    file: "audio/run.wav",
    note: "Local master",
  },
  // Add more as needed
];

const audioEl = document.getElementById("ae-audio");
const nowTitleEl = document.getElementById("ae-now-title");
const playlistEl = document.getElementById("ae-playlist");
let currentIndex = 0;

function renderPlaylist() {
  playlistEl.innerHTML = "";
  localTracks.forEach((track, index) => {
    const li = document.createElement("li");
    li.dataset.index = index;
    li.innerHTML = `
      <span class="track-title">${track.title}</span>
      <span class="track-meta">${track.release} · ${track.note}</span>
    `;
    li.addEventListener("click", () => playTrack(index));
    playlistEl.appendChild(li);
  });
}

function highlightActive() {
  Array.from(playlistEl.children).forEach((li, idx) => {
    li.classList.toggle("active", idx === currentIndex);
  });
}

function playTrack(index) {
  currentIndex = index;
  const track = localTracks[index];
  if (!track) return;
  audioEl.src = track.file;
  nowTitleEl.textContent = track.title;
  audioEl.play().catch(() => {
    // autoplay blocked – user will hit play
  });
  highlightActive();
}

audioEl.addEventListener("ended", () => {
  const nextIndex = (currentIndex + 1) % localTracks.length;
  playTrack(nextIndex);
});

// ==== Discovery: load discography.json and render cards ====

async function loadDiscography() {
  const container = document.getElementById("ae-discography");
  container.innerHTML = "<p>Loading astroenergies catalog…</p>";

  try {
    const res = await fetch("data/discography.json", {
      cache: "no-cache",
    });
    if (!res.ok) throw new Error("Network error");
    const data = await res.json();

    // data should be an array of tracks
    container.innerHTML = "";
    data.forEach((track) => {
      const card = document.createElement("article");
      card.className = "ae-release";
      card.innerHTML = `
        <h3>${track.name}</h3>
        <div class="ae-release-meta">
          <span>${track.album}</span> ·
          <span>${track.releaseDate}</span> ·
          <span>${track.type}</span>
        </div>
        <div class="ae-release-meta">
          <span>Duration: ${track.duration}</span>
        </div>
        <a href="${track.url}" target="_blank" rel="noopener">
          Open on Apple Music
        </a>
      `;
      container.appendChild(card);
    });

    if (!data.length) {
      container.innerHTML = "<p>No tracks found in discography.json yet.</p>";
    }
  } catch (err) {
    console.error(err);
    container.innerHTML =
      "<p>Could not load discography. Check discography.json and your server config.</p>";
  }
}

// ==== Footer year ====

document.getElementById("ae-year").textContent =
  new Date().getFullYear().toString();

// Init on load
document.addEventListener("DOMContentLoaded", () => {
  if (localTracks.length) {
    renderPlaylist();
    playTrack(0);
  }
  loadDiscography();
});