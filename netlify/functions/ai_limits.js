// netlify/functions/ai_limits.js
import { createClient } from "@supabase/supabase-js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function json(statusCode, body) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "content-type, authorization, x-user-id",
            "Access-Control-Allow-Methods": "GET,OPTIONS",
        },
        body: JSON.stringify(body),
    };
}

function todayISODate() {
    const d = new Date();
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

        const userId = event.headers["x-user-id"];
        if (!userId) return json(401, { error: "Missing x-user-id" });

        const sb = createClient(SB_URL, SB_KEY);

        const { data: prof, error: e1 } = await sb
            .from("profiles")
            .select("plan")
            .eq("user_id", userId)
            .maybeSingle();
        if (e1) throw e1;

        const plan = prof?.plan || "free";

        const { data: limits, error: e2 } = await sb
            .from("plan_limits")
            .select("daily_msg_limit,daily_img_limit,rpm_limit")
            .eq("plan", plan)
            .maybeSingle();
        if (e2) throw e2;

        const day = todayISODate();

        const { data: usage, error: e3 } = await sb
            .from("ai_usage_daily")
            .select("msg_count,img_count")
            .eq("user_id", userId)
            .eq("day", day)
            .maybeSingle();
        if (e3) throw e3;

        const msg_count = usage?.msg_count ?? 0;
        const img_count = usage?.img_count ?? 0;

        const msg_left = limits?.daily_msg_limit == null ? null : Math.max(0, limits.daily_msg_limit - msg_count);
        const img_left = limits?.daily_img_limit == null ? null : Math.max(0, limits.daily_img_limit - img_count);

        return json(200, {
            ok: true,
            plan,
            day,
            usage: { msg_count, img_count },
            limits: {
                daily_msg_limit: limits?.daily_msg_limit ?? null,
                daily_img_limit: limits?.daily_img_limit ?? null,
                rpm_limit: limits?.rpm_limit ?? null,
            },
            left: { msg_left, img_left },
        });
    } catch (e) {
        return json(500, { error: e.message || "Server error" });
    }
};
