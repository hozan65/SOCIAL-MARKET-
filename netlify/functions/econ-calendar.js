// netlify/functions/econ_calendar.js
// Markasız Economic Calendar: TradingEconomics API -> JSON -> Frontend
// CORS + caching friendly

function json(statusCode, bodyObj) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=60", // 60s cache
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
        body: JSON.stringify(bodyObj),
    };
}

exports.handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

        const days = Math.min(Math.max(parseInt(event.queryStringParameters?.days || "7", 10), 1), 30);
        const importance = event.queryStringParameters?.importance || ""; // optional

        const key = (process.env.TE_API_KEY || "").trim();
        const secret = (process.env.TE_API_SECRET || "").trim();

        if (!key) return json(500, { error: "Missing TE_API_KEY in Netlify env" });

        // TradingEconomics calendar endpoint
        // Docs: tradingeconomics.com/api/calendar.aspx and docs.tradingeconomics.com :contentReference[oaicite:4]{index=4}
        // Auth 방식 plan'a göre değişebilir:
        // - Basic auth user:pass
        // - query params (c=key:secret) gibi
        // Bu yüzden en esnek: Basic Auth + fallback query param.

        const base = "https://api.tradingeconomics.com/calendar";
        const from = new Date();
        const to = new Date(Date.now() + days * 24 * 3600 * 1000);

        const fmt = (d) => d.toISOString().slice(0, 10); // YYYY-MM-DD
        const qs = new URLSearchParams({
            d1: fmt(from),
            d2: fmt(to),
            format: "json",
        });

        if (importance) qs.set("importance", importance);

        // Fallback: query credential (bazı örneklerde c=key:secret)
        // secret yoksa sadece key ile çalışan planın olabilir, yine de c=key:secret denemiyoruz.
        if (secret) qs.set("c", `${key}:${secret}`);

        const url = `${base}?${qs.toString()}`;

        const headers = {};
        if (secret) {
            const token = Buffer.from(`${key}:${secret}`).toString("base64");
            headers["Authorization"] = `Basic ${token}`;
        }

        const r = await fetch(url, { headers });
        const data = await r.json().catch(() => null);

        if (!r.ok) {
            const msg =
                data?.message ||
                data?.error ||
                `TE API error (${r.status})`;
            return json(r.status, { error: msg });
        }

        // Normalize: frontend daha kolay render etsin
        const items = Array.isArray(data) ? data : (data?.data || []);
        const mapped = items.map((x) => ({
            id: x?.CalendarId ?? x?.id ?? null,
            country: x?.Country ?? x?.country ?? "",
            currency: x?.Currency ?? x?.currency ?? "",
            event: x?.Event ?? x?.event ?? "",
            importance: x?.Importance ?? x?.importance ?? "",
            actual: x?.Actual ?? x?.actual ?? null,
            forecast: x?.Forecast ?? x?.forecast ?? null,
            previous: x?.Previous ?? x?.previous ?? null,
            date: x?.Date ?? x?.date ?? x?.Datetime ?? x?.datetime ?? null,
        }));

        return json(200, { ok: true, items: mapped });
    } catch (e) {
        console.error("econ_calendar error:", e);
        return json(500, { error: e.message || "Server error" });
    }
};
