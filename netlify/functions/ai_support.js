// netlify/functions/ai_support.js
// ONLY AI SUPPORT BOT

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(statusCode, body) {
    return {
        statusCode,
        headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
        body: JSON.stringify(body),
    };
}

export const handler = async (event) => {
    if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    try {
        const apiKey = process.env.OPENAI_API_KEY_SUPPORT;
        if (!apiKey) {
            return json(500, { error: "Missing OPENAI_API_KEY_SUPPORT" });
        }

        const { message } = JSON.parse(event.body || "{}");
        if (!message || typeof message !== "string") {
            return json(400, { error: "Missing message" });
        }

        const systemPrompt = `
You are the official support assistant for Social Market.
Rules:
- Reply in the SAME language as the user.
- Be short, clear, and helpful.
- Guide users step by step.
- Never ask for passwords or private keys.
`.trim();

        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                temperature: 0.3,
                max_tokens: 400,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: message },
                ],
            }),
        });

        const data = await res.json();

        if (!res.ok) {
            console.error("OpenAI error:", data);
            return json(500, { error: "AI provider error" });
        }

        return json(200, {
            reply: data.choices?.[0]?.message?.content || "",
        });
    } catch (e) {
        console.error("ai_support error:", e);
        return json(500, { error: "Server error" });
    }
};
