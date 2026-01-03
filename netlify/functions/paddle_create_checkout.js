// netlify/functions/paddle_create_checkout.js
// Paddle transaction -> returns { url } for redirect
// ENV required:
// PADDLE_ENV=sandbox|live
// PADDLE_API_KEY
// PADDLE_PRICE_NORMAL
// PADDLE_PRICE_PRO
// PADDLE_SUCCESS_URL
// PADDLE_CANCEL_URL

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, x-user-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(statusCode, obj) {
    return {
        statusCode,
        headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
        body: JSON.stringify(obj),
    };
}

function paddleBaseUrl() {
    const env = String(process.env.PADDLE_ENV || "sandbox").toLowerCase();
    return env === "live" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
}

export async function handler(event) {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        const userId = String(event.headers["x-user-id"] || "").trim();
        if (!userId) return json(401, { error: "Missing x-user-id" });

        let body = {};
        try { body = event.body ? JSON.parse(event.body) : {}; } catch {}

        const plan = String(body.plan || "").toLowerCase().trim();
        if (plan !== "normal" && plan !== "pro") return json(400, { error: "Invalid plan" });

        const apiKey = process.env.PADDLE_API_KEY;
        const priceNormal = process.env.PADDLE_PRICE_NORMAL;
        const pricePro = process.env.PADDLE_PRICE_PRO;
        const successUrl = process.env.PADDLE_SUCCESS_URL;
        const cancelUrl = process.env.PADDLE_CANCEL_URL;

        // ✅ hard env checks (these were causing your 500)
        if (!apiKey) return json(500, { error: "Missing PADDLE_API_KEY" });
        if (!priceNormal) return json(500, { error: "Missing PADDLE_PRICE_NORMAL" });
        if (!pricePro) return json(500, { error: "Missing PADDLE_PRICE_PRO" });
        if (!successUrl) return json(500, { error: "Missing PADDLE_SUCCESS_URL" });
        if (!cancelUrl) return json(500, { error: "Missing PADDLE_CANCEL_URL" });

        const priceId = plan === "pro" ? pricePro : priceNormal;

        const payload = {
            items: [{ price_id: priceId, quantity: 1 }],
            // ✅ checkout mode
            checkout: {
                success_url: successUrl,
                cancel_url: cancelUrl,
            },
            enable_checkout: true,
            custom_data: {
                user_id: userId,
                plan,
                app: "social_market",
            },
        };

        const base = paddleBaseUrl();
        const res = await fetch(`${base}/transactions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
        });

        const text = await res.text();
        let data = {};
        try { data = JSON.parse(text); } catch { data = { raw: text }; }

        if (!res.ok) {
            // ✅ Return Paddle error to browser so we see WHY (400/401 etc.)
            return json(400, {
                error: "paddle_error",
                status: res.status,
                details: data,
            });
        }

        const url = data?.data?.checkout?.url;
        if (!url) {
            return json(500, { error: "Missing checkout.url from Paddle", details: data });
        }

        return json(200, { ok: true, plan, url });
    } catch (e) {
        console.error("paddle_create_checkout error:", e);
        return json(500, { error: e?.message || String(e) });
    }
}
