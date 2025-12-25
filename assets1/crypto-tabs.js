// /assets1/crypto-tabs.js
// ✅ Top Crypto: CoinGecko
// ✅ Tabs + Search + 3s refresh + 3s cache
// ✅ Cards: ICON + SYMBOL only
// ✅ Works with your HTML ids:
//    #cryptoGrid, #cryptoMsg, #cryptoSearch, .gTab[data-tab]

(() => {
    const cryptoGrid = document.getElementById("cryptoGrid");
    const cryptoMsg = document.getElementById("cryptoMsg");
    const cryptoSearch = document.getElementById("cryptoSearch");
    const cryptoTabs = Array.from(document.querySelectorAll(".gTab[data-tab]"));

    if (!cryptoGrid || !cryptoTabs.length) return;

    const CG = "https://api.coingecko.com/api/v3";
    const REFRESH_MS = 3000;     // ✅ 3 saniye
    const CACHE_MS = 3000;       // ✅ 3 saniye cache

    let activeTab = (document.querySelector('.gTab[data-tab].active')?.dataset.tab) || "trending";
    let timer = null;
    let lastList = [];          // arama filtresi için son liste

    // ---------- helpers ----------
    const esc = (s) =>
        String(s ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");

    function setCryptoMsg(t) {
        if (cryptoMsg) cryptoMsg.textContent = t || "";
    }

    function fmtUsd(n) {
        const x = Number(n);
        if (!isFinite(x)) return "-";
        if (x >= 1) {
            return x.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
        }
        return x.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 6 });
    }

    // ✅ 3 sn cache
    async function cgJson(url) {
        const key = "cg_cache_" + url;
        const cached = localStorage.getItem(key);
        if (cached) {
            try {
                const obj = JSON.parse(cached);
                if (Date.now() - obj.t < CACHE_MS) return obj.v;
            } catch {}
        }

        const r = await fetch(url, { headers: { accept: "application/json" } });
        if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
        const v = await r.json();

        try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch {}
        return v;
    }

    // ICON + SYMBOL only
    function renderCoinCards(list) {
        lastList = Array.isArray(list) ? list : [];

        const q = String(cryptoSearch?.value || "").trim().toLowerCase();

        const filtered = !q
            ? lastList
            : lastList.filter(c => {
                const sym = String(c.symbol || "").toLowerCase();
                const id = String(c.id || "").toLowerCase();
                const name = String(c.name || "").toLowerCase();
                return sym.includes(q) || id.includes(q) || name.includes(q);
            });

        cryptoGrid.innerHTML = filtered.map((c) => {
            const sym = esc(String(c.symbol || "").toUpperCase()) || "—";
            const img = esc(c.image || "");
            const price = c.current_price != null ? fmtUsd(c.current_price) : "-";

            const chgNum = Number(c.price_change_percentage_24h);
            const chgText = isFinite(chgNum) ? `${chgNum.toFixed(2)}%` : "-";
            const chgClass = !isFinite(chgNum) ? "" : (chgNum >= 0 ? "chgUp" : "chgDown");

            return `
        <div class="coinCard" title="${sym}">
          <div class="coinLeft">
            ${img ? `<img class="coinIcon" src="${img}" alt="${sym}" loading="lazy">` : `<div class="coinIcon"></div>`}
            <div class="coinSymbol">${sym}</div>
          </div>

          <div class="coinRight">
            <div class="coinPrice">${price}</div>
            <div class="coinChg ${chgClass}">${chgText}</div>
          </div>
        </div>
      `;
        }).join("");
    }

    // ---------- loaders ----------
    async function loadTrending() {
        setCryptoMsg("Loading trending...");
        const j = await cgJson(`${CG}/search/trending`);

        const coins = (j?.coins || []).slice(0, 10);
        const ids = coins.map(x => x?.item?.id).filter(Boolean).join(",");

        if (!ids) { renderCoinCards([]); setCryptoMsg(""); return; }

        const markets = await cgJson(
            `${CG}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids)}&order=market_cap_desc&per_page=10&page=1&sparkline=false&price_change_percentage=24h`
        );

        // coins order korunur
        const map = new Map((markets || []).map(m => [m.id, m]));
        const merged = coins.map(t => {
            const id = t?.item?.id;
            const m = map.get(id) || {};
            return {
                id,
                symbol: t?.item?.symbol,
                image: t?.item?.thumb || t?.item?.large,
                current_price: m.current_price,
                price_change_percentage_24h: m.price_change_percentage_24h,
            };
        });

        renderCoinCards(merged);
        setCryptoMsg("");
    }

    async function loadGainers() {
        setCryptoMsg("Loading gainers...");

        // 200 al -> en çok artan 10 seç (daha iyi)
        const j = await cgJson(
            `${CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=200&page=1&sparkline=false&price_change_percentage=24h`
        );

        const sorted = (j || [])
            .filter(x => typeof x.price_change_percentage_24h === "number")
            .sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h)
            .slice(0, 10);

        renderCoinCards(sorted);
        setCryptoMsg("");
    }

    async function loadLosers() {
        setCryptoMsg("Loading losers...");

        const j = await cgJson(
            `${CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=200&page=1&sparkline=false&price_change_percentage=24h`
        );

        const sorted = (j || [])
            .filter(x => typeof x.price_change_percentage_24h === "number")
            .sort((a, b) => a.price_change_percentage_24h - b.price_change_percentage_24h)
            .slice(0, 10);

        renderCoinCards(sorted);
        setCryptoMsg("");
    }

    async function loadVolume() {
        setCryptoMsg("Loading volume...");
        const j = await cgJson(
            `${CG}/coins/markets?vs_currency=usd&order=volume_desc&per_page=10&page=1&sparkline=false&price_change_percentage=24h`
        );
        renderCoinCards(j || []);
        setCryptoMsg("");
    }

    async function loadActiveTab() {
        try {
            if (activeTab === "trending") return await loadTrending();
            if (activeTab === "gainers") return await loadGainers();
            if (activeTab === "losers")  return await loadLosers();
            if (activeTab === "volume")  return await loadVolume();
        } catch (e) {
            console.error("❌ crypto error:", e);
            setCryptoMsg("Crypto unavailable");
            cryptoGrid.innerHTML = "";
        }
    }

    // ---------- auto refresh ----------
    function start() {
        stop();
        timer = setInterval(loadActiveTab, REFRESH_MS);
    }
    function stop() {
        if (timer) clearInterval(timer);
        timer = null;
    }

    // ---------- events ----------
    cryptoTabs.forEach(btn => {
        btn.addEventListener("click", () => {
            cryptoTabs.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            activeTab = btn.dataset.tab || "trending";
            loadActiveTab();
        });
    });

    if (cryptoSearch) {
        cryptoSearch.addEventListener("input", () => renderCoinCards(lastList));
    }

    // ---------- init ----------
    loadActiveTab();
    start();

    // sayfa gizlenince gereksiz refresh yapma
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) stop();
        else { loadActiveTab(); start(); }
    });

})();
