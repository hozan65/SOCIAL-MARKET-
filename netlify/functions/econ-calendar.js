// netlify/functions/econ_calendar.js
// ENV: TE_CREDENTIALS = KEY:SECRET  (tırnaksız)

function json(statusCode, body, extraHeaders = {}) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=300, s-maxage=300",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            ...extraHeaders,
        },
        body: JSON.stringify(body),
    };
}

function clamp(n, min, max, fallback) {
    const x = Number(n);
    if (!Number.isFinite(x)) return fallback;
    return Math.min(max, Math.max(min, x));
}

function toISODate(d) {
    const pad = (x) => String(x).padStart(2, "0");
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function addDaysUTC(date, days) {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
}

function impactFromImportance(val) {
    const n = Number(val);
    if (n === 3) return "high";
    if (n === 2) return "medium";
    if (n === 1) return "low";
    return "unknown";
}

async function fetchWithTimeout(url, ms = 9000) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), ms);
    try {
        return await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
    } finally {
        clearTimeout(t);
    }
}

async function fetchWithRetry(url) {
    let lastErr = null;
    for (let i = 0; i < 2; i++) {
        try {
            const r = await fetchWithTimeout(url, 9000);
            if ([502, 503, 504].includes(r.status)) {
                lastErr = new Error(`TE temporary error ${r.status}`);
                await new Promise((res) => setTimeout(res, 450));
                continue;
            }
            return r;
        } catch (e) {
            lastErr = e;
            await new Promise((res) => setTimeout(res, 450));
        }
    }
    throw lastErr || new Error("TE fetch failed");
}

exports.handler = async (event) => {
    if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

    const creds = process.env.TE_CREDENTIALS; // KEY:SECRET
    if (!creds || !String(creds).includes(":")) {
        // ✅ key yoksa siteyi bozma
        return json(200, { ok: false, reason: "missing_TE_CREDENTIALS", events: [] });
    }

    const days = clamp(event.queryStringParameters?.days, 1, 14, 7);
    const limit = clamp(event.queryStringParameters?.limit, 5, 200, 40);

    const now = new Date();
    const from = toISODate(now);
    const to = toISODate(addDaysUTC(now, days));

    const url =
        `https://api.tradingeconomics.com/calendar/country/all/${from}/${to}` +
        `?c=${encodeURIComponent(creds)}`;

    try {
        const r = await fetchWithRetry(url);
        const text = await r.text();

        let data = null;
        try { data = JSON.parse(text); } catch {}

        if (!r.ok || !Array.isArray(data)) {
            // ✅ 401 olsa bile 200 + boş events
            return json(200, {
                ok: false,
                error: `TE API error ${r.status}`,
                from, to, days, limit,
                events: [],
            });
        }

        const events = data
            .map((e) => {
                const dt = e?.Date || e?.date;
                const time = dt ? new Date(dt).toISOString() : null;
                return {
                    time,
                    country: e?.Country || "",
                    currency: e?.Currency || "",
                    title: e?.Event || "",
                    impact: impactFromImportance(e?.Importance),
                    previous: e?.Previous ?? null,
                    forecast: e?.Forecast ?? null,
                    actual: e?.Actual ?? null,
                };
            })
            .filter((x) => x.time && x.title)
            .sort((a, b) => new Date(a.time) - new Date(b.time))
            .slice(0, limit);

        return json(200, { ok: true, from, to, days, limit, events }, { "X-SM-Source": "TradingEconomics" });
    } catch (e) {
        const msg = e?.name === "AbortError" ? "Timeout (TradingEconomics)" : (e?.message || "unknown");
        return json(200, { ok: false, error: msg, events: [], from, to, days, limit });
    }
};
