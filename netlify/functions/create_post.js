// netlify/functions/create_post.js
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async (event) => {
    try {
        if (event.httpMethod !== "POST") {
            return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
        }

        if (!SUPABASE_URL || !SERVICE_KEY) {
            return { statusCode: 500, body: JSON.stringify({ error: "Missing Supabase env" }) };
        }

        const auth = event.headers.authorization || event.headers.Authorization || "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
        if (!token) return { statusCode: 401, body: JSON.stringify({ error: "Missing JWT" }) };

        // ✅ JWT doğrulama: senin projede zaten var
        // Not: _auth_user.js'nin export'una göre import yolu çalışmalı
        const { requireUser } = require("./_auth_user");
        const user = await requireUser(token); // { uid, email } gibi dönmeli

        const body = JSON.parse(event.body || "{}");

        const market = String(body.market || "").trim();
        const timeframe = String(body.timeframe || "").trim();
        const pair = String(body.pair || "").trim();
        const content = String(body.content || "").trim();
        const image_path = body.image_path ? String(body.image_path) : null;

        // FEED.js senin tablonda pairs bekliyor:
        // burada pair'i pairs olarak da yazalım
        const pairs = pair;

        if (!market || !timeframe || !content) {
            return { statusCode: 400, body: JSON.stringify({ error: "Missing fields" }) };
        }

        const sb = createClient(SUPABASE_URL, SERVICE_KEY);

        const { data, error } = await sb
            .from("analyses")
            .insert([{
                author_id: user.uid,     // ✅ Appwrite UID
                market,
                category: body.category ? String(body.category) : null, // varsa
                timeframe,
                pairs,
                content,
                image_path
            }])
            .select("id")
            .single();

        if (error) throw error;

        return { statusCode: 200, body: JSON.stringify({ ok: true, id: data.id }) };
    } catch (e) {
        console.error("create_post error:", e);
        return { statusCode: 500, body: JSON.stringify({ error: e.message || "Server error" }) };
    }
};
