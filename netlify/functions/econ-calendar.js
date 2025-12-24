// netlify/functions/econ_calendar.js
// Uses TradingEconomics credentials as ONE env var:
//   TE_CREDENTIALS = "KEY:SECRET"

function json(statusCode, body) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
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

exports.handler = async (event) => {
    if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

    try {
        const creds = process.env.TE_CREDENTIALS; // "KEY:SECRET"
        if (!creds || !String(creds).includes(":")) {
            return json(500, {
                error: "Missing/invalid TE_CREDENTIALS",
                hint: 'Netlify ENV: TE_CREDENTIALS must be like "KEY:SECRET"',
            });
        }

        const days = clamp(event.queryStringParameters?.days, 1, 14, 7);
        const limit = clamp(event.queryStringParameters?.limit, 5, 200, 40);

        const now = new Date();
        const from = toISODate(now);
        const to = toISODate(addDaysUTC(now, days));

        const url =
            `https://api.tradingeconomics.com/calendar/country/all/${from}/${to}` +
            `?c=${encodeURIComponent(creds)}`;

        const r = await fetch(url, { headers: { Accept: "application/json" } });
        const text = await r.text();

        let data;
        try { data = JSON.parse(text); } catch { data = null; }

        if (!r.ok) {
            return json(500, {
                error: `TE API error ${r.status}`,
                detail: String(text).slice(0, 500),
            });
        }

        if (!Array.isArray(data)) {
            return json(500, { error: "TE response not an array", detail: String(text).slice(0, 300) });
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

        return json(200, { from, to, days, limit, events });

    } catch (e) {
        return json(500, { error: e?.message || "unknown" });
    }
};
