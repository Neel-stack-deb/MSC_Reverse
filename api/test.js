module.exports = async (req, res) => {
  return res.json({
    ok: true,
    message: "API routing works!",
    env: {
      hasSupabaseUrl:        !!process.env.SUPABASE_URL,
      hasServiceKey:         !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasAnonKey:            !!process.env.SUPABASE_ANON_KEY,
      hasCronSecret:         !!process.env.CRON_SECRET,
    },
  });
};
