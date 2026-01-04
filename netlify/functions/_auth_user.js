// netlify/functions/_auth_user.js (CJS - NO extra file needed)

const APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT;
const APPWRITE_PROJECT_ID = process.env.APPWRITE_PROJECT_ID;

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
        const status = low.includes("jwt") || low.includes("unauthorized") || low.includes("invalid") ? 401 : 500;
        return json(status, { error: msg });
    }
};

// add_comment gibi yerler için helper
async function authUser(jwt) {
    const user = await fetchUser(jwt);
    const uid = String(user?.$id || "").trim();
    if (!uid) throw new Error("User id missing");
    return { uid, user };
}
module.exports.authUser = authUser;

async function fetchUser(jwt) {
    if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID) {
        throw new Error("Missing APPWRITE_ENDPOINT or APPWRITE_PROJECT_ID env");
    }

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
    try { data = txt ? JSON.parse(txt) : null; } catch {}

    if (!r.ok) {
        const msg = data?.message || data?.error || `Appwrite /account failed: HTTP ${r.status}`;
        throw new Error(msg);
    }

    if (!data?.$id) throw new Error("Invalid JWT");
    return data;
}

function extractJWT(event) {
    const h = event?.headers || {};
    const auth = h.authorization || h.Authorization || "";
    const xjwt = h["x-appwrite-jwt"] || h["X-Appwrite-JWT"] || h["X-APPWRITE-JWT"] || "";

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
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Appwrite-JWT",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
        body: JSON.stringify(body),
    };
}
