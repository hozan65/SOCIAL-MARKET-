// netlify/functions/is_following.js
import { createClient } from "@supabase/supabase-js";
import { getAppwriteUser } from "./_appwrite_user.js";

const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
    if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

    const { user } = await getAppwriteUser(event);
    const myUid = user.$id;

    const target = String(event.queryStringParameters?.id || "").trim();
    if (!target) return json(400, { error: "Missing id" });

    const { data, error } = await sb
        .from("follows")
        .select("id")
        .eq("follower_uid", myUid)
        .eq("following_uid", target)
        .maybeSingle();

    if (error) return json(500, { error: error.message });

    return json(200, { ok: true, is_following: !!data?.id });
  } catch (e) {
    const msg = String(e?.message || e);
    const status = msg.toLowerCase().includes("jwt") ? 401 : 502;
    return json(status, { error: msg });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Appwrite-JWT",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}
