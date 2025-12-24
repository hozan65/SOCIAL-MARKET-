// netlify/functions/create_post.js
// Appwrite JWT -> Appwrite /account doğrula -> Supabase (service_role) insert
// DEBUG: Supabase key role log (only "anon" / "service_role")

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT;      // örn: https://cloud.appwrite.io/v1
const APPWRITE_PROJECT_ID = process.env.APPWRITE_PROJECT_ID;  // Appwrite Project ID

function json(statusCode, bodyObj) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
        },
        body: JSON.stringify(bodyObj),
    };
}

function jwtRole(token) {
    try {
        if (!token || typeof token !== "string") return null;
        const parts = token.split(".");
        if (parts.length < 2) return null;
        const payload = parts[1];

        // base64url -> base64
        const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
        const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
        const buf = Buffer.from(b64 + pad, "base64");
        const obj = JSON.parse(buf.toString("utf8"));
        return obj?.role || null;
    } catch {
        return null;
    }
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

exports.handler = async (event) => {
    try {
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        if (!SUPABASE_URL || !SERVICE_KEY) {
            return json(500, { error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" });
        }

        // ✅ DEBUG: log only role (no secrets)
        console.log("SUPABASE_SERVICE_ROLE_KEY role =", jwtRole(SERVICE_KEY));

        const jwt = getBearerToken(event);
        if (!jwt) return json(401, { error: "Missing JWT" });

        const user = await getAppwriteUser(jwt);

        const body = JSON.parse(event.body || "{}");

        const market = String(body.market || "").trim();
        const category = String(body.category || "").trim() || null;
        const timeframe = String(body.timeframe || "").trim();
        const content = String(body.content || "").trim();
        const pairs = String(body.pairs || "").trim(); // text
        const image_path = body.image_path ? String(body.image_path).trim() : null;

        if (!market || !timeframe || !content || !pairs) {
            return json(400, { error: "Missing fields (market/timeframe/content/pairs)" });
        }

        const sb = createClient(SUPABASE_URL, SERVICE_KEY);

        const { data, error } = await sb
            .from("analyses")
            .insert([
                {
                    author_id: user.uid,
                    market,
                    category,
                    timeframe,
                    content,
                    pairs,
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
