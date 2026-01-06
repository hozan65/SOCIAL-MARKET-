// /assets/user-sync.js
// ✅ Client-side safe: DOES NOT write DB directly
// ✅ Calls Hetzner sm-api
// ✅ Uses Appwrite JWT (Bearer)

import { account } from "/assets/appwrite.js";

const API_BASE = "https://api.chriontoken.com";
const API_SYNC_USER = `${API_BASE}/api/users/sync`;

async function ensureJwt() {
    if (window.SM_JWT_READY) {
        try { await window.SM_JWT_READY; } catch {}
    }

    let jwt = (window.SM_JWT || localStorage.getItem("sm_jwt") || "").trim();
    if (jwt) return jwt;

    if (window.SM_REFRESH_JWT) {
        jwt = await window.SM_REFRESH_JWT();
        jwt = (jwt || "").trim();
        if (jwt) return jwt;
    }

    // last resort: create JWT via imported account
    const r = await account.createJWT();
    jwt = (r?.jwt || "").trim();
    if (!jwt) throw new Error("JWT create failed");
    localStorage.setItem("sm_jwt", jwt);
    window.SM_JWT = jwt;
    return jwt;
}

export async function syncUser() {
    try {
        const user = await account.get(); // throws if not logged

        if (j?.user_id) localStorage.setItem("sm_user_id", String(j.user_id));

        const jwt = await ensureJwt();

        const res = await fetch(API_SYNC_USER, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${jwt}`,
            },
            body: JSON.stringify({}),
        });

        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error || `user sync failed (${res.status})`);

        return j; // { ok:true, user_id:"...", created:true/false }
    } catch (err) {
        console.warn("User sync skipped:", err?.message || err);
        return null;
    }
}
