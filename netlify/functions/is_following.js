// netlify/functions/is_following.js
// ✅ FINAL - Appwrite JWT verify + sm-api check (NO Supabase)

import { getAppwriteUser } from "./_appwrite_user.js";

const SM_API_BASE_URL = (process.env.SM_API_BASE_URL || "").trim();
const SM_API_TIMEOUT_MS = Number(process.env.SM_API_TIMEOUT_MS || "6500") || 6500;

export const handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
    if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

    if (!SM_API_BASE_URL) return json(500, { error: "Missing SM_API_BASE_URL env" });

    const { user } = await getAppwriteUser(event);
    if (!user?.$id) return json(401, { error: "Unauthorized" });
    const myUid = String(user.$id).trim();

    const target = String(event.queryStringParameters?.id || "").trim();
    if (!target) return json(400, { error: "Missing id" });

    // kendi kendini follow false
    if (target === myUid) return json(200, { ok: true, is_following: false });

    const out = await smGet(`/api/follow/is-following?target=${encodeURIComponent(target)}`, myUid);

    const is_following = !!(out?.is_following ?? out?.following ?? false);

    return json(200, { ok: true, is_following });
  } catch (e) {
    const msg = String(e?.message || e);
    const low = msg.toLowerCase();
    const status =
        low.includes("jwt") || low.includes("unauthorized") || low.includes("invalid") ? 401 : 500;
    return json(status, { error: msg });
  }
};

async function smGet(path, myUid) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), SM_API_TIMEOUT_MS);

  try {
    const r = await fetch(`${SM_API_BASE_URL}${path}`, {
      method: "GET",
      headers: {
        "X-User-Id": String(myUid || "").trim(),
      },
      signal: ctrl.signal,
    });

    const txt = await r.text().catch(() => "");
    let j = {};
    try { j = txt ? JSON.parse(txt) : {}; } catch { j = { raw: txt }; }

    if (!r.ok) throw new Error(j?.error || j?.message || `sm-api GET ${path} failed (${r.status})`);
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
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}
