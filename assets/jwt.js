// /assets/jwt.js
import { account } from "/assets/appwrite.js";

/**
 * Creates (or refreshes) Appwrite JWT and stores it for Netlify Functions.
 * - window.SM_JWT  (fast access)
 * - localStorage.sm_jwt (persistence, mobile)
 */

async function refreshJWT() {
    try {
        // If session is invalid, this throws
        await account.get();

        // Create a short-lived JWT (Appwrite)
        const jwtObj = await account.createJWT();
        const jwt = jwtObj?.jwt;

        if (!jwt) throw new Error("JWT not returned");

        window.SM_JWT = jwt;
        localStorage.setItem("sm_jwt", jwt);

        console.log("✅ sm_jwt updated");
        return jwt;
    } catch (e) {
        // Not logged in / session expired
        window.SM_JWT = "";
        localStorage.removeItem("sm_jwt");

        console.warn("⚠️ No session -> sm_jwt cleared");
        return null;
    }
}

// Run once on load
refreshJWT();

// Optional: refresh every 8 minutes (keeps mobile alive)
// You can remove this if you want.
setInterval(() => {
    if (document.visibilityState !== "visible") return;
    refreshJWT();
}, 8 * 60 * 1000);

// Make callable from other scripts if needed
window.SM_REFRESH_JWT = refreshJWT;
