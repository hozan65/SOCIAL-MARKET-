// netlify/functions/ai_chat.js
// ✅ Supabase removed
// ✅ This endpoint is disabled in production (SocialMarket now uses sm-api + Postgres)

export async function handler(event) {
    // CORS
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Content-Type": "application/json; charset=utf-8",
    };

    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers, body: "ok" };
    }

    return {
        statusCode: 410,
        headers,
        body: JSON.stringify({
            ok: false,
            error: "ai_chat is disabled. Use sm-api endpoints (Postgres) instead.",
        }),
    };
}
