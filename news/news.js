import { supabase } from "../services/supabase.js";

/* =========================
   NEWS.JS (OPTIMIZED)
   - Lazy images
   - Chunked render (no freeze)
   - Event delegation (1 listener)
   - ID->item map (fast modal open)
========================= */

const DEFAULT_IMAGES = {
    crypto: "/img/news-default.jpg",
    forex: "/img/news-default.jpg",
    indices: "/img/news-default.jpg",
    commodities: "/img/news-default.jpg",
    stocks: "/img/news-default.jpg",
    macro: "/img/news-default.jpg",
    all: "/img/news-default.jpg",
};

const VALID_CATS = new Set(["all","crypto","forex","indices","commodities","stocks","macro"]);

let ALL_NEWS = [];
let ACTIVE_CAT = "all";
let ITEM_BY_ID = new Map();

// Render tuning
const CHUNK_SIZE = 12;       // 12-12 bas
const CHUNK_DELAY = 0;       // 0 = requestAnimationFrame
let lastRenderToken = 0;

function escapeHtml(str) {
    return String(str ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatDate(ts) {
    try { return new Date(ts).toLocaleString("tr-TR",{dateStyle:"short",timeStyle:"short"}); }
    catch { return ""; }
}

function normalizeCat(cat) {
    const c = String(cat ?? "").trim().toLowerCase();
    return VALID_CATS.has(c) ? c : "all";
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

function openModal(item) {
    const modal = document.getElementById("news-modal");
    const imgEl = document.getElementById("modal-img");
    const titleEl = document.getElementById("modal-title");
    const textEl = document.getElementById("modal-text");
    const metaEl = document.getElementById("modal-meta");

    const catKey = String(item.category ?? "").toLowerCase();
    const img = item.image_url || DEFAULT_IMAGES[catKey] || "/img/news-default.jpg";

    // ✅ decode async = jank azaltır
    imgEl.decoding = "async";
    imgEl.loading = "eager";
    imgEl.src = img;

    titleEl.textContent = item.title ?? "";
    textEl.textContent = item.body ?? "";
    metaEl.textContent = `${item.category ?? ""} • ${formatDate(item.created_at)}`;

    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
}

function closeModal() {
    const modal = document.getElementById("news-modal");
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
}

function cardHtml(n) {
    const catKey = String(n.category ?? "").toLowerCase();
    const img = n.image_url || DEFAULT_IMAGES[catKey] || "/img/news-default.jpg";

    // ✅ loading="lazy" + decoding="async"
    // ✅ width/height eklemek (CSS ile de olur) layout shift azaltır
    return `
    <article class="news-card" tabindex="0" data-id="${escapeHtml(n.id)}">
      <div class="news-thumb">
        <img class="news-img" src="${escapeHtml(img)}" alt=""
             loading="lazy" decoding="async">
        <div class="news-thumb-overlay"></div>
      </div>
      <div class="news-content">
        <div class="news-title">${escapeHtml(n.title)}</div>
        <div class="news-body">${escapeHtml(n.body)}</div>
        <div class="news-meta">
          <span class="news-cat">${escapeHtml(n.category)}</span>
          <span class="news-dot">•</span>
          <span>${escapeHtml(formatDate(n.created_at))}</span>
        </div>
      </div>
    </article>
  `;
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

    // skeleton
    grid.innerHTML = `<div class="news-loading">Loading…</div>`;

    // ✅ chunk render
    let i = 0;
    grid.innerHTML = ""; // clear

    const step = () => {
        if (token !== lastRenderToken) return; // başka render başladıysa iptal

        const slice = items.slice(i, i + CHUNK_SIZE);
        if (!slice.length) return;

        const html = slice.map(cardHtml).join("");
        grid.insertAdjacentHTML("beforeend", html);

        i += CHUNK_SIZE;

        if (i < items.length) {
            if (CHUNK_DELAY === 0) requestAnimationFrame(step);
            else setTimeout(step, CHUNK_DELAY);
        }
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

function getCatFromUrl() {
    const url = new URL(window.location.href);
    return normalizeCat(url.searchParams.get("cat") || "all");
}

async function loadNews() {
    const grid = document.getElementById("news-grid");
    if (!grid) return;

    grid.innerHTML = `<div class="news-loading">News Loading...</div>`;

    const { data, error } = await supabase
        .from("news")
        .select("id,title,body,category,image_url,created_at")
        .order("created_at", { ascending: false })
        .limit(80);

    if (error) {
        console.error("News load error:", error);
        grid.innerHTML = `<div class="news-empty">Haberler yüklenemedi.</div>`;
        return;
    }

    ALL_NEWS = Array.isArray(data) ? data : [];
    ITEM_BY_ID = new Map(ALL_NEWS.map((x) => [String(x.id), x]));

    applyFilter();
}

function bindGridEvents() {
    const grid = document.getElementById("news-grid");
    if (!grid) return;

    // ✅ tek listener
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
}

document.addEventListener("DOMContentLoaded", () => {
    ACTIVE_CAT = getCatFromUrl();
    setActiveTab(ACTIVE_CAT);

    initTabs();
    bindGridEvents();

    loadNews();

    // modal close
    const modal = document.getElementById("news-modal");
    if (modal) {
        modal.addEventListener("click", (e) => {
            if (e.target?.dataset?.close === "1") closeModal();
        });
    }

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeModal();
    });
});
