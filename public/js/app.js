/* ════════════════════════════════════════════════
   ReverseIT — App Logic v3
   Supabase Auth · Upload (auth-gated) · Dynamic Leaderboard
════════════════════════════════════════════════ */

"use strict";

// ── Supabase Client ───────────────────────────────────────
// SUPABASE_URL and SUPABASE_ANON_KEY come from public/js/config.js
const { createClient } = window.supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── State ─────────────────────────────────────────────────
let selectedFile   = null;
let currentSession = null;
let currentUser    = null;
let toastTimer     = null;

// ── DOM refs ──────────────────────────────────────────────
const dropZone          = document.getElementById("drop-zone");
const fileInput         = document.getElementById("file-input");
const filePreview       = document.getElementById("file-preview");
const fpName            = document.getElementById("file-name");
const fpSize            = document.getElementById("file-size");
const uploadBtn         = document.getElementById("upload-btn");
const uploadBtnText     = document.getElementById("upload-btn-text");
const uploadSpinner     = document.getElementById("upload-spinner");
const progressWrap      = document.getElementById("progress-wrap");
const progressFill      = document.getElementById("progress-fill");
const progressLabel     = document.getElementById("progress-label");
const questionsSection  = document.getElementById("questions-section");
const questionsGrid     = document.getElementById("questions-grid");
const questionsFileName = document.getElementById("questions-file-name");
const authGroup         = document.getElementById("auth-group");
const userChip          = document.getElementById("user-chip");
const userNameDisplay   = document.getElementById("user-name-display");
const userAvatar        = document.getElementById("user-avatar");
const toast             = document.getElementById("toast");
const toastMsg          = document.getElementById("toast-msg");
const navbar            = document.getElementById("navbar");
const navResultsLink    = document.getElementById("nav-lnk-results");
const loginNudge        = document.getElementById("upload-login-nudge");

// ══════════════════════════════════════════════════════════
//  AUTH STATE — live listener
// ══════════════════════════════════════════════════════════
sb.auth.onAuthStateChange((event, session) => {
  currentSession = session;
  currentUser    = session?.user ?? null;
  updateAuthUI();

  if (event === "SIGNED_IN") {
    const name = currentUser?.user_metadata?.name || currentUser?.email?.split("@")[0] || "User";
    showToast(`👋 Welcome, ${cap(name)}!`);
  }
  if (event === "SIGNED_OUT") {
    showToast("👋 Logged out.");
  }
});

// ══════════════════════════════════════════════════════════
//  AUTH — Real Supabase calls
// ══════════════════════════════════════════════════════════
async function handleLogin(e) {
  e.preventDefault();
  const email    = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const btn      = e.target.querySelector("[type=submit]");

  btn.textContent = "Signing in…";
  btn.disabled    = true;

  const { error } = await sb.auth.signInWithPassword({ email, password });

  btn.textContent = "Login";
  btn.disabled    = false;

  if (error) { showToast("❌ " + error.message, "error"); return; }
  closeModal("login-modal");
}

async function handleSignup(e) {
  e.preventDefault();
  const name     = document.getElementById("signup-name").value.trim();
  const email    = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  const btn      = e.target.querySelector("[type=submit]");

  btn.textContent = "Creating…";
  btn.disabled    = true;

  const { error } = await sb.auth.signUp({
    email, password,
    options: { data: { name } },
  });

  btn.textContent = "Create Account";
  btn.disabled    = false;

  if (error) { showToast("❌ " + error.message, "error"); return; }
  showToast("🎉 Account created! Welcome, " + cap(name) + "!");
  closeModal("signup-modal");
}

async function handleLogout() {
  await sb.auth.signOut();
}

function updateAuthUI() {
  const loggedIn = !!currentSession;

  if (loggedIn && currentUser) {
    const name = currentUser.user_metadata?.name || currentUser.email?.split("@")[0] || "User";
    authGroup.classList.add("hidden");
    userChip.classList.remove("hidden");
    userNameDisplay.textContent = cap(name.split(" ")[0]);
    userAvatar.textContent      = name[0].toUpperCase();
    if (loginNudge) loginNudge.classList.add("hidden");
    if (selectedFile) uploadBtn.disabled = false;
  } else {
    authGroup.classList.remove("hidden");
    userChip.classList.add("hidden");
    uploadBtn.disabled = true;
    if (loginNudge) loginNudge.classList.remove("hidden");
  }
  updateMobileAuth();
}

