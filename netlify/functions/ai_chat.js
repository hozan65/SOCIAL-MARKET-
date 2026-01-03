// netlify/functions/ai_chat.js
// ✅ Finance-only AI
// ✅ Free/Normal/Pro limits (from plan_limits table OR env fallback)
// ✅ Sessions + Messages saved (ai_sessions, ai_messages)
// ✅ Live data snapshot (Crypto: CoinGecko, Forex/Stocks: AlphaVantage)
// ✅ Cache (market_cache) if table exists
// ✅ Returns: { allowed, plan, text, remaining, sid }

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

function toInt(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function todayISODateUTC() {
    const d = new Date();
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function nowISO() {
    return new Date().toISOString();
}

function safeJsonParse(s) {
    try {
        return JSON.parse(s);
    } catch {
        return null;
    }
}

function extractOutputText(respJson) {
    if (typeof respJson?.output_text === "string" && respJson.output_text.trim()) {
        return respJson.output_text;
    }
    const out = respJson?.output;
    if (!Array.isArray(out)) return "";
    const chunks = [];
    for (const item of out) {
        const content = item?.content;
        if (!Array.isArray(content)) continue;
        for (const c of content) {
            if (c?.type === "output_text" && typeof c?.text === "string") chunks.push(c.text);
            if (c?.type === "text" && typeof c?.text === "string") chunks.push(c.text);
        }
    }
    return chunks.join("").trim();
}

async function openaiResponses({ input, model, max_output_tokens }) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("Missing OPENAI_API_KEY");

    const res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ model, input, max_output_tokens }),
    });

    const text = await res.text();
    const data = safeJsonParse(text);

    if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${text}`);
    return data;
}

/* -----------------------
   PLAN LIMITS
------------------------ */

function envFallbackLimits(plan) {
    const p = String(plan || "free").toLowerCase();

    const FREE = toInt(process.env.FREE_DAILY_MSG_LIMIT, 10);
    const NORMAL = toInt(process.env.NORMAL_DAILY_MSG_LIMIT, 200);
    const PRO = toInt(process.env.PRO_DAILY_MSG_LIMIT, 9999);

    const FREE_IMG = toInt(process.env.FREE_DAILY_IMAGE_LIMIT, 1);
    const NORMAL_IMG = toInt(process.env.NORMAL_DAILY_IMAGE_LIMIT, 10);
    const PRO_IMG = toInt(process.env.PRO_DAILY_IMAGE_LIMIT, 999);

    if (p === "pro") return { daily_msg_limit: PRO, daily_image_limit: PRO_IMG, live_data: true, analysis_depth: 5 };
    if (p === "normal") return { daily_msg_limit: NORMAL, daily_image_limit: NORMAL_IMG, live_data: true, analysis_depth: 3 };
    return { daily_msg_limit: FREE, daily_image_limit: FREE_IMG, live_data: false, analysis_depth: 1 };
}

async function getPlanLimits(sb, plan) {
    // If plan_limits table exists and has rows, use it. Else fallback to env.
    try {
        const res = await sb.from("plan_limits").select("daily_msg_limit,daily_image_limit,live_data,analysis_depth").eq("plan", plan).maybeSingle();
        if (res?.data) return res.data;
    } catch {}
    return envFallbackLimits(plan);
}

/* -----------------------
   SESSIONS + MESSAGES
------------------------ */

async function ensureSession(sb, { sid, user_id, titleHint }) {
    // if sid exists -> ensure record
    // if not exists -> insert
    const s = String(sid || "").trim();
    if (!s) throw new Error("Missing sid");

    // Check exists
    const existing = await sb.from("ai_sessions").select("sid,title").eq("sid", s).maybeSingle();
    if (existing?.data?.sid) {
        // Optionally set title if empty
        if (!existing.data.title && titleHint) {
            await sb.from("ai_sessions").update({ title: titleHint }).eq("sid", s);
        }
        return s;
    }

    // Create
    const ins = await sb.from("ai_sessions").insert({ sid: s, user_id, title: titleHint || null });
    if (ins.error) throw ins.error;
    return s;
}

async function saveMessage(sb, { sid, user_id, role, content }) {
    const ins = await sb.from("ai_messages").insert({
        sid,
        user_id,
        role,
        content,
        created_at: nowISO(),
    });
    if (ins.error) throw ins.error;
}

/* -----------------------
   ASSET DETECTION
------------------------ */

function normalizeText(s) {
    return String(s || "")
        .trim()
        .replace(/\s+/g, " ");
}

// Very simple parsing (good enough for v1)
function detectAsset(userText) {
    const t = normalizeText(userText);

    // Forex pair patterns: EURUSD, EUR/USD, EUR-USD
    const fx = t.match(/\b([A-Z]{3})\s*[/\-]?\s*([A-Z]{3})\b/);
    if (fx) {
        const from = fx[1];
        const to = fx[2];
        // filter common false positives (e.g., AND, THE) – keep simple
        const bad = new Set(["THE", "AND", "FOR", "YOU", "NOT"]);
        if (!bad.has(from) && !bad.has(to)) {
            return { type: "forex", symbol: `${from}${to}`, from, to };
        }
    }

    // Crypto hints: words like btc, eth, sol, coin
    const cryptoHint = t.match(/\b(btc|bitcoin|eth|ethereum|sol|solana|xrp|doge|bnb|usdt|usdc)\b/i);
    if (cryptoHint) {
        return { type: "crypto", query: cryptoHint[0] };
    }

    // Stock ticker: $AAPL or AAPL (1-5 letters)
    const stock = t.match(/\$?([A-Z]{1,5})\b/);
    if (stock) {
        const sym = stock[1];
        // avoid matching common words
        const avoid = new Set(["I", "A", "AN", "THE", "AND", "OR", "TO", "IN", "ON", "AT", "FOR", "WITH", "AS"]);
        if (!avoid.has(sym)) {
            return { type: "stock", symbol: sym };
        }
    }

    // Default: general finance question
    return { type: "general" };
}

/* -----------------------
   MARKET DATA (with cache)
------------------------ */

async function cacheGet(sb, cache_key) {
    try {
        const r = await sb.from("market_cache").select("payload,updated_at,ttl_seconds").eq("cache_key", cache_key).maybeSingle();
        if (!r?.data) return null;
        const ttl = toInt(r.data.ttl_seconds, 30);
        const updatedAt = new Date(r.data.updated_at).getTime();
        if (!updatedAt) return null;
        const ageMs = Date.now() - updatedAt;
        if (ageMs <= ttl * 1000) return r.data.payload;
        return null;
    } catch {
        return null;
    }
}

async function cacheSet(sb, cache_key, payload, source, ttl_seconds = 30) {
    try {
        await sb.from("market_cache").upsert(
            { cache_key, payload, source, ttl_seconds, updated_at: nowISO() },
            { onConflict: "cache_key" }
        );
    } catch {}
}

async function fetchCoinGeckoSnapshot(sb, queryRaw) {
    const base = process.env.COINGECKO_BASE_URL || "https://api.coingecko.com/api/v3";
    const query = String(queryRaw || "").trim() || "bitcoin";
    const cache_key = `crypto:search:${query.toLowerCase()}`;

    const cached = await cacheGet(sb, cache_key);
    if (cached) return cached;

    // Search -> pick first coin id
    const sRes = await fetch(`${base}/search?query=${encodeURIComponent(query)}`);
    const sJson = await sRes.json().catch(() => null);
    const first = sJson?.coins?.[0];
    const coinId = first?.id || "bitcoin";

    // Price
    const pRes = await fetch(`${base}/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=usd&include_24hr_change=true`);
    const pJson = await pRes.json().catch(() => null);

    const price = pJson?.[coinId]?.usd ?? null;
    const ch24 = pJson?.[coinId]?.usd_24h_change ?? null;

    const snapshot = {
        asset_type: "crypto",
        id: coinId,
        symbol: first?.symbol?.toUpperCase?.() || null,
        name: first?.name || coinId,
        price_usd: price,
        change_24h_pct: ch24,
        source: "coingecko",
        asof: nowISO(),
    };

    await cacheSet(sb, cache_key, snapshot, "coingecko", 30);
    return snapshot;
}

async function fetchAlphaVantageFX(sb, from, to) {
    const key = process.env.FX_API_KEY;
    if (!key) return null;

    const cache_key = `fx:${from}:${to}`;
    const cached = await cacheGet(sb, cache_key);
    if (cached) return cached;

    const url = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${encodeURIComponent(from)}&to_currency=${encodeURIComponent(to)}&apikey=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    const js = await res.json().catch(() => null);

    const rateObj = js?.["Realtime Currency Exchange Rate"];
    const rate = rateObj?.["5. Exchange Rate"] ? Number(rateObj["5. Exchange Rate"]) : null;
    const asof = rateObj?.["6. Last Refreshed"] || null;

    const snapshot = {
        asset_type: "forex",
        pair: `${from}${to}`,
        from,
        to,
        rate,
        source: "alphavantage",
        asof: asof || nowISO(),
        raw: rateObj ? null : js, // keep raw if error
    };

    await cacheSet(sb, cache_key, snapshot, "alphavantage", 30);
    return snapshot;
}

async function fetchAlphaVantageStock(sb, symbol) {
    const key = process.env.STOCKS_API_KEY;
    if (!key) return null;

    const cache_key = `stock:${symbol}`;
    const cached = await cacheGet(sb, cache_key);
    if (cached) return cached;

    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    const js = await res.json().catch(() => null);

    const q = js?.["Global Quote"];
    const price = q?.["05. price"] ? Number(q["05. price"]) : null;
    const change = q?.["09. change"] ? Number(q["09. change"]) : null;
    const changePctRaw = q?.["10. change percent"] || null;

    const snapshot = {
        asset_type: "stock",
        symbol,
        price,
        change,
        change_percent: typeof changePctRaw === "string" ? changePctRaw : null,
        source: "alphavantage",
        asof: nowISO(),
        raw: q ? null : js,
    };

    await cacheSet(sb, cache_key, snapshot, "alphavantage", 30);
    return snapshot;
}

/* -----------------------
   PROMPTS (finance-only)
------------------------ */

function buildSystemPrompt({ plan, analysis_depth, live_data }) {
    const base = `
