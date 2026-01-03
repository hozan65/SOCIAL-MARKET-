// netlify/functions/usage_check_and_inc.js
// Free plan daily limits gate + increments.
// Uses tables: ai_users, ai_usage_daily

import { sbAdmin } from "./supabase.js";

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

function todayISODateUTC() {
    const d = new Date();
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function toInt(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        const userId = String(event.headers["x-user-id"] || "").trim();
        if (!userId) return json(401, { error: "Missing x-user-id" });

        const body = JSON.parse(event.body || "{}");
        const type = String(body.type || "").toLowerCase(); // msg | img
        if (type !== "msg" && type !== "img") {
            return json(400, { error: "Invalid type. Use msg | img" });
        }

        const FREE_MSG_LIMIT = toInt(process.env.FREE_DAILY_MSG_LIMIT, 10);
        const FREE_IMG_LIMIT = toInt(process.env.FREE_DAILY_IMG_LIMIT, 1);

        const sb = sbAdmin();

        // Ensure ai_user exists (first time user)
        await sb.from("ai_users").upsert(
            { user_id: userId },
            { onConflict: "user_id", ignoreDuplicates: true }
        );

        // Read plan
        const profRes = await sb
            .from("ai_users")
            .select("plan, pro_active")
            .eq("user_id", userId)
            .maybeSingle();

        if (profRes.error) return json(500, { error: profRes.error.message });

        const plan = profRes.data?.plan || "free";
        const proActive = Boolean(profRes.data?.pro_active);

        // Pro bypass
        if (proActive || String(plan).startsWith("pro")) {
            return json(200, {
                allowed: true,
                bypass: true,
                plan,
                remaining: { msg: null, img: null },
            });
        }

        // Free usage check + increment
        const day = todayISODateUTC();

        await sb
            .from("ai_usage_daily")
            .upsert({ user_id: userId, day }, { onConflict: "user_id,day", ignoreDuplicates: true });

        const usageRes = await sb
            .from("ai_usage_daily")
            .select("msg_count, img_count")
            .eq("user_id", userId)
            .eq("day", day)
            .single();

        if (usageRes.error) return json(500, { error: usageRes.error.message });

        let msgCount = toInt(usageRes.data?.msg_count, 0);
        let imgCount = toInt(usageRes.data?.img_count, 0);

        const wouldMsg = type === "msg" ? msgCount + 1 : msgCount;
        const wouldImg = type === "img" ? imgCount + 1 : imgCount;

        const allowed = type === "msg"
            ? (wouldMsg <= FREE_MSG_LIMIT)
            : (wouldImg <= FREE_IMG_LIMIT);

        if (!allowed) {
            return json(200, {
                allowed: false,
                plan: "free",
                limit: { msg: FREE_MSG_LIMIT, img: FREE_IMG_LIMIT },
                used: { msg: msgCount, img: imgCount },
                remaining: {
                    msg: Math.max(0, FREE_MSG_LIMIT - msgCount),
                    img: Math.max(0, FREE_IMG_LIMIT - imgCount),
                },
                reason: type === "msg" ? "msg_limit_reached" : "img_limit_reached",
            });
        }

        const patch =
            type === "msg"
                ? { msg_count: msgCount + 1, updated_at: new Date().toISOString() }
                : { img_count: imgCount + 1, updated_at: new Date().toISOString() };

        const upd = await sb
            .from("ai_usage_daily")
            .update(patch)
            .eq("user_id", userId)
            .eq("day", day);

        if (upd.error) return json(500, { error: upd.error.message });

        msgCount = type === "msg" ? msgCount + 1 : msgCount;
        imgCount = type === "img" ? imgCount + 1 : imgCount;

        return json(200, {
            allowed: true,
            plan: "free",
            limit: { msg: FREE_MSG_LIMIT, img: FREE_IMG_LIMIT },
            used: { msg: msgCount, img: imgCount },
            remaining: {
                msg: Math.max(0, FREE_MSG_LIMIT - msgCount),
                img: Math.max(0, FREE_IMG_LIMIT - imgCount),
            },
        });
    } catch (e) {
        console.error("usage_check_and_inc error:", e);
        return json(500, { error: e?.message || String(e) });
    }
};
