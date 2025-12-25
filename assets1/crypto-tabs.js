// /assets1/crypto-tabs.js (SILENT + FAST ICONS + NO SEARCH REQUIRED)

(() => {
    const grid = document.getElementById("cryptoGrid");
    const msg = document.getElementById("cryptoMsg");     // varsa kullanır (ama artık yazmayacağız)
    const search = document.getElementById("cryptoSearch"); // SİLİNSE BİLE sorun yok
    const tabBtns = Array.from(document.querySelectorAll(".gTab[data-tab]"));
    if (!grid) return;

    // ====== CONFIG ======
    const DEFAULT_LIST = ["BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT","BNBUSDT","DOGEUSDT","ADAUSDT","AVAXUSDT","LINKUSDT","MATICUSDT"];
    const REST_24H = "https://api.binance.com/api/v3/ticker/24hr";

    // HIZLI çözüm: ikonlar coingecko'dan, ama lazy kapalı (daha hızlı gelir)
    const ICON = {
        BTCUSDT: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
        ETHUSDT: "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
        SOLUSDT: "https://assets.coingecko.com/coins/images/4128/large/solana.png",
        XRPUSDT: "https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png",
        BNBUSDT: "https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png",
        DOGEUSDT:"https://assets.coingecko.com/coins/images/5/large/dogecoin.png",
        ADAUSDT: "https://assets.coingecko.com/coins/images/975/large/cardano.png",
        AVAXUSDT:"https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png",
        LINKUSDT:"https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png",
        MATICUSDT:"https://assets.coingecko.com/coins/images/4713/large/polygon.png",
    };

    // ====== helpers ======
    const esc = (s) =>
        String(s ?? "")
            .replaceAll("&","&amp;")
            .replaceAll("<","&lt;")
            .replaceAll(">","&gt;")
            .replaceAll('"',"&quot;")
            .replaceAll("'","&#039;");

    function fmtUsd(x){
        const n = Number(x);
        if (!isFinite(n)) return "-";
        if (n >= 1) return n.toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:2});
        return n.toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:6});
    }

    // Artık ekranda "Loading/Reconnecting" istemiyorsun:
    function setMsg(_) {
        // istersen console'a:
        // if (_) console.log("[crypto]", _);
        if (msg) msg.textContent = ""; // hep boş kalsın
    }

    // ====== state ======
    let activeTab = (document.querySelector(".gTab[data-tab].active")?.dataset.tab) || "trending";
    let activeSymbols = [...DEFAULT_LIST];
    const state = new Map(); // sym -> {price, chg24, vol}

    let ws = null;
    let renderRaf = 0;

    function render(){
        const q = String(search?.value || "").trim().toUpperCase(); // search yoksa ""

        grid.innerHTML = (activeSymbols || [])
            .filter(sym => !q || sym.includes(q))
            .map(sym => {
                const d = state.get(sym) || {};
                const base = sym.replace("USDT",""); // BTC
                const img = ICON[sym] || "";

                const price = d.price != null ? fmtUsd(d.price) : "-";
                const chgNum = Number(d.chg24);
                const chgText = isFinite(chgNum) ? `${chgNum.toFixed(2)}%` : "-";
                const cls = isFinite(chgNum) ? (chgNum >= 0 ? "chgUp" : "chgDown") : "";

                return `
          <div class="coinCard">
            <div class="coinLeft">
              ${img
                    ? `<img class="coinIcon" src="${esc(img)}" alt="${esc(base)}">`
                    : `<div class="coinIcon"></div>`
                }
              <div class="coinSymbol">${esc(base)}</div>
            </div>

            <div class="coinRight">
              <div class="coinPrice">${price}</div>
              <div class="coinChg ${cls}">${chgText}</div>
            </div>
          </div>
        `;
            }).join("");
    }

    function scheduleRender(){
        if (renderRaf) return;
        renderRaf = requestAnimationFrame(() => {
            renderRaf = 0;
            render();
        });
    }

    if (search) search.addEventListener("input", render);

    // ====== REST top list ======
    async function fetch24h(){
        const r = await fetch(REST_24H, { headers: { accept: "application/json" }});
        if (!r.ok) throw new Error(`Binance REST ${r.status}`);
        return r.json();
    }

    function isUsdtSpotRow(x){
        const sym = String(x?.symbol || "");
        if (!sym.endsWith("USDT")) return false;
        if (sym.includes("UPUSDT") || sym.includes("DOWNUSDT") || sym.includes("BULLUSDT") || sym.includes("BEARUSDT")) return false;
        return true;
    }

    async function buildTopList(tab){
        setMsg(""); // sessiz

        const list = await fetch24h();
        const rows = (list || []).filter(isUsdtSpotRow);

        // state seed
        for (const r of rows) {
            const sym = r.symbol;
            const chg24 = Number(r.priceChangePercent);
            const vol = Number(r.quoteVolume);
            const last = Number(r.lastPrice);
            const old = state.get(sym) || {};
            state.set(sym, {
                price: isFinite(old.price) ? old.price : (isFinite(last) ? last : old.price),
                chg24: isFinite(chg24) ? chg24 : old.chg24,
                vol: isFinite(vol) ? vol : old.vol
            });
        }

        let picked = [];
        if (tab === "gainers") {
            picked = rows.sort((a,b)=>Number(b.priceChangePercent)-Number(a.priceChangePercent)).slice(0,10).map(r=>r.symbol);
        } else if (tab === "losers") {
            picked = rows.sort((a,b)=>Number(a.priceChangePercent)-Number(b.priceChangePercent)).slice(0,10).map(r=>r.symbol);
        } else if (tab === "volume") {
            picked = rows.sort((a,b)=>Number(b.quoteVolume)-Number(a.quoteVolume)).slice(0,10).map(r=>r.symbol);
        } else {
            // trending fallback: volume top
            picked = rows.sort((a,b)=>Number(b.quoteVolume)-Number(a.quoteVolume)).slice(0,10).map(r=>r.symbol);
        }

        activeSymbols = picked.length ? picked : [...DEFAULT_LIST];
        render();
        reconnectWS();
    }

    // ====== WS realtime ======
    function makeWsUrl(symbols){
        const streams = (symbols || []).map(s => `${String(s).toLowerCase()}@ticker`).join("/");
        return `wss://stream.binance.com:9443/stream?streams=${streams}`;
    }

    function closeWS(){
        try { ws?.close(); } catch {}
        ws = null;
    }

    function reconnectWS(){
        closeWS();
        if (!activeSymbols?.length) return;

        ws = new WebSocket(makeWsUrl(activeSymbols));

        ws.onmessage = (ev) => {
            try{
                const payload = JSON.parse(ev.data);
                const d = payload?.data;
                const sym = String(d?.s || "").toUpperCase();
                if (!sym) return;

                const price = Number(d?.c);
                const chg24 = Number(d?.P);
                const vol = Number(d?.q);

                const old = state.get(sym) || {};
                state.set(sym, {
                    price: isFinite(price) ? price : old.price,
                    chg24: isFinite(chg24) ? chg24 : old.chg24,
                    vol: isFinite(vol) ? vol : old.vol,
                });

                scheduleRender();
            } catch {}
        };

        // sessiz reconnect
        ws.onclose = () => {
            if (document.hidden) return;
            setTimeout(() => {
                if (!document.hidden) reconnectWS();
            }, 1200);
        };
    }

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) closeWS();
        else reconnectWS();
    });

    // tabs
    function setActiveTab(tab){
        activeTab = tab;
        tabBtns.forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
        buildTopList(tab).catch(err => {
            console.error(err);
            activeSymbols = [...DEFAULT_LIST];
            render();
            reconnectWS();
        });
    }

    tabBtns.forEach(btn => btn.addEventListener("click", () => setActiveTab(btn.dataset.tab)));

    // init
    setActiveTab(activeTab);

})();
