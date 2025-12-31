// netlify/functions/_appwrite_user.js

const APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT; // örn: https://cloud.appwrite.io/v1
const APPWRITE_PROJECT_ID = process.env.APPWRITE_PROJECT_ID;

export async function getAppwriteUser(event) {
    if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID) {
        throw new Error("Missing APPWRITE_ENDPOINT or APPWRITE_PROJECT_ID env");
    }

    // ✅ JWT'yi her ihtimalden oku
    const jwt = extractJWT(event);
    if (!jwt) throw new Error("Missing JWT");

    // Appwrite Account endpoint'i ile JWT doğrula
    const r = await fetch(`${APPWRITE_ENDPOINT}/account`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "X-Appwrite-Project": APPWRITE_PROJECT_ID,
            "X-Appwrite-JWT": jwt, // ✅ Appwrite JWT header
        },
    });

    const txt = await r.text().catch(() => "");
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch { data = null; }

    if (!r.ok) {
        // Appwrite genelde 401/403 döner; mesajı netleştirelim
        const msg =
            data?.message ||
            data?.error ||
            `Appwrite /account failed: HTTP ${r.status}`;
        throw new Error(msg);
    }

    if (!data?.$id) {
        throw new Error("Invalid JWT (no user id)");
    }

    return { user: data, jwt };
}

function extractJWT(event) {
    const h = event?.headers || {};
    // Netlify bazen header keylerini küçültür
    const auth =
        h.authorization ||
        h.Authorization ||
        "";

    const xjwt =
        h["x-appwrite-jwt"] ||
        h["X-Appwrite-JWT"] ||
        h["X-APPWRITE-JWT"] ||
        "";

    // 1) Authorization: Bearer <jwt>
    if (auth) {
        const m = auth.match(/Bearer\s+(.+)/i);
        if (m && m[1]) return m[1].trim();
        // bazen direkt jwt koyuyorlar
        return auth.trim();
    }

    // 2) X-Appwrite-JWT: <jwt>
    if (xjwt) return String(xjwt).trim();

    return "";
}
