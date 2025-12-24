console.log("✅ crypto-tabs.js loaded");

(() => {
    const grid = document.getElementById("cryptoGrid");
    const msg = document.getElementById("cryptoMsg");
    const tabs = document.querySelectorAll('.gTab[data-tab]');
    if (!grid) return;

    const API = "https://api.coingecko.com/api/v3";

    const MEME_IDS = [
        "dogecoin",
        "shiba-inu",
        "pepe",
        "dogwifcoin",
        "bonk",
        "floki"
    ].join(",");

    const fmtUsd = (n) => {
        const x = Number(n);
        if (!isFinite(x)) return "-";
        if (x >= 1) return x.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
        return x.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 6 });
    };

    const esc = (s) =>
        String(s ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");

    const setMsg = (t) => { if (msg) msg.textContent = t || ""; };

    function renderCards(list) {
        grid.innerHTML = (list || []).map((c) => {
            const name = esc(c.name || c.item?.name || "-");
            const sym = esc((c.symbol || c.item?.symbol || "").toUpperCase());
            const img = c.image || c.item?.large || c.item?.thumb || "";
            const price = c.current_price != null ? fmtUsd(c.current_price) : "-";
            const chg = c.price_change_percentage_24h ?? c.item?.data?.price_change_percentage_24h?.usd;

            const chgNum = Number(chg);
            const chgText = isFinite(chgNum) ? `${chgNum.toFixed(2)}%` : "-";
            const chgClass = !isFinite(chgNum) ? "" : (chgNum >= 0 ? "chgUp" : "chgDown");

            return `
        <div class="coinCard">
          <div class="coinLeft">
            ${img ? `<img class="coinIcon" src="${esc(img)}" alt="">` : `<div class="coinIcon"></div>`}
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

    async function fetchJson(url) {
        const r = await fetch(url, { headers: { "accept": "application/json" } });
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json();
    }

    async function loadTrending() {
        setMsg("Loading trending...");
        const j = await fetchJson(`${API}/search/trending`);
        renderCards((j.coins || []).slice(0, 10));
        setMsg("");
    }

    async function loadGainers() {
        setMsg("Loading gainers...");
        const j = await fetchJson(`${API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=24h`);
        const sorted = (j || [])
            .filter(x => typeof x.price_change_percentage_24h === "number")
            .sort((a,b) => b.price_change_percentage_24h - a.price_change_percentage_24h)
            .slice(0, 10);
        renderCards(sorted);
        setMsg("");
    }

    async function loadMeme() {
        setMsg("Loading meme coins...");
        const j = await fetchJson(`${API}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(MEME_IDS)}&order=market_cap_desc&per_page=20&page=1&sparkline=false&price_change_percentage=24h`);
        renderCards((j || []).slice(0, 10));
        setMsg("");
    }

    async function loadVolume() {
        setMsg("Loading top volume...");
        const j = await fetchJson(`${API}/coins/markets?vs_currency=usd&order=volume_desc&per_page=10&page=1&sparkline=false&price_change_percentage=24h`);
        renderCards(j || []);
        setMsg("");
    }

    async function loadTab(tab) {
        try {
            if (tab === "trending") return await loadTrending();
            if (tab === "gainers") return await loadGainers();
            if (tab === "meme") return await loadMeme();
            if (tab === "volume") return await loadVolume();
        } catch (e) {
            console.error("❌ crypto load error:", e);
            setMsg("Crypto data unavailable right now.");
            grid.innerHTML = "";
        }
    }

    tabs.forEach(btn => {
        btn.addEventListener("click", () => {
            tabs.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            loadTab(btn.dataset.tab);
        });
    });

    loadTab("trending");
})();
