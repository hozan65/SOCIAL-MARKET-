/* =========================================================
  /assets1/crypto-tabs.js
  4 Tabs + Search (10 items each)
  - Trending / Gainers / Losers / Volume
  - Search: CoinGecko search -> first 10 results
========================================================= */
console.log("✅ crypto-tabs.js loaded");

(() => {
    const CG = "https://api.coingecko.com/api/v3";
    const LIMIT = 10;

    const grid = document.getElementById("cryptoGrid");
    const msg = document.getElementById("cryptoMsg");
    const tabs = document.querySelectorAll(".gTab[data-tab]");
    const search = document.getElementById("cryptoSearch");

    if (!grid) return;

    let ACTIVE_TAB = "trending";
    let CURRENT_LIST = [];

    const esc = (s) =>
        String(s ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");

    const fmtUsd = (n) => {
        const x = Number(n);
        if (!isFinite(x)) return "-";
        if (x >= 1) return x.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
        return x.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 6 });
    };

    const setMsg = (t) => { if (msg) msg.textContent = t || ""; };

    async function cgJson(url){
        const r = await fetch(url, { headers: { accept: "application/json" }});
        if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
        return r.json();
    }

    function render(list){
        grid.innerHTML = (list || []).map((c) => {
            const name = esc(c.name || "-");
            const sym = esc(String(c.symbol || "").toUpperCase());
            const img = esc(c.image || "");
            const price = c.current_price != null ? fmtUsd(c.current_price) : "-";

            const chgNum = Number(c.price_change_percentage_24h);
            const chgText = isFinite(chgNum) ? `${chgNum.toFixed(2)}%` : "-";
            const chgClass = !isFinite(chgNum) ? "" : (chgNum >= 0 ? "chgUp" : "chgDown");

            return `
        <div class="coinCard">
          <div class="coinLeft">
            ${img ? `<img class="coinIcon" src="${img}" alt="">` : `<div class="coinIcon"></div>`}
            <div style="min-width:0">
              <div class="coinName">${name}<span class="coinSym"> ${sym}</span></div>
            </div>
          </div>
          <div class="coinRight">
            <div class="coinPrice">${price}</div>
            <div class="coinChg ${chgClass}">${chgText}</div>
          </div>
        </div>
      `;
        }).join("");
    }

    // ===== 4 TAB LOADER =====
    async function loadTrending10(){
        const j = await cgJson(`${CG}/search/trending`);
        const coins = (j.coins || []).slice(0, LIMIT);

        const ids = coins.map(x => x?.item?.id).filter(Boolean).join(",");
        if (!ids) return [];

        const markets = await cgJson(
            `${CG}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids)}&order=market_cap_desc&per_page=${LIMIT}&page=1&sparkline=false&price_change_percentage=24h`
        );
        const map = new Map((markets || []).map(m => [m.id, m]));

        return coins.map(t => {
            const id = t?.item?.id;
            const m = map.get(id);
            return {
                name: t?.item?.name,
                symbol: t?.item?.symbol,
                image: t?.item?.large || t?.item?.thumb,
                current_price: m?.current_price,
                price_change_percentage_24h: m?.price_change_percentage_24h
            };
        });
    }

    async function loadTopGainers10(){
        const j = await cgJson(
            `${CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=24h`
        );
        return (j || [])
            .filter(x => typeof x.price_change_percentage_24h === "number")
            .sort((a,b) => b.price_change_percentage_24h - a.price_change_percentage_24h)
            .slice(0, LIMIT);
    }

    async function loadTopLosers10(){
        const j = await cgJson(
            `${CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=24h`
        );
        return (j || [])
            .filter(x => typeof x.price_change_percentage_24h === "number")
            .sort((a,b) => a.price_change_percentage_24h - b.price_change_percentage_24h) // küçükten büyüğe = en çok düşen
            .slice(0, LIMIT);
    }

    async function loadTopVolume10(){
        const j = await cgJson(
            `${CG}/coins/markets?vs_currency=usd&order=volume_desc&per_page=${LIMIT}&page=1&sparkline=false&price_change_percentage=24h`
        );
        return (j || []).slice(0, LIMIT);
    }

    async function loadTab(tab){
        ACTIVE_TAB = tab;
        setMsg("Loading...");
        grid.innerHTML = "";

        try{
            let list = [];
            if (tab === "trending") list = await loadTrending10();
            if (tab === "gainers")  list = await loadTopGainers10();
            if (tab === "losers")   list = await loadTopLosers10();
            if (tab === "volume")   list = await loadTopVolume10();

            CURRENT_LIST = Array.isArray(list) ? list.slice(0, LIMIT) : [];
            setMsg("");

            // tab değişince arama sıfırla
            if (search) search.value = "";
            render(CURRENT_LIST);
        }catch(e){
            console.error("❌ crypto-tabs error:", e);
            CURRENT_LIST = [];
            setMsg("Crypto unavailable");
            grid.innerHTML = "";
        }
    }

    // ===== SEARCH: herhangi coin arama =====
    let searchTimer = null;

    async function runSearch(q){
        const query = String(q || "").trim();
        if (!query) {
            setMsg("");
            render(CURRENT_LIST);
            return;
        }

        setMsg("Searching...");
        try{
            const s = await cgJson(`${CG}/search?query=${encodeURIComponent(query)}`);
            const ids = (s.coins || []).slice(0, LIMIT).map(c => c.id).filter(Boolean).join(",");
            if (!ids){
                setMsg("No results");
                grid.innerHTML = "";
                return;
            }

            const m = await cgJson(
                `${CG}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids)}&order=market_cap_desc&per_page=${LIMIT}&page=1&sparkline=false&price_change_percentage=24h`
            );

            setMsg("");
            render(m.slice(0, LIMIT));
        }catch(e){
            console.error(e);
            setMsg("Search failed");
        }
    }

    if (search){
        search.addEventListener("input", () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => runSearch(search.value), 250);
        });
    }

    // tabs click
    tabs.forEach(btn => {
        btn.addEventListener("click", () => {
            tabs.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            loadTab(btn.dataset.tab);
        });
    });

    // init
    const active = document.querySelector(".gTab[data-tab].active") || tabs[0];
    loadTab(active?.dataset?.tab || "trending");
})();
