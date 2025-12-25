// /assets1/fx-heatmap.js
// TradingView style MATRIX heatmap using Binance 24h % change
// Cell = rowChange - colChange (strength difference)
// Refresh: 25s

(() => {
    const wrap = document.getElementById("fxHeatWrap");
    if (!wrap) return;

    const msg = document.getElementById("fxHeatMsg");
    const uniSel = document.getElementById("fxHeatUniverse");

    const REST_24H = "https://api.binance.com/api/v3/ticker/24hr";
    const REFRESH_MS = 25_000;

    const MAJORS = [
        "BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","ADAUSDT","DOGEUSDT",
        "AVAXUSDT","LINKUSDT","DOTUSDT","TRXUSDT","TONUSDT","MATICUSDT","ATOMUSDT"
    ];

    const LIMIT_TOPVOL = 10;

    let timer = null;

    const esc = (s) =>
        String(s ?? "")
            .replaceAll("&","&amp;")
            .replaceAll("<","&lt;")
            .replaceAll(">","&gt;")
            .replaceAll('"',"&quot;")
            .replaceAll("'","&#039;");

    function setMsg(t){
        if (msg) msg.textContent = t || "";
    }

    function isUsdtSpot(sym){
        const s = String(sym || "");
        if (!s.endsWith("USDT")) return false;
        if (s.includes("UPUSDT") || s.includes("DOWNUSDT") || s.includes("BULLUSDT") || s.includes("BEARUSDT")) return false;
        if (s === "BUSDUSDT" || s === "USDCUSDT" || s === "TUSDUSDT") return false;
        return true;
    }

    async function fetch24h(){
        const r = await fetch(REST_24H, { headers: { accept: "application/json" }});
        if (!r.ok) throw new Error(`Binance ${r.status}`);
        return r.json();
    }

    // intensity mapping like TV: clamp around 0..1.2%
    function cellStyle(v){
        const x = Number(v);
        if (!isFinite(x)) return { bg:"rgba(255,255,255,.04)", color:"#fff" };

        // intensity: 0..1 from abs value (cap 1.2)
        const cap = 1.2;
        const t = Math.min(Math.abs(x), cap) / cap;  // 0..1
        const alpha = 0.08 + t * 0.55;               // 0.08..0.63

        if (x >= 0) return { bg:`rgba(16,185,129,${alpha})`, color:"#071a12" };
        return { bg:`rgba(239,68,68,${alpha})`, color:"#1a0609" };
    }

    function pickUniverse(all){
        const u = uniSel?.value || "majors";
        const rows = (all || [])
            .filter(x => isUsdtSpot(x?.symbol))
            .map(x => ({
                sym: String(x.symbol || ""),
                chg: Number(x.priceChangePercent),
                vol: Number(x.quoteVolume),
            }));

        if (u === "top_volume"){
            return rows
                .sort((a,b) => (b.vol||0) - (a.vol||0))
                .slice(0, LIMIT_TOPVOL)
                .map(x => x.sym);
        }

        return [...MAJORS];
    }

    function renderMatrix(symbols, changeMap){
        const bases = symbols.map(s => s.replace("USDT",""));

        let thead = `<thead><tr>`;
        thead += `<th class="fxCorner"> </th>`;
        for (const b of bases){
            thead += `<th>${esc(b)}</th>`;
        }
        thead += `</tr></thead>`;

        let tbody = `<tbody>`;
        for (let i=0; i<bases.length; i++){
            const rowSym = symbols[i];
            const rowBase = bases[i];
            const rowChg = changeMap.get(rowSym);

            tbody += `<tr>`;
            tbody += `<th class="fxRowHead">${esc(rowBase)}</th>`;

            for (let j=0; j<bases.length; j++){
                if (i === j){
                    tbody += `<td class="fxDiag">—</td>`;
                    continue;
                }

                const colSym = symbols[j];
                const colChg = changeMap.get(colSym);

                // strength difference
                const v = (Number(rowChg) - Number(colChg));
                const ok = isFinite(v);
                const txt = ok ? (v > 0 ? `+${v.toFixed(2)}%` : `${v.toFixed(2)}%`) : "-";

                const st = cellStyle(v);
                tbody += `<td class="fxCell" style="background:${st.bg}; color:${st.color};">${esc(txt)}</td>`;
            }

            tbody += `</tr>`;
        }
        tbody += `</tbody>`;

        wrap.innerHTML = `<table class="fxHeatTable">${thead}${tbody}</table>`;
    }

    async function load(){
        try{
            setMsg("");
            const all = await fetch24h();

            const symbols = pickUniverse(all);

            const map = new Map();
            for (const x of all || []){
                const sym = String(x?.symbol || "");
                if (!symbols.includes(sym)) continue;
                map.set(sym, Number(x?.priceChangePercent));
            }

            // eksik varsa 0 yazma, hücrede - çıkmasın
            const missing = symbols.filter(s => !map.has(s));
            if (missing.length){
                console.warn("Missing symbols:", missing);
            }

            renderMatrix(symbols, map);

            const now = new Date();
            setMsg(`Updated: ${now.toLocaleString("tr-TR", { timeStyle:"short", dateStyle:"short" })}`);
        }catch(e){
            console.error(e);
            wrap.innerHTML = "";
            setMsg("Heatmap unavailable");
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

    uniSel?.addEventListener("change", () => start());

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) stop();
        else start();
    });

    start();
})();
