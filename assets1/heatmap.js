// /assets1/heatmap.js
// REALTIME HEATMAP (Binance WebSocket) - NO SEARCH - NO MESSAGE
// - Uses WS @ticker streams for live updates
// - Universe:
//    - top_volume: refresh list from REST every 60s, WS live between
//    - top_mcap_like ("Majors"): fixed majors list (fills up to LIMIT with top_volume if needed)
// - Metric:
//    - change: shows 24h % change
//    - volume: shows quote volume (24h)
// - No "updated" text, no logs, no search.

(() => {
    const grid = document.getElementById("heatmapGrid");
    const metricSel = document.getElementById("heatmapMetric");
    const uniSel = document.getElementById("heatmapUniverse");

    // msg exists in HTML, but we keep it empty always
    const msg = document.getElementById("heatmapMsg");
    if (msg) msg.textContent = "";

    if (!grid) return;

    // ===== CONFIG =====
    const REST_24H = "https://api.binance.com/api/v3/ticker/24hr";
    const WS_BASE = "wss://stream.binance.com:9443/stream?streams=";

    const LIMIT = 36;

    // top_volume list refresh (WS is realtime between refreshes)
    const LIST_REFRESH_MS = 60_000;

    // majors list (you can edit)
    const MAJORS = [
        "BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","ADAUSDT","DOGEUSDT",
        "AVAXUSDT","LINKUSDT","DOTUSDT","TRXUSDT","TONUSDT","MATICUSDT","ATOMUSDT",
        "LTCUSDT","BCHUSDT","APTUSDT","SUIUSDT","OPUSDT","ARBUSDT",
        "NEARUSDT","AAVEUSDT","INJUSDT","ETCUSDT","XLMUSDT","FILUSDT"
    ];

    // ===== STATE =====
    let activeSymbols = [];
    let rowsBySym = new Map(); // sym -> { sym, chg24, vol, last }
    let ws = null;

    let listTimer = null;
    let renderRaf = 0;

    // ===== HELPERS =====
    const esc = (s) =>
        String(s ?? "")
            .replaceAll("&","&amp;")
            .replaceAll("<","&lt;")
            .replaceAll(">","&gt;")
            .replaceAll('"',"&quot;")
            .replaceAll("'","&#039;");

    function isUsdtSpot(sym){
        const s = String(sym || "");
        if (!s.endsWith("USDT")) return false;
        if (s.includes("UPUSDT") || s.includes("DOWNUSDT") || s.includes("BULLUSDT") || s.includes("BEARUSDT")) return false;
        if (s === "BUSDUSDT" || s === "USDCUSDT" || s === "TUSDUSDT") return false;
        return true;
    }

    function fmtK(n){
        const x = Number(n);
        if (!isFinite(x)) return "-";
        if (x >= 1e9) return (x/1e9).toFixed(2) + "B";
        if (x >= 1e6) return (x/1e6).toFixed(2) + "M";
        if (x >= 1e3) return (x/1e3).toFixed(2) + "K";
        return String(Math.round(x));
    }

    function colorForChange(pct){
        const p = Number(pct);
        if (!isFinite(p)) return { bg:"rgba(255,255,255,.04)" };

        const cap = 12;
        const a = Math.min(Math.abs(p), cap) / cap;
        const alpha = 0.10 + a * 0.40;

        if (p >= 0) return { bg:`rgba(16,185,129,${alpha})` };
        return { bg:`rgba(239,68,68,${alpha})` };
    }

    async function fetch24h(){
        const r = await fetch(REST_24H, { headers: { accept: "application/json" }});
        if (!r.ok) throw new Error(`Binance REST ${r.status}`);
        return r.json();
    }

    function pickTopVolume(list){
        const rows = (list || [])
            .filter(x => isUsdtSpot(x?.symbol))
            .map(x => ({
                sym: String(x.symbol || "").toUpperCase(),
                chg24: Number(x.priceChangePercent),
                vol: Number(x.quoteVolume),
                last: Number(x.lastPrice),
            }))
            .sort((a,b)=> (b.vol||0) - (a.vol||0))
            .slice(0, LIMIT);

        // seed map
        for (const r of rows){
            const old = rowsBySym.get(r.sym) || {};
            rowsBySym.set(r.sym, {
                sym: r.sym,
                chg24: isFinite(r.chg24) ? r.chg24 : old.chg24,
                vol: isFinite(r.vol) ? r.vol : old.vol,
                last: isFinite(r.last) ? r.last : old.last,
            });
        }

        return rows.map(r => r.sym);
    }

    function pickMajorsFill(list){
        const majors = MAJORS.filter(isUsdtSpot).slice(0, LIMIT);

        // seed majors from REST if exists
        const bySym = new Map((list || []).map(x => [String(x?.symbol||"").toUpperCase(), x]));
        for (const sym of majors){
            const x = bySym.get(sym);
            if (!x) continue;
            const old = rowsBySym.get(sym) || {};
            rowsBySym.set(sym, {
                sym,
                chg24: isFinite(Number(x.priceChangePercent)) ? Number(x.priceChangePercent) : old.chg24,
                vol: isFinite(Number(x.quoteVolume)) ? Number(x.quoteVolume) : old.vol,
                last: isFinite(Number(x.lastPrice)) ? Number(x.lastPrice) : old.last,
            });
        }

        // if majors < LIMIT, fill with top_volume
        if (majors.length < LIMIT){
            const fill = pickTopVolume(list).filter(s => !majors.includes(s));
            return majors.concat(fill).slice(0, LIMIT);
        }

        return majors;
    }

    function makeWsUrl(symbols){
        const streams = (symbols || [])
            .map(s => `${String(s).toLowerCase()}@ticker`)
            .join("/");
        return WS_BASE + streams;
    }

    function closeWS(){
        try { ws?.close(); } catch {}
        ws = null;
    }

    function connectWS(){
        closeWS();
        if (!activeSymbols.length) return;

        ws = new WebSocket(makeWsUrl(activeSymbols));

        ws.onmessage = (ev) => {
            try{
                const payload = JSON.parse(ev.data);
                const d = payload?.data;
                const sym = String(d?.s || "").toUpperCase();
                if (!sym) return;

                // Binance @ticker:
                // c: last price, P: 24h percent change, q: quote volume
                const last = Number(d?.c);
                const chg24 = Number(d?.P);
                const vol = Number(d?.q);

                const old = rowsBySym.get(sym) || { sym };

                rowsBySym.set(sym, {
                    sym,
                    last: isFinite(last) ? last : old.last,
                    chg24: isFinite(chg24) ? chg24 : old.chg24,
                    vol: isFinite(vol) ? vol : old.vol,
                });

                scheduleUpdateTiles();
            } catch {}
        };

        ws.onclose = () => {
            if (document.hidden) return;
            // silent reconnect
            setTimeout(() => {
                if (!document.hidden) connectWS();
            }, 1200);
        };
    }

    function buildGrid(){
        const metric = metricSel?.value || "change";

        grid.innerHTML = activeSymbols.map(sym => {
            const r = rowsBySym.get(sym) || { sym };
            const base = sym.replace("USDT","");

            const chg = Number(r.chg24);
            const vol = Number(r.vol);

            const color = colorForChange(chg).bg;

            const badge =
                metric === "volume"
                    ? `Vol ${esc(fmtK(vol))}`
                    : (isFinite(chg) ? `${chg.toFixed(2)}%` : "-");

            const meta =
                metric === "volume"
                    ? (isFinite(chg) ? `${chg.toFixed(2)}% • 24h` : "24h")
                    : `Vol ${esc(fmtK(vol))}`;

            return `
        <div class="hmTile" data-sym="${esc(sym)}" style="background:${color}">
          <div class="hmTop">
            <div class="hmSym">${esc(base)}</div>
            <div class="hmBadge">${esc(badge)}</div>
          </div>
          <div class="hmMeta">${esc(meta)}</div>
        </div>
      `;
        }).join("");
    }

    function updateTiles(){
        const metric = metricSel?.value || "change";

        for (const sym of activeSymbols){
            const el = grid.querySelector(`.hmTile[data-sym="${CSS.escape(sym)}"]`);
            if (!el) continue;

            const r = rowsBySym.get(sym) || {};
            const chg = Number(r.chg24);
            const vol = Number(r.vol);

            // background by change (always)
            el.style.background = colorForChange(chg).bg;

            const badgeEl = el.querySelector(".hmBadge");
            const metaEl  = el.querySelector(".hmMeta");

            if (badgeEl){
                badgeEl.textContent =
                    metric === "volume"
                        ? `Vol ${fmtK(vol)}`
                        : (isFinite(chg) ? `${chg.toFixed(2)}%` : "-");
            }

            if (metaEl){
                metaEl.textContent =
                    metric === "volume"
                        ? (isFinite(chg) ? `${chg.toFixed(2)}% • 24h` : "24h")
                        : `Vol ${fmtK(vol)}`;
            }
        }

        // no message
        if (msg) msg.textContent = "";
    }

    function scheduleUpdateTiles(){
        if (renderRaf) return;
        renderRaf = requestAnimationFrame(() => {
            renderRaf = 0;
            updateTiles();
        });
    }

    async function refreshUniverse(){
        const u = uniSel?.value || "top_volume";

        let list = [];
        try{
            list = await fetch24h();
        }catch{
            // if REST fails, keep current list, just reconnect WS
            connectWS();
            return;
        }

        const nextSymbols =
            u === "top_mcap_like"
                ? pickMajorsFill(list)
                : pickTopVolume(list);

        // if same list, do nothing
        const same = nextSymbols.length === activeSymbols.length &&
            nextSymbols.every((s,i)=> s === activeSymbols[i]);

        if (same) return;

        activeSymbols = nextSymbols;
        buildGrid();
        connectWS();
    }

    function start(){
        stop();

        refreshUniverse(); // build + connect

        listTimer = setInterval(() => {
            // only top_volume needs periodic refresh; majors can stay stable
            if ((uniSel?.value || "top_volume") === "top_volume") {
                refreshUniverse();
            }
        }, LIST_REFRESH_MS);

        metricSel?.addEventListener("change", () => updateTiles());
        uniSel?.addEventListener("change", () => {
            refreshUniverse();
        });
    }

    function stop(){
        if (listTimer) clearInterval(listTimer);
        listTimer = null;
        closeWS();
    }

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) stop();
        else start();
    });

    start();
})();
