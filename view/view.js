/* =========================
  VIEW.JS (ANALYSES + SAFE)
  - sm-api only for reads
  - Like/Follow/Comments: optional (won't break if missing)
========================= */

console.log("✅ view.js running (analyses)");

// =========================
// API BASE
// =========================
const API_BASE = "https://api.chriontoken.com";

// Analyses endpoints
const API_ANALYSIS = (id) => `${API_BASE}/api/analyses/${encodeURIComponent(id)}`;
const API_LIKES_COUNT = (id) => `${API_BASE}/api/analyses/${encodeURIComponent(id)}/likes_count`;

// (Optional future endpoints)
// const API_COMMENTS_LIST = (id) => `${API_BASE}/api/analyses/${encodeURIComponent(id)}/comments?limit=200`;
// const API_COMMENT_ADD  = (id) => `${API_BASE}/api/analyses/${encodeURIComponent(id)}/comments`;
// const API_LIKE_TOGGLE  = (id) => `${API_BASE}/api/analyses/${encodeURIComponent(id)}/like_toggle`;

// =========================
// DOM
// =========================
const postBox = document.getElementById("postBox");
const viewMsg = document.getElementById("viewMsg");

// Optional DOM (if present in HTML)
const commentsList = document.getElementById("commentsList");
const commentForm = document.getElementById("commentForm");
const commentInput = document.getElementById("commentInput");
const cCount = document.getElementById("cCount");

// =========================
// HELPERS
// =========================
function setMsg(t) {
    if (viewMsg) viewMsg.textContent = t || "";
}

function esc(str) {
    return String(str ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatTime(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}

function formatPairs(pairs) {
    if (Array.isArray(pairs)) return pairs.join(", ");
    return String(pairs ?? "");
}

function oneLineText(s) {
    return String(s ?? "").trim();
}

function getIdFromQuery() {
    const u = new URL(window.location.href);
    return String(u.searchParams.get("id") || "").trim();
}

function resolveImageUrl(image_path) {
    const p = String(image_path ?? "").trim();
    if (!p) return "";

    if (p.startsWith("http://") || p.startsWith("https://")) return p;
    if (p.startsWith("/uploads/")) return `${API_BASE}${p}`;
    if (!p.startsWith("/")) return `${API_BASE}/uploads/${p}`;
    return p;
}

async function fetchJson(url, opts = {}, timeoutMs = 8000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
        const r = await fetch(url, { ...opts, signal: ctrl.signal, cache: "no-store" });
        const txt = await r.text();
        let j = null;
        try { j = txt ? JSON.parse(txt) : {}; } catch { j = { raw: txt }; }

        if (!r.ok) throw new Error(j?.error || `Request failed (${r.status})`);
        return j;
    } finally {
        clearTimeout(t);
    }
}

// =========================
// API READS
// =========================
async function getAnalysis(id) {
    const j = await fetchJson(API_ANALYSIS(id));
    // backend may return {ok:true, post:row} or {ok:true, analysis:row}
    return j?.post || j?.analysis || j?.item || j?.data || j;
}

async function getLikeCount(id) {
    try {
        const j = await fetchJson(API_LIKES_COUNT(id));
        // feed.js expects likes_count, but we accept multiple
        const c = Number(j?.likes_count ?? j?.count ?? j?.likes ?? 0);
        return Number.isFinite(c) ? c : 0;
    } catch {
        return 0;
    }
}

// =========================
// RENDER
// =========================
function renderView(row, likeCount) {
    const imgUrl = resolveImageUrl(row.image_path);
    const pairsText = esc(formatPairs(row.pairs));
    const created = esc(formatTime(row.created_at));

    const market = esc(row.market || "");
    const category = esc(row.category || "");
    const timeframe = esc(row.timeframe || "");
    const content = esc(oneLineText(row.content));

    const metaLine =
        `${market}${market && category ? " • " : ""}${category}` +
        `${(market || category) && timeframe ? " • " : ""}${timeframe}`;

    return `
    <div class="pvMedia">
      ${
        imgUrl
            ? `<img class="pvImg" src="${esc(imgUrl)}" alt="" loading="lazy" decoding="async">`
            : `<div class="pvNoImg">NO IMAGE</div>`
    }
    </div>

    <div class="pvHead">
      <div class="pvTitle">${pairsText || "PAIR"}</div>
      <div class="pvMeta">${metaLine}</div>

      <div class="pvSub">
        <div class="pvTime">${created}</div>
      </div>

      <div class="pvActions">
        <button id="pvLikeBtn" class="pvBtn" type="button" disabled>
          ❤️ <span id="pvLikeCount">${likeCount}</span>
        </button>
        <div class="pvHint">Like/Follow/Comments will be enabled after endpoints are added.</div>
      </div>
    </div>

    <div class="pvContent">
      <div class="pvContentHead">
        <div class="pvContentTitle">Analysis</div>
        <button id="pvExpandBtn" class="pvLinkBtn" type="button">Expand</button>
      </div>

      <div id="pvText" class="pvText isClamp">${content || ""}</div>
    </div>
  `;
}

// =========================
// MAIN
// =========================
async function loadAll() {
    const id = getIdFromQuery();
    if (!id) return setMsg("❌ Missing id");

    if (!postBox) return setMsg("❌ postBox not found in view.html");

    setMsg("Loading...");

    try {
        const [post, likeCount] = await Promise.all([
            getAnalysis(id),
            getLikeCount(id),
        ]);

        if (!post || !post.id) {
            setMsg("❌ Post not found");
            return;
        }

        postBox.innerHTML = renderView(post, likeCount);
        setMsg("");

        const pvText = document.getElementById("pvText");
        const pvExpandBtn = document.getElementById("pvExpandBtn");

        pvExpandBtn?.addEventListener("click", () => {
            pvText?.classList.toggle("isClamp");
            pvExpandBtn.textContent = pvText?.classList.contains("isClamp") ? "Expand" : "Collapse";
        });

        // comments UI (optional)
        if (commentsList) commentsList.innerHTML = `<div class="cEmpty">Comments disabled (endpoint not added)</div>`;
        if (cCount) cCount.textContent = "0";
        if (commentForm) commentForm.style.display = "none";

    } catch (err) {
        console.error(err);
        setMsg("❌ " + (err?.message || "unknown"));
    }
}

document.addEventListener("DOMContentLoaded", loadAll);
