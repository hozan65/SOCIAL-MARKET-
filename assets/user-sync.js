// /assets/user-sync.js
// ✅ Client-side safe: DOES NOT write to Supabase directly
// ✅ Calls Netlify Function (server) using Appwrite JWT

import { account } from "/assets/appwrite.js";

const FN_SYNC_USER = "/.netlify/functions/sync_user";

function getJWT() {
    const jwt = window.SM_JWT || localStorage.getItem("sm_jwt");
    if (!jwt) throw new Error("Login required (missing sm_jwt)");
    return jwt;
}

export async function syncUserToSupabase() {
    try {
        // ensure session exists (throws if not logged)
        const user = await account.get();

        // optional: keep local uid for UI
        localStorage.setItem("sm_uid", user.$id);

        const jwt = getJWT();

        const r = await fetch(FN_SYNC_USER, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${jwt}`,
            },
            body: JSON.stringify({}), // body not required
        });

        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || `sync_user failed (${r.status})`);

        // ✅ j = { ok:true, user_id:"...", created:true/false }
        return j;
    } catch (err) {
        console.warn("User sync skipped:", err?.message || err);
        return null;
    }
}
