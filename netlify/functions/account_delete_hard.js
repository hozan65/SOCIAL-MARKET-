// netlify/functions/account_delete_hard.js
import { Client, Users } from "node-appwrite";

function json(statusCode, obj, extraHeaders = {}) {
    return {
        statusCode,
        headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "Content-Type, Authorization, X-Appwrite-JWT, x-jwt",
            "access-control-allow-methods": "POST, OPTIONS",
            ...extraHeaders,
        },
        body: JSON.stringify(obj),
    };
}

function getJwtFromEvent(event) {
    const h = event?.headers || {};
    const mvh = event?.multiValueHeaders || {};

    const pick = (name) => {
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

    const auth = (pick("authorization") || "").trim();
    if (auth) {
        const m = auth.match(/^Bearer\s+(.+)$/i);
        if (m?.[1]) return m[1].trim();
        return auth; // bearer yazmadan token atan clientlar
    }

    const xjwt =
        (pick("x-appwrite-jwt") || "").trim() ||
        (pick("x-jwt") || "").trim() ||
        (pick("sm-jwt") || "").trim();

    return xjwt || "";
}

async function appwriteMe(jwt) {
    const endpoint = (process.env.APPWRITE_ENDPOINT || "").trim();
    const projectId = (process.env.APPWRITE_PROJECT_ID || "").trim();
    if (!endpoint || !projectId) throw new Error("Missing APPWRITE_ENDPOINT or APPWRITE_PROJECT_ID env");

    const r = await fetch(`${endpoint}/account`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "X-Appwrite-Project": projectId,
            "X-Appwrite-JWT": jwt,
        },
    });

    const txt = await r.text().catch(() => "");
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch { data = null; }

    if (!r.ok) {
        const msg = data?.message || data?.error || `Appwrite /account failed: HTTP ${r.status}`;
        throw new Error(msg);
    }
    if (!data?.$id) throw new Error("Invalid JWT");
    return data;
}

async function smApiHardDeleteUser({ userId }) {
    const base = (process.env.SM_API_BASE_URL || "").trim();
    const adminKey = (process.env.SM_API_ADMIN_KEY || "").trim();
    if (!base) throw new Error("Missing SM_API_BASE_URL env");
    if (!adminKey) throw new Error("Missing SM_API_ADMIN_KEY env");

    // ✅ sm-api'de bu endpointi senin backend’de yapacağız:
    // POST /internal/user/hard_delete  { user_id }
    const r = await fetch(`${base}/internal/user/hard_delete`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Admin-Key": adminKey,
        },
        body: JSON.stringify({ user_id: userId }),
    });

    const txt = await r.text().catch(() => "");
    let data = {};
    try { data = txt ? JSON.parse(txt) : {}; } catch { data = { raw: txt }; }

    if (!r.ok) {
        throw new Error(data?.error || data?.message || `sm-api hard_delete failed (${r.status})`);
    }
    return data;
}

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        let body = {};
        try { body = event.body ? JSON.parse(event.body) : {}; } catch {}

        if (body?.confirm !== true) {
            return json(400, { error: "Missing confirm:true" });
        }

        // ✅ 1) JWT doğrula -> UID sadece buradan gelir
        const jwt = getJwtFromEvent(event);
        if (!jwt) return json(401, { error: "Missing JWT" });

        const me = await appwriteMe(jwt);
        const userId = String(me.$id || "").trim();
        if (!userId) return json(401, { error: "Invalid JWT" });

        // ✅ 2) sm-api (Postgres) tarafında user datasını sil
        // (Supabase yok)
        const smRes = await smApiHardDeleteUser({ userId });

        // ✅ 3) Appwrite user hard delete (admin)
        const APPWRITE_ENDPOINT = (process.env.APPWRITE_ENDPOINT || "").trim();
        const APPWRITE_PROJECT_ID = (process.env.APPWRITE_PROJECT_ID || "").trim();
        const APPWRITE_API_KEY = (process.env.APPWRITE_API_KEY || "").trim();

        if (!APPWRITE_API_KEY) {
            return json(500, { error: "Missing APPWRITE_API_KEY env" });
        }

        const client = new Client()
            .setEndpoint(APPWRITE_ENDPOINT)
            .setProject(APPWRITE_PROJECT_ID)
            .setKey(APPWRITE_API_KEY);

        const users = new Users(client);
        await users.delete(userId);

        return json(200, {
            ok: true,
            deleted: true,
            userId,
            sm_api: smRes,
        });
    } catch (e) {
        return json(500, { error: "Unhandled server error", details: e?.message || String(e) });
    }
};
