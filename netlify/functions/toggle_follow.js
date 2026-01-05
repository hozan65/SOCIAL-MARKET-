// netlify/functions/toggle_follow.js
// ✅ FINAL - Appwrite JWT verify + sm-api toggle (NO Supabase)

import { getAppwriteUser } from "./_appwrite_user.js";

const SM_API_BASE_URL = (process.env.SM_API_BASE_URL || "").trim();
const SM_API_TIMEOUT_MS = Number(process.env.SM_API_TIMEOUT_MS || "6500") || 6500;

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        if (!SM_API_BASE_URL) return json(500, { error: "Missing SM_API_BASE_URL env" });

        // 🔐 Appwrite auth (my uid)
        const { user } = await getAppwriteUser(event);
        if (!user?.$id) return json(401, { error: "Unauthorized" });
        const myUid = String(user.$id).trim();

        let body = {};
        try { body = JSON.parse(event.body || "{}"); } catch {}

        const following_uid = String(body.following_uid || body.target_user_id || "").trim();
        if (!following_uid) return json(400, { error: "Missing following_uid" });
        if (following_uid === myUid) return json(400, { error: "Cannot follow yourself" });

        // ✅ call sm-api
        const out = await smPost(
            "/api/follow/toggle",
            myUid,
            { target_user_id: following_uid }
        );

        // normalize response for current frontend
        const following = !!(out?.following ?? out?.is_following ?? out?.data?.following ?? false);

        // counts (optional)
        const followers_count =
            numOrZero(out?.followers_count ?? out?.counts?.followers ?? out?.data?.followers_count);
        const following_count =
            numOrZero(out?.following_count ?? out?.counts?.following ?? out?.data?.following_count);

        return json(200, {
            ok: true,
            following,
            followers_count,
            following_count,
        });
    } catch (e) {
        console.error("toggle_follow crash:", e);
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

async function smPost(path, myUid, body) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), SM_API_TIMEOUT_MS);

    try {
        const r = await fetch(`${SM_API_BASE_URL}${path}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-User-Id": String(myUid || "").trim(),
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
