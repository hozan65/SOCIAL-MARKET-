// netlify/functions/ensure_profile.js
import { getAppwriteUser } from "./_appwrite_user.js";

const SM_API_BASE_URL = (process.env.SM_API_BASE_URL || "").trim();
const SM_API_TIMEOUT_MS = Number(process.env.SM_API_TIMEOUT_MS || "6500") || 6500;

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        if (!SM_API_BASE_URL) return json(500, { error: "Missing SM_API_BASE_URL env" });

        const { user } = await getAppwriteUser(event);
        const uid = String(user?.$id || "").trim();
        if (!uid) return json(401, { error: "Invalid JWT (missing uid)" });

        // sm-api call
        const out = await smPost("/api/profile/ensure", uid, { ok: true });

        return json(200, { ok: true, ...(out || {}) });
    } catch (e) {
        const msg = String(e?.message || e);
        return json(msg.toLowerCase().includes("jwt") ? 401 : 500, { error: msg });
    }
};

async function smPost(path, uid, body) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), SM_API_TIMEOUT_MS);

    try {
        const r = await fetch(`${SM_API_BASE_URL}${path}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-User-Id": uid,
            },
            body: JSON.stringify(body || {}),
            signal: ctrl.signal,
        });

        const txt = await r.text().catch(() => "");
        let j = {};
        try { j = txt ? JSON.parse(txt) : {}; } catch { j = { raw: txt }; }

        if (!r.ok) throw new Error(j?.error || j?.message || `sm-api ${path} failed (${r.status})`);
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
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Appwrite-JWT, x-jwt",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: JSON.stringify(body),
    };
}
