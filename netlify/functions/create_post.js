// netlify/functions/create_post.js
// FINAL FULL - Appwrite JWT verify + Supabase insert (service key) + CORS/OPTIONS
// Fixes: author_uid NOT NULL, pair NOT NULL, pairs normalization

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

const APPWRITE_ENDPOINT = (process.env.APPWRITE_ENDPOINT || "").trim(); // e.g. https://cloud.appwrite.io/v1
const APPWRITE_PROJECT_ID = (process.env.APPWRITE_PROJECT_ID || "").trim();

function json(statusCode, bodyObj) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: JSON.stringify(bodyObj),
    };
}

function getBearerToken(event) {
    const auth = event.headers.authorization || event.headers.Authorization || "";
    if (!auth.startsWith("Bearer ")) return null;
    return auth.slice(7).trim() || null;
}

async function getAppwriteUser(jwt) {
    if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID) {
        throw new Error("Missing APPWRITE_ENDPOINT / APPWRITE_PROJECT_ID in Netlify env");
    }

    const url = `${APPWRITE_ENDPOINT.replace(/\/$/, "")}/account`;

    const r = await fetch(url, {
        method: "GET",
        headers: {
            "X-Appwrite-Project": APPWRITE_PROJECT_ID,
            "X-Appwrite-JWT": jwt,
        },
    });

    const j = await r.json().catch(() => null);

    if (!r.ok) {
        const msg = j?.message || `Appwrite auth failed (${r.status})`;
        throw new Error(msg);
    }

    const uid = j?.$id || j?.id || null;
    const email = j?.email || null;

    if (!uid) throw new Error("Appwrite user id not found");
    return { uid, email };
}

function normalizePairs(pairs) {
    // Accepts array or string. Returns a CSV string: "BTCUSDT,ETHUSDT"
    if (Array.isArray(pairs)) {
        return pairs
            .map((x) => String(x ?? "").trim())
            .filter(Boolean)
            .join(",");
    }

    return String(pairs || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
        .join(",");
}

exports.handler = async (event) => {
    try {
        // ✅ CORS preflight
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        if (!SUPABASE_URL || !SERVICE_KEY) {
            return json(500, { error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" });
        }

        const jwt = getBearerToken(event);
        if (!jwt) return json(401, { error: "Missing JWT" });

        const user = await getAppwriteUser(jwt);

        const body = JSON.parse(event.body || "{}");

        const market = String(body.market || "").trim();
        const category = String(body.category || "").trim() || null;
        const timeframe = String(body.timeframe || "").trim();
        const content = String(body.content || "").trim();
        const pairs = normalizePairs(body.pairs);
        const pair = pairs.split(",")[0] || pairs; // ✅ DB NOT NULL
        const image_path = body.image_path ? String(body.image_path).trim() : null;

        // ✅ strict required (based on your DB constraints + app needs)
        if (!market || !timeframe || !content || !pair) {
            return json(400, { error: "Missing fields (market/timeframe/content/pair)" });
        }

        const sb = createClient(SUPABASE_URL, SERVICE_KEY);

        const { data, error } = await sb
            .from("analyses")
            .insert([
                {
                    // ✅ satisfy NOT NULL constraints
                    author_uid: user.uid,
                    pair: pair,

                    // ✅ compatibility (your feed.js sometimes uses author_id/pairs)
                    author_id: user.uid,
                    pairs: pairs,

                    market,
                    category,
                    timeframe,
                    content,
                    image_path,
                },
            ])
            .select("id")
            .single();

        if (error) throw error;

        return json(200, { ok: true, id: data.id });
    } catch (e) {
        console.error("create_post error:", e);
        return json(500, { error: e.message || "Server error" });
    }
};