function updateMobileAuth() {
  const mob = document.querySelector(".mob-auth");
  if (!mob) return;
  if (currentSession && currentUser) {
    const name = currentUser.user_metadata?.name || currentUser.email?.split("@")[0] || "User";
    mob.innerHTML = `
      <span style="font-size:.88rem;color:var(--ink-soft);font-weight:600;">Hi, ${cap(name.split(" ")[0])} 👋</span>
      <button class="btn btn-ghost btn-sm" onclick="handleLogout();closeMobile()">Logout</button>
    `;
  } else {
    mob.innerHTML = `
      <button class="btn btn-ghost" onclick="closeMobile();openModal('login-modal')">Login</button>
      <button class="btn btn-accent" onclick="closeMobile();openModal('signup-modal')">Sign Up</button>
    `;
  }
}

// ══════════════════════════════════════════════════════════
//  LEADERBOARD — live fetch
// ══════════════════════════════════════════════════════════
async function fetchLeaderboard() {
  const podium = document.getElementById("lb-podium");
  const listEl = document.getElementById("lb-list-rows");

  if (podium) podium.innerHTML = `<div class="lb-loading">Loading…</div>`;
  if (listEl) listEl.innerHTML = "";

  try {
    const res  = await fetch("/api/leaderboard");
    const data = await res.json();
    renderLeaderboard(data.leaderboard || []);
  } catch (_) {
    if (podium) podium.innerHTML = `<p class="lb-empty">Leaderboard unavailable right now.</p>`;
  }
}

function renderLeaderboard(entries) {
  const podium = document.getElementById("lb-podium");
  const listEl = document.getElementById("lb-list-rows");

  // ── Podium (top 3: order displayed as 2nd · 1st · 3rd) ──
  if (podium) {
    if (entries.length === 0) {
      podium.innerHTML = `<p class="lb-empty">No entries yet — upload a document to be first! 🚀</p>`;
    } else {
      const positions = [
        { idx: 1, cls: "lb-silver", medal: "🥈", rank: 2, h: "70%" },
        { idx: 0, cls: "lb-gold",   medal: "🏆", rank: 1, h: "100%" },
        { idx: 2, cls: "lb-bronze", medal: "🥉", rank: 3, h: "50%" },
      ];
      podium.innerHTML = positions.map(({ idx, cls, medal, rank, h }) => {
        const e = entries[idx];
        if (!e) return "";
        const initials = initials2(e.name);
        return `
          <div class="lb-podium-item ${cls} neo-card">
            <div class="lb-avatar">${initials}</div>
            <div class="lb-medal">${medal}</div>
            <p class="lb-uname">${esc(e.name)}</p>
            <p class="lb-count">${e.upload_count} doc${e.upload_count !== 1 ? "s" : ""}</p>
            <div class="lb-bar-wrap"><div class="lb-bar" style="height:${h}"></div></div>
            <div class="lb-rank-num">${rank}</div>
          </div>`;
      }).join("");
    }
  }

  // ── List (rank 4+) ───────────────────────────────────────
  if (listEl) {
    const rest = entries.slice(3);
    if (rest.length === 0) {
      listEl.innerHTML = `<p class="lb-empty" style="padding:1.5rem 0">Be the first to claim rank 4+!</p>`;
    } else {
      const maxScore = Math.max(...rest.map(e => e.score), 1);
      listEl.innerHTML = rest.map((e, i) => {
        const w = Math.round((e.score / maxScore) * 80) + 10;
        return `
          <div class="lb-row neo-card" style="--ri:${i}">
            <span class="lb-pos">${i + 4}</span>
            <div class="lb-row-user">
              <div class="lb-row-avatar">${initials2(e.name)}</div>
              <span>${esc(e.name)}</span>
            </div>
            <span class="lb-docs-count">${e.upload_count}</span>
            <div class="lb-score-wrap">
              <div class="lb-score-bar" style="--w:${w}%"></div>
              <span>${e.score} pts</span>
            </div>
          </div>`;
      }).join("");
    }
  }
}

