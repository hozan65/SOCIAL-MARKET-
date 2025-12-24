/* =========================
  FEED.JS (NO MODULE / NO IMPORT)
  - Supabase CDN (READ ONLY)
  - Like / Comment / Follow: Netlify Functions (Appwrite JWT)
  - News slider (Supabase news table)
  - Top Crypto (CoinGecko public API)
========================= */

console.log("✅ feed.js running");

// =========================
// SUPABASE (READ ONLY)
// =========================
const SUPABASE_URL = "https://yzrhqduuqvllatliulqv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_dN5E6cw7uaKj7Cmmpo7RJg_W4FWxjs_";

const sb = window.supabase?.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// =========================
// NETLIFY FUNCTIONS
// =========================
const FN_TOGGLE_LIKE = "/.netlify/functions/toggle_like";
const FN_ADD_COMMENT = "/.netlify/functions/add_comment";
const FN_TOGGLE_FOLLOW = "/.netlify/functions/toggle_follow";

// =========================
// DOM
// =========================
const grid = document.getElementById("postsGrid");
const msg = document.getElementById("feedMsg");
const newsSlider = document.getElementById("feed-news-slider");

// TOP CRYPTO DOM (varsayım)
const cryptoGrid = document.getElementById("cryptoGrid");     // (HTML'de olmalı)
const cryptoMsg = document.getElementById("cryptoMsg");       // (opsiyonel)
const cryptoTabs = document.querySelectorAll(".gTab[data-tab]");

// =========================
// HELPERS
// =========================
function setMsg(t) {
    if (msg) msg.textContent = t || "";
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

// =========================
// COMMENTS UI CSS (inject)
// =========================
(function injectCommentsCSS() {
    const css = `
  .commentsWrap{
    display:none;
    margin-top:12px;
    border:1px solid rgba(15,23,42,.10);
    background: rgba(255,255,255,.95);
    border-radius:16px;
    padding:12px;
    box-shadow: 0 14px 30px rgba(15,23,42,.08);
  }
  .post-card.isCommentsOpen .commentsWrap{ display:block; }
  .cHead{ display:flex;align-items:center;justify-content:space-between; gap:10px;margin-bottom:10px; }
  .cTitle{ font-weight:900;font-size:13px;color:rgba(15,23,42,.85); }
  .cClose{ width:34px;height:34px;border-radius:12px;border:1px solid rgba(15,23,42,.10);background:#fff;font-weight:900;cursor:pointer; }

  .commentsList{
    max-height:220px;
    overflow:auto;
    display:flex;flex-direction:column;gap:8px;
    padding-right:4px;margin-bottom:10px;
  }
  .commentItem{ border:1px solid rgba(15,23,42,.08);background:#fff;border-radius:14px;padding:10px; }
  .commentText{ font-size:13px;font-weight:800;color:rgba(15,23,42,.86);line-height:1.25; }
  .commentMeta{ margin-top:6px;font-size:11px;font-weight:800;color:rgba(15,23,42,.50); }

  .commentForm{ display:flex;gap:8px;align-items:center; }
  .commentInput{
    flex:1;height:40px;padding:0 12px;border-radius:14px;
    border:1px solid rgba(15,23,42,.12);
    outline:none;font-weight:800;
  }
  .commentSend{
    height:40px;padding:0 14px;border-radius:14px;
    border:1px solid rgba(15,23,42,.12);
    background:#fff;font-weight:900;cursor:pointer;
  }
  `;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
})();

// =========================
// AUTH (Appwrite JWT from /assets/jwt.js)
// =========================
function getJWT() {
    const jwt = window.SM_JWT || localStorage.getItem("sm_jwt");
    if (!jwt) throw new Error("Login required");
    return jwt;
}

async function fnPost(url, body) {
    const jwt = getJWT();
    const r = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify(body || {}),
    });

    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error || `Request failed (${r.status})`);
    return j;
}

