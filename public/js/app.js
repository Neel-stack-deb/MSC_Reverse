/* ════════════════════════════════════════════════
   ReverseIT — App Logic v3
   Supabase Auth · Upload (auth-gated) · Dynamic Leaderboard
════════════════════════════════════════════════ */

"use strict";

// ── Supabase Client ───────────────────────────────────────
// SUPABASE_URL and SUPABASE_ANON_KEY come from public/js/config.js
const { createClient } = window.supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function apiUrl(path) {
  return `${(typeof API_BASE_URL !== "undefined" ? API_BASE_URL : "")}${path}`;
}

// ── State ─────────────────────────────────────────────────
let selectedFile   = null;
let currentSession = null;
let currentUser    = null;
let toastTimer     = null;
let currentAnalysis = null;

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
const analysisPanel     = document.getElementById("analysis-panel");
const analysisDocSummary = document.getElementById("analysis-doc-summary");
const analysisScore     = document.getElementById("analysis-score");
const analysisFeedback  = document.getElementById("analysis-feedback");
const analysisBreakdown = document.getElementById("analysis-breakdown");
const analysisStrengths = document.getElementById("analysis-strengths");
const analysisImprovements = document.getElementById("analysis-improvements");
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

  if (error) {
    if (isEmailNotConfirmedError(error.message)) {
      showToast("📧 Please verify your email first, then login.", "error");
      return;
    }
    showToast("❌ " + error.message, "error");
    return;
  }
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

  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { name } },
  });

  btn.textContent = "Create Account";
  btn.disabled    = false;

  if (error) { showToast("❌ " + error.message, "error"); return; }

  // If email confirmation is enabled in Supabase, signup succeeds but no session is created.
  if (!data?.session) {
    showToast("📧 Account created. Check your inbox to confirm email before login.");
    closeModal("signup-modal");
    setTimeout(() => openModal("login-modal"), 150);
    return;
  }

  showToast("🎉 Account created! Welcome, " + cap(name) + "!");
  closeModal("signup-modal");
}

async function handleLogout() {
  await sb.auth.signOut();
}

async function updateAuthUI() {
  const loggedIn = !!currentSession;

  if (loggedIn && currentUser) {
    const name = currentUser.user_metadata?.name || currentUser.email?.split("@")[0] || "User";
    authGroup.classList.add("hidden");
    userChip.classList.remove("hidden");
    userNameDisplay.textContent = cap(name.split(" ")[0]);
    userAvatar.textContent      = name[0].toUpperCase();
    if (loginNudge) loginNudge.classList.add("hidden");
    
    // Check if user already has an upload
    const hasUploaded = await checkUserHasUploaded();
    if (hasUploaded) {
      uploadBtn.disabled = true;
      uploadBtnText.textContent = "Already submitted (1 per student)";
      dropZone.style.pointerEvents = "none";
      dropZone.style.opacity = "0.5";
      fileInput.disabled = true;
      showToast("📝 You've already submitted one document. Students can upload 1 document per account.");
    } else {
      if (selectedFile) uploadBtn.disabled = false;
      uploadBtnText.textContent = "Analyze Document";
      dropZone.style.pointerEvents = "auto";
      dropZone.style.opacity = "1";
      fileInput.disabled = false;
    }
  } else {
    authGroup.classList.remove("hidden");
    userChip.classList.add("hidden");
    uploadBtn.disabled = true;
    if (loginNudge) loginNudge.classList.remove("hidden");
  }
  updateMobileAuth();
}

async function checkUserHasUploaded() {
  if (!currentUser) return false;
  try {
    const { data: profileData, error } = await sb
      .from("profiles")
      .select("upload_count")
      .eq("id", currentUser.id)
      .single();
    if (error) {
      return false;
    }
    return (profileData?.upload_count ?? 0) >= 1;
  } catch (err) {
    return false;
  }
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
    const res  = await fetch(apiUrl("/api/leaderboard"));
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Failed to fetch leaderboard");
    renderLeaderboard(data.leaderboard || []);
  } catch (err) {
    if (podium) podium.innerHTML = `<p class="lb-empty">Leaderboard unavailable right now.</p>`;
  }
}

