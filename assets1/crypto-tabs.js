/* =========================================================
  /assets1/crypto-tabs.js
  Top Crypto Tabs + Search (10 items each)
  - Trending / Gainers / Meme / Volume
  - CoinGecko public API (no key)
  - Works as standalone (no imports)
========================================================= */

console.log("✅ crypto-tabs.js loaded");

(() => {
    const CG = "https://api.coingecko.com/api/v3";
    const COIN_LIMIT = 10;

    // ===== DOM (HTML'de bunlar olmalı) =====
    const grid = document.getElementById("cryptoGrid");
    const msg = document.getElementById("cryptoMsg");
    const tabs = document.querySelectorAll(".gTab[data-tab]");
    const search = document.getElementById("cryptoSearch");

    if (!grid) {
        console.warn("⚠️ cryptoGrid not found (Top Crypto box yok).");
        return;
    }

    // ===== State =====
    let ALL = []; // aktif tab'ın 10 coin verisi

    // ===== Helpers =====
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
        if (x >= 1)
            return x.toLocaleString(undefined, {
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 2,
            });
        return x.toLocaleString(undefined, {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 6,
        });
    };

    const setMsg = (t) => {
        if (msg) msg.textContent = t || "";
    };

    async function cgJson(url) {
        const r = await fetch(url, { headers: { accept: "application/json" } });
        if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
        return r.json();
    }

    function render(list) {
        grid.innerHTML = (list || [])
            .map((c) => {
                const name = esc(c.name || "-");
                const sym = esc(String(c.symbol || "").toUpperCase());
                const img = esc(c.image || "");
                const price = c.current_price != null ? fmtUsd(c.current_price) : "-";

                const chgNum = Number(c.price_change_percentage_24h);
                const chgText = isFinite(chgNum) ? `${chgNum.toFixed(2)}%` : "-";
                const chgClass = !isFinite(chgNum)
                    ? ""
                    : chgNum >= 0
                        ? "chgUp"
                        : "chgDown";

                return `
          <div class="coinCard">
            <div class="coinLeft">
              ${
                    img
                        ? `<img class="coinIcon" src="${img}" alt="">`
                        : `<div class="coinIcon"></div>`
                }
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
            })
            .join("");
    }

    function applyFilter() {
        const q = String(search?.value || "").trim().toLowerCase();
        if (!q) {
            render(ALL);
            setMsg("");
            return;
        }
        const filtered = ALL.filter((c) => {
            const n = String(c.name || "").toLowerCase();
            const s = String(c.symbol || "").toLowerCase();
            return n.includes(q) || s.includes(q);
        });
        render(filtered);
        setMsg(filtered.length ? "" : "No results");
    }

    // ===== Loaders (each returns 10 items) =====
    async function loadTrending10() {
        const j = await cgJson(`${CG}/search/trending`);
        const coins = (j.coins || []).slice(0, COIN_LIMIT);

        const ids = coins.map((x) => x?.item?.id).filter(Boolean).join(",");
        if (!ids) return [];

        const markets = await cgJson(
            `${CG}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(
                ids
            )}&order=market_cap_desc&per_page=${COIN_LIMIT}&page=1&sparkline=false&price_change_percentage=24h`
        );
        const map = new Map((markets || []).map((m) => [m.id, m]));

        return coins.map((t) => {
            const id = t?.item?.id;
            const m = map.get(id);
            return {
                name: t?.item?.name,
                symbol: t?.item?.symbol,
                image: t?.item?.large || t?.item?.thumb,
                current_price: m?.current_price,
                price_change_percentage_24h: m?.price_change_percentage_24h,
            };
        });
    }

    async function loadGainers10() {
        const j = await cgJson(
            `${CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=24h`
        );
        return (j || [])
            .filter((x) => typeof x.price_change_percentage_24h === "number")
            .sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h)
            .slice(0, COIN_LIMIT);
    }

    async function loadMeme10() {
        // İstersen burayı genişlet
        const MEME_IDS = [
            "dogecoin",
            "shiba-inu",
            "pepe",
            "dogwifcoin",
            "bonk",
            "floki",
            "mog-coin",
            "baby-doge-coin",
            "memecoin",
            "book-of-meme",
        ].join(",");

        const j = await cgJson(
            `${CG}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(
                MEME_IDS
            )}&order=market_cap_desc&per_page=${COIN_LIMIT}&page=1&sparkline=false&price_change_percentage=24h`
        );
        return (j || []).slice(0, COIN_LIMIT);
    }

    async function loadVolume10() {
        const j = await cgJson(
            `${CG}/coins/markets?vs_currency=usd&order=volume_desc&per_page=${COIN_LIMIT}&page=1&sparkline=false&price_change_percentage=24h`
        );
        return (j || []).slice(0, COIN_LIMIT);
    }

    async function loadTab(tab) {
        setMsg("Loading...");
        grid.innerHTML = "";

        try {
            let list = [];
            if (tab === "trending") list = await loadTrending10();
            if (tab === "gainers") list = await loadGainers10();
            if (tab === "meme") list = await loadMeme10();
            if (tab === "volume") list = await loadVolume10();

            ALL = Array.isArray(list) ? list.slice(0, COIN_LIMIT) : [];
            setMsg("");

            // tab değişince arama sıfırla
            if (search) search.value = "";
            render(ALL);
        } catch (e) {
            console.error("❌ crypto-tabs error:", e);
            ALL = [];
            setMsg("Crypto unavailable");
            grid.innerHTML = "";
        }
    }

    // ===== Init =====
    if (search) search.addEventListener("input", applyFilter);

    tabs.forEach((btn) => {
        btn.addEventListener("click", () => {
            tabs.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            loadTab(btn.dataset.tab);
        });
    });

    // default active tab
    const active = document.querySelector(".gTab[data-tab].active") || tabs[0];
    loadTab(active?.dataset?.tab || "trending");
})();
