// /assets1/heatmap.js  (BINANCE HEATMAP: REST refresh)
// - No API key
// - Updates every 25s
// - Search + metric switch
// - Click opens Binance symbol page (optional)

(() => {
    const grid = document.getElementById("heatmapGrid");
    if (!grid) return;

    const msg = document.getElementById("heatmapMsg");
    const metricSel = document.getElementById("heatmapMetric");
    const universeSel = document.getElementById("heatmapUniverse");
    const search = document.getElementById("heatmapSearch");

    const REST_24H = "https://api.binance.com/api/v3/ticker/24hr";

    // “Majors” gibi sabit liste (istersen artırırız)
    const MAJORS = [
        "BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","ADAUSDT","DOGEUSDT",
        "AVAXUSDT","LINKUSDT","DOTUSDT","TRXUSDT","TONUSDT","MATICUSDT","ATOMUSDT",
        "LTCUSDT","BCHUSDT","APTUSDT","SUIUSDT","OPUSDT","ARBUSDT"
    ];

    // heatmap boyutu (tile sayısı)
    const LIMIT = 36;
    const REFRESH_MS = 25_000;

    let lastRows = [];
    let timer = null;

    const esc = (s) =>
        String(s ?? "")
            .replaceAll("&","&amp;")
            .replaceAll("<","&lt;")
            .replaceAll(">","&gt;")
            .replaceAll('"',"&quot;")
            .replaceAll("'","&#039;");

    function setMsg(t){
        if (!msg) return;
        msg.textContent = t || "";
    }

    function isUsdtSpot(sym){
        const s = String(sym || "");
        if (!s.endsWith("USDT")) return false;
        // leveraged tokens
        if (s.includes("UPUSDT") || s.includes("DOWNUSDT") || s.includes("BULLUSDT") || s.includes("BEARUSDT")) return false;
        // stable-stable vs (istersen filtreleri genişletiriz)
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

    // Renk yoğunluğu: +% -> yeşil, -% -> kırmızı
    function colorForChange(pct){
        const p = Number(pct);
        if (!isFinite(p)) return { bg:"rgba(255,255,255,.04)", cls:"" };

        // clamp: 0..12 arası yoğunluk
        const a = Math.min(Math.abs(p), 12) / 12;  // 0..1
        const alpha = 0.10 + a * 0.40;             // 0.10..0.50

        if (p >= 0){
            return { bg:`rgba(16,185,129,${alpha})`, cls:"hmGreen" };
        }
        return { bg:`rgba(239,68,68,${alpha})`, cls:"hmRed" };
    }

    function render(rows){
        const metric = metricSel?.value || "change";
        const q = String(search?.value || "").trim().toUpperCase();

        const list = (rows || [])
            .filter(r => !q || String(r.symbol || "").includes(q))
            .slice(0, LIMIT);

        if (!list.length){
            grid.innerHTML = "";
            setMsg("No matches.");
            return;
        }

        grid.innerHTML = list.map(r => {
            const sym = String(r.symbol || "");
            const base = sym.replace("USDT","");

            const change = Number(r.priceChangePercent);
            const vol = Number(r.quoteVolume);

            const c = colorForChange(change);

            const badge =
                metric === "volume"
                    ? `Vol ${esc(fmtK(vol))}`
                    : (isFinite(change) ? `${change.toFixed(2)}%` : "-");

            const meta =
                metric === "volume"
                    ? (isFinite(change) ? `${change.toFixed(2)}%  •  24h` : "24h")
                    : `Vol ${esc(fmtK(vol))}`;

            return `
        <div class="hmTile ${c.cls}" data-sym="${esc(sym)}" style="background:${c.bg}">
          <div class="hmTop">
            <div class="hmSym">${esc(base)}</div>
            <div class="hmBadge">${badge}</div>
          </div>
          <div class="hmMeta">${meta}</div>
        </div>
      `;
        }).join("");
    }

    async function fetch24h(){
        const r = await fetch(REST_24H, { headers: { accept: "application/json" }});
        if (!r.ok) throw new Error(`Binance ${r.status}`);
        return r.json();
    }

    function pickUniverse(all){
        const universe = universeSel?.value || "top_volume";

        // filter + normalize
        const rows = (all || [])
            .filter(x => isUsdtSpot(x?.symbol))
            .map(x => ({
                symbol: String(x.symbol || ""),
                priceChangePercent: Number(x.priceChangePercent),
                quoteVolume: Number(x.quoteVolume),
            }));

        if (universe === "top_mcap_like"){
            const set = new Set(MAJORS);
            const majors = rows.filter(r => set.has(r.symbol));
            // eksik varsa doldur
            if (majors.length >= LIMIT) return majors.slice(0, LIMIT);
            const rest = rows
                .filter(r => !set.has(r.symbol))
                .sort((a,b)=> (b.quoteVolume||0) - (a.quoteVolume||0));
            return majors.concat(rest).slice(0, LIMIT);
        }

        // top volume default
        return rows
            .sort((a,b)=> (b.quoteVolume||0) - (a.quoteVolume||0))
            .slice(0, LIMIT);
    }

    async function load(){
        try{
            setMsg("");
            const all = await fetch24h();
            const picked = pickUniverse(all);
            lastRows = picked;
            render(lastRows);
        }catch(e){
            console.error("heatmap error:", e);
            setMsg("Heatmap unavailable");
            grid.innerHTML = "";
        }
    }

    function start(){
        stop();
        load();
        timer = setInterval(load, REFRESH_MS);
    }

    function stop(){
        if (timer) clearInterval(timer);
        timer = null;
    }

    // events
    metricSel?.addEventListener("change", () => render(lastRows));
    universeSel?.addEventListener("change", () => start());
    search?.addEventListener("input", () => render(lastRows));

    // click action (optional): Binance sayfası aç
    document.addEventListener("click", (e) => {
        const tile = e.target.closest(".hmTile");
        if (!tile) return;
        const sym = tile.dataset.sym;
        if (!sym) return;

        // İstersen bunu kapatırız.
        const url = `https://www.binance.com/en/trade/${encodeURIComponent(sym)}?type=spot`;
        window.open(url, "_blank", "noopener");
    });

    // visibility optimize
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) stop();
        else start();
    });

    start();
})();
