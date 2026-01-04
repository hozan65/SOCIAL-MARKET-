

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://yzrhqduuqvllatliulqv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_dN5E6cw7uaKj7Cmmpo7RJg_W4FWxjs_";

// ⚠️ Supabase burada SADECE READ için var
export const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
    }
);

// ✅ Appwrite UID her yerde buradan okunur
export function getAppwriteUID() {
    return localStorage.getItem("sm_uid") || null;
}

// ✅ JWT (Netlify Functions)
export function getJWT() {
    return localStorage.getItem("sm_jwt") || null;
}
