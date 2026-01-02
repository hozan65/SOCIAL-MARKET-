// netlify/functions/paddle_create_checkout.js
// Creates a Paddle transaction and returns checkout_url for redirect.
//
// ENV required:
// - PADDLE_API_KEY
// - PADDLE_ENV = sandbox | live
// - PADDLE_PRICE_ID_BASIC   ($10/mo)
// - PADDLE_PRICE_ID_PLUS    ($20/mo)
// - SITE_URL (optional, for future redirects / metadata)

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

function paddleBaseUrl() {
    const env = (process.env.PADDLE_ENV || "sandbox").toLowerCase();
    return env === "live" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
}

async function paddleFetch(path, { method = "GET", body } = {}) {
    const apiKey = process.env.PADDLE_API_KEY;
    if (!apiKey) throw new Error("Missing PADDLE_API_KEY");

    const res = await fetch(`${paddleBaseUrl()}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        // ignore
    }

    if (!res.ok) {
        throw new Error(`Paddle API ${res.status}: ${text}`);
    }
    return data;
}

/**
 * POST body:
 *   { "plan": "basic" | "plus" }
 *
 * Auth:
 *   For now: header "x-user-id" is required.
 *   (Later we will replace this with Appwrite/Supabase auth verification)
 */
export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        // ✅ TEMP AUTH (replace with real auth later)
        const userId = String(event.headers["x-user-id"] || "").trim();
        if (!userId) {
            return json(401, { error: "Missing x-user-id (wire this to real auth)" });
        }

        const body = JSON.parse(event.body || "{}");
        const plan = String(body.plan || "").toLowerCase();

        // Choose price id by plan
        const priceBasic = process.env.PADDLE_PRICE_ID_BASIC;
        const pricePlus = process.env.PADDLE_PRICE_ID_PLUS;

        if (!priceBasic) return json(500, { error: "Missing PADDLE_PRICE_ID_BASIC" });
        if (!pricePlus) return json(500, { error: "Missing PADDLE_PRICE_ID_PLUS" });

        let priceId = null;
        if (plan === "basic") priceId = priceBasic;
        if (plan === "plus") priceId = pricePlus;

        if (!priceId) {
            return json(400, { error: "Invalid plan. Use: basic | plus" });
        }

        // Optional: pass your own metadata to Paddle
        const site = process.env.SITE_URL || "";
        const customData = {
            app_user_id: userId,
            plan,
            site,
        };

        // Create transaction (Paddle returns checkout.url)
        const created = await paddleFetch("/transactions", {
            method: "POST",
            body: {
                items: [{ price_id: priceId, quantity: 1 }],
                collection_mode: "automatic",
                custom_data: customData,
            },
        });

        const checkoutUrl = created?.data?.checkout?.url || null;
        const transactionId = created?.data?.id || null;

        if (!checkoutUrl) {
            return json(500, {
                error: "No checkout.url returned from Paddle",
                debug: created,
            });
        }

        return json(200, {
            checkout_url: checkoutUrl,
            transaction_id: transactionId,
            plan,
        });
    } catch (e) {
        return json(500, { error: e?.message || String(e) });
    }
};
