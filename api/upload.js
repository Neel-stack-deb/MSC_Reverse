/* ════════════════════════════════════════════════
   api/upload.js  —  Vercel Serverless Function
   Supabase client initialized INSIDE handler to
   prevent module-load crashes if env vars are missing.
════════════════════════════════════════════════ */

const { createClient } = require("@supabase/supabase-js");
const formidable = require("formidable");
const fs = require("fs");
const os = require("os"); // Required for Vercel /tmp directory

module.exports.config = { api: { bodyParser: false } };

module.exports = async (req, res) => {
  // Wrap everything in a try/catch so Vercel returns JSON instead of crashing
  try {
    // ── CORS ──────────────────────────────────────────────
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") {
      return res.status(405).json({ success: false, message: "Method not allowed" });
    }

    // ── Validate env vars ─────────────────────────────────
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Missing Supabase env vars in Vercel settings.");
      return res.status(500).json({ success: false, message: "Server misconfiguration: missing env vars." });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // ── Auth check ────────────────────────────────────────
    const token = (req.headers.authorization || "").split(" ")[1];
    if (!token) {
      return res.status(401).json({ success: false, message: "Not authenticated. Please login first." });
    }

    // Safely destructure to prevent crashes if data is null
    const { data, error: authErr } = await supabase.auth.getUser(token);
    const user = data?.user;

    if (authErr || !user) {
      return res.status(401).json({ success: false, message: "Session expired. Please login again." });
    }

    // ── Parse multipart form ──────────────────────────────
    // CRITICAL: Must use os.tmpdir() in Vercel
    const form = formidable({
      maxFileSize: 50 * 1024 * 1024,
      uploadDir: os.tmpdir(),
      keepExtensions: true
    });

    let fields, files;
    try {
      [fields, files] = await form.parse(req);
    } catch (e) {
      return res.status(400).json({ success: false, message: `Form parse error: ${e.message}` });
    }

    const fileArr = files.document;
    const file = Array.isArray(fileArr) ? fileArr[0] : fileArr;
    if (!file) {
      return res.status(400).json({ success: false, message: "No file received." });
    }

    // ── Validate PDF ──────────────────────────────────────
    const ext = (file.originalFilename || file.newFilename || "").split(".").pop().toLowerCase();
    if (ext !== "pdf") {
      return res.status(400).json({ success: false, message: "Only PDF files are allowed." });
    }

    // ── Upload to Supabase Storage ────────────────────────
    const storagePath = `${user.id}/${Date.now()}-${file.originalFilename || file.newFilename}`;
    const fileBuffer = fs.readFileSync(file.filepath);

    // Clean up temp file
    try { fs.unlinkSync(file.filepath); } catch (_) { }

    const { error: uploadErr } = await supabase.storage
      .from("documents")
      .upload(storagePath, fileBuffer, { contentType: "application/pdf", upsert: false });

    if (uploadErr) {
      return res.status(500).json({ success: false, message: `Storage error: ${uploadErr.message}` });
    }

    // ── Log upload + update score ─────────────────────────
    await supabase.from("uploads").insert({
      user_id: user.id,
      file_path: storagePath,
      original_name: file.originalFilename || "document.pdf",
      size: file.size,
    });
    await supabase.rpc("increment_upload_count", { uid: user.id });

    // ── Mock questions (LLM pending) ──────────────────────
    const mockQuestions = [
      { id: 1, question: "What is the primary objective discussed in this document?" },
      { id: 2, question: "Summarize the key concepts introduced in the first section." },
      { id: 3, question: "What methodologies or approaches are highlighted?" },
      { id: 4, question: "Identify any conclusions or outcomes mentioned in the document." }
    ];

    return res.status(200).json({
      success: true,
      file: { originalName: file.originalFilename || "document.pdf", size: file.size },
      questions: mockQuestions,
      note: "LLM integration pending — placeholder questions shown.",
    });

  } catch (globalError) {
    console.error("Function crashed:", globalError);
    return res.status(500).json({ success: false, message: globalError.message || "Internal server crash" });
  }
};