// netlify/functions/ai_image.js
// Image endpoint: checks plan/limits, increments image usage, calls OpenAI Images API.
//
// Required ENV:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - OPENAI_API_KEY
//
// Optional ENV:
// - OPENAI_IMAGE_MODEL (default: "gpt-image-1")
// - FREE_DAILY_IMG_LIMIT (default: 1)

import { sbAdmin } from "./_supabase.js";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, x-user-id, authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(statusCode, obj) {
    return {
        statusCode,
        headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
        body: JSON.stringify(obj),
    };
}

function toInt(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function todayISODateUTC() {
    const d = new Date();
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

async function openaiImage({ prompt, model }) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("Missing OPENAI_API_KEY");

    // OpenAI Images API
    const res = await fetch("https://api.openai.com/v1/images", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
            model,
            prompt,
            size: "1024x1024",
        }),
    });

    const text = await res.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {}

    if (!res.ok) {
        throw new Error(`OpenAI API ${res.status}: ${text}`);
    }

    // Expect: { data: [{ b64_json: "..." }] }
    const b64 = data?.data?.[0]?.b64_json || null;
    return { b64, raw: data };
}

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        // TEMP AUTH: replace later with Appwrite/Supabase auth verification
        const userId = String(event.headers["x-user-id"] || "").trim();
        if (!userId) return json(401, { error: "Missing x-user-id (wire this to real auth)" });

        const body = JSON.parse(event.body || "{}");
        const prompt = String(body.prompt || "").trim();
        if (!prompt) return json(400, { error: "Missing prompt" });

        const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
        const FREE_IMG_LIMIT = toInt(process.env.FREE_DAILY_IMG_LIMIT, 1);

        const sb = sbAdmin();

        // 1) profile check
        const profRes = await sb
            .from("profiles")
            .select("plan, pro_active")
            .eq("id", userId)
            .maybeSingle();

        if (profRes.error) return json(500, { error: profRes.error.message });

        const plan = profRes.data?.plan || "free";
        const proActive = Boolean(profRes.data?.pro_active);

        // 2) limits (only for free)
        if (!(proActive || String(plan).startsWith("pro"))) {
            const day = todayISODateUTC();

            await sb
                .from("usage_daily")
                .upsert({ user_id: userId, day }, { onConflict: "user_id,day", ignoreDuplicates: true });

            const usageRes = await sb
                .from("usage_daily")
                .select("img_count")
                .eq("user_id", userId)
                .eq("day", day)
                .single();

            if (usageRes.error) return json(500, { error: usageRes.error.message });

            const imgCount = toInt(usageRes.data?.img_count, 0);
            if (imgCount + 1 > FREE_IMG_LIMIT) {
                return json(200, {
                    allowed: false,
                    reason: "img_limit_reached",
                    plan: "free",
                    limit: { img: FREE_IMG_LIMIT },
                    used: { img: imgCount },
                    remaining: { img: Math.max(0, FREE_IMG_LIMIT - imgCount) },
                });
            }

            const upd = await sb
                .from("usage_daily")
                .update({ img_count: imgCount + 1, updated_at: new Date().toISOString() })
                .eq("user_id", userId)
                .eq("day", day);

            if (upd.error) return json(500, { error: upd.error.message });
        }

        // 3) call OpenAI images
        const { b64, raw } = await openaiImage({ prompt, model });

        if (!b64) {
            return json(200, { allowed: true, b64: null, note: "No b64_json in response", raw });
        }

        return json(200, {
            allowed: true,
            plan: proActive ? plan : "free",
            b64, // frontend: "data:image/png;base64," + b64
        });
    } catch (e) {
        console.error("ai_image error:", e);
        return json(500, { error: e?.message || String(e) });
    }
};
