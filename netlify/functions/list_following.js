import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function pickId(row, keys) {
    for (const k of keys) {
        const v = row?.[k];
        if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
}

export const handler = async (event) => {
    try {
        const uid = String(event.queryStringParameters?.id || "").trim();
        if (!uid) return json(400, { error: "Missing id" });

        // ✅ select("*") => kolon adı ne olursa olsun satır gelir
        const { data: rel, error: e1 } = await sb
            .from("follows")
            .select("*")
            .eq("follower_uid", uid)
            .order("created_at", { ascending: false })
            .limit(200);

        if (e1) return json(500, { error: e1.message });

        // ✅ following uid'yi farklı kolon adlarından yakala
        const ids = (rel || [])
            .map(r => pickId(r, ["following_uid", "following_id", "following_user_id", "following", "to_uid", "to_id"]))
            .filter(Boolean);

        if (!ids.length) return json(200, { list: [] });

        const { data: profs, error: e2 } = await sb
            .from("profiles")
            .select("appwrite_user_id, name, avatar_url")
            .in("appwrite_user_id", ids);

        if (e2) return json(500, { error: e2.message });

        const map = new Map((profs || []).map(p => [p.appwrite_user_id, p]));

        // ✅ profile yoksa bile listede göster
        const list = ids.map(id => {
            const p = map.get(id);
            return { id, name: p?.name || "User", avatar_url: p?.avatar_url || null };
        });

        return json(200, { list });
    } catch (e) {
        return json(500, { error: String(e?.message || e) });
    }
};

function json(statusCode, body) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store",
        },
        body: JSON.stringify(body),
    };
}
