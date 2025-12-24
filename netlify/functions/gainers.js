// netlify/functions/gainers.js
// returns { forex: [...], metals: [...], indices: [...] }
// Each row: { symbol, price, changePct }

let cachedSession = { cst: null, sec: null, exp: 0 };

// ✅ last-good data cache (prevents "came then no data")
let lastGood = {
    exp: 0, // timestamp
    data: { forex: [], metals: [], indices: [] }
};

// how long we keep last good data if IG fails
const LAST_GOOD_TTL_MS = 2 * 60 * 1000; // 2 minutes

function envName() {
    return (process.env.IG_ENV || "demo").toLowerCase();
}

function baseUrl() {
    return envName() === "live"
        ? "https://api.ig.com/gateway/deal"
        : "https://demo-api.ig.com/gateway/deal";
}

function json(statusCode, body) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, X-Requested-With",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
        body: JSON.stringify(body),
    };
}

async function igLogin() {
    const now = Date.now();
    if (cachedSession.cst && cachedSession.sec && now < cachedSession.exp) return cachedSession;

    const apiKey = process.env.IG_API_KEY;
    const username = process.env.IG_USERNAME;
    const password = process.env.IG_PASSWORD;

    if (!apiKey || !username || !password) {
        throw new Error("Missing IG env vars: IG_API_KEY / IG_USERNAME / IG_PASSWORD");
    }

    const r = await fetch(`${baseUrl()}/session`, {
        method: "POST",
        headers: {
            "X-IG-API-KEY": apiKey,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Version": "2",
        },
        body: JSON.stringify({ identifier: username, password }),
    });

    const text = await r.text();
    if (!r.ok) throw new Error(`IG login failed ${r.status}: ${text.slice(0, 400)}`);

    const cst = r.headers.get("cst");
    const sec = r.headers.get("x-security-token");
    if (!cst || !sec) throw new Error("IG login ok but missing CST / X-SECURITY-TOKEN headers");

    cachedSession = { cst, sec, exp: Date.now() + 8 * 60 * 1000 };
    return cachedSession;
}

async function searchMarkets(term) {
    const apiKey = process.env.IG_API_KEY;
    const { cst, sec } = await igLogin();

    const r = await fetch(`${baseUrl()}/markets?searchTerm=${encodeURIComponent(term)}`, {
        headers: {
            "X-IG-API-KEY": apiKey,
            "CST": cst,
            "X-SECURITY-TOKEN": sec,
            "Accept": "application/json",
            "Version": "1",
        },
    });

    const text = await r.text();
    let j = {};
    try { j = JSON.parse(text); } catch (_) {}
    if (!r.ok) return [];
    return Array.isArray(j?.markets) ? j.markets : [];
}

function pickBestEpic(markets) {
    if (!markets.length) return null;
    const scored = markets.map(m => {
        const epic = String(m?.epic || "");
        const stream = m?.streamingPricesAvailable ? 1 : 0;
        let s = 0;
        if (/\.MINI\./i.test(epic)) s += 6;
        if (/\.DAILY\./i.test(epic)) s += 5;
        if (/IX\.D\./i.test(epic)) s += 3;
        if (/CS\.D\./i.test(epic)) s += 3;
        if (stream) s += 2;
        return { epic, s };
    }).filter(x => x.epic);
    scored.sort((a, b) => b.s - a.s);
    return scored[0]?.epic || null;
}

async function getMarketByEpic(epic, label) {
    const apiKey = process.env.IG_API_KEY;
    const { cst, sec } = await igLogin();

    const r = await fetch(`${baseUrl()}/markets/${encodeURIComponent(epic)}`, {
        headers: {
            "X-IG-API-KEY": apiKey,
            "CST": cst,
            "X-SECURITY-TOKEN": sec,
            "Accept": "application/json",
            "Version": "3",
        },
    });

    const text = await r.text();
    let j = {};
    try { j = JSON.parse(text); } catch (_) {}

    if (!r.ok) return null;

    const bid = Number(j?.snapshot?.bid);
    const ask = Number(j?.snapshot?.offer);
    const mid =
        Number.isFinite(bid) && Number.isFinite(ask) ? (bid + ask) / 2 :
            Number.isFinite(bid) ? bid :
                Number.isFinite(ask) ? ask : null;

    // ✅ mid null ise row'u sayma
    if (!Number.isFinite(mid)) return null;

    const pct = Number(j?.snapshot?.percentageChange);

    return {
        symbol: label,
        price: mid,
        changePct: Number.isFinite(pct) ? pct : 0,
    };
}

// ✅ Terimleri biraz daha "bulunur" yapalım (metals çalıştı diyorsun, demek burada tutan var)
const TERMS = {
    forex: ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD"],
    metals: ["Gold", "Silver"],
    indices: ["Wall Street", "US 500", "NASDAQ", "Germany 40", "FTSE 100"],
};

exports.handler = async (event) => {
    if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

    const now = Date.now();

    try {
        const out = { forex: [], metals: [], indices: [] };

        for (const key of ["forex", "metals", "indices"]) {
            const terms = TERMS[key] || [];
            const resolved = [];

            for (const term of terms) {
                const markets = await searchMarkets(term);
                const epic = pickBestEpic(markets);
                if (epic) resolved.push({ term, epic });
            }

            const rows = (await Promise.all(
                resolved.map(({ term, epic }) => getMarketByEpic(epic, term))
            ))
                .filter(Boolean)
                .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0))
                .slice(0, 10);

            out[key] = rows;
        }

        // ✅ Eğer en az 1 kategori doluysa lastGood güncelle
        const anyData = out.forex.length || out.metals.length || out.indices.length;
        if (anyData) {
            lastGood = { exp: now + LAST_GOOD_TTL_MS, data: out };
            return json(200, out);
        }

        // ✅ Hiç veri yoksa ama lastGood hala geçerliyse onu döndür
        if (now < lastGood.exp) {
            return json(200, lastGood.data);
        }

        // ✅ Gerçekten no data
        return json(200, out);

    } catch (e) {
        // ✅ Hata olsa bile lastGood varsa onu döndür
        if (now < lastGood.exp) {
            return json(200, lastGood.data);
        }
        return json(500, {
            error: e?.message || "unknown",
            hint: "Check IG env vars and reduce refresh frequency; IG demo can be rate-limited.",
        });
    }
};