// =========================
// ✅ FUNCTIONS (correct payload keys)
// =========================
async function toggleLike(postId) {
    return fnPost(FN_TOGGLE_LIKE, { post_id: String(postId) });
}

async function addComment(postId, text) {
    const content = String(text || "").trim();
    if (!content) throw new Error("Empty comment");
    return fnPost(FN_ADD_COMMENT, { post_id: String(postId), content });
}

async function toggleFollow(targetUserId) {
    if (!targetUserId) throw new Error("Author id missing");
    return fnPost(FN_TOGGLE_FOLLOW, { following_id: String(targetUserId) });
}

// =========================
// READ HELPERS (Supabase SELECT)
// =========================
async function getLikeCount(postId) {
    if (!sb) throw new Error("Supabase CDN not loaded");
    const { count, error } = await sb
        .from("post_likes")
        .select("*", { count: "exact", head: true })
        .eq("post_id", postId);

    if (error) throw error;
    return count || 0;
}

async function loadComments(postId, limit = 30) {
    if (!sb) throw new Error("Supabase CDN not loaded");
    const { data, error } = await sb
        .from("post_comments")
        .select("id, user_id, content, created_at")
        .eq("post_id", postId)
        .order("created_at", { ascending: true })
        .limit(limit);

    if (error) throw error;
    return data || [];
}

// =========================
// RENDER POST
// =========================
function renderPost(row) {
    const market = esc(row.market);
    const category = esc(row.category);
    const timeframe = esc(row.timeframe);
    const pairsText = esc(formatPairs(row.pairs));
    const content = esc(row.content);
    const image = row.image_path || "";
    const created = formatTime(row.created_at);

    const postId = esc(row.id);
    const authorId = esc(row.author_id || "");

    return `
  <article class="post-card" data-post-id="${postId}">
    <div class="tags">
      <span>${market || "MARKET"}</span>
      <span>${category || "Category"}</span>
      <span>${timeframe || "TF"}</span>
    </div>

    ${
        image
            ? `<img class="post-img" src="${esc(image)}" alt="chart" loading="lazy">`
            : `<div class="chart-placeholder">NO IMAGE</div>`
    }

    <h3>${pairsText || "PAIR"}</h3>
    <p>${content || ""}</p>

    <div class="post-meta" style="margin-top:10px;color:rgba(15,23,42,.55);font-weight:800;font-size:12px">
      ${created}
    </div>

    <div class="post-actions">
      <button class="likeBtn" data-post-id="${postId}">
        ❤️ <span class="likeCount">0</span>
      </button>

      <button class="commentToggleBtn" data-post-id="${postId}">
        💬 Comment
      </button>

      <button class="followBtn" data-user-id="${authorId}">
        ➕ Follow
      </button>
    </div>

    <div class="commentsWrap" data-post-id="${postId}">
      <div class="cHead">
        <div class="cTitle">Comments</div>
        <button class="cClose" type="button" data-post-id="${postId}">✕</button>
      </div>

      <div class="commentsList"></div>

      <form class="commentForm" data-post-id="${postId}">
        <input class="commentInput" placeholder="..." maxlength="280" />
        <button class="commentSend" type="submit">Send</button>
      </form>
    </div>
  </article>`;
}

// =========================
// HYDRATE LIKE COUNTS
// =========================
async function hydrateNewPosts(justAddedRows) {
    if (!grid) return;
    for (const r of justAddedRows) {
        try {
            const postId = String(r.id);
            const c = await getLikeCount(postId);
            const btn = grid.querySelector(`.likeBtn[data-post-id="${postId}"]`);
            const span = btn?.querySelector(".likeCount");
            if (span) span.textContent = String(c);
        } catch {}
    }
}

// =========================
// POSTS SHOW MORE (5 by 5)
// =========================
const POSTS_STEP = 5;
let postsPage = 0;
let postsBusy = false;
let postsHasMore = true;

