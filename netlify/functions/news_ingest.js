// netlify/functions/news_ingest.js
// Scheduled ingestion -> Supabase news_feed (schema match)
// ✅ Netlify: return Response
// ✅ Inserts: source,title,content,slug,published_at

export default async () => {
    try {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const FMP_KEY = process.env.FMP_API_KEY;

        if (!SUPABASE_URL || !SERVICE_ROLE) {
            return json(500, { ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
        }
        if (!FMP_KEY) {
            return json(500, { ok: false, error: "Missing FMP_API_KEY" });
        }

        const now = new Date();
        const end = fmtDate(now);
        const start = fmtDate(new Date(now.getTime() - 3 * 24 * 3600 * 1000));

        const srcUrl =
            `https://financialmodelingprep.com/api/v3/economic_calendar?from=${start}&to=${end}&apikey=${encodeURIComponent(FMP_KEY)}`;

        const r = await fetch(srcUrl, { headers: { accept: "application/json" } });
        if (!r.ok) {
            const t = await r.text().catch(() => "");
            return json(500, { ok: false, error: `FMP error ${r.status}`, detail: t.slice(0, 300) });
        }

        const raw = await r.json().catch(() => []);
        const items = Array.isArray(raw) ? raw : [];

        const rows = items
            .map(toRowForNewsFeed)
            .filter(Boolean)
            .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
            .slice(0, 80);

        if (!rows.length) return json(200, { ok: true, inserted: 0, note: "No rows" });

        const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/news_feed?on_conflict=slug`, {
            method: "POST",
            headers: {
                apikey: SERVICE_ROLE,
                Authorization: `Bearer ${SERVICE_ROLE}`,
                "Content-Type": "application/json",
                Prefer: "resolution=ignore-duplicates,return=representation",
            },
            body: JSON.stringify(rows),
        });

        if (!insertRes.ok) {
            const txt = await insertRes.text().catch(() => "");
            return json(500, { ok: false, error: "Supabase insert failed", detail: txt.slice(0, 600) });
        }

        const inserted = await insertRes.json().catch(() => []);
        return json(200, { ok: true, inserted: Array.isArray(inserted) ? inserted.length : 0 });
    } catch (e) {
        return json(500, { ok: false, error: e?.message || String(e) });
    }
};

function json(status, body) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
        },
    });
}

function fmtDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function safeNum(x) {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
}

function toIso(dateStr) {
    const d = new Date(dateStr);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    return new Date().toISOString();
}

function makeSlug(dateStr, country, event) {
    const base = `${dateStr}__${country || "NA"}__${event || "NA"}`;
    return base
        .toLowerCase()
        .replaceAll(" ", "-")
        .replaceAll("/", "-")
        .replaceAll("\\", "-")
        .replaceAll(":", "-")
        .replaceAll(".", "")
        .replaceAll(",", "")
        .slice(0, 180);
}

function toRowForNewsFeed(x) {
    const event = String(x?.event || x?.title || "").trim();
    const country = String(x?.country || "").trim();
    const dateStr = String(x?.date || x?.datetime || "").trim();
    if (!event || !dateStr) return null;

    const actual = safeNum(x?.actual);
    const forecast = safeNum(x?.forecast);
    const previous = safeNum(x?.previous);

    const bits = [];
    if (actual != null) bits.push(`Actual: ${actual}`);
    if (forecast != null) bits.push(`Forecast: ${forecast}`);
    if (previous != null) bits.push(`Previous: ${previous}`);

    const suffix = bits.length ? ` (${bits.join(", ")})` : "";
    const title = country ? `${country}: ${event}${suffix}` : `${event}${suffix}`;

    const contentParts = [];
    if (country) contentParts.push(`Country: ${country}`);
    contentParts.push(`Event: ${event}`);
    if (actual != null) contentParts.push(`Actual: ${actual}`);
    if (forecast != null) contentParts.push(`Forecast: ${forecast}`);
    if (previous != null) contentParts.push(`Previous: ${previous}`);
    const content = contentParts.join(" • ");

    const published_at = toIso(dateStr);
    const slug = makeSlug(dateStr, country, event);

    return { source: "FMP", title, content, slug, published_at };
}
