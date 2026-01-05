// netlify/functions/toggle_like.js
// ✅ FINAL - Appwrite JWT verify + sm-api like toggle (NO Supabase)

import { getAppwriteUser } from "./_appwrite_user.js";

const SM_API_BASE_URL = (process.env.SM_API_BASE_URL || "").trim();
const SM_API_TIMEOUT_MS = Number(process.env.SM_API_TIMEOUT_MS || "6500") || 6500;

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        if (!SM_API_BASE_URL) return json(500, { error: "Missing SM_API_BASE_URL env" });

        const { user } = await getAppwriteUser(event);
        if (!user?.$id) return json(401, { error: "Unauthorized" });
        const uid = String(user.$id).trim();

        let body = {};
        try { body = JSON.parse(event.body || "{}"); } catch {}

        const post_id = String(body.post_id || "").trim();
        if (!post_id) return json(400, { error: "Missing post_id" });

        const out = await smPost("/api/likes/toggle", uid, { post_id });

        // normalize
        const liked = !!(out?.liked ?? out?.is_liked ?? out?.data?.liked ?? false);
        const likes_count = numOrZero(out?.likes_count ?? out?.count ?? out?.data?.likes_count);

        return json(200, { ok: true, liked, likes_count });
    } catch (e) {
        const msg = String(e?.message || e);
        const low = msg.toLowerCase();
        const status =
            low.includes("jwt") || low.includes("unauthorized") || low.includes("invalid") ? 401 : 500;
        return json(status, { error: msg });
    }
};

function numOrZero(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

async function smPost(path, uid, body) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), SM_API_TIMEOUT_MS);

    try {
        const r = await fetch(`${SM_API_BASE_URL}${path}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-User-Id": String(uid || "").trim(),
            },
            body: JSON.stringify(body || {}),
            signal: ctrl.signal,
        });

        const txt = await r.text().catch(() => "");
        let j = {};
        try { j = txt ? JSON.parse(txt) : {}; } catch { j = { raw: txt }; }

        if (!r.ok) throw new Error(j?.error || j?.message || `sm-api POST ${path} failed (${r.status})`);
        return j;
    } catch (e) {
        if (String(e?.name || "").toLowerCase() === "aborterror") throw new Error("sm-api timeout");
        throw e;
    } finally {
        clearTimeout(t);
    }
}

function json(statusCode, body) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Appwrite-JWT, x-jwt, X-User-Id",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: JSON.stringify(body),
    };
}
