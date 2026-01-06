// /assets/jwt.js
import { account } from "/assets/appwrite.js";

/**
 * Creates (or refreshes) Appwrite JWT and stores it for Hetzner API.
 * - window.SM_JWT
 * - localStorage.sm_jwt
 * - window.SM_REFRESH_JWT()
 * - window.SM_JWT_READY (await this!)
 */

async function refreshJWT() {
    try {
        // session var mı?
        await account.get();

        const jwtObj = await account.createJWT();
        const jwt = jwtObj?.jwt;

        if (!jwt) throw new Error("JWT not returned");

        window.SM_JWT = jwt;
        localStorage.setItem("sm_jwt", jwt);

        console.log("✅ sm_jwt updated for Hetzner API");
        return jwt;
    } catch (e) {
        // session yoksa mevcut tokenı silme
        window.SM_JWT =
            window.SM_JWT ||
            localStorage.getItem("sm_jwt") ||
            "";

        console.warn("⚠ No session -> JWT refresh skipped (kept existing sm_jwt if any)");
        return null;
    }
}

// Run once on load
window.SM_JWT_READY = refreshJWT();

// Optional: refresh every 8 minutes (only when visible)
setInterval(() => {
    if (document.visibilityState !== "visible") return;
    refreshJWT();
}, 8 * 60 * 1000);

// Expose callable
window.SM_REFRESH_JWT = refreshJWT;
