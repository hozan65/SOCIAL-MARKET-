// netlify/functions/_appwrite_user.js
// ✅ Appwrite JWT -> /account verify helper (robust headers + timeout)

const APPWRITE_ENDPOINT = (process.env.APPWRITE_ENDPOINT || "").trim(); // https://cloud.appwrite.io/v1
const APPWRITE_PROJECT_ID = (process.env.APPWRITE_PROJECT_ID || "").trim();

const DEFAULT_TIMEOUT_MS = 6500;

export async function getAppwriteUser(event, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID) {
        throw new Error("Missing APPWRITE_ENDPOINT or APPWRITE_PROJECT_ID env");
    }

    const jwt = extractJWT(event);
    if (!jwt) throw new Error("Missing JWT");

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
        const r = await fetch(`${APPWRITE_ENDPOINT}/account`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "X-Appwrite-Project": APPWRITE_PROJECT_ID,
                "X-Appwrite-JWT": jwt,
            },
            signal: ctrl.signal,
        });

        const txt = await r.text().catch(() => "");
        let data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch { data = null; }

        if (!r.ok) {
            const msg =
                data?.message ||
                data?.error ||
                data?.errors?.[0]?.message ||
                `Appwrite /account failed: HTTP ${r.status}`;
            throw new Error(msg);
        }

        if (!data?.$id) throw new Error("Invalid JWT (missing user id)");

        return { user: data, user_id: data.$id, jwt };
    } catch (e) {
        // AbortController error normalize
        if (String(e?.name || "").toLowerCase() === "aborterror") {
            throw new Error("Appwrite /account timeout");
        }
        throw e;
    } finally {
        clearTimeout(t);
    }
}

function extractJWT(event) {
    // Netlify can have headers + multiValueHeaders
    const h = event?.headers || {};
    const mvh = event?.multiValueHeaders || {};

    // helper: get header case-insensitive, also from multiValueHeaders
    const getHeader = (name) => {
        const lower = name.toLowerCase();

        // multiValueHeaders first
        for (const k of Object.keys(mvh || {})) {
            if (String(k).toLowerCase() === lower) {
                const v = mvh[k];
                if (Array.isArray(v) && v[0]) return String(v[0]);
                if (typeof v === "string") return v;
            }
        }

        // headers
        for (const k of Object.keys(h || {})) {
            if (String(k).toLowerCase() === lower) return String(h[k] ?? "");
        }

        return "";
    };

    const auth = getHeader("authorization");
    const xjwt = getHeader("x-appwrite-jwt") || getHeader("x-jwt") || getHeader("sm-jwt");

    if (auth) {
        const m = auth.match(/Bearer\s+(.+)/i);
        if (m?.[1]) return m[1].trim();
        return auth.trim();
    }

    if (xjwt) return String(xjwt).trim();

    return "";
}