function ensurePostsMoreUI() {
    if (!grid) return;

    let wrap = document.getElementById("postsMoreWrap");
    if (!wrap) {
        wrap = document.createElement("div");
        wrap.id = "postsMoreWrap";
        wrap.className = "postsMoreWrap";
        grid.insertAdjacentElement("afterend", wrap);
    }

    if (!postsHasMore) {
        wrap.innerHTML = `<div class="postsMoreEnd">No more posts</div>`;
        return;
    }

    wrap.innerHTML = `<button id="postsMoreBtn" class="postsMoreBtn" type="button">Show more</button>`;
    const btn = document.getElementById("postsMoreBtn");
    if (btn) btn.onclick = () => loadFeedMore();
}

function setPostsMoreLoading() {
    const wrap = document.getElementById("postsMoreWrap");
    if (wrap) wrap.innerHTML = `<button class="postsMoreBtn" type="button" disabled>Loading…</button>`;
}

async function loadFeed(reset = false) {
    if (!grid) return;
    if (!sb) {
        setMsg("❌ Supabase CDN not loaded");
        return;
    }

    if (reset) {
        postsPage = 0;
        postsBusy = false;
        postsHasMore = true;
        grid.innerHTML = "";
        setMsg("Loading feed...");
    }

    await loadFeedMore();
}

async function loadFeedMore() {
    if (!grid || !sb || postsBusy || !postsHasMore) return;
    postsBusy = true;
    setMsg("");

    try {
        ensurePostsMoreUI();
        setPostsMoreLoading();

        const from = postsPage * POSTS_STEP;
        const to = from + POSTS_STEP - 1;

        const { data, error } = await sb
            .from("analyses")
            .select("id, author_id, market, category, timeframe, content, pairs, image_path, created_at")
            .order("created_at", { ascending: false })
            .range(from, to);

        if (error) throw error;

        const rows = data || [];

        if (postsPage === 0 && rows.length === 0) {
            setMsg("No analyses yet.");
            postsHasMore = false;
            ensurePostsMoreUI();
            return;
        }

        grid.insertAdjacentHTML("beforeend", rows.map(renderPost).join(""));
        await hydrateNewPosts(rows);

        if (rows.length < POSTS_STEP) postsHasMore = false;
        else postsPage++;

        ensurePostsMoreUI();
        setMsg("");
    } catch (err) {
        console.error(err);
        setMsg("❌ Feed error: " + (err?.message || "unknown"));
        ensurePostsMoreUI();
    } finally {
        postsBusy = false;
    }
}