function renderLeaderboard(entries) {
  const podium = document.getElementById("lb-podium");
  const listEl = document.getElementById("lb-list-rows");
  const sortedEntries = [...(Array.isArray(entries) ? entries : [])]
    .map((entry) => ({
      ...entry,
      score: Number(entry?.score) || 0,
    }))
    .sort((a, b) => b.score - a.score);

  // ── Podium (top 3: order displayed as 2nd · 1st · 3rd) ──
  if (podium) {
    if (sortedEntries.length === 0) {
      podium.innerHTML = `<p class="lb-empty">No entries yet — upload a document to be first! 🚀</p>`;
    } else {
      const podiumSize = Math.min(5, sortedEntries.length);
      const byRank = [
        { rank: 1, cls: "lb-gold",   medal: "🏆", h: "100%" },
        { rank: 2, cls: "lb-silver", medal: "🥈", h: "74%" },
        { rank: 3, cls: "lb-bronze", medal: "🥉", h: "58%" },
        { rank: 4, cls: "lb-rank-4", medal: "🎖️", h: "48%" },
        { rank: 5, cls: "lb-rank-5", medal: "🏅", h: "40%" },
      ].slice(0, podiumSize);

      const byPosition = {
        1: [1],
        2: [2, 1],
        3: [2, 1, 3],
        4: [4, 2, 1, 3],
        5: [4, 2, 1, 3, 5],
      };

      const rankMeta = new Map(byRank.map((item) => [item.rank, item]));
      const displayOrder = byPosition[podiumSize] || byPosition[5];

      podium.innerHTML = displayOrder.map((rank) => {
        const e = sortedEntries[rank - 1];
        const meta = rankMeta.get(rank);
        if (!e || !meta) return "";
        const initials = initials2(e.name);
        return `
          <div class="lb-podium-item ${meta.cls} neo-card">
            <div class="lb-avatar">${initials}</div>
            <div class="lb-medal">${meta.medal}</div>
            <p class="lb-uname">${esc(e.name)}</p>
            <div class="lb-bar-wrap"><div class="lb-bar" style="height:${meta.h}"></div></div>
            <div class="lb-rank-num">${rank}</div>
          </div>`;
      }).join("");
    }
  }

  // ── List (all entries with full ranking) ───────────────────────────────────────
  if (listEl) {
    if (sortedEntries.length === 0) {
      listEl.innerHTML = `<p class="lb-empty" style="padding:1.5rem 0">Be the first to claim the leaderboard!</p>`;
    } else {
      const maxScore = Math.max(...sortedEntries.map(e => e.score), 1);
      listEl.innerHTML = sortedEntries.map((e, i) => {
        const w = Math.round((e.score / maxScore) * 80) + 10;
        return `
          <div class="lb-row neo-card" style="--ri:${i}">
            <span class="lb-pos">${i + 1}</span>
            <div class="lb-row-user">
              <div class="lb-row-avatar">${initials2(e.name)}</div>
              <span>${esc(e.name)}</span>
            </div>
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
  const safeName = String(name || "User").trim();
  return safeName.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "??";
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

  // Re-check and refresh session at upload time.
  let { data: { session } } = await sb.auth.getSession();
  if (session?.expires_at && Date.now() >= (session.expires_at * 1000 - 30000)) {
    const { data: refreshed, error: refreshErr } = await sb.auth.refreshSession();
    if (!refreshErr) session = refreshed?.session || session;
  }

  if (!session?.access_token) {
    showToast("🔐 Please login to analyze documents.", "error");
    openModal("login-modal");
    return;
  }

  // Check if user already has uploaded a document
  const hasUploaded = await checkUserHasUploaded();
  if (hasUploaded) {
    showToast("📝 You've already submitted one document. Students can upload 1 per account.", "error");
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
    const res  = await fetch(apiUrl("/api/upload"), {
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
    if (!res.ok || !data.success) {
      if (res.status === 401) {
        await sb.auth.signOut();
        openModal("login-modal");
      }
      throw new Error(data.message || "Upload failed");
    }

    progressFill.style.width   = "100%";
    progressLabel.textContent  = "Done ✓";

    setTimeout(() => {
      renderQuestions(data.questions, data.file.originalName, data.note, data.analysis);
      fetchLeaderboard(); // Refresh leaderboard after every upload
      updateAuthUI(); // Disable upload UI after successful upload
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

function renderQuestions(questions, origName, note, analysis = {}) {
  currentAnalysis = {
    fileName: origName,
    summary: analysis.summary || note || "",
    questions,
  };

  questionsGrid.innerHTML = "";
  questions.forEach((q, i) => {
    const card   = document.createElement("div");
    card.className = "question-card";
    card.style.animationDelay = `${i * 0.07}s`;
    card.innerHTML = `
      <div class="q-num">${q.id}</div>
      <p class="q-text">${esc(q.question)}</p>
      <p class="q-focus">${esc(q.focus || "Explain the application problem, your technical approach, and the trade-offs.")}</p>
      <div class="q-answer-wrap">
        <textarea class="neo-textarea" data-question-id="${q.id}" placeholder="Write your answer here…" rows="5" aria-label="Your answer for question ${q.id}"></textarea>
        <p class="q-ans-note">Your answer is private until you submit for scoring.</p>
      </div>
    `;
    questionsGrid.appendChild(card);
  });

  if (questionsFileName) questionsFileName.textContent = `File: ${origName}`;

  if (analysisPanel) analysisPanel.classList.remove("hidden");
  if (analysisDocSummary) analysisDocSummary.textContent = currentAnalysis.summary || note || "";
  resetAnalysisPanel();

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
  currentAnalysis = null;
  resetAnalysisPanel();
  document.getElementById("upload-section").scrollIntoView({ behavior: "smooth" });
}

function resetAnalysisPanel() {
  if (analysisScore) analysisScore.textContent = "--";
  if (analysisFeedback) analysisFeedback.textContent = "Submit your answers to get a scored review.";
  if (analysisBreakdown) analysisBreakdown.innerHTML = "";
  if (analysisStrengths) analysisStrengths.innerHTML = "";
  if (analysisImprovements) analysisImprovements.innerHTML = "";
}

async function submitAnswers() {
  if (!currentAnalysis || !currentAnalysis.questions.length) {
    showToast("⚠️ Upload a document first.", "error");
    return;
  }

  let { data: { session } } = await sb.auth.getSession();
  if (session?.expires_at && Date.now() >= (session.expires_at * 1000 - 30000)) {
    const { data: refreshed, error: refreshErr } = await sb.auth.refreshSession();
    if (!refreshErr) session = refreshed?.session || session;
  }

  if (!session?.access_token) {
    showToast("🔐 Please login to submit your answers.", "error");
    openModal("login-modal");
    return;
  }

  const answers = currentAnalysis.questions.map((question, index) => {
    const textarea = questionsGrid.querySelectorAll("textarea")[index];
    return {
      id: question.id,
      question: question.question,
      focus: question.focus || "",
      answer: textarea ? textarea.value.trim() : "",
    };
  });

  const submitBtn = document.getElementById("submit-answers-btn");
  const originalLabel = submitBtn?.textContent || "Submit Answers for Scoring";
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Scoring…";
  }

  try {
    const res = await fetch(apiUrl("/api/grade"), {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fileName: currentAnalysis.fileName,
        summary: currentAnalysis.summary,
        questions: currentAnalysis.questions,
        answers,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      if (res.status === 401) {
        await sb.auth.signOut();
        openModal("login-modal");
      }
      throw new Error(data.message || "Scoring failed");
    }

    renderScoreResult(data);
    fetchLeaderboard();
    showToast(`✅ Scored ${data.score}/100`);
  } catch (err) {
    showToast("❌ " + err.message, "error");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  }
}

function renderScoreResult(result) {
  if (analysisScore) analysisScore.textContent = `${result.score}/100`;
  if (analysisFeedback) analysisFeedback.textContent = result.feedback || "The submission was scored successfully.";

  if (analysisBreakdown) {
    analysisBreakdown.innerHTML = (result.breakdown || []).map((item) => `
      <div class="analysis-breakdown-item">
        <div class="analysis-breakdown-top">
          <span>Question ${item.id}</span>
          <strong>${item.score}/${item.max}</strong>
        </div>
        <p>${esc(item.comment || "")}</p>
      </div>
    `).join("");
  }

  if (analysisStrengths) {
    analysisStrengths.innerHTML = (result.strengths || []).map((item) => `<li>${esc(item)}</li>`).join("") || "<li>Strong answers will appear here.</li>";
  }

  if (analysisImprovements) {
    analysisImprovements.innerHTML = (result.improvements || []).map((item) => `<li>${esc(item)}</li>`).join("") || "<li>More specific feedback will appear here.</li>";
  }

  analysisPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
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

function isEmailNotConfirmedError(message = "") {
  const text = String(message).toLowerCase();
  return text.includes("email not confirmed") || text.includes("email_not_confirmed");
}
