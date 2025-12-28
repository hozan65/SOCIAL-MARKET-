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
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    // ✅ JWT -> Appwrite user
    const { user } = await getAppwriteUser(event);
    const myUid = user.$id;

    // body
    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }

    const following_uid = String(body.following_uid || body.following_id || "").trim();
    if (!following_uid) return json(400, { error: "Missing following_uid" });
    if (following_uid === myUid) return json(400, { error: "Cannot follow yourself" });

    // ✅ FK için profiles satırı garanti (var olanı ezmez)
    await ensureProfileRow(myUid, user.name || "User");
    await ensureProfileRow(following_uid, "User");

    // mevcut follow var mı?
    const { data: existing, error: e1 } = await sb
        .from("follows")
        .select("id")
        .eq("follower_uid", myUid)
        .eq("following_uid", following_uid)
        .maybeSingle();

    if (e1) return json(500, { error: e1.message });

    // toggle
    if (existing?.id) {
      const { error: delErr } = await sb.from("follows").delete().eq("id", existing.id);
      if (delErr) return json(500, { error: delErr.message });
      return json(200, { ok: true, following: false });
    } else {
      const { error: insErr } = await sb
          .from("follows")
          .insert([{ follower_uid: myUid, following_uid }]);

      if (insErr) return json(500, { error: insErr.message });
      return json(200, { ok: true, following: true });
    }
  } catch (e) {
    const msg = String(e?.message || e);
    const status = msg.toLowerCase().includes("jwt") ? 401 : 500;
    return json(status, { error: msg });
  }
};

async function ensureProfileRow(uid, name) {
  // ✅ varsa dokunmaz, yoksa oluşturur
  const { error } = await sb
      .from("profiles")
      .upsert(
          [{ appwrite_user_id: uid, name: name || "User" }],
          { onConflict: "appwrite_user_id" }
      );

  // upsert bazen update yapabilir; ama name="User" yazmak istemiyorsan:
  // burada sadece insert istiyorsan ayrıca "select then insert" yöntemi kullanırız.
  if (error) throw error;
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Appwrite-JWT",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    },
    body: JSON.stringify(body),
  };
}
