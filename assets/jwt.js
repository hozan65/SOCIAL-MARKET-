// /assets/jwt.js
import { account } from "/assets/appwrite.js";

/**
 * Creates (or refreshes) Appwrite JWT and stores it for Netlify Functions.
 * - window.SM_JWT
 * - localStorage.sm_jwt
 * - window.SM_REFRESH_JWT()
 * - window.SM_JWT_READY (await this!)
 */

async function refreshJWT() {
    try {
        await account.get(); // throws if no session

        const jwtObj = await account.createJWT();
        const jwt = jwtObj?.jwt;

        if (!jwt) throw new Error("JWT not returned");

        window.SM_JWT = jwt;
        localStorage.setItem("sm_jwt", jwt);

        console.log(" sm_jwt updated");
        return jwt;
    } catch (e) {
        window.SM_JWT = "";
        localStorage.removeItem("sm_jwt");
        console.warn("⚠ No session -> sm_jwt cleared");
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
