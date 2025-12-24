// netlify/functions/upsert_profile.js
import { createClient } from "@supabase/supabase-js";
import { verifyAppwriteUser } from "./_verify.js";

export default async (req) => {
    try {
        if (req.method !== "POST") {
            return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
        }

        // ✅ Appwrite JWT doğrula → userId al
        const { userId } = await verifyAppwriteUser(req);

        // ✅ Body al
        const body = await req.json();

        const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        const s = (v) => String(v ?? "").trim();
        const n = (v) => {
            const x = Number(v);
            return Number.isFinite(x) ? x : 0;
        };

        // ✅ Server "userId"yi kesin olarak yazar (client yollasa bile ezilir)
        const payload = {
            appwrite_user_id: userId,
            email: s(body.email),
            name: s(body.name),
            avatar_url: s(body.avatar_url),

            skills: s(body.skills),
            description: s(body.description),
            bio: s(body.bio),

            x: s(body.x),
            youtube: s(body.youtube),
            facebook: s(body.facebook),
            instagram: s(body.instagram),
            website: s(body.website),

            followers: n(body.followers),
            following: n(body.following),

            updated_at: new Date().toISOString(),
        };

        // ✅ Upsert (profiles.appwrite_user_id UNIQUE olmalı)
        const { error } = await sb
            .from("profiles")
            .upsert(payload, { onConflict: "appwrite_user_id" });

        if (error) throw error;

        return new Response(JSON.stringify({ ok: true }), {
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
