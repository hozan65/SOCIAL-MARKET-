import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Resp = Record<string, unknown>;

function json(data: Resp, status = 200, headers: HeadersInit = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", ...headers },
    });
}

function corsHeaders(origin: string | null) {
    // ✅ allowlist
    const allow = new Set([
        "https://chriontoken.com",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]);

    // ✅ origin null olabilir (file://, bazı proxy’ler)
    const o = (origin && allow.has(origin)) ? origin : "https://chriontoken.com";

    return {
        "Access-Control-Allow-Origin": o,
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info",
    };
}

async function verifyUser(req: Request) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const auth = req.headers.get("authorization") || "";

    if (!auth.toLowerCase().startsWith("bearer ")) return null;

    const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: anonKey, authorization: auth },
    });

    if (!r.ok) return null;
    return await r.json();
}

async function openAIChartAnalysis(imageDataUrl: string) {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY missing");

    const payload = {
        model: "gpt-4.1-mini",
        input: [
            {
                role: "user",
                content: [
                    {
                        type: "input_text",
                        text: `You are a trading chart parser.
TASK:
1) First decide if this image is a TRADING PRICE CHART (candles/lines + axes + ticker/timeframe). If not a chart, respond with is_chart=false and invalid_reason.
2) If it IS a chart, infer:
- detected_market: forex | crypto | metals | energy | indices | stocks | unknown
- detected_pair: like EURUSD, BTCUSD, XAUUSD, USOIL, SPX, etc. If uncertain: "unknown"
- detected_timeframe: like 1m/5m/15m/1h/4h/1D/1W etc. If uncertain: "unknown"
3) Provide analysis fields:
trend, bias, confidence (0-1),
summary, setup,
key_levels.support[] (numbers), key_levels.resistance[] (numbers),
trade_idea: { entry, stop_loss, take_profit[], rr_notes },
disclaimer: "Not financial advice."

Return STRICT JSON only, no markdown, no extra text.`,
                    },
                    { type: "input_image", image_url: imageDataUrl },
                ],
            },
        ],
    };

    const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    const text = await r.text();
    if (!r.ok) throw new Error(`OpenAI error ${r.status}: ${text}`);

    const obj = JSON.parse(text);

    // ✅ daha sağlam parse
    const outText =
        obj?.output?.[0]?.content?.find((c: any) => c.type === "output_text")?.text ??
        obj?.output_text ??
        obj?.response?.output_text ??
        "";

    if (!outText) throw new Error("OpenAI returned empty output_text");

    return JSON.parse(outText);
}

Deno.serve(async (req) => {
    const origin = req.headers.get("origin");
    const cors = corsHeaders(origin);

    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors });
    }

    if (req.method !== "POST") {
        return json({ ok: false, error: "Method not allowed" }, 405, cors);
    }

    const user = await verifyUser(req);
    if (!user) return json({ ok: false, error: "Unauthorized" }, 401, cors);

    const body = await req.json().catch(() => null);
    if (!body) return json({ ok: false, error: "invalid json" }, 400, cors);

    const market = String(body.market || "auto");
    const pair = String(body.pair || "").trim().toUpperCase();
    const timeframe = String(body.timeframe || "").trim().toUpperCase();
    const image_data_url = String(body.image_data_url || "");

    if (!image_data_url.startsWith("data:image/")) {
        return json({ ok: false, error: "image_data_url is required (data:image/...)" }, 400, cors);
    }

    try {
        const analysis = await openAIChartAnalysis(image_data_url);

        return json(
            {
                ok: true,
                input: {
                    market,
                    pair,
                    timeframe,
                    image_size_base64: image_data_url.length,
                },
                analysis,
                timestamp: new Date().toISOString(),
            },
            200,
            cors
        );
    } catch (e) {
        return json({ ok: false, error: String((e as any)?.message || e) }, 500, cors);
    }
});
