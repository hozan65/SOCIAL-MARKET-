// netlify/functions/dm_inbox.js
// ✅ NO SUPABASE
// ✅ Appwrite JWT verify
// ✅ Calls sm-api (Postgres) to get inbox list

const { getAppwriteUser } = require("./_appwrite_user.cjs");

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
            "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
        body: JSON.stringify(bodyObj),
    };
}

async function smApiInbox(uid) {
    if (!SM_API_BASE_URL) throw new Error("Missing SM_API_BASE_URL env");

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), SM_API_TIMEOUT_MS);

    try {
        const r = await fetch(`${SM_API_BASE_URL}/api/dm/inbox`, {
            method: "GET",
            headers: {
                "X-User-Id": String(uid || "").trim(),
            },
            signal: ctrl.signal,
        });

        const txt = await r.text().catch(() => "");
        let j = {};
        try { j = txt ? JSON.parse(txt) : {}; } catch { j = { raw: txt }; }

        if (!r.ok) throw new Error(j?.error || j?.message || `sm-api inbox failed (${r.status})`);
        return j;
    } finally {
        clearTimeout(t);
    }
}

exports.handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

        const { user } = await getAppwriteUser(event);
        const uid = user?.$id;
        if (!uid) return json(401, { error: "Missing user id" });

        const out = await smApiInbox(uid);
        // sm-api { ok:true, list:[...] } döndürecek
        return json(200, { ok: true, list: out.list || [] });
    } catch (e) {
        return json(500, { error: String(e?.message || e) });
    }
};