You are “Social Market Finance AI”.

SCOPE (hard rules):
- Only discuss finance topics: crypto, forex, stocks, indices, commodities, macroeconomics, risk management, trading psychology.
- If the user asks anything outside finance, refuse briefly and redirect to a finance-related finance alternative.

TRUTHFULNESS:
- Never invent live prices, percent changes, or news.
- If live market numbers are needed and not provided, say clearly that you don't have live data in this message.
- If MARKET DATA SNAPSHOT is provided, you must use it.

STYLE:
- Reply in the same language as the user.
- Be structured with Markdown:
  ## Title
  **Summary**
  **Key Levels**
  **Scenarios**
  **Risk & Invalidation**
- Avoid filler. Be direct and actionable.
- Always add a short disclaimer: "This is not financial advice."

PLAN:
- Current plan: ${plan}
- Analysis depth: ${analysis_depth} / 5
- Live data: ${live_data ? "enabled" : "disabled"}
`.trim();

    // Plan tuning
    const p = String(plan || "free").toLowerCase();
    const extra =
        p === "pro"
            ? `
PRO MODE:
- Provide premium depth: multi-scenario view, more detail, and practical risk plan.
- If helpful, include a small watchlist (2-3 related instruments).
- Ask at most ONE follow-up question, only if absolutely necessary.
`.trim()
            : p === "normal"
                ? `
