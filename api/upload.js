const { createClient } = require("@supabase/supabase-js");
const formidable = require("formidable");
const fs = require("fs");

module.exports.config = { api: { bodyParser: false } };

module.exports = async (req, res) => {
  try {
    // ── CORS ──────────────────────────────────────────────
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") {
      return res.status(405).json({ success: false, message: "Method not allowed" });
    }

    // ── Validate env vars before touching Supabase ────────
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Missing Supabase env vars");
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

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return res.status(401).json({ success: false, message: "Session expired. Please login again." });
    }

    // ── Parse multipart form ──────────────────────────────
    const form = formidable({ maxFileSize: 50 * 1024 * 1024 });
    const [, files] = await form.parse(req);

    const fileArr = files.document;
    const file = Array.isArray(fileArr) ? fileArr[0] : fileArr;
    if (!file) {
      return res.status(400).json({ success: false, message: "No file received." });
    }

    // ── Validate PDF ──────────────────────────────────────
    const originalName = file.originalFilename || "document.pdf";
    const ext = originalName.split(".").pop().toLowerCase();
    if (ext !== "pdf") {
      return res.status(400).json({ success: false, message: "Only PDF files are allowed." });
    }

    // ── Upload to Supabase Storage ────────────────────────
    const storagePath = `${user.id}/${Date.now()}-${originalName}`;
    const fileBuffer = fs.readFileSync(file.filepath);
    try { fs.unlinkSync(file.filepath); } catch (_) { }

    const { error: uploadErr } = await supabase.storage
      .from("documents")
      .upload(storagePath, fileBuffer, { contentType: "application/pdf", upsert: false });

    if (uploadErr) {
      console.error("Supabase storage upload failed:", uploadErr);
      return res.status(500).json({ success: false, message: uploadErr.message });
    }

    // ── Log upload + update score ─────────────────────────
    const { error: insertErr } = await supabase.from("uploads").insert({
      user_id: user.id,
      file_path: storagePath,
      original_name: originalName,
      size: file.size,
    });

    const { error: rpcErr } = await supabase.rpc("increment_upload_count", { uid: user.id });

    if (insertErr || rpcErr) {
      console.warn("Upload metadata update failed:", {
        insertErr: insertErr?.message,
        rpcErr: rpcErr?.message,
      });
    }

    // ── Mock questions (LLM pending) ──────────────────────
    const mockQuestions = [
      { id: 1, question: "What is the primary objective discussed in this document?" },
      { id: 2, question: "Summarize the key concepts introduced in the first section." },
      { id: 3, question: "What methodologies or approaches are highlighted?" },
      { id: 4, question: "Identify any conclusions or outcomes mentioned in the document." },
      { id: 5, question: "What are the potential real-world applications of the topics covered?" },
      { id: 6, question: "Are there any limitations or challenges discussed in the document?" },
    ];

    return res.json({
      success: true,
      file: { originalName, size: file.size },
      questions: mockQuestions,
      note: "LLM integration pending — placeholder questions shown.",
      warnings: insertErr || rpcErr
        ? [
            ...(insertErr ? [insertErr.message] : []),
            ...(rpcErr ? [rpcErr.message] : []),
          ]
        : [],
    });
  } catch (error) {
    console.error("Upload handler failed:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};