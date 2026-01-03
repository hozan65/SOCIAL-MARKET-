// netlify/functions/ai_support.js
// ✅ AI SUPPORT ONLY
// ✅ Same-language replies
// ✅ No 400 spam (empty message safe)
// ✅ Uses OpenAI Chat Completions
// ENV REQUIRED:
// - OPENAI_API_KEY
// OPTIONAL:
// - OPENAI_SUPPORT_MODEL (default: gpt-4o-mini)

export async function handler(event) {
    if (event.httpMethod === "OPTIONS") {
        return {
            statusCode: 200,
            headers: cors(event),
            body: "ok",
        };
    }

    if (event.httpMethod !== "POST") {
        return {
            statusCode: 405,
            headers: cors(event),
            body: JSON.stringify({ error: "Method not allowed" }),
        };
    }

    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return {
                statusCode: 500,
                headers: cors(event),
                body: JSON.stringify({ error: "Missing OPENAI_API_KEY" }),
            };
        }

        const body = JSON.parse(event.body || "{}");
        const message =
            typeof body.message === "string" ? body.message.trim() : "";

        // ✅ IMPORTANT: empty / welcome / auto messages → silently ignore
        if (!message) {
            return {
                statusCode: 200,
                headers: cors(event),
                body: JSON.stringify({ reply: "", skipped: true }),
            };
        }

        const systemPrompt = `
You are the official customer support assistant for "Social Market".

Your job:
- Help users use the website
- Explain features clearly
- Guide troubleshooting step-by-step

Rules:
- Always reply in the SAME language as the user's message
- Be concise, practical, and friendly
- Ask clarifying questions if needed (which page, what action, what error)
- NEVER request passwords, private keys, or sensitive data
`.trim();

        const payload = {
            model: process.env.OPENAI_SUPPORT_MODEL || "gpt-4o-mini",
            temperature: 0.3,
            max_tokens: 450,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: message },
            ],
        };

        const r = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        const data = await r.json().catch(() => ({}));

        if (!r.ok) {
            console.error("OpenAI support error:", r.status, data);
            return {
                statusCode: 500,
                headers: cors(event),
                body: JSON.stringify({ error: "AI provider error" }),
            };
        }

        const reply =
            data?.choices?.[0]?.message?.content?.trim() || "";

        return {
            statusCode: 200,
            headers: cors(event),
            body: JSON.stringify({ reply }),
        };
    } catch (e) {
        console.error("ai_support crash:", e);
        return {
            statusCode: 500,
            headers: cors(event),
            body: JSON.stringify({ error: "Server error" }),
        };
    }
}

function cors(event) {
    const origin = event.headers?.origin || "*";
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers":
            "Content-Type, Authorization, x-user-id",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json; charset=utf-8",
    };
}
