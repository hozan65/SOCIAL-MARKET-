// netlify/functions/get_profile.js
// ✅ Supabase REMOVED
// ✅ Cache-friendly GET
// ✅ If ?id missing -> infer uid from JWT (like before)
// ✅ Response shape preserved for frontend

import { getAppwriteUser } from "./_appwrite_user.js";

const SM_API_BASE_URL = (process.env.SM_API_BASE_URL || "").trim();
const SM_API_TIMEOUT_MS = Number(process.env.SM_API_TIMEOUT_MS || "6500") || 6500;

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

        if (!SM_API_BASE_URL) return json(500, { error: "Missing SM_API_BASE_URL env" });

        // target uid (profile to fetch)
        let uid = String(event.queryStringParameters?.id || "").trim();

        // ✅ if id missing -> use JWT user (me)
        let meUid = "";
        if (!uid) {
            const { user } = await getAppwriteUser(event).catch(() => ({ user: null }));
            uid = user?.$id ? String(user.$id) : "";
            meUid = uid;
        } else {
            // if id provided, still try to parse me (optional)
            const { user } = await getAppwriteUser(event).catch(() => ({ user: null }));
            meUid = user?.$id ? String(user.$id) : "";
        }

        if (!uid) return json(401, { error: "Missing id" });

        // ✅ sm-api GET
        const out = await smGet(`/api/profile/get?id=${encodeURIComponent(uid)}`, {
            meUid,
        });

        // normalize to old shape (in case sm-api uses different fields)
        const p = out?.profile || out?.data?.profile || out?.data || out || {};
        const counts = out?.counts || out?.data?.counts || {};
        const posts = out?.posts || out?.data?.posts || [];

        // links format for frontend
        const website = p.website || p.link1 || "";
        const links = [];
        if (website) links.push({ url: String(website), label: "" });

        const profile = {
            id: p.id || p.user_id || p.appwrite_user_id || uid,
            name: p.name || p.username || "User",
            bio: p.bio || "",
            website: website || "",
            avatar_url: p.avatar_url || "",
            links,
            created_at: p.created_at || "",
        };

        return json(200, {
            profile,
            counts: {
                followers: Number(counts.followers ?? 0) || 0,
                following: Number(counts.following ?? 0) || 0,
                posts: Number(counts.posts ?? 0) || 0,
            },
            posts: Array.isArray(posts) ? posts : [],
            is_following: !!(out?.is_following ?? out?.data?.is_following ?? false),
        });
    } catch (e) {
        return json(500, { error: String(e?.message || e) });
    }
};

async function smGet(path, { meUid } = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), SM_API_TIMEOUT_MS);

    try {
        const headers = {};
        if (meUid) headers["X-User-Id"] = String(meUid).trim();

        const r = await fetch(`${SM_API_BASE_URL}${path}`, {
            method: "GET",
            headers,
            signal: ctrl.signal,
        });

        const txt = await r.text().catch(() => "");
        let j = {};
        try { j = txt ? JSON.parse(txt) : {}; } catch { j = { raw: txt }; }

        if (!r.ok) {
            const msg = j?.error || j?.message || `sm-api GET ${path} failed (${r.status})`;
            // pass 404 through if sm-api returns it
            const status = r.status || 500;
            throw Object.assign(new Error(msg), { statusCode: status, payload: j });
        }
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
            "Access-Control-Allow-Headers": "content-type, authorization, X-Appwrite-JWT, x-jwt, X-User-Id",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
        body: JSON.stringify(body),
    };
}
