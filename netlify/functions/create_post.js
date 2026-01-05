// netlify/functions/create_post.js
// ✅ FINAL - Appwrite JWT verify + sm-api insert (NO Supabase)
// ✅ Uses /api/analyses/create
// ✅ Sends pairs as ARRAY (text[])
// ✅ Sends X-User-Id header for author_id
// ✅ Robust JWT extraction + CORS/OPTIONS

const APPWRITE_ENDPOINT = (process.env.APPWRITE_ENDPOINT || "").trim(); // https://cloud.appwrite.io/v1
const APPWRITE_PROJECT_ID = (process.env.APPWRITE_PROJECT_ID || "").trim();

const SM_API_BASE_URL = (process.env.SM_API_BASE_URL || "").trim();
const SM_API_TIMEOUT_MS = Number(process.env.SM_API_TIMEOUT_MS || "6500") || 6500;

function json(statusCode, bodyObj) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Appwrite-JWT, x-jwt",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: JSON.stringify(bodyObj),
    };
}

function extractJWT(event) {
    const h = event?.headers || {};
    const mvh = event?.multiValueHeaders || {};

    const getHeader = (name) => {
        const lower = String(name).toLowerCase();

        for (const k of Object.keys(mvh || {})) {
            if (String(k).toLowerCase() === lower) {
                const v = mvh[k];
                if (Array.isArray(v) && v[0]) return String(v[0]);
                if (typeof v === "string") return v;
            }
        }
        for (const k of Object.keys(h || {})) {
            if (String(k).toLowerCase() === lower) return String(h[k] ?? "");
        }
        return "";
    };

    const auth = (getHeader("authorization") || "").trim();
    if (auth) {
        const m = auth.match(/^Bearer\s+(.+)$/i);
        if (m?.[1]) return m[1].trim();
        return auth.trim();
    }

    const xjwt =
        (getHeader("x-appwrite-jwt") || "").trim() ||
        (getHeader("x-jwt") || "").trim() ||
        (getHeader("sm-jwt") || "").trim();

    return xjwt || "";
}

async function getAppwriteUser(jwt) {
    if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID) {
        throw new Error("Missing APPWRITE_ENDPOINT / APPWRITE_PROJECT_ID in Netlify env");
    }

    const url = `${APPWRITE_ENDPOINT.replace(/\/$/, "")}/account`;

    const r = await fetch(url, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "X-Appwrite-Project": APPWRITE_PROJECT_ID,
            "X-Appwrite-JWT": jwt,
        },
    });

    const txt = await r.text().catch(() => "");
    let j = null;
    try {
        j = txt ? JSON.parse(txt) : null;
    } catch {
        j = null;
    }

    if (!r.ok) {
        const msg = j?.message || j?.error || `Appwrite auth failed (${r.status})`;
        throw new Error(msg);
    }

    const uid = j?.$id || j?.id || null;
    const email = j?.email || null;

    if (!uid) throw new Error("Appwrite user id not found");
    return { uid, email };
}

function toPairsArray(pairs) {
    if (Array.isArray(pairs)) {
        return pairs.map((x) => String(x ?? "").trim()).filter(Boolean);
    }
    return String(pairs || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
}

async function smApiCreateAnalysis(uid, payload) {
    if (!SM_API_BASE_URL) throw new Error("Missing SM_API_BASE_URL env");

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), SM_API_TIMEOUT_MS);

    try {
        // ✅ correct endpoint
        const r = await fetch(`${SM_API_BASE_URL.replace(/\/$/, "")}/api/analyses/create`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-User-Id": String(uid || "").trim(),
            },
            body: JSON.stringify(payload || {}),
            signal: ctrl.signal,
        });

        const txt = await r.text().catch(() => "");
        let j = {};
        try {
            j = txt ? JSON.parse(txt) : {};
        } catch {
            j = { raw: txt };
        }

        if (!r.ok) {
            throw new Error(j?.error || j?.message || `sm-api create failed (${r.status})`);
        }

        return j;
    } catch (e) {
        if (String(e?.name || "").toLowerCase() === "aborterror") {
            throw new Error("sm-api timeout");
        }
        throw e;
    } finally {
        clearTimeout(t);
    }
}

exports.handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        const jwt = extractJWT(event);
        if (!jwt) return json(401, { error: "Missing JWT" });

        const user = await getAppwriteUser(jwt);

        let body = {};
        try {
            body = JSON.parse(event.body || "{}");
        } catch {
            body = {};
        }

        const market = String(body.market || "").trim();
        const category = String(body.category || "").trim() || "";
        const timeframe = String(body.timeframe || "").trim();
        const content = String(body.content || "").trim();
        const image_path = body.image_path ? String(body.image_path).trim() : "";

        const pairsArr = toPairsArray(body.pairs);
        if (!market || !timeframe || !content || pairsArr.length === 0) {
            return json(400, { error: "Missing fields (market/timeframe/content/pairs[])" });
        }

        const out = await smApiCreateAnalysis(user.uid, {
            market,
            category,
            timeframe,
            content,
            pairs: pairsArr,      // ✅ ARRAY!
            image_path,
        });

        // sm-api might return { ok:true, analysis:{id...} } OR { ok:true, id }
        const id =
            out?.analysis?.id ||
            out?.id ||
            out?.post_id ||
            out?.data?.id ||
            null;

        if (!id) return json(500, { error: "sm-api returned missing id", raw: out });

        return json(200, { ok: true, id });
    } catch (e) {
        console.error("create_post error:", e);
        return json(500, { error: e.message || "Server error" });
    }
};
