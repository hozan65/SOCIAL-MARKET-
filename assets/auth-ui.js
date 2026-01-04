// /assets/auth-ui.js  (UI OFF + AUTH GUARD)
import { account } from "/assets/appwrite.js";

console.log("✅ auth-ui.js loaded (ui off + guard)");

// Bu sayfalarda login zorunlu olsun:
const PROTECTED_PREFIXES = ["/profile/", "/u/", "/messages/"];

// şimdiki sayfa protected mı?
const isProtected = PROTECTED_PREFIXES.some(p => location.pathname.startsWith(p));

(async () => {
    if (!isProtected) return;

    try {
        await account.get(); // login var mı?
    } catch {
        // login yoksa → login sayfasına
        location.replace("/auth/login.html");
    }
})();
