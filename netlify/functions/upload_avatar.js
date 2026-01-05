// netlify/functions/upload_avatar.js
// ✅ Upload avatar -> Supabase Storage
// ✅ Save avatar_url -> sm-api (Postgres)
// ❌ No Supabase DB writes

import { createClient } from "@supabase/supabase-js";
import { getAppwriteUser } from "./_appwrite_user.js";

const BUCKET = (process.env.AVATAR_BUCKET || "avatars").trim();
const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

const SM_API_BASE_URL = (process.env.SM_API_BASE_URL || "").trim();
const MAX_BYTES = Number(process.env.MAX_AVATAR_BYTES || "2097152") || 2097152; // 2MB default
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

function decodeBase64(input) {
    const s = String(input || "");
    const base64 = s.includes("base64,") ? s.split("base64,").pop() : s;
    return Buffer.from(base64, "base64");
}

function pickExt(contentType) {
    const ct = String(contentType || "").toLowerCase();
    if (ct.includes("png")) return "png";
    if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
    if (ct.includes("webp")) return "webp";
    return "";
}

async function smPut(path, uid, bodyObj) {
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

        if (!SUPABASE_URL || !SERVICE_KEY) {
            return json(500, { error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" });
        }
        if (!SM_API_BASE_URL) {
            return json(500, { error: "Missing SM_API_BASE_URL" });
        }

        const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
        });

        const { user } = await getAppwriteUser(event);
        const uid = String(user?.$id || "").trim();
        if (!uid) return json(401, { error: "Unauthorized" });

        let body = {};
        try { body = JSON.parse(event.body || "{}"); } catch {}

        const b64 = body.file_base64;
        if (!b64) return json(400, { error: "Missing file_base64" });

        const contentType = String(body.content_type || "image/png");
        const ext = pickExt(contentType);
        if (!ext) return json(400, { error: "Unsupported content_type. Use png/jpg/webp." });

        const buffer = decodeBase64(b64);
        if (!buffer?.length) return json(400, { error: "Invalid base64" });
        if (buffer.length > MAX_BYTES) return json(400, { error: `File too large. Max ${MAX_BYTES} bytes.` });

        // ✅ path: avatars/<uid>/<timestamp-rand>.<ext>
        const rand = Math.random().toString(16).slice(2);
        const path = `${uid}/${Date.now()}-${rand}.${ext}`;

        const { error: uploadErr } = await sb.storage
            .from(BUCKET)
            .upload(path, buffer, { contentType, upsert: true });

        if (uploadErr) return json(500, { error: uploadErr.message });

        const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
        const avatar_url = data?.publicUrl || "";
        if (!avatar_url) return json(500, { error: "Public URL missing" });

        // ✅ write to sm-api (Postgres)
        await smPut("/api/profile/avatar", uid, { avatar_url });

        return json(200, { ok: true, avatar_url });
    } catch (e) {
        const msg = String(e?.message || e);
        const low = msg.toLowerCase();
        return json(low.includes("jwt") || low.includes("unauthorized") ? 401 : 500, { error: msg });
    }
};
