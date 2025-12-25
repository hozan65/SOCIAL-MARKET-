// /assets1/heatmap.js (SAFE + DEBUG + ALWAYS SHOW MESSAGE)

(() => {
    const grid = document.getElementById("heatmapGrid");
    const msg = document.getElementById("heatmapMsg");

    const metricSel = document.getElementById("heatmapMetric");
    const uniSel = document.getElementById("heatmapUniverse");
    const search = document.getElementById("heatmapSearch");

    // ====== hard fail if no grid ======
    if (!grid) {
        console.error("❌ heatmap: #heatmapGrid not found");
        if (msg) msg.textContent = "❌ heatmapGrid not found (HTML id wrong)";
        return;
    }

    const REST_24H = "https://api.binance.com/api/v3/ticker/24hr";
    const REFRESH_MS = 25_000;
    const LIMIT = 36;

    const MAJORS = [
        "BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","ADAUSDT","DOGEUSDT",
        "AVAXUSDT","LINKUSDT","DOTUSDT","TRXUSDT","TONUSDT","MATICUSDT","ATOMUSDT",
        "LTCUSDT","BCHUSDT","APTUSDT","SUIUSDT","OPUSDT","ARBUSDT"
    ];

    let lastRows = [];
    let timer = null;

    function setMsg(t){
        if (msg) msg.textContent = t || "";
    }

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
        if (!isFinite(p)) return { bg:"rgba(255,255,255,.04)", cls:"" };

        const cap = 12; // 12% üstü aynı yoğunluk
        const a = Math.min(Math.abs(p), cap) / cap;  // 0..1
        const alpha = 0.10 + a * 0.40;               // 0.10..0.50

        if (p >= 0) return { bg:`rgba(16,185,129,${alpha})`, cls:"hmGreen" };
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
                    ? (isFinite(change) ? `${change.toFixed(2)}% • 24h` : "24h")
                    : `Vol ${esc(fmtK(vol))}`;

            return `
        <div class="hmTile ${c.cls}" style="background:${c.bg}">
          <div class="hmTop">
            <div class="hmSym">${esc(base)}</div>
            <div class="hmBadge">${esc(badge)}</div>
          </div>
          <div class="hmMeta">${esc(meta)}</div>
        </div>
      `;
        }).join("");

        const now = new Date();
        setMsg(`✅ Heatmap JS loaded • Updated ${now.toLocaleTimeString("tr-TR")}`);
    }

    async function fetch24h(){
        const r = await fetch(REST_24H, { headers: { accept: "application/json" }});
        if (!r.ok) throw new Error(`Binance REST ${r.status}`);
        return r.json();
    }

    function pickUniverse(all){
        const u = uniSel?.value || "top_volume";

        const rows = (all || [])
            .filter(x => isUsdtSpot(x?.symbol))
            .map(x => ({
                symbol: String(x.symbol || ""),
                priceChangePercent: Number(x.priceChangePercent),
                quoteVolume: Number(x.quoteVolume),
            }));

        if (u === "top_mcap_like"){
            const set = new Set(MAJORS);
            const majors = rows.filter(r => set.has(r.symbol));
            if (majors.length >= LIMIT) return majors.slice(0, LIMIT);

            const rest = rows
                .filter(r => !set.has(r.symbol))
                .sort((a,b)=> (b.quoteVolume||0) - (a.quoteVolume||0));

            return majors.concat(rest).slice(0, LIMIT);
        }

        return rows
            .sort((a,b)=> (b.quoteVolume||0) - (a.quoteVolume||0))
            .slice(0, LIMIT);
    }

    async function load(){
        try{
            const all = await fetch24h();
            lastRows = pickUniverse(all);
            render(lastRows);
        }catch(e){
            console.error("❌ heatmap failed:", e);
            grid.innerHTML = "";
            setMsg("❌ Heatmap failed: " + (e?.message || "unknown"));
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

    metricSel?.addEventListener("change", () => render(lastRows));
    uniSel?.addEventListener("change", () => start());
    search?.addEventListener("input", () => render(lastRows));

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) stop();
        else start();
    });

    start();
})();
