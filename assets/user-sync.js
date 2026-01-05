// /assets/user-sync.js
// ✅ Client-side safe: DOES NOT write DB directly
// ✅ Calls sm-api (NOT Netlify Functions)
// ✅ Uses Appwrite JWT (Bearer)

import { account } from "/assets/appwrite.js";

// ✅ sm-api endpoint (adjust if your route differs)
const API_SYNC_USER = "/api/users/sync";

async function ensureJwt() {
    // if appwrite-init.js provided SM_JWT_READY / SM_REFRESH_JWT use them
    if (window.SM_JWT_READY) {
        try { await window.SM_JWT_READY; } catch {}
    }

    let jwt = (window.SM_JWT || localStorage.getItem("sm_jwt") || "").trim();
    if (jwt) return jwt;

    if (window.SM_REFRESH_JWT) {
        jwt = await window.SM_REFRESH_JWT();
        return jwt;
    }

    // fallback: createJWT via SDK directly (if init available)
    if (window.account?.createJWT) {
        const r = await window.account.createJWT();
        jwt = (r?.jwt || "").trim();
        if (!jwt) throw new Error("JWT create failed");
        localStorage.setItem("sm_jwt", jwt);
        window.SM_JWT = jwt;
        return jwt;
    }

    throw new Error("Login required (missing JWT)");
}

export async function syncUser() {
    try {
        // ensure session exists (throws if not logged)
        const user = await account.get();

        // keep local uid for UI
        if (user?.$id) {
            localStorage.setItem("sm_uid", user.$id);
            window.APPWRITE_USER_ID = user.$id;
        }

        const jwt = await ensureJwt();

        const r = await fetch(API_SYNC_USER, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${jwt}`,
            },
            body: JSON.stringify({}), // backend can ignore
        });

        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || `user sync failed (${r.status})`);

        // expected: { ok:true, user_id:"...", created:true/false }
        return j;
    } catch (err) {
        console.warn("User sync skipped:", err?.message || err);
        return null;
    }
}
