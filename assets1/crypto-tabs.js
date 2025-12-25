// /assets1/crypto-tabs.js
// ✅ Top Crypto: tabs + fast render (cache) + short labels (XRP/DOGE) + CoinGecko
(() => {
    const cryptoGrid = document.getElementById("cryptoGrid");
    const cryptoMsg = document.getElementById("cryptoMsg");
    const cryptoTabs = document.querySelectorAll(".gTab[data-tab]");
    const searchInput = document.getElementById("cryptoSearch");

    if (!cryptoGrid) return;

    const CG = "https://api.coingecko.com/api/v3";

    // ------- CACHE -------
    const CRYPTO_CACHE_KEY = "sm_crypto_cache_v2";
    const CRYPTO_CACHE_TTL = 60 * 1000; // 60sn

    function readCache() {
        try {
            const raw = localStorage.getItem(CRYPTO_CACHE_KEY);
            if (!raw) return null;
            const j = JSON.parse(raw);
            if (!j?.ts || !Array.isArray(j?.data)) return null;
            if (Date.now() - j.ts > CRYPTO_CACHE_TTL) return null;
            return j.data;
        } catch {
            return null;
        }
    }

    function writeCache(data) {
        try {
            localStorage.setItem(
                CRYPTO_CACHE_KEY,
                JSON.stringify({ ts: Date.now(), data })
            );
        } catch {}
    }

    // ------- HELPERS -------
    function setCryptoMsg(t) {
        if (cryptoMsg) cryptoMsg.textContent = t || "";
    }

    function esc(str) {
        return String(str ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function fmtUsd(n) {
        const x = Number(n);
        if (!isFinite(x)) return "-";
        if (x >= 1) {
            return x.toLocaleString(undefined, {
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 2,
            });
        }
        return x.toLocaleString(undefined, {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 6,
        });
    }

    function shortLabel(c) {
        const sym = String(c.symbol || "").toUpperCase().trim() || "-";
        const name = String(c.name || "").trim();

        // uzun / saçma ekleri temizle
        const clean = name
            .replace(/bridged|binance|wrapped|wormhole|portal|chain|token/gi, "")
            .replace(/\s+/g, " ")
            .trim();

        // sub: symbol ile aynıysa gösterme
        let sub = clean && clean.toUpperCase() !== sym ? clean : "";
        if (sub.length > 12) sub = sub.slice(0, 12) + "…";

        return { sym, sub };
    }

    function renderCoinCards(list) {
        cryptoGrid.innerHTML = (list || [])
            .map((c) => {
                const { sym, sub } = shortLabel(c);
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
          <div class="coinCard" data-sym="${esc(sym)}" data-name="${esc(
                    String(c.name || "")
                )}">
            <div class="coinLeft">
              ${
                    img
                        ? `<img class="coinIcon" src="${img}" alt="">`
                        : `<div class="coinIcon"></div>`
                }
              <div style="min-width:0">
                <div class="coinName"><span class="coinSym">${esc(sym)}</span></div>
                ${sub ? `<div class="coinSub">${esc(sub)}</div>` : ``}
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

    // ------- FETCH (timeout + abort) -------
    async function cgJson(url, timeoutMs = 6500) {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const r = await fetch(url, {
                headers: { accept: "application/json" },
                signal: controller.signal,
            });
            if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
            return await r.json();
        } finally {
            clearTimeout(t);
        }
    }

    // ------- LOADERS -------
    async function loadTrending() {
        setCryptoMsg("Loading trending...");

        const j = await cgJson(`${CG}/search/trending`);
        const coins = (j.coins || []).slice(0, 10);
        const ids = coins.map((x) => x?.item?.id).filter(Boolean).join(",");
        if (!ids) {
            renderCoinCards([]);
            setCryptoMsg("");
            return [];
        }

        const markets = await cgJson(
            `${CG}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(
                ids
            )}&order=market_cap_desc&per_page=10&page=1&sparkline=false&price_change_percentage=24h`
        );

        const map = new Map((markets || []).map((m) => [m.id, m]));

        const merged = coins.map((t) => {
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

        renderCoinCards(merged);
        writeCache(merged);
        setCryptoMsg("");
        return merged;
    }

    async function loadGainers() {
        setCryptoMsg("Loading gainers...");

        const j = await cgJson(
            `${CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=24h`
        );

        const sorted = (j || [])
            .filter((x) => typeof x.price_change_percentage_24h === "number")
            .sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h)
            .slice(0, 10);

        renderCoinCards(sorted);
        writeCache(sorted);
        setCryptoMsg("");
        return sorted;
    }

    async function loadLosers() {
        setCryptoMsg("Loading losers...");

        const j = await cgJson(
            `${CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=24h`
        );

        const sorted = (j || [])
            .filter((x) => typeof x.price_change_percentage_24h === "number")
            .sort((a, b) => a.price_change_percentage_24h - b.price_change_percentage_24h)
            .slice(0, 10);

        renderCoinCards(sorted);
        writeCache(sorted);
        setCryptoMsg("");
        return sorted;
    }

    async function loadVolume() {
        setCryptoMsg("Loading volume...");

        const j = await cgJson(
            `${CG}/coins/markets?vs_currency=usd&order=volume_desc&per_page=10&page=1&sparkline=false&price_change_percentage=24h`
        );

        renderCoinCards(j || []);
        writeCache(j || []);
        setCryptoMsg("");
        return j || [];
    }

    async function loadTab(tab) {
        // 1) anında cache
        const cached = readCache();
        if (cached?.length) {
            renderCoinCards(cached);
            setCryptoMsg("");
        } else {
            setCryptoMsg("Loading...");
        }

        // 2) güncelle
        try {
            if (tab === "trending") return await loadTrending();
            if (tab === "gainers") return await loadGainers();
            if (tab === "losers") return await loadLosers();
            if (tab === "volume") return await loadVolume();
        } catch (e) {
            console.error("❌ crypto error:", e);
            if (!cached?.length) {
                cryptoGrid.innerHTML = "";
                setCryptoMsg("Crypto unavailable");
            } else {
                setCryptoMsg("");
            }
            return [];
        }
    }

    // ------- SEARCH FILTER -------
    function applySearchFilter(q) {
        const query = String(q || "").trim().toUpperCase();
        const cards = cryptoGrid.querySelectorAll(".coinCard");
        cards.forEach((card) => {
            const sym = (card.getAttribute("data-sym") || "").toUpperCase();
            const name = (card.getAttribute("data-name") || "").toUpperCase();
            const ok = !query || sym.includes(query) || name.includes(query);
            card.style.display = ok ? "" : "none";
        });
    }

    // ------- INIT TABS -------
    function initTabs() {
        if (cryptoTabs?.length) {
            cryptoTabs.forEach((btn) => {
                btn.addEventListener("click", () => {
                    cryptoTabs.forEach((b) => b.classList.remove("active"));
                    btn.classList.add("active");
                    const tab = btn.dataset.tab;
                    loadTab(tab);
                });
            });

            const active =
                document.querySelector(".gTab[data-tab].active") || cryptoTabs[0];
            if (active) loadTab(active.dataset.tab);
        } else {
            // tab yoksa default trending
            loadTab("trending");
        }
    }

    // Search input
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            applySearchFilter(e.target.value);
        });
    }

    // START
    document.addEventListener("DOMContentLoaded", initTabs);
})();
