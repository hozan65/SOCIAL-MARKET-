// netlify/functions/news_ingest.js
// Scheduled ingestion -> Supabase news_feed
// Source: Financial Modeling Prep (FMP) economic calendar (legal/stable)
// Writes with SUPABASE_SERVICE_ROLE_KEY (server-side only)

export default async (req) => {
    try {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

        // Data source (choose one)
        const FMP_KEY = process.env.FMP_API_KEY; // put in Netlify env
        if (!SUPABASE_URL || !SERVICE_ROLE) {
            return json(500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
        }
        if (!FMP_KEY) {
            return json(500, { error: "Missing FMP_API_KEY" });
        }

        // ---- 1) Fetch events/news-like macro items
        // FMP economic calendar returns macro events with time/actual/forecast/previous.
        // We'll convert these into "headline" style text news.
        // You can filter by date range. We'll pull last 3 days to be safe.
        const now = new Date();
        const end = fmtDate(now);
        const start = fmtDate(new Date(now.getTime() - 3 * 24 * 3600 * 1000));

        const url =
            `https://financialmodelingprep.com/api/v3/economic_calendar?from=${start}&to=${end}&apikey=${encodeURIComponent(FMP_KEY)}`;

        const r = await fetch(url, { headers: { accept: "application/json" } });
        if (!r.ok) return json(500, { error: `FMP error ${r.status}` });

        const raw = await r.json();
        const items = Array.isArray(raw) ? raw : [];

        // ---- 2) Normalize -> news_feed rows
        // Keep only events with country + event + date.
        const rows = items
            .map(toRow)
            .filter(Boolean)
            // newest first
            .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
            // limit to avoid too big writes
            .slice(0, 80);

        if (!rows.length) return json(200, { ok: true, inserted: 0, note: "No rows" });

        // ---- 3) Insert to Supabase via REST (service role)
        // We rely on unique(url) index to prevent duplicates.
        // Use "Prefer: resolution=ignore-duplicates" so duplicates won't fail.
        const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/news_feed`, {
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
            return json(500, { error: "Supabase insert failed", detail: txt.slice(0, 500) });
        }

        const inserted = await insertRes.json().catch(() => []);
        return json(200, { ok: true, inserted: Array.isArray(inserted) ? inserted.length : 0 });
    } catch (e) {
        return json(500, { error: e?.message || "unknown" });
    }
};

function json(statusCode, body) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
        },
        body: JSON.stringify(body),
    };
}

function fmtDate(d) {
    // YYYY-MM-DD
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function safeNum(x) {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
}

function toRow(x) {
    // FMP fields vary; common ones:
    // date, country, event, actual, forecast, previous
    const event = String(x?.event || x?.title || "").trim();
    const country = String(x?.country || "").trim();
    const dateStr = String(x?.date || x?.datetime || "").trim();

    if (!event || !dateStr) return null;

    // Create a clean "headline-like" title (English)
    const actual = safeNum(x?.actual);
    const forecast = safeNum(x?.forecast);
    const previous = safeNum(x?.previous);

    const bits = [];
    if (actual != null) bits.push(`Actual: ${actual}`);
    if (forecast != null) bits.push(`Forecast: ${forecast}`);
    if (previous != null) bits.push(`Previous: ${previous}`);

    const suffix = bits.length ? ` (${bits.join(", ")})` : "";
    const headline =
        country ? `${country}: ${event}${suffix}` : `${event}${suffix}`;

    // URL must be unique. FMP econ calendar doesn't always have a permalink,
    // so we generate a stable synthetic url using date+country+event.
    const syntheticUrl = makeSyntheticUrl(dateStr, country, event);

    return {
        source: "FMP",
        title: headline,
        url: syntheticUrl,
        category: "forex",
        lang: "en",
        published_at: toIso(dateStr),
    };
}

function toIso(dateStr) {
    // if already ISO, keep
    const d = new Date(dateStr);
    if (!Number.isNaN(d.getTime())) return d.toISOString();

    // fallback: now
    return new Date().toISOString();
}

function makeSyntheticUrl(dateStr, country, event) {
    const base = `${dateStr}__${country || "NA"}__${event || "NA"}`;
    const slug = base
        .toLowerCase()
        .replaceAll(" ", "-")
        .replaceAll("/", "-")
        .replaceAll("\\", "-")
        .replaceAll(":", "-")
        .replaceAll(".", "")
        .replaceAll(",", "")
        .slice(0, 180);

    // Not a real link, but unique & stable. (We can open a detail modal later.)
    return `smnews://${slug}`;
}
