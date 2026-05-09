// MeckGrade — Supabase Configuration
// Fill in after creating your Supabase project at https://supabase.com
// Dashboard → Project Settings → API

window.MECKGRADE_CONFIG = {
  // Paste your Supabase project URL here:
  supabaseUrl: "",   // e.g. "https://abcdefghijkl.supabase.co"

  // Paste your Supabase anon/public key here (safe to expose in frontend):
  supabaseAnonKey: "",  // e.g. "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
};

// Initialize Supabase client if configured
if (window.MECKGRADE_CONFIG.supabaseUrl && window.MECKGRADE_CONFIG.supabaseAnonKey) {
  try {
    window._supabase = window.supabase.createClient(
      window.MECKGRADE_CONFIG.supabaseUrl,
      window.MECKGRADE_CONFIG.supabaseAnonKey,
    );
    console.log("[MeckGrade] Supabase initialized");
  } catch (e) {
    console.warn("[MeckGrade] Supabase init failed:", e);
  }
}
