// netlify/functions/delete_avatar.js
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
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Appwrite-JWT, x-jwt, X-User-Id",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: JSON.stringify(body),
    };
}

async function smPut(path, uid, bodyObj) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const r = await fetch(`${SM_API_BASE_URL}${path}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", "X-User-Id": String(uid || "").trim() },
            body: JSON.stringify(bodyObj || {}),
            signal: ctrl.signal,
        });
        const txt = await r.text().catch(() => "");
        let j = {};
        try { j = txt ? JSON.parse(txt) : {}; } catch { j = { raw: txt }; }
        if (!r.ok) throw new Error(j?.error || j?.message || `sm-api PUT ${path} failed (${r.status})`);
        return j;
    } finally { clearTimeout(t); }
}

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
        if (!SM_API_BASE_URL) return json(500, { error: "Missing SM_API_BASE_URL" });

        const { user } = await getAppwriteUser(event);
        const uid = String(user?.$id || "").trim();
        if (!uid) return json(401, { error: "Unauthorized" });

        await smPut("/api/profile/avatar", uid, { avatar_url: null });

        return json(200, { ok: true });
    } catch (e) {
        const msg = String(e?.message || e);
        return json(msg.toLowerCase().includes("jwt") ? 401 : 500, { error: msg });
    }
};
