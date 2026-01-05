// netlify/functions/profile_upsert.js
// ✅ Appwrite JWT verify
// ✅ Update profile in sm-api (Postgres)
// ❌ No Supabase DB writes

import { getAppwriteUser } from "./_appwrite_user.js";

const SM_API_BASE_URL = (process.env.SM_API_BASE_URL || "").trim();
const TIMEOUT_MS = 6500;

function json(statusCode, body) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Appwrite-JWT",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: JSON.stringify(body),
    };
}

function clampStr(v, max) {
    const s = String(v ?? "").trim();
    if (!s) return null;
    return s.length > max ? s.slice(0, max) : s;
}

function safeWebsite(v) {
    const s = clampStr(v, 300);
    if (!s) return null;
    // basic safety: only allow http/https
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
    return null;
}

async function smPut(path, uid, bodyObj) {
    if (!SM_API_BASE_URL) throw new Error("Missing SM_API_BASE_URL");

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    try {
        const r = await fetch(`${SM_API_BASE_URL}${path}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "X-User-Id": String(uid || "").trim(),
            },
            body: JSON.stringify(bodyObj || {}),
            signal: ctrl.signal,
        });

        const txt = await r.text().catch(() => "");
        let j = {};
        try { j = txt ? JSON.parse(txt) : {}; } catch { j = { raw: txt }; }

        if (!r.ok) throw new Error(j?.error || j?.message || `sm-api PUT ${path} failed (${r.status})`);
        return j;
    } finally {
        clearTimeout(t);
    }
}

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        const { user } = await getAppwriteUser(event);
        const uid = String(user?.$id || "").trim();
        if (!uid) return json(401, { error: "Unauthorized" });

        let body = {};
        try { body = JSON.parse(event.body || "{}"); } catch {}

        // name: Appwrite name default (ama user settings sayfasında değiştirteceksen body’den de alabiliriz)
        const payload = {
            name: clampStr(body.name ?? user.name ?? "", 120) || (user.name || ""),
            bio: clampStr(body.bio, 500),
            website: safeWebsite(body.website),
        };

        const out = await smPut("/api/profile", uid, payload);

        return json(200, { ok: true, ...out });
    } catch (e) {
        const msg = String(e?.message || e);
        const low = msg.toLowerCase();
        return json(low.includes("jwt") || low.includes("unauthorized") || low.includes("invalid") ? 401 : 500, { error: msg });
    }
};
