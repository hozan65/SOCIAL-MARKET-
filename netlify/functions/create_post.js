import { createClient } from "@supabase/supabase-js";
import { verifyAppwriteUser } from "./_verify.js";

export default async (req) => {
    try {
        if (req.method !== "POST") {
            return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
        }

        const { userId } = await verifyAppwriteUser(req);
        const body = await req.json();

        const market = String(body.market || "").trim();
        const timeframe = String(body.timeframe || "").trim();
        const category = String(body.category || "Trend").trim();
        const content = String(body.content || "").trim();
        const pairs = Array.isArray(body.pairs) ? body.pairs.map(x => String(x).trim()).filter(Boolean) : [];
        const image_path = String(body.image_path || "").trim();

        if (!market || !timeframe || !content || !pairs.length || !image_path) {
            return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400 });
        }

        const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        const payload = {
            author_id: userId,     // ✅ Appwrite id (TEXT)
            market,
            category,
            timeframe,
            content,
            pairs,
            image_path,
            created_at: new Date().toISOString(),
        };

        const { data, error } = await sb.from("analyses").insert(payload).select("id").single();
        if (error) throw error;

        return new Response(JSON.stringify({ ok: true, id: data?.id }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: e?.message || "unknown" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }
};
