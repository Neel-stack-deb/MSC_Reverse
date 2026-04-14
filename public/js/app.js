/* ════════════════════════════════════════════════
   MSC Club — App Logic v2
   Upload · Modals · Nav · Toast
════════════════════════════════════════════════ */

"use strict";

// ── State ─────────────────────────────────────────────
let selectedFile   = null;
let isLoggedIn     = false;
let currentUser    = null;
let toastTimer     = null;

// ── DOM refs ───────────────────────────────────────────
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
const questionsNote     = document.getElementById("questions-note-text");
const questionsFileName = document.getElementById("questions-file-name");
const authGroup         = document.getElementById("auth-group");
const userChip          = document.getElementById("user-chip");
const userNameDisplay   = document.getElementById("user-name-display");
const userAvatar        = document.getElementById("user-avatar");
const toast             = document.getElementById("toast");
const toastMsg          = document.getElementById("toast-msg");
const navbar            = document.getElementById("navbar");
const navResultsLink    = document.getElementById("nav-lnk-results");

// ══════════════════════════════════════════════════════
//  SCROLLED NAV
// ══════════════════════════════════════════════════════
window.addEventListener("scroll", () => {
  navbar.classList.toggle("scrolled", window.scrollY > 20);
}, { passive: true });

// ══════════════════════════════════════════════════════
//  ACTIVE NAV HIGHLIGHT
// ══════════════════════════════════════════════════════
const navSections = [
  { id: "hero",            linkId: "nav-lnk-home"   },
  { id: "how-section",     linkId: "nav-lnk-how"    },
  { id: "upload-section",  linkId: "nav-lnk-upload" },
  { id: "questions-section", linkId: "nav-lnk-results" },
];

function updateActiveNav() {
  let current = navSections[0].linkId;
  for (const s of navSections) {
    const el = document.getElementById(s.id);
    if (!el) continue;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.55) {
      current = s.linkId;
    }
  }
  document.querySelectorAll(".nav-link").forEach(l => l.classList.remove("active"));
  const active = document.getElementById(current);
  if (active) active.classList.add("active");
}
window.addEventListener("scroll", updateActiveNav, { passive: true });

// ══════════════════════════════════════════════════════
//  HAMBURGER MOBILE MENU
// ══════════════════════════════════════════════════════
const hamburger   = document.getElementById("hamburger");
const mobileDrawer = document.getElementById("mobile-drawer");

hamburger.addEventListener("click", () => {
  mobileDrawer.classList.toggle("hidden");
});

function closeMobile() {
  mobileDrawer.classList.add("hidden");
}

// ══════════════════════════════════════════════════════
//  FILE HANDLING
// ══════════════════════════════════════════════════════
fileInput.addEventListener("change", (e) => {
  if (e.target.files.length > 0) setFile(e.target.files[0]);
});

dropZone.addEventListener("click", (e) => {
  if (!e.target.closest("button")) fileInput.click();
});

