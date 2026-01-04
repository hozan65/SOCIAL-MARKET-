// /assets/sb.js
// ✅ Single Supabase client (NO MODULE)
// ✅ Prevents "Multiple GoTrueClient instances"
// ✅ Read-only friendly config (no session persistence)

(() => {
    // ---- config
    const SUPABASE_URL = "https://yzrhqduuqvllatliulqv.supabase.co";
    const SUPABASE_ANON_KEY = "sb_publishable_dN5E6cw7uaKj7Cmmpo7RJg_W4FWxjs_";

    // ---- guard: Supabase CDN must be loaded first
    if (!window.supabase?.createClient) {
        console.error(" Supabase CDN not loaded. Add this before sb.js:");
        console.error('   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>');
        return;
    }

    // ---- singleton guard
    if (window.sb) {
        // already created
        return;
    }

    // ---- create ONE client for the whole site
    window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            // read-only usage: avoid GoTrue session persistence/refresh
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
        global: {
            headers: {
                "X-Client-Info": "social-market-web",
            },
        },
    });

    // Optional helper to verify quickly in console:
    // window.sb ? "ok" : "missing"
    console.log("✅ window.sb ready");
})();
