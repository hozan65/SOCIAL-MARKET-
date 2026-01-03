// netlify/functions/ai_chat.js  (FULL - FIXED)
// ✅ Accepts: body.message OR body.text
// ✅ Returns: { allowed, plan, text } (unchanged from your design)
// ✅ Keeps: free daily msg limit logic
// ✅ Safer CORS headers
// ✅ If OpenAI fails -> 500 with message

import { sbAdmin } from "./supabase.js";

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

function extractOutputText(respJson) {
    if (typeof respJson?.output_text === "string" && respJson.output_text.trim()) {
        return respJson.output_text;
    }
    const out = respJson?.output;
    if (!Array.isArray(out)) return "";
    const chunks = [];
    for (const item of out) {
        const content = item?.content;
        if (!Array.isArray(content)) continue;
        for (const c of content) {
            if (c?.type === "output_text" && typeof c?.text === "string") chunks.push(c.text);
            if (c?.type === "text" && typeof c?.text === "string") chunks.push(c.text);
        }
    }
    return chunks.join("").trim();
}

async function openaiResponses({ input, model, max_output_tokens }) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("Missing OPENAI_API_KEY");

    const res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ model, input, max_output_tokens }),
    });

    const text = await res.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {}

    if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${text}`);
    return data;
}

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        const userId = String(event.headers["x-user-id"] || "").trim();
        if (!userId) return json(401, { error: "Missing x-user-id" });

        // ✅ tolerate missing/invalid body
        let body = {};
        try {
            body = event.body ? JSON.parse(event.body) : {};
        } catch {
            body = {};
        }

        // ✅ FIX: accept message OR text
        const userText = String(body.message || body.text || "").trim();
        if (!userText) return json(400, { error: "Missing message" });

        const model = process.env.OPENAI_MODEL || "gpt-5";
        const maxOut = toInt(process.env.OPENAI_MAX_OUTPUT_TOKENS, 700);
        const FREE_MSG_LIMIT = toInt(process.env.FREE_DAILY_MSG_LIMIT, 10);

        const sb = sbAdmin();

        // Ensure ai_user exists
        await sb.from("ai_users").upsert(
            { user_id: userId },
            { onConflict: "user_id", ignoreDuplicates: true }
        );

        // Plan check
        const profRes = await sb
            .from("ai_users")
            .select("plan, pro_active")
            .eq("user_id", userId)
            .maybeSingle();

        if (profRes.error) return json(500, { error: profRes.error.message });

        const plan = profRes.data?.plan || "free";
        const proActive = Boolean(profRes.data?.pro_active);

        // Free daily msg limit
        if (!(proActive || String(plan).startsWith("pro"))) {
            const day = todayISODateUTC();

            await sb
                .from("ai_usage_daily")
                .upsert({ user_id: userId, day }, { onConflict: "user_id,day", ignoreDuplicates: true });

            const usageRes = await sb
                .from("ai_usage_daily")
                .select("msg_count")
                .eq("user_id", userId)
                .eq("day", day)
                .single();

            if (usageRes.error) return json(500, { error: usageRes.error.message });

            const msgCount = toInt(usageRes.data?.msg_count, 0);

            if (msgCount + 1 > FREE_MSG_LIMIT) {
                return json(200, {
                    allowed: false,
                    reason: "msg_limit_reached",
                    plan: "free",
                    limit: { msg: FREE_MSG_LIMIT },
                    used: { msg: msgCount },
                    remaining: { msg: Math.max(0, FREE_MSG_LIMIT - msgCount) },
                });
            }

            const upd = await sb
                .from("ai_usage_daily")
                .update({ msg_count: msgCount + 1, updated_at: new Date().toISOString() })
                .eq("user_id", userId)
                .eq("day", day);

            if (upd.error) return json(500, { error: upd.error.message });
        }

        // OpenAI call
        const resp = await openaiResponses({
            model,
            max_output_tokens: maxOut,
            input: [{ role: "user", content: [{ type: "input_text", text: userText }] }],
        });

        const answer = extractOutputText(resp);

        return json(200, {
            allowed: true,
            plan: proActive ? plan : "free",
            text: answer || "",
            usage: resp?.usage || null,
            response_id: resp?.id || null,
        });
    } catch (e) {
        console.error("ai_chat error:", e);
        return json(500, { error: e?.message || String(e) });
    }
};