function initials2(name = "") {
  return name.trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "??";
}

function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// Fetch on page load
fetchLeaderboard();

// ══════════════════════════════════════════════════════════
//  SCROLLED NAV
// ══════════════════════════════════════════════════════════
window.addEventListener("scroll", () => {
  navbar.classList.toggle("scrolled", window.scrollY > 20);
}, { passive: true });

// ══════════════════════════════════════════════════════════
//  ACTIVE NAV HIGHLIGHT
// ══════════════════════════════════════════════════════════
const navSections = [
  { id: "hero",               linkId: "nav-lnk-home"        },
  { id: "how-section",        linkId: "nav-lnk-how"         },
  { id: "upload-section",     linkId: "nav-lnk-upload"      },
  { id: "questions-section",  linkId: "nav-lnk-results"     },
  { id: "leaderboard-section",linkId: "nav-lnk-leaderboard" },
];

function updateActiveNav() {
  let current = navSections[0].linkId;
  for (const s of navSections) {
    const el = document.getElementById(s.id);
    if (!el) continue;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.55) current = s.linkId;
  }
  document.querySelectorAll(".nav-link").forEach(l => l.classList.remove("active"));
  const active = document.getElementById(current);
  if (active) active.classList.add("active");
}
window.addEventListener("scroll", updateActiveNav, { passive: true });

// ══════════════════════════════════════════════════════════
//  HAMBURGER
// ══════════════════════════════════════════════════════════
const hamburger   = document.getElementById("hamburger");
const mobileDrawer = document.getElementById("mobile-drawer");

hamburger.addEventListener("click", () => {
  mobileDrawer.classList.toggle("hidden");
});

function closeMobile() { mobileDrawer.classList.add("hidden"); }

// ══════════════════════════════════════════════════════════
//  FILE HANDLING
// ══════════════════════════════════════════════════════════
fileInput.addEventListener("change", (e) => {
  if (e.target.files.length > 0) setFile(e.target.files[0]);
});

dropZone.addEventListener("click", (e) => {
  if (!e.target.closest("button")) fileInput.click();
});

