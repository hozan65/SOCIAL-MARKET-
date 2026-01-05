// /news/news.js (UPDATED - sm-api fetch, NO supabase import)
// Uses API: GET /api/news?limit=80&cat=all (cat optional)
// Expected item fields:
// id, category, title, summary, url, image_url, source, published_at, created_at

/* =========================
   NEWS.JS
   - Filter tabs
   - Chunked render
   - Fast modal open
========================= */

const DEFAULT_IMG = "/img/news-default.jpg";
const VALID_CATS = new Set(["all", "crypto", "forex", "indices", "commodities", "stocks", "macro"]);

let ALL_NEWS = [];
let ACTIVE_CAT = "all";
let ITEM_BY_ID = new Map();

const CHUNK_SIZE = 12;
let lastRenderToken = 0;

const esc = (s) =>
    String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

function normalizeCat(cat) {
    const c = String(cat ?? "").trim().toLowerCase();
    return VALID_CATS.has(c) ? c : "all";
}

function fmtDate(ts) {
    try {
        return new Date(ts).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
    } catch {
        return "";
    }
}

function setActiveTab(cat) {
    document.querySelectorAll(".news-tab").forEach((b) => {
        b.classList.toggle("active", b.dataset.cat === cat);
    });
}

function setUrlCat(cat) {
    const url = new URL(window.location.href);
    if (cat && cat !== "all") url.searchParams.set("cat", cat);
    else url.searchParams.delete("cat");
    window.history.replaceState({}, "", url.toString());
}

function getCatFromUrl() {
    const url = new URL(window.location.href);
    return normalizeCat(url.searchParams.get("cat") || "all");
}

function cardHtml(n) {
    const img = n.image_url || DEFAULT_IMG;
    const title = n.title ?? "";
    const summary = n.summary ?? "";
    const cat = n.category ?? "";
    const time = n.published_at || n.created_at;

    return `
  <article class="news-card" tabindex="0" data-id="${esc(n.id)}">
    <div class="news-thumb">
      <img class="news-img" src="${esc(img)}" alt="" loading="lazy" decoding="async">
      <div class="news-thumb-overlay"></div>
    </div>
    <div class="news-content">
      <div class="news-title">${esc(title)}</div>
      <div class="news-body">${esc(summary)}</div>
      <div class="news-meta">
        <span class="news-cat">${esc(cat)}</span>
        <span class="news-dot">•</span>
        <span>${esc(fmtDate(time))}</span>
      </div>
    </div>
  </article>`;
}

function renderEmpty(grid) {
    grid.innerHTML = `<div class="news-empty">Bu kategoride haber yok.</div>`;
}

function renderGridChunked(grid, items) {
    const token = ++lastRenderToken;

    if (!items || items.length === 0) {
        renderEmpty(grid);
        return;
    }

    grid.innerHTML = "";
    let i = 0;

    const step = () => {
        if (token !== lastRenderToken) return;

        const slice = items.slice(i, i + CHUNK_SIZE);
        if (!slice.length) return;

        grid.insertAdjacentHTML("beforeend", slice.map(cardHtml).join(""));
        i += CHUNK_SIZE;

        if (i < items.length) requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
}

function applyFilter() {
    const grid = document.getElementById("news-grid");
    if (!grid) return;

    const filtered =
        ACTIVE_CAT === "all"
            ? ALL_NEWS
            : ALL_NEWS.filter((n) => String(n.category ?? "").toLowerCase() === ACTIVE_CAT);

    renderGridChunked(grid, filtered);
}

function initTabs() {
    const wrap = document.getElementById("news-tabs");
    if (!wrap) return;

    wrap.addEventListener("click", (e) => {
        const btn = e.target.closest(".news-tab");
        if (!btn) return;

        ACTIVE_CAT = normalizeCat(btn.dataset.cat);
        setActiveTab(ACTIVE_CAT);
        setUrlCat(ACTIVE_CAT);
        applyFilter();
    });
}

function openModal(item) {
    const modal = document.getElementById("news-modal");
    const imgEl = document.getElementById("modal-img");
    const titleEl = document.getElementById("modal-title");
    const textEl = document.getElementById("modal-text");
    const metaEl = document.getElementById("modal-meta");
    const goBtn = document.getElementById("modal-go"); // ✅ optional button

    const img = item.image_url || DEFAULT_IMG;
    if (imgEl) {
        imgEl.decoding = "async";
        imgEl.loading = "eager";
        imgEl.src = img;
    }

    if (titleEl) titleEl.textContent = item.title ?? "";
    if (textEl) textEl.textContent = item.summary ?? "";

    const when = item.published_at || item.created_at;
    const source = item.source ? ` • ${item.source}` : "";
    if (metaEl) metaEl.textContent = `${item.category ?? ""} • ${fmtDate(when)}${source}`;

    // ✅ if url exists, show button
    if (goBtn) {
        const u = (item.url || "").trim();
        if (u) {
            goBtn.hidden = false;
            goBtn.onclick = () => window.open(u, "_blank", "noopener,noreferrer");
        } else {
            goBtn.hidden = true;
            goBtn.onclick = null;
        }
    }

    if (modal) {
        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
    }
    document.body.style.overflow = "hidden";
}

function closeModal() {
    const modal = document.getElementById("news-modal");
    if (modal) {
        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
    }
    document.body.style.overflow = "";
}

function bindGridEvents() {
    const grid = document.getElementById("news-grid");
    if (!grid) return;

    grid.addEventListener("click", (e) => {
        const card = e.target.closest(".news-card");
        if (!card) return;
        const id = String(card.getAttribute("data-id") || "");
        const item = ITEM_BY_ID.get(id);
        if (item) openModal(item);
    });

    grid.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        const card = e.target.closest(".news-card");
        if (!card) return;
        const id = String(card.getAttribute("data-id") || "");
        const item = ITEM_BY_ID.get(id);
        if (item) openModal(item);
    });

    const modal = document.getElementById("news-modal");
    if (modal) {
        modal.addEventListener("click", (e) => {
            if (e.target?.dataset?.close === "1") closeModal();
        });
    }

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeModal();
    });
}

// ✅ API fetch (sm-api behind netlify OR direct)
async function fetchNews({ limit = 80 } = {}) {
    // if you have a gateway route like /api/news (nginx -> sm-api), use it:
    const url = `/api/news?limit=${encodeURIComponent(limit)}`;

    const r = await fetch(url, { cache: "no-store" });
    const out = await r.json().catch(() => ({}));

    if (!r.ok) throw new Error(out?.error || `news fetch failed (${r.status})`);

    // accepted shapes:
    // { list: [...] } OR [...] OR { data:[...] }
    const list = out?.list || out?.data || out;
    return Array.isArray(list) ? list : [];
}

async function loadNews() {
    const grid = document.getElementById("news-grid");
    if (!grid) return;

    grid.innerHTML = `<div class="news-loading">News Loading...</div>`;

    try {
        const data = await fetchNews({ limit: 80 });

        ALL_NEWS = data;
        ITEM_BY_ID = new Map(ALL_NEWS.map((x) => [String(x.id), x]));

        applyFilter();
    } catch (e) {
        console.error("News load error:", e);
        grid.innerHTML = `<div class="news-empty">Haberler yüklenemedi.</div>`;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    ACTIVE_CAT = getCatFromUrl();
    setActiveTab(ACTIVE_CAT);

    initTabs();
    bindGridEvents();
    loadNews();
});
