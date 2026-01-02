// netlify/functions/paddle_webhook.js
// Receives Paddle webhooks, verifies signature, updates Supabase profile.
//
// ENV required:
// - PADDLE_WEBHOOK_SECRET
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - PADDLE_PRICE_ID_BASIC
// - PADDLE_PRICE_ID_PLUS
//
// DB required (recommended):
// - profiles: columns: id, plan, pro_active, pro_until, paddle_customer_id, paddle_subscription_id
// - paddle_events: event_id primary key (for idempotency)

import crypto from "crypto";
import { sbAdmin } from "./supabase.js";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, paddle-signature",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(statusCode, obj) {
    return {
        statusCode,
        headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
        body: JSON.stringify(obj),
    };
}

function getHeader(event, name) {
    const h = event.headers || {};
    const lower = name.toLowerCase();
    return h[name] || h[lower] || h[name.toUpperCase()] || h[Object.keys(h).find(k => k.toLowerCase() === lower)];
}

/**
 * Paddle signature verify
 * Header format: "ts=...;h1=..." (or similar)
 * Expected HMAC_SHA256(secret, `${ts}:${rawBody}`) == h1
 */
function verifyPaddleSignature(signatureHeader, rawBody, secret) {
    if (!signatureHeader) return false;

    const parts = String(signatureHeader)
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);

    const map = {};
    for (const p of parts) {
        const [k, v] = p.split("=");
        if (k && v) map[k] = v;
    }

    const ts = map.ts;
    const h1 = map.h1;
    if (!ts || !h1) return false;

    const signedPayload = `${ts}:${rawBody}`;

    const expected = crypto
        .createHmac("sha256", secret)
        .update(signedPayload, "utf8")
        .digest("hex");

    try {
        return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(h1, "hex"));
    } catch {
        return false;
    }
}

function normalizePlanFromPriceId(priceId) {
    const basic = process.env.PADDLE_PRICE_ID_BASIC;
    const plus = process.env.PADDLE_PRICE_ID_PLUS;

    if (priceId && basic && priceId === basic) return "pro_basic";
    if (priceId && plus && priceId === plus) return "pro_plus";

    // Unknown price -> treat as pro (or free). Safer: mark active but plan "pro".
    return "pro";
}

/**
 * Try extract your app_user_id from Paddle payload custom_data
 */
function extractAppUserId(payload) {
    // Most common: payload.data.custom_data.app_user_id
    const d = payload?.data;
    const candidates = [
        d?.custom_data?.app_user_id,
        d?.transaction?.custom_data?.app_user_id,
        d?.subscription?.custom_data?.app_user_id,
        d?.checkout?.custom_data?.app_user_id,
    ];
    return candidates.find(Boolean) || null;
}

/**
 * Extract price_id from subscription payload (best effort, Paddle payloads can vary by event)
 */
function extractPriceIdFromSubscription(data) {
    // common shapes:
    // data.items[0].price.id
    // data.items[0].price_id
    // data.recurring_transaction_details.items[0].price_id
    const cands = [
        data?.items?.[0]?.price?.id,
        data?.items?.[0]?.price_id,
        data?.items?.[0]?.price?.price_id,
        data?.recurring_transaction_details?.items?.[0]?.price_id,
        data?.recurring_transaction_details?.items?.[0]?.price?.id,
    ];
    return cands.find(Boolean) || null;
}

/**
 * Convert Paddle subscription status to pro_active boolean
 */
function isProActiveFromStatus(status) {
    const s = String(status || "").toLowerCase();
    return s === "active" || s === "trialing";
}

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        const secret = process.env.PADDLE_WEBHOOK_SECRET;
        if (!secret) return json(500, { error: "Missing PADDLE_WEBHOOK_SECRET" });

        // Netlify sometimes base64 encodes body
        const rawBody = event.isBase64Encoded
            ? Buffer.from(event.body || "", "base64").toString("utf8")
            : (event.body || "");

        const sig = getHeader(event, "Paddle-Signature");
        if (!sig) return json(401, { error: "Missing Paddle-Signature header" });

        if (!verifyPaddleSignature(sig, rawBody, secret)) {
            return json(401, { error: "Invalid webhook signature" });
        }

        const payload = JSON.parse(rawBody);

        const event_id = payload?.event_id || payload?.id || null;
        const event_type = payload?.event_type || payload?.type || null;
        const occurred_at = payload?.occurred_at || payload?.event_time || null;

        if (!event_id || !event_type) {
            return json(400, { error: "Invalid payload (missing event_id/event_type)", payload });
        }

        const sb = sbAdmin();

        // Idempotency: store event once (recommended)
        const ins = await sb.from("paddle_events").insert({
            event_id,
            event_type,
            occurred_at,
        });

        if (ins.error) {
            // if duplicate key => already processed
            const msg = String(ins.error.message || "").toLowerCase();
            if (msg.includes("duplicate") || msg.includes("already exists") || msg.includes("unique")) {
                return json(200, { ok: true, duplicate: true });
            }
            // not fatal - continue (but log)
            console.error("paddle_events insert error:", ins.error);
        }

        const app_user_id = extractAppUserId(payload);
        if (!app_user_id) {
            console.warn("Webhook has no custom_data.app_user_id. Event:", event_type, event_id);
            return json(200, { ok: true, note: "no app_user_id in custom_data" });
        }

        // We only care about subscription lifecycle events
        if (String(event_type).startsWith("subscription.")) {
            const data = payload.data || {};
            const status = data.status || data.subscription_status || null;

            const pro_active = isProActiveFromStatus(status);

            const price_id = extractPriceIdFromSubscription(data);
            const plan = pro_active ? normalizePlanFromPriceId(price_id) : "free";

            // best-effort fields
            const paddle_subscription_id = data.id || data.subscription_id || null;
            const paddle_customer_id = data.customer_id || data.customer?.id || null;

            // period end - best effort (depends on payload)
            const pro_until =
                data.current_billing_period?.ends_at ||
                data.current_period_end ||
                data.next_billed_at ||
                null;

            const upd = await sb
                .from("profiles")
                .update({
                    plan,
                    pro_active,
                    pro_until,
                    paddle_customer_id,
                    paddle_subscription_id,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", app_user_id);

            if (upd.error) {
                console.error("profiles update error:", upd.error);
                return json(500, { error: "Failed to update profile", detail: upd.error.message });
            }

            return json(200, { ok: true, event_type, app_user_id, plan, pro_active });
        }

        // Ignore other events (we didn't subscribe to them anyway)
        return json(200, { ok: true, ignored: true, event_type });
    } catch (e) {
        console.error("paddle_webhook error:", e);
        return json(500, { error: e?.message || String(e) });
    }
};