NORMAL MODE:
- Provide solid analysis with key levels and clear scenarios.
- Keep it medium length.
`.trim()
                : `
FREE MODE:
- Keep it shorter.
- Still be useful and structured; no long essays.
`.trim();

    return `${base}\n\n${extra}`.trim();
}

/* -----------------------
   HANDLER
------------------------ */

export const handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        const userId = String(event.headers["x-user-id"] || "").trim();
        if (!userId) return json(401, { error: "Missing x-user-id" });

        let body = {};
        try {
            body = event.body ? JSON.parse(event.body) : {};
        } catch {
            body = {};
        }

        const sid = String(body.sid || "").trim();
        const userText = String(body.message || body.text || "").trim();
        if (!sid) return json(400, { error: "Missing sid" });
        if (!userText) return json(400, { error: "Missing message" });

        const sb = sbAdmin();

        // Ensure user exists
        await sb.from("ai_users").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });

        // Load user plan
        const profRes = await sb
            .from("ai_users")
            .select("plan, pro_active, plan_expires_at")
            .eq("user_id", userId)
            .maybeSingle();

        if (profRes.error) return json(500, { error: profRes.error.message });

        let plan = String(profRes.data?.plan || "free").toLowerCase();
        let proActive = Boolean(profRes.data?.pro_active);

        // Expiry check (if exists)
        const expiresAt = profRes.data?.plan_expires_at ? new Date(profRes.data.plan_expires_at).getTime() : null;
        if (expiresAt && Date.now() > expiresAt) {
            // downgrade
            plan = "free";
            proActive = false;
            await sb.from("ai_users").update({ plan: "free", pro_active: false, updated_at: nowISO() }).eq("user_id", userId);
        }

        // normalize plan if pro_active
        if (proActive) plan = plan === "pro" ? "pro" : "pro";

        // Limits (table or env)
        const limits = await getPlanLimits(sb, plan);
        const day = todayISODateUTC();

        // usage row ensure
        await sb
            .from("ai_usage_daily")
            .upsert({ user_id: userId, day }, { onConflict: "user_id,day", ignoreDuplicates: true });

        // fetch usage
        const usageRes = await sb
            .from("ai_usage_daily")
            .select("msg_count,image_count")
            .eq("user_id", userId)
            .eq("day", day)
            .single();

        if (usageRes.error) return json(500, { error: usageRes.error.message });

        const msgCount = toInt(usageRes.data?.msg_count, 0);
        const msgLimit = toInt(limits?.daily_msg_limit, 10);

        if (msgCount + 1 > msgLimit) {
            return json(200, {
                allowed: false,
                reason: "msg_limit_reached",
                plan,
                limit: { msg: msgLimit },
                used: { msg: msgCount },
                remaining: { msg: Math.max(0, msgLimit - msgCount) },
                sid,
            });
        }

        // increment usage
        const upd = await sb
            .from("ai_usage_daily")
            .update({ msg_count: msgCount + 1, updated_at: nowISO() })
            .eq("user_id", userId)
            .eq("day", day);

        if (upd.error) return json(500, { error: upd.error.message });

        // Session + save user message
        const titleHint = userText.slice(0, 48);
        await ensureSession(sb, { sid, user_id: userId, titleHint });
        await saveMessage(sb, { sid, user_id: userId, role: "user", content: userText });

        // Live data snapshot (plan-based)
        const liveDataEnabled = Boolean(limits?.live_data);
        const detected = detectAsset(userText);

        let snapshot = null;
        if (liveDataEnabled) {
            if (detected.type === "crypto") {
                snapshot = await fetchCoinGeckoSnapshot(sb, detected.query);
            } else if (detected.type === "forex") {
                snapshot = await fetchAlphaVantageFX(sb, detected.from, detected.to);
            } else if (detected.type === "stock") {
                snapshot = await fetchAlphaVantageStock(sb, detected.symbol);
            }
        }

        const systemPrompt = buildSystemPrompt({
            plan,
            analysis_depth: toInt(limits?.analysis_depth, 3),
            live_data: liveDataEnabled,
        });

        const model = process.env.OPENAI_MODEL || "gpt-5";
        const maxOut = toInt(process.env.OPENAI_MAX_OUTPUT_TOKENS, 900);

        const input = [
            { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
            ...(snapshot
                ? [
                    {
                        role: "user",
                        content: [{ type: "input_text", text: `MARKET DATA SNAPSHOT:\n${JSON.stringify(snapshot, null, 2)}` }],
                    },
                ]
                : []),
            { role: "user", content: [{ type: "input_text", text: userText }] },
        ];

        const resp = await openaiResponses({ model, max_output_tokens: maxOut, input });
        const answer = extractOutputText(resp) || "";

        // save assistant message
        await saveMessage(sb, { sid, user_id: userId, role: "assistant", content: answer });

        return json(200, {
            allowed: true,
            plan,
            text: answer,
            remaining: { msg: Math.max(0, msgLimit - (msgCount + 1)) },
            sid,
        });
    } catch (e) {
        console.error("ai_chat error:", e);
        return json(500, { error: e?.message || String(e) });
    }
};