dropZone.addEventListener("dragover",  (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
dropZone.addEventListener("dragleave", ()  => dropZone.classList.remove("drag-over"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  if (e.dataTransfer.files.length > 0) setFile(e.dataTransfer.files[0]);
});

function setFile(file) {
  const ext = "." + file.name.split(".").pop().toLowerCase();
  if (ext !== ".pdf") {
    showToast("⚠️ Only PDF files are allowed!", "error");
    return;
  }
  selectedFile = file;
  fpName.textContent = file.name;
  fpSize.textContent = formatBytes(file.size);
  document.getElementById("fp-icon").style.color = "#ff7c5c";
  dropZone.style.display = "none";
  filePreview.classList.remove("hidden");
  // Only enable upload if logged in
  if (currentSession) uploadBtn.disabled = false;
  showToast(`📄 "${file.name}" selected`);
}

function clearFile() {
  selectedFile = null;
  fileInput.value = "";
  filePreview.classList.add("hidden");
  dropZone.style.display = "";
  uploadBtn.disabled = true;
}

function formatBytes(b) {
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
  return (b / 1048576).toFixed(2) + " MB";
}

// ══════════════════════════════════════════════════════════
//  UPLOAD — auth-gated
// ══════════════════════════════════════════════════════════
async function handleUpload() {
  if (!selectedFile) return;

  // Re-check session at upload time
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    showToast("🔐 Please login to analyze documents.", "error");
    openModal("login-modal");
    return;
  }

  uploadBtn.disabled = true;
  uploadBtnText.textContent = "Analyzing…";
  uploadSpinner.classList.remove("hidden");
  progressWrap.classList.remove("hidden");
  animateProgress();

  const form = new FormData();
  form.append("document", selectedFile);

  try {
    const res  = await fetch("/api/upload", {
      method: "POST",
      headers: { "Authorization": `Bearer ${session.access_token}` },
      body: form,
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      throw new Error(`Server error (${res.status}): ${text.slice(0, 120)}`);
    }
    if (!res.ok || !data.success) throw new Error(data.message || "Upload failed");

    progressFill.style.width   = "100%";
    progressLabel.textContent  = "Done ✓";

    setTimeout(() => {
      renderQuestions(data.questions, data.file.originalName, data.note);
      fetchLeaderboard(); // Refresh leaderboard after every upload
    }, 600);
  } catch (err) {
    showToast("❌ " + err.message, "error");
    resetUploadState();
  }
}

function animateProgress() {
  let v = 0;
  const iv = setInterval(() => {
    v += Math.random() * 11;
    if (v >= 90) { v = 90; clearInterval(iv); }
    progressFill.style.width   = v + "%";
    progressLabel.textContent  = "Processing… " + Math.round(v) + "%";
  }, 220);
}

function renderQuestions(questions, origName, note) {
  questionsGrid.innerHTML = "";
  questions.forEach((q, i) => {
    const card   = document.createElement("div");
    card.className = "question-card";
    card.style.animationDelay = `${i * 0.07}s`;
    const areaId = `ans-${q.id}`;
    card.innerHTML = `
      <div class="q-num">${q.id}</div>
      <p class="q-text">${q.question}</p>
      <div class="q-answer-wrap">
        <button class="q-ans-toggle" onclick="toggleAnswer('${areaId}', this)" aria-expanded="false">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Write Answer
        </button>
        <div class="q-answer-area hidden" id="${areaId}">
          <textarea class="neo-textarea" placeholder="Write your answer here…" rows="4" aria-label="Your answer for question ${q.id}"></textarea>
          <p class="q-ans-note">Your answer is private and not saved.</p>
        </div>
      </div>
    `;
    questionsGrid.appendChild(card);
  });

  if (questionsFileName) questionsFileName.textContent = `File: ${origName}`;

  navResultsLink.classList.remove("hidden");
  questionsSection.classList.remove("hidden");
  questionsSection.scrollIntoView({ behavior: "smooth", block: "start" });

  resetUploadState();
  showToast("✅ Analysis complete! Questions generated.");
}

function resetUploadState() {
  uploadBtnText.textContent = "Analyze Document";
  uploadSpinner.classList.add("hidden");
  progressWrap.classList.add("hidden");
  progressFill.style.width = "0%";
  uploadBtn.disabled = !selectedFile || !currentSession;
}

function resetAll() {
  clearFile();
  questionsSection.classList.add("hidden");
  navResultsLink.classList.add("hidden");
  questionsGrid.innerHTML = "";
  document.getElementById("upload-section").scrollIntoView({ behavior: "smooth" });
}

// ══════════════════════════════════════════════════════════
//  ANSWER TOGGLE
// ══════════════════════════════════════════════════════════
function toggleAnswer(areaId, btn) {
  const area     = document.getElementById(areaId);
  const isHidden = area.classList.contains("hidden");
  area.classList.toggle("hidden", !isHidden);
  btn.setAttribute("aria-expanded", isHidden ? "true" : "false");
  btn.classList.toggle("q-ans-toggle--open", isHidden);
  if (isHidden) area.querySelector("textarea").focus();
}

// ══════════════════════════════════════════════════════════
//  MODALS
// ══════════════════════════════════════════════════════════
function openModal(id)  {
  document.getElementById(id).classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
  document.body.style.overflow = "";
}
function switchModal(closeId, openId) {
  closeModal(closeId);
  setTimeout(() => openModal(openId), 150);
}

document.querySelectorAll(".modal-overlay").forEach(o => {
  o.addEventListener("click", (e) => {
    if (e.target === o) { o.classList.add("hidden"); document.body.style.overflow = ""; }
  });
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal-overlay:not(.hidden)").forEach(m => {
      m.classList.add("hidden"); document.body.style.overflow = "";
    });
  }
});

// ══════════════════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════════════════
function showToast(msg, type = "info") {
  if (toastTimer) clearTimeout(toastTimer);
  toastMsg.textContent  = msg;
  toast.style.borderColor = type === "error" ? "rgba(255,100,80,.4)" : "rgba(255,255,255,.13)";
  toast.classList.remove("hidden");
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 3200);
}

// ── Helpers ───────────────────────────────────────────────
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
