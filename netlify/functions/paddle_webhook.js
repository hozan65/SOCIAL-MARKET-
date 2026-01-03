// netlify/functions/paddle_webhook.js
// Verifies Paddle webhook signature and updates user plan in Supabase
// Requires ENV: PADDLE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(statusCode, obj) {
    return {
        statusCode,
        headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
        body: JSON.stringify(obj),
    };
}

function sbAdmin() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return createClient(url, key, { auth: { persistSession: false } });
}

// Paddle signature header format includes ts + h1 (HMAC sha256) :contentReference[oaicite:4]{index=4}
function verifyPaddleSignature({ rawBody, signatureHeader, secret }) {
    if (!signatureHeader) return false;

    // Example header: "ts=..., h1=..."
    const parts = Object.fromEntries(
        signatureHeader.split(";").map((p) => p.trim().split("="))
    );

    const ts = parts.ts;
    const h1 = parts.h1;
    if (!ts || !h1) return false;

    const signedPayload = `${ts}:${rawBody}`; // doc pattern :contentReference[oaicite:5]{index=5}

    const computed = crypto
        .createHmac("sha256", secret)
        .update(signedPayload, "utf8")
        .digest("hex");

    // timing safe compare
    const a = Buffer.from(computed, "hex");
    const b = Buffer.from(h1, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

function nowISO() {
    return new Date().toISOString();
}

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        const secret = process.env.PADDLE_WEBHOOK_SECRET;
        if (!secret) return json(500, { error: "Missing PADDLE_WEBHOOK_SECRET" });

        const rawBody = event.body || "";
        const sig = event.headers["paddle-signature"] || event.headers["Paddle-Signature"];

        const ok = verifyPaddleSignature({ rawBody, signatureHeader: sig, secret });
        if (!ok) return json(401, { error: "Invalid signature" });

        const payload = JSON.parse(rawBody || "{}");
        const eventType = payload?.event_type;
        const data = payload?.data;

        // We stored user_id + plan in transaction.custom_data at checkout creation
        const custom = data?.custom_data || {};
        const userId = String(custom.user_id || "").trim();
        const plan = String(custom.plan || "").toLowerCase().trim();

        if (!userId) {
            // still accept so Paddle doesn't retry forever
            return json(200, { ok: true, ignored: "missing_user_id" });
        }

        const sb = sbAdmin();

        // Minimal: When transaction completed => activate plan
        // Event names can vary; keep it robust.
        const completed =
            eventType === "transaction.completed" ||
            eventType === "subscription.activated" ||
            eventType === "subscription.created";

        const canceled =
            eventType === "subscription.canceled" ||
            eventType === "subscription.cancelled" ||
            eventType === "subscription.paused";

        if (completed && (plan === "normal" || plan === "pro")) {
            await sb
                .from("ai_users")
                .upsert(
                    {
                        user_id: userId,
                        plan,
                        pro_active: plan === "pro",
                        updated_at: nowISO(),
                    },
                    { onConflict: "user_id" }
                );

            return json(200, { ok: true, applied: plan });
        }

        if (canceled) {
            await sb
                .from("ai_users")
                .upsert(
                    {
                        user_id: userId,
                        plan: "free",
                        pro_active: false,
                        updated_at: nowISO(),
                    },
                    { onConflict: "user_id" }
                );
            return json(200, { ok: true, applied: "free" });
        }

        // ignore other events safely
        return json(200, { ok: true, ignored: eventType || "unknown" });
    } catch (e) {
        console.error("paddle_webhook error:", e);
        return json(500, { error: e?.message || String(e) });
    }
};