// =========================
// NEWS (Supabase -> Slider)
// =========================
async function fetchNews(limit = 6) {
    if (!sb) throw new Error("Supabase CDN not loaded");

    // ✅ Tablo/kolon farklıysa burayı değiştir
    const { data, error } = await sb
        .from("news")
        .select("id, title, image_url, url, source, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);

    if (error) throw error;
    return data || [];
}

function renderNewsSlide(n, active = false) {
    const title = esc(n.title || "");
    const img = esc(n.image_url || "");
    const url = esc(n.url || "#");
    const source = esc(n.source || "");
    const time = formatTime(n.created_at);

    return `
    <div class="newsSlide ${active ? "active" : ""}" data-url="${url}">
      ${
        img
            ? `<img class="newsSlideImg" src="${img}" alt="" loading="lazy">`
            : `<div class="newsSlideSkeleton">NO IMAGE</div>`
    }
      <div class="newsOverlay">
        <h4 class="newsTitle">${title}</h4>
        <div class="newsMeta">${source ? source + " • " : ""}${time}</div>
      </div>
    </div>
  `;
}

let newsTimer = null;

function startNewsAutoRotate() {
    if (!newsSlider) return;
    const slides = Array.from(newsSlider.querySelectorAll(".newsSlide"));
    if (slides.length <= 1) return;

    let idx = 0;
    clearInterval(newsTimer);
    newsTimer = setInterval(() => {
        slides[idx]?.classList.remove("active");
        idx = (idx + 1) % slides.length;
        slides[idx]?.classList.add("active");
    }, 4500);
}

async function loadNews() {
    if (!newsSlider) return;

    newsSlider.innerHTML = `<div class="newsSlideSkeleton">Loading news…</div>`;

    try {
        const items = await fetchNews(6);
        if (!items.length) {
            newsSlider.innerHTML = `<div class="newsSlideSkeleton">No news yet.</div>`;
            return;
        }

        newsSlider.innerHTML = items.map((n, i) => renderNewsSlide(n, i === 0)).join("");
        startNewsAutoRotate();
    } catch (err) {
        console.error("❌ News error:", err);
        newsSlider.innerHTML = `<div class="newsSlideSkeleton">News unavailable</div>`;
    }
}

// Click slide -> open URL
document.addEventListener("click", (e) => {
    const slide = e.target.closest(".newsSlide");
    if (!slide) return;
    const url = slide.dataset.url;
    if (url && url !== "#") window.open(url, "_blank", "noopener");
});

// =========================
// TOP CRYPTO (CoinGecko)
// =========================
const CG = "https://api.coingecko.com/api/v3";
const MEME_IDS = ["dogecoin","shiba-inu","pepe","dogwifcoin","bonk","floki"].join(",");

function setCryptoMsg(t){
    if (cryptoMsg) cryptoMsg.textContent = t || "";
}

function renderCoinCards(list){
    if (!cryptoGrid) return;
    cryptoGrid.innerHTML = (list || []).map((c) => {
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

async function cgJson(url){
    const r = await fetch(url, { headers: { accept: "application/json" }});
    if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
    return r.json();
}

async function loadTrending(){
    if (!cryptoGrid) return;
    setCryptoMsg("Loading trending...");

    const j = await cgJson(`${CG}/search/trending`);
    const coins = (j.coins || []).slice(0, 10);
    const ids = coins.map(x => x?.item?.id).filter(Boolean).join(",");
    if (!ids) { renderCoinCards([]); setCryptoMsg(""); return; }

    const markets = await cgJson(`${CG}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids)}&order=market_cap_desc&per_page=10&page=1&sparkline=false&price_change_percentage=24h`);
    const map = new Map((markets || []).map(m => [m.id, m]));

    const merged = coins.map(t => {
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
    setCryptoMsg("");
}

async function loadGainers(){
    if (!cryptoGrid) return;
    setCryptoMsg("Loading gainers...");

    const j = await cgJson(`${CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=24h`);
    const sorted = (j || [])
        .filter(x => typeof x.price_change_percentage_24h === "number")
        .sort((a,b) => b.price_change_percentage_24h - a.price_change_percentage_24h)
        .slice(0, 10);

    renderCoinCards(sorted);
    setCryptoMsg("");
}

async function loadMeme(){
    if (!cryptoGrid) return;
    setCryptoMsg("Loading meme coins...");

    const j = await cgJson(`${CG}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(MEME_IDS)}&order=market_cap_desc&per_page=20&page=1&sparkline=false&price_change_percentage=24h`);
    renderCoinCards((j || []).slice(0, 10));
    setCryptoMsg("");
}

async function loadVolume(){
    if (!cryptoGrid) return;
    setCryptoMsg("Loading top volume...");

    const j = await cgJson(`${CG}/coins/markets?vs_currency=usd&order=volume_desc&per_page=10&page=1&sparkline=false&price_change_percentage=24h`);
    renderCoinCards(j || []);
    setCryptoMsg("");
}

async function loadCryptoTab(tab){
    try{
        if (tab === "trending") return await loadTrending();
        if (tab === "gainers") return await loadGainers();
        if (tab === "meme") return await loadMeme();
        if (tab === "volume") return await loadVolume();
    } catch(e){
        console.error("❌ crypto error:", e);
        setCryptoMsg("Crypto unavailable");
        if (cryptoGrid) cryptoGrid.innerHTML = "";
    }
}

// tabs click
function initCryptoTabs(){
    if (!cryptoTabs?.length) return;
    cryptoTabs.forEach(btn => {
        btn.addEventListener("click", () => {
            cryptoTabs.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            loadCryptoTab(btn.dataset.tab);
        });
    });

    // default
    const active = document.querySelector('.gTab[data-tab].active') || cryptoTabs[0];
    if (active) loadCryptoTab(active.dataset.tab);
}

// =========================
// EVENTS (Like/Comment/Follow)
// =========================
document.addEventListener("click", async (e) => {
    // COMMENTS CLOSE
    const closeBtn = e.target.closest(".cClose");
    if (closeBtn) {
        const postId = closeBtn.dataset.postId;
        document.querySelector(`.post-card[data-post-id="${postId}"]`)?.classList.remove("isCommentsOpen");
        return;
    }

    // LIKE
    const likeBtn = e.target.closest(".likeBtn");
    if (likeBtn) {
        const postId = likeBtn.dataset.postId;
        likeBtn.disabled = true;
        try {
            await toggleLike(postId);
            const c = await getLikeCount(postId);
            likeBtn.querySelector(".likeCount").textContent = String(c);
        } catch (err) {
            alert("❌ " + (err?.message || err));
        } finally {
            likeBtn.disabled = false;
        }
        return;
    }

    // COMMENT TOGGLE
    const tgl = e.target.closest(".commentToggleBtn");
    if (tgl) {
        const postId = tgl.dataset.postId;
        const card = document.querySelector(`.post-card[data-post-id="${postId}"]`);
        if (!card) return;

        const isOpen = card.classList.contains("isCommentsOpen");
        document.querySelectorAll(".post-card.isCommentsOpen").forEach(x => x.classList.remove("isCommentsOpen"));

        if (!isOpen) {
            card.classList.add("isCommentsOpen");
            try {
                const list = await loadComments(postId);
                const box = card.querySelector(`.commentsWrap[data-post-id="${postId}"] .commentsList`);
                if (box) {
                    box.innerHTML = list.map(c => `
            <div class="commentItem">
              <div class="commentText">${esc(c.content)}</div>
              <div class="commentMeta">${formatTime(c.created_at)}</div>
            </div>
          `).join("");
                    box.scrollTop = box.scrollHeight;
                }
            } catch (err) {
                alert("❌ " + (err?.message || err));
            }
        }
        return;
    }

    // FOLLOW
    const followBtn = e.target.closest(".followBtn");
    if (followBtn) {
        const targetUserId = followBtn.dataset.userId;
        followBtn.disabled = true;
        try {
            const r = await toggleFollow(targetUserId);
            followBtn.textContent = r?.following ? "Following" : "➕ Follow";
        } catch (err) {
            alert("❌ " + (err?.message || err));
        } finally {
            followBtn.disabled = false;
        }
        return;
    }
});

document.addEventListener("submit", async (e) => {
    const f = e.target.closest(".commentForm");
    if (!f) return;

    e.preventDefault();
    const postId = f.dataset.postId;

    const card = document.querySelector(`.post-card[data-post-id="${postId}"]`);
    const input = card?.querySelector(`.commentsWrap[data-post-id="${postId}"] .commentInput`);
    const text = input?.value || "";

    const btn = f.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;

    try {
        await addComment(postId, text);
        if (input) input.value = "";

        const list = await loadComments(postId);
        const box = card?.querySelector(`.commentsWrap[data-post-id="${postId}"] .commentsList`);
        if (box) {
            box.innerHTML = list.map(c => `
        <div class="commentItem">
          <div class="commentText">${esc(c.content)}</div>
          <div class="commentMeta">${formatTime(c.created_at)}</div>
        </div>
      `).join("");
            box.scrollTop = box.scrollHeight;
        }
    } catch (err) {
        alert("❌ " + (err?.message || err));
    } finally {
        if (btn) btn.disabled = false;
    }
});

// =========================
// INIT
// =========================
document.addEventListener("DOMContentLoaded", () => {
    loadNews();       // ✅ NEWS
    initCryptoTabs(); // ✅ TOP CRYPTO
    loadFeed(true);   // ✅ POSTS
});
