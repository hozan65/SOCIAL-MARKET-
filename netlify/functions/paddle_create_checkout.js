// netlify/functions/paddle_create_checkout.js
// Creates Paddle transaction and returns checkout.url
// Requires ENV: PADDLE_ENV, PADDLE_API_KEY, PADDLE_PRICE_NORMAL_ID, PADDLE_PRICE_PRO_ID, PADDLE_SUCCESS_URL, PADDLE_CANCEL_URL

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

function getPaddleBaseUrl() {
    const env = String(process.env.PADDLE_ENV || "sandbox").toLowerCase();
    // Paddle uses different base URLs for sandbox vs live
    // Sandbox: https://sandbox-api.paddle.com
    // Live:    https://api.paddle.com
    return env === "live" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
}

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        const userId = String(event.headers["x-user-id"] || "").trim();
        if (!userId) return json(401, { error: "Missing x-user-id" });

        const body = event.body ? JSON.parse(event.body) : {};
        const plan = String(body.plan || "").toLowerCase().trim();
        if (!["normal", "pro"].includes(plan)) return json(400, { error: "Invalid plan" });

        const apiKey = process.env.PADDLE_API_KEY;
        const successUrl = process.env.PADDLE_SUCCESS_URL;
        const cancelUrl = process.env.PADDLE_CANCEL_URL;

        if (!apiKey) return json(500, { error: "Missing PADDLE_API_KEY" });
        if (!successUrl || !cancelUrl) return json(500, { error: "Missing PADDLE_SUCCESS_URL or PADDLE_CANCEL_URL" });

        const priceId =
            plan === "pro" ? process.env.PADDLE_PRICE_PRO_ID : process.env.PADDLE_PRICE_NORMAL_ID;

        if (!priceId) return json(500, { error: `Missing price env for ${plan}` });

        const baseUrl = getPaddleBaseUrl();

        // Create transaction (enable_checkout=true so Paddle returns checkout.url) :contentReference[oaicite:2]{index=2}
        const payload = {
            items: [{ price_id: priceId, quantity: 1 }],
            enable_checkout: true,
            checkout: {
                // If you omit url, Paddle uses default payment link domain
                // url: "https://pay.yourdomain.com",
            },
            custom_data: {
                user_id: userId,
                plan,
                app: "social_market",
            },
            // Optional: if you want to force redirect URLs at the payment link domain level,
            // Paddle typically controls success/cancel via your checkout settings/payment link.
            // Many teams just put success/cancel in their payment link configuration.
        };

        const res = await fetch(`${baseUrl}/transactions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            return json(400, { error: "paddle_error", details: data });
        }

        const checkoutUrl = data?.data?.checkout?.url;
        if (!checkoutUrl) {
            return json(500, { error: "Missing checkout.url from Paddle", data });
        }

        // We append redirect info ourselves (optional, if your payment link supports it you can use it)
        // Otherwise, keep it simple and just redirect to checkoutUrl
        return json(200, {
            ok: true,
            plan,
            checkout_url: checkoutUrl,
        });
    } catch (e) {
        console.error("paddle_create_checkout error:", e);
        return json(500, { error: e?.message || String(e) });
    }
};
