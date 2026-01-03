import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,x-user-id",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const json = (statusCode, body) => ({
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body),
});

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });

        const uid = (event.headers["x-user-id"] || event.headers["X-User-Id"] || "").trim();
        if (!uid) return json(401, { error: "missing_uid" });

        const body = JSON.parse(event.body || "{}");
        const sid = (body.session_id || "").trim();
        const text = (body.text || "").trim();

        if (!sid) return json(400, { error: "missing_session_id" });
        if (!text) return json(400, { error: "missing_text" });

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
            return json(500, { error: "missing_supabase_env" });
        }
        if (!OPENAI_API_KEY) {
            return json(500, { error: "missing_openai_key" });
        }

        const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

        // 1) save user message
        const insUser = await sb.from("ai_messages").insert({
            sid,
            user_id: uid,
            role: "user",
            content: text,
        });
        if (insUser.error) return json(500, { error: "db_insert_user_failed", details: insUser.error });

        // 2) recent context
        const { data: history, error: selErr } = await sb
            .from("ai_messages")
            .select("role, content")
            .eq("user_id", uid)
            .eq("sid", sid)
            .order("created_at", { ascending: true })
            .limit(20);

        if (selErr) return json(500, { error: "db_select_failed", details: selErr });

        const input = [
            {
                role: "system",
                content:
                    "You are Social Market AI. Reply in the user's language (mostly Turkish). Be helpful and concise. Avoid guaranteeing profits.",
            },
            ...(history || []).map((m) => ({
                role: m.role === "assistant" ? "assistant" : "user",
                content: m.content || "",
            })),
        ];

        // 3) OpenAI
        const r = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${OPENAI_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: OPENAI_MODEL,
                input,
                max_output_tokens: 700,
            }),
        });

        const raw = await r.text();
        let out = {};
        try { out = JSON.parse(raw); } catch {}

        if (!r.ok) {
            console.log("OpenAI error:", raw);
            return json(500, { error: "openai_error", status: r.status, details: out });
        }

        const reply =
            out.output_text ||
            out?.output?.[0]?.content?.[0]?.text ||
            "Üzgünüm, cevap üretemedim.";

        // 4) save assistant
        const insAI = await sb.from("ai_messages").insert({
            sid,
            user_id: uid,
            role: "assistant",
            content: reply,
        });
        if (insAI.error) return json(500, { error: "db_insert_ai_failed", details: insAI.error });

        return json(200, { ok: true, reply });
    } catch (e) {
        console.log("ai_send_message server_error:", e);
        return json(500, { error: "server_error", message: e.message });
    }
};
