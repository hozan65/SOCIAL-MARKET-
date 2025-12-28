// netlify/functions/ensure_profile.js
import { createClient } from "@supabase/supabase-js";
import { getAppwriteUser } from "./_appwrite_user.js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        const { user } = await getAppwriteUser(event);
        const uid = user.$id;

        // ✅ Appwrite name (register’da artık fullName gelecek)
        const appwriteName = String(user.name || "").trim();
        const name = appwriteName || "User";

        // 1) profil var mı? (name de çekiyoruz)
        const { data: existing, error: e1 } = await sb
            .from("profiles")
            .select("appwrite_user_id, name")
            .eq("appwrite_user_id", uid)
            .maybeSingle();

        if (e1) return json(500, { error: e1.message });

        // 2) varsa: name boş / User ise, Appwrite name ile güncelle
        if (existing?.appwrite_user_id) {
            const currentName = String(existing?.name || "").trim();
            const needsNameFix = !currentName || currentName.toLowerCase() === "user";

            // ✅ sadece gerçek isim varsa güncelle (boşsa dokunma)
            if (needsNameFix && appwriteName) {
                const { error: ue } = await sb
                    .from("profiles")
                    .update({ name: appwriteName })
                    .eq("appwrite_user_id", uid);

                if (ue) return json(500, { error: ue.message });
            }

            return json(200, { ok: true });
        }

        // 3) yoksa insert (duplicate olursa OK say)
        const { error: e2 } = await sb.from("profiles").insert([{
            appwrite_user_id: uid,
            name,
            bio: null,
            website: null,
            avatar_url: null
        }]);

        if (e2) {
            // duplicate -> ok
            if (e2.code === "23505") return json(200, { ok: true });
            const msg = String(e2.message || "");
            if (msg.toLowerCase().includes("duplicate")) return json(200, { ok: true });
            return json(500, { error: e2.message });
        }

        return json(200, { ok: true });
    } catch (e) {
        const msg = String(e?.message || e);
        return json(msg.includes("JWT") ? 401 : 500, { error: msg });
    }
};

function json(statusCode, body) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Appwrite-JWT",
            "Access-Control-Allow-Methods": "POST, OPTIONS"
        },
        body: JSON.stringify(body)
    };
}
