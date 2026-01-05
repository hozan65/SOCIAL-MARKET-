// netlify/functions/_auth_user.js (CJS - self-contained)
// ✅ Robust JWT extraction (Authorization / X-Appwrite-JWT / x-jwt)
// ✅ Timeout protection
// ✅ Exposes handler + authUser helper

const APPWRITE_ENDPOINT = (process.env.APPWRITE_ENDPOINT || "").trim();
const APPWRITE_PROJECT_ID = (process.env.APPWRITE_PROJECT_ID || "").trim();

const DEFAULT_TIMEOUT_MS = 6500;

exports.handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

        const jwt = extractJWT(event);
        if (!jwt) return json(401, { error: "Missing JWT" });

        const user = await fetchUser(jwt);

        return json(200, {
            ok: true,
            uid: user.$id,
            user_id: user.$id,
            user: { $id: user.$id, name: user.name || "", email: user.email || "" },
        });
    } catch (e) {
        const msg = String(e?.message || e);
        const low = msg.toLowerCase();

        const status =
            low.includes("jwt") ||
            low.includes("unauthorized") ||
            low.includes("invalid") ||
            low.includes("not authorized")
                ? 401
                : 500;

        return json(status, { error: msg });
    }
};

// ✅ add_comment gibi yerler için helper
async function authUser(jwt) {
    const user = await fetchUser(jwt);
    const uid = String(user?.$id || "").trim();
    if (!uid) throw new Error("User id missing");
    return { uid, user };
}
module.exports.authUser = authUser;

async function fetchUser(jwt, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID) {
        throw new Error("Missing APPWRITE_ENDPOINT or APPWRITE_PROJECT_ID env");
    }

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

        if (!data?.$id) throw new Error("Invalid JWT");
        return data;
    } catch (e) {
        if (String(e?.name || "").toLowerCase() === "aborterror") {
            throw new Error("Appwrite /account timeout");
        }
        throw e;
    } finally {
        clearTimeout(t);
    }
}

function extractJWT(event) {
    const h = event?.headers || {};
    const mvh = event?.multiValueHeaders || {};

    const getHeader = (name) => {
        const lower = String(name).toLowerCase();

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

function json(statusCode, body) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Appwrite-JWT, x-jwt",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
        body: JSON.stringify(body),
    };
}
