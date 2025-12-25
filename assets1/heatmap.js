// /assets1/heatmap.js
// FAST HEATMAP (Binance 24h) - NO SEARCH
// - Fetch data every 10s (safe + stable)
// - Update "Güncellendi: X sn/dk önce" every 1s
// - Metric: 24h % change OR quote volume
// - Universe: Top by volume OR "Majors"

(() => {
    const grid = document.getElementById("heatmapGrid");
    const msg  = document.getElementById("heatmapMsg");

    const metricSel = document.getElementById("heatmapMetric");
    const uniSel    = document.getElementById("heatmapUniverse");

    if (!grid) {
        console.error("❌ heatmap: #heatmapGrid not found");
        if (msg) msg.textContent = "❌ heatmapGrid bulunamadı (HTML id yanlış)";
        return;
    }

    // ===== CONFIG =====
    const REST_24H = "https://api.binance.com/api/v3/ticker/24hr";

    // "anlık" hissiyat için güvenli aralık:
    // 5 saniye yapabilirsin ama rate-limit riski artar.
    const FETCH_MS = 10_000;

    // Kart sayısı
    const LIMIT = 36;

    // Majors list (istersen değiştir)
    const MAJORS = [
        "BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","ADAUSDT","DOGEUSDT",
        "AVAXUSDT","LINKUSDT","DOTUSDT","TRXUSDT","TONUSDT","MATICUSDT","ATOMUSDT",
        "LTCUSDT","BCHUSDT","APTUSDT","SUIUSDT","OPUSDT","ARBUSDT"
    ];

    // ===== STATE =====
    let lastRows = [];
    let lastUpdateTs = 0;
    let fetchTimer = null;
    let tickTimer  = null;

    // ===== HELPERS =====
    function setMsg(t){ if (msg) msg.textContent = t || ""; }

    function esc(s){
        return String(s ?? "")
            .replaceAll("&","&amp;")
            .replaceAll("<","&lt;")
            .replaceAll(">","&gt;")
            .replaceAll('"',"&quot;")
            .replaceAll("'","&#039;");
    }

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

    function timeAgoTR(ts){
        if (!ts) return "";
        const diff = Date.now() - ts;
        const s = Math.max(0, Math.floor(diff / 1000));
        if (s < 60) return `Güncellendi: ${s} sn önce`;
        const m = Math.floor(s / 60);
        if (m < 60) return `Güncellendi: ${m} dk önce`;
        const h = Math.floor(m / 60);
        return `Güncellendi: ${h} sa önce`;
    }

    function colorForChange(pct){
        const p = Number(pct);
        if (!isFinite(p)) return { bg:"rgba(255,255,255,.04)", cls:"" };

        // yoğunluk
        const cap = 12; // 12% üstü aynı
        const a = Math.min(Math.abs(p), cap) / cap;  // 0..1
        const alpha = 0.10 + a * 0.40;               // 0.10..0.50

        if (p >= 0) return { bg:`rgba(16,185,129,${alpha})`, cls:"hmGreen" };
        return { bg:`rgba(239,68,68,${alpha})`, cls:"hmRed" };
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

        if (u === "top_mcap_like") {
            const set = new Set(MAJORS);
            const majors = rows.filter(r => set.has(r.symbol));

            // majors azsa volume ile tamamla
            const rest = rows
                .filter(r => !set.has(r.symbol))
                .sort((a,b)=> (b.quoteVolume||0) - (a.quoteVolume||0));

            return majors.concat(rest).slice(0, LIMIT);
        }

        // top volume
        return rows
            .sort((a,b)=> (b.quoteVolume||0) - (a.quoteVolume||0))
            .slice(0, LIMIT);
    }

    function render(rows){
        const metric = metricSel?.value || "change";
        const list = (rows || []).slice(0, LIMIT);

        if (!list.length){
            grid.innerHTML = "";
            setMsg("Veri yok");
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

        // mesaj: sadece zaman
        setMsg(timeAgoTR(lastUpdateTs));
    }

    async function load(){
        try{
            const all = await fetch24h();
            lastRows = pickUniverse(all);
            lastUpdateTs = Date.now();
            render(lastRows);
        }catch(e){
            console.error("❌ heatmap failed:", e);
            grid.innerHTML = "";
            setMsg("Heatmap hata: " + (e?.message || "unknown"));
        }
    }

    function start(){
        stop();

        // ilk yükleme
        load();

        // veri çekme
        fetchTimer = setInterval(load, FETCH_MS);

        // 1 sn’de bir sadece "kaç sn önce" güncelle
        tickTimer = setInterval(() => {
            if (lastUpdateTs) setMsg(timeAgoTR(lastUpdateTs));
        }, 1000);

        // UI değişimleri
        metricSel?.addEventListener("change", () => render(lastRows));
        uniSel?.addEventListener("change", () => load());
    }

    function stop(){
        if (fetchTimer) clearInterval(fetchTimer);
        if (tickTimer) clearInterval(tickTimer);
        fetchTimer = null;
        tickTimer = null;
    }

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) stop();
        else start();
    });

    start();
})();