dropZone.addEventListener("dragover",  (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
dropZone.addEventListener("dragleave", ()  => dropZone.classList.remove("drag-over"));
dropZone.addEventListener("drop",      (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  if (e.dataTransfer.files.length > 0) setFile(e.dataTransfer.files[0]);
});

function setFile(file) {
  const ext = "." + file.name.split(".").pop().toLowerCase();
  if (![".pdf"].includes(ext)) {
    showToast("⚠️ Only PDF files are allowed!", "error");
    return;
  }
  selectedFile = file;
  fpName.textContent = file.name;
  fpSize.textContent = formatBytes(file.size);

  // Icon colour
  const icon = document.getElementById("fp-icon");
  icon.style.color = ext === ".pdf" ? "#ff7c5c" : "#f5a623";

  dropZone.style.display = "none";
  filePreview.classList.remove("hidden");
  uploadBtn.disabled = false;
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

// ══════════════════════════════════════════════════════
//  UPLOAD
// ══════════════════════════════════════════════════════
async function handleUpload() {
  if (!selectedFile) return;

  uploadBtn.disabled   = true;
  uploadBtnText.textContent = "Analyzing…";
  uploadSpinner.classList.remove("hidden");
  progressWrap.classList.remove("hidden");
  animateProgress();

  const form = new FormData();
  form.append("document", selectedFile);

  try {
    const res  = await fetch("/api/upload", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || "Upload failed");

    progressFill.style.width = "100%";
    progressLabel.textContent = "Done ✓";

    setTimeout(() => renderQuestions(data.questions, data.file.originalName, data.note), 600);

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
    progressFill.style.width = v + "%";
    progressLabel.textContent = "Processing… " + Math.round(v) + "%";
  }, 220);
}

function renderQuestions(questions, origName, note) {
  questionsGrid.innerHTML = "";
  questions.forEach((q, i) => {
    const card = document.createElement("div");
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
  if (note && questionsNote) questionsNote.textContent = note;

  // Show results link in nav
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
  uploadBtn.disabled = !selectedFile;
}

// ══════════════════════════════════════════════════════
//  ANSWER TOGGLE
// ══════════════════════════════════════════════════════
function toggleAnswer(areaId, btn) {
  const area = document.getElementById(areaId);
  const isHidden = area.classList.contains("hidden");
  area.classList.toggle("hidden", !isHidden);
  btn.setAttribute("aria-expanded", isHidden ? "true" : "false");
  btn.classList.toggle("q-ans-toggle--open", isHidden);
  if (isHidden) {
    area.querySelector("textarea").focus();
  }
}

function resetAll() {
  clearFile();
  questionsSection.classList.add("hidden");
  navResultsLink.classList.add("hidden");
  questionsGrid.innerHTML = "";
  document.getElementById("upload-section").scrollIntoView({ behavior: "smooth" });
}

// ══════════════════════════════════════════════════════
//  AUTH (UI only)
// ══════════════════════════════════════════════════════
function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById("login-email").value;
  const name  = email.split("@")[0];
  currentUser = { name, email };
  isLoggedIn  = true;
  closeModal("login-modal");
  updateAuthUI();
  showToast(`👋 Welcome back, ${cap(name)}!`);
}

function handleSignup(e) {
  e.preventDefault();
  const name  = document.getElementById("signup-name").value;
  const email = document.getElementById("signup-email").value;
  currentUser = { name, email };
  isLoggedIn  = true;
  closeModal("signup-modal");
  updateAuthUI();
  showToast(`🎉 Account created! Welcome, ${cap(name)}!`);
}

function handleLogout() {
  isLoggedIn  = false;
  currentUser = null;
  updateAuthUI();
  showToast("👋 Logged out.");
}

function updateAuthUI() {
  if (isLoggedIn && currentUser) {
    authGroup.classList.add("hidden");
    userChip.classList.remove("hidden");
    userNameDisplay.textContent = cap(currentUser.name.split(" ")[0]);
    userAvatar.textContent = currentUser.name[0].toUpperCase();
  } else {
    authGroup.classList.remove("hidden");
    userChip.classList.add("hidden");
  }
  // Also update mobile drawer auth
  updateMobileAuth();
}

function updateMobileAuth() {
  const mob = document.querySelector(".mob-auth");
  if (!mob) return;
  if (isLoggedIn && currentUser) {
    mob.innerHTML = `
      <span style="font-size:.88rem;color:var(--text-2);font-weight:600;">Hi, ${cap(currentUser.name.split(" ")[0])} 👋</span>
      <button class="btn btn-ghost btn-sm" onclick="handleLogout();closeMobile()">Logout</button>
    `;
  } else {
    mob.innerHTML = `
      <button class="btn btn-ghost" onclick="closeMobile(); openModal('login-modal')">Login</button>
      <button class="btn btn-accent" onclick="closeMobile(); openModal('signup-modal')">Sign Up</button>
    `;
  }
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ══════════════════════════════════════════════════════
//  MODALS
// ══════════════════════════════════════════════════════
function openModal(id) {
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

// ══════════════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════════════
function showToast(msg, type = "info") {
  if (toastTimer) clearTimeout(toastTimer);
  toastMsg.textContent = msg;
  toast.style.borderColor = type === "error" ? "rgba(255,100,80,0.4)" : "rgba(255,255,255,0.13)";
  toast.classList.remove("hidden");
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 3200);
}
