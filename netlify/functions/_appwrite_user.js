// netlify/functions/_appwrite_user.js

const APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT; // https://cloud.appwrite.io/v1
const APPWRITE_PROJECT_ID = process.env.APPWRITE_PROJECT_ID;

export async function getAppwriteUser(event) {
    if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID) {
        throw new Error("Missing APPWRITE_ENDPOINT or APPWRITE_PROJECT_ID env");
    }

    const jwt = extractJWT(event);
    if (!jwt) throw new Error("Missing JWT");

    const r = await fetch(`${APPWRITE_ENDPOINT}/account`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "X-Appwrite-Project": APPWRITE_PROJECT_ID,
            "X-Appwrite-JWT": jwt,
        },
    });

    const txt = await r.text().catch(() => "");
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch { data = null; }

    if (!r.ok) {
        const msg = data?.message || data?.error || `Appwrite /account failed: HTTP ${r.status}`;
        throw new Error(msg);
    }

    if (!data?.$id) throw new Error("Invalid JWT");

    return { user: data, jwt };
}

function extractJWT(event) {
    const h = event?.headers || {};

    const auth = h.authorization || h.Authorization || "";
    const xjwt =
        h["x-appwrite-jwt"] ||
        h["X-Appwrite-JWT"] ||
        h["X-APPWRITE-JWT"] ||
        "";

    if (auth) {
        const m = auth.match(/Bearer\s+(.+)/i);
        if (m?.[1]) return m[1].trim();
        return auth.trim();
    }

    if (xjwt) return String(xjwt).trim();

    return "";
}
