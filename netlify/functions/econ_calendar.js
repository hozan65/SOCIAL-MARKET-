// netlify/functions/econ_calendar.js
// Economic Calendar Proxy (FMP) -> Your Frontend
export default async (req) => {
    try {
        const url = new URL(req.url);

        // params
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);

        // ENV
        const API_KEY = process.env.FMP_API_KEY;
        if (!API_KEY) {
            return new Response(JSON.stringify({ ok: false, error: "Missing FMP_API_KEY env" }), {
                status: 500,
                headers: { "content-type": "application/json; charset=utf-8" },
            });
        }

        // FMP Economic Calendar endpoint (Legacy docs)
        // Docs confirm: add ?apikey=YOUR_API_KEY to requests. :contentReference[oaicite:0]{index=0}
        const upstream = `https://financialmodelingprep.com/api/v3/economic_calendar?apikey=${encodeURIComponent(API_KEY)}`;

        const r = await fetch(upstream, {
            headers: { "user-agent": "social-market-netlify-function" },
        });

        if (!r.ok) {
            const text = await r.text();
            return new Response(
                JSON.stringify({ ok: false, error: "Upstream API error", status: r.status, body: text.slice(0, 400) }),
                {
                    status: 502,
                    headers: { "content-type": "application/json; charset=utf-8" },
                }
            );
        }

        const data = await r.json();

        // Normalize (keep only what we need)
        const clean = Array.isArray(data)
            ? data.slice(0, limit).map((e) => ({
                date: e.date ?? null,
                country: e.country ?? null,
                currency: e.currency ?? null,
                event: e.event ?? null,
                impact: e.impact ?? null,
                actual: e.actual ?? null,
                forecast: e.forecast ?? null,
                previous: e.previous ?? null,
            }))
            : [];

        return new Response(JSON.stringify({ ok: true, data: clean }), {
            status: 200,
            headers: {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "public, max-age=300", // 5 dk cache (free plan için iyi)
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
