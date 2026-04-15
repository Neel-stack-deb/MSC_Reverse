/* ════════════════════════════════════════════════
   api/cleanup.js  —  Vercel Cron (runs daily 02:00 UTC)
════════════════════════════════════════════════ */

const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  const auth = (req.headers.authorization || "").split(" ")[1];
  if (auth !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Server misconfiguration: missing env vars." });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: old, error: fetchErr } = await supabase
    .from("uploads")
    .select("id, file_path")
    .lt("uploaded_at", oneDayAgo);

  if (fetchErr) return res.status(500).json({ error: fetchErr.message });
  if (!old || old.length === 0) return res.json({ deleted: 0, message: "Nothing to clean up." });

  const paths = old.map((u) => u.file_path);
  await supabase.storage.from("documents").remove(paths);

  const ids = old.map((u) => u.id);
  await supabase.from("uploads").delete().in("id", ids);

  return res.json({ deleted: old.length, message: `Cleaned up ${old.length} file(s).` });
};
