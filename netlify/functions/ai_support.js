// netlify/functions/ai_support.js
// ✅ Support only
// ✅ Multi-language: replies in same language as user
// ✅ Needs OPENAI_API_KEY in Netlify environment variables

export async function handler(event) {
    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers: cors(event), body: "ok" };
    }
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, headers: cors(event), body: JSON.stringify({ error: "Method not allowed" }) };
    }

    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return { statusCode: 500, headers: cors(event), body: JSON.stringify({ error: "Missing OPENAI_API_KEY env" }) };
        }

        const { message } = JSON.parse(event.body || "{}");
        if (!message || typeof message !== "string") {
            return { statusCode: 400, headers: cors(event), body: JSON.stringify({ error: "Missing message" }) };
        }

        // Support prompt (siteine göre edit edebilirsin)
        const system = `
You are the official customer support assistant for "Social Market".
Your job: help users use the website, explain features, and guide troubleshooting step-by-step.

Rules:
- Always reply in the SAME language as the user's last message.
- Be concise and practical.
- If you need more info, ask: which page, what they clicked, and what error they see.
- Never request passwords or secret keys.
`.trim();

        const payload = {
            model: "gpt-4o-mini",
            temperature: 0.3,
            max_tokens: 450, // ✅ support kısa kalsın (maliyet düşük)
            messages: [
                { role: "system", content: system },
                { role: "user", content: message }
            ]
        };

        const r = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const data = await r.json().catch(() => ({}));

        if (!r.ok) {
            console.error("OpenAI error:", r.status, data);
            return { statusCode: 500, headers: cors(event), body: JSON.stringify({ error: "AI provider error" }) };
        }

        const reply = data?.choices?.[0]?.message?.content?.trim() || "No reply.";
        return { statusCode: 200, headers: cors(event), body: JSON.stringify({ reply }) };

    } catch (e) {
        console.error("ai_support crash:", e);
        return { statusCode: 500, headers: cors(event), body: JSON.stringify({ error: "Server error" }) };
    }
}

function cors(event) {
    const origin = event.headers?.origin || "*";
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json; charset=utf-8"
    };
}
