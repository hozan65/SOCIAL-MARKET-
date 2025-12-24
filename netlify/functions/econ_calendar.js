// netlify/functions/econ_calendar.js
export default async (req) => {
    try {
        const url = new URL(req.url);
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);

        const TOKEN = process.env.EODHD_API_TOKEN;
        if (!TOKEN) {
            return new Response(JSON.stringify({ ok: false, error: "Missing EODHD_API_TOKEN env" }), {
                status: 500,
                headers: { "content-type": "application/json; charset=utf-8" },
            });
        }

        // EODHD Economic Events API
        const upstream = `https://eodhd.com/api/economic-events?api_token=${encodeURIComponent(
            TOKEN
        )}&fmt=json`;

        const r = await fetch(upstream, { headers: { "user-agent": "social-market-netlify-function" } });
        const text = await r.text();

        let data;
        try { data = JSON.parse(text); } catch { data = null; }

        if (!r.ok) {
            return new Response(
                JSON.stringify({
                    ok: false,
                    error: "Upstream API error",
                    upstream_status: r.status,
                    upstream_body: data ?? text.slice(0, 400),
                }),
                { status: 502, headers: { "content-type": "application/json; charset=utf-8" } }
            );
        }

        // Normalize (EODHD alanları değişebilir, güvenli map)
        const arr = Array.isArray(data) ? data : [];
        const clean = arr.slice(0, limit).map((e) => ({
            date: e.date ?? e.datetime ?? null,
            country: e.country ?? null,
            currency: e.currency ?? e.ccy ?? null,
            event: e.event ?? e.title ?? e.name ?? null,
            impact: e.impact ?? e.importance ?? null,
            actual: e.actual ?? null,
            forecast: e.forecast ?? null,
            previous: e.previous ?? null,
        }));

        return new Response(JSON.stringify({ ok: true, data: clean }), {
            status: 200,
            headers: {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "public, max-age=300",
                "access-control-allow-origin": "*",
            },
        });
    } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err?.message || "Unknown error" }), {
            status: 500,
            headers: { "content-type": "application/json; charset=utf-8" },
        });
    }
};
