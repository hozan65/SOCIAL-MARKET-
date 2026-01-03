// netlify/functions/get_my_plan.js
// Returns user's plan from ai_users (free/normal/pro)

import { sbAdmin } from "./supabase.js";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, x-user-id, authorization",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(statusCode, obj) {
    return {
        statusCode,
        headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
        body: JSON.stringify(obj),
    };
}

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

        const userId = String(event.headers["x-user-id"] || "").trim();
        if (!userId) return json(401, { error: "Missing x-user-id" });

        const sb = sbAdmin();

        // ensure exists (optional but useful)
        await sb.from("ai_users").upsert(
            { user_id: userId },
            { onConflict: "user_id", ignoreDuplicates: true }
        );

        const r = await sb
            .from("ai_users")
            .select("plan, pro_active")
            .eq("user_id", userId)
            .maybeSingle();

        if (r.error) return json(500, { error: r.error.message });

        const plan = (r.data?.plan || "free").toLowerCase();
        const proActive = Boolean(r.data?.pro_active);

        // normalize: if pro_active true treat as pro
        const finalPlan = proActive ? "pro" : plan;

        return json(200, { ok: true, plan: finalPlan });
    } catch (e) {
        console.error("get_my_plan error:", e);
        return json(500, { error: e?.message || String(e) });
    }
};
