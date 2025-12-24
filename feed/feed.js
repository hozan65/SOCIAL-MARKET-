/* =========================
  FEED.JS (NO MODULE / NO IMPORT)
  - Uses Supabase CDN (global) ONLY FOR READ
  - Loads:
    1) Analyses feed  (SHOW MORE: 5 by 5)
    2) News slider
    3) Top Gainers (Tabs)
  + ✅ Like / Comment / Follow via Netlify Functions (Appwrite JWT)
  + ✅ Better comments UI (drawer + scroll)
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
const FN_TOGGLE_LIKE   = "/.netlify/functions/toggle_like";
const FN_ADD_COMMENT   = "/.netlify/functions/add_comment";
const FN_TOGGLE_FOLLOW = "/.netlify/functions/toggle_follow";

const grid = document.getElementById("postsGrid");
const msg = document.getElementById("feedMsg");
const newsSlider = document.getElementById("feed-news-slider");
const gainersTable = document.getElementById("gainersTable");

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

function fmtPrice(p) {
    const n = Number(p);
    if (!Number.isFinite(n)) return "—";
    const d = n >= 1000 ? 2 : n >= 1 ? 4 : 8;
    return n.toLocaleString("en-US", { maximumFractionDigits: d });
}

function fmtPct(p) {
    const n = Number(p);
    if (!Number.isFinite(n)) return "—";
    return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}

// =========================
// ✅ Inject Comments CSS
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

  .cHead{
    display:flex;align-items:center;justify-content:space-between;
    gap:10px;margin-bottom:10px;
  }
  .cTitle{ font-weight:900;font-size:13px;color:rgba(15,23,42,.85); }
  .cClose{
    width:34px;height:34px;border-radius:12px;
    border:1px solid rgba(15,23,42,.10);
    background:#fff;font-weight:900;cursor:pointer;
  }

  .commentsList{
    max-height:220px;
    overflow:auto;
    display:flex;flex-direction:column;gap:8px;
    padding-right:4px;margin-bottom:10px;
  }

  .commentItem{
    border:1px solid rgba(15,23,42,.08);
    background:#fff;border-radius:14px;padding:10px;
  }
  .commentText{
    font-size:13px;font-weight:800;color:rgba(15,23,42,.86);line-height:1.25;
  }
  .commentMeta{
    margin-top:6px;font-size:11px;font-weight:800;color:rgba(15,23,42,.50);
  }

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
// ✅ AUTH (JWT)  ✅ FIX HERE
// - first: window.SM_JWT  (if you created /assets/jwt.js)
// - second: localStorage sm_jwt
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
            "Authorization": `Bearer ${jwt}`,
        },
        body: JSON.stringify(body || {}),
    });

    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error || `Request failed (${r.status})`);
    return j;
}

// =========================
// ✅ LIKE / COMMENT / FOLLOW (FUNCTIONS)
// =========================
async function toggleLike(postId) {
    return fnPost(FN_TOGGLE_LIKE, { postId }); // { liked, count }
}

async function addComment(postId, text) {
    const content = String(text || "").trim();
    if (!content) throw new Error("Empty comment");
    return fnPost(FN_ADD_COMMENT, { postId, content }); // { ok, comments }
}

async function toggleFollow(targetUserId) {
    if (!targetUserId) throw new Error("Author id missing");
    return fnPost(FN_TOGGLE_FOLLOW, { targetUserId }); // { ok, following }
}

// =========================
// READ HELPERS (Supabase SELECT)
// =========================
async function getLikeCount(postId) {
    if (!sb) throw new Error("Supabase not loaded");
    const { count, error } = await sb
        .from("post_likes")
        .select("*", { count: "exact", head: true })
        .eq("post_id", postId);

    if (error) throw error;
    return count || 0;
}

async function loadComments(postId, limit = 30) {
    if (!sb) throw new Error("Supabase not loaded");
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
// FEED POSTS
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
        <button class="commentSend" type="submit">Sent</button>
      </form>
    </div>
  </article>`;
}

// =========================
// ✅ AFTER RENDER: update like counts
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

/* =========================
   ✅ POSTS SHOW MORE (5 by 5)
========================= */
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
// ✅ EVENTS
// =========================
document.addEventListener("click", async (e) => {
    // COMMENTS CLOSE (X)
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
            const res = await toggleLike(postId);
            likeBtn.querySelector(".likeCount").textContent = String(res?.count ?? 0);
        } catch (err) {
            alert("❌ " + (err?.message || err));
        } finally {
            likeBtn.disabled = false;
        }
        return;
    }

    // COMMENT TOGGLE (drawer)
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
        const res = await addComment(postId, text);
        if (input) input.value = "";

        const list = Array.isArray(res?.comments) ? res.comments : await loadComments(postId);

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
// NEWS SLIDER (same as yours)
// =========================
let sliderIdx = 0;
let sliderTimer = null;

function renderNews(items) {
    if (!newsSlider) return;

    if (!items || items.length === 0) {
        newsSlider.innerHTML = `<div class="newsSlideSkeleton">No news yet.</div>`;
        return;
    }

    const n = items[sliderIdx % items.length];
    const img = n.image_url ? esc(n.image_url) : "";
    const title = esc(n.title || "Untitled");
    const cat = esc((n.category || "general").toUpperCase());
    const created = formatTime(n.created_at);

    newsSlider.innerHTML = `
    <div class="newsSlide active" data-id="${esc(n.id)}" style="position:relative;inset:0;">
      ${
        img
            ? `<img class="newsSlideImg" src="${img}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:16px;" loading="lazy">`
            : `<div style="height:100%;display:grid;place-items:center;background:rgba(37,99,235,.22);border-radius:16px;color:#fff;font-weight:900">NEWS</div>`
    }
      <div class="newsOverlay" style="position:absolute;left:0;right:0;bottom:0;padding:14px;background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.7));border-radius:0 0 16px 16px;">
        <div style="color:#fff;font-weight:900;font-size:15px;line-height:1.2">${title}</div>
        <div style="margin-top:6px;color:rgba(255,255,255,.85);font-weight:800;font-size:11px">${cat} • ${created}</div>
      </div>
    </div>
  `;

    newsSlider.querySelector(".newsSlide")?.addEventListener("click", () => {
        window.location.href = `../news/news.html?id=${encodeURIComponent(n.id)}`;
    });
}

async function loadNewsSlider() {
    if (!newsSlider) return;
    if (!sb) {
        newsSlider.innerHTML = `<div class="newsSlideSkeleton">Supabase not loaded.</div>`;
        return;
    }

    try {
        const { data, error } = await sb
            .from("news")
            .select("id,title,category,image_url,created_at")
            .order("created_at", { ascending: false })
            .limit(8);

        if (error) throw error;

        const items = data || [];
        sliderIdx = 0;
        renderNews(items);

        if (sliderTimer) clearInterval(sliderTimer);
        sliderTimer = setInterval(() => {
            if (document.visibilityState !== "visible") return;
            sliderIdx++;
            renderNews(items);
        }, 3500);
    } catch (err) {
        console.error(err);
        newsSlider.innerHTML = `<div class="newsSlideSkeleton">❌ News error: ${esc(err?.message || "unknown")}</div>`;
    }
}

// =========================
// TOP GAINERS (same as yours)
// =========================
const PINNED = ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","ADAUSDT","AVAXUSDT","DOGEUSDT"];
const TD_GAINERS_ENDPOINT = "/.netlify/functions/gainers";

let activeGTab = "crypto";
let gainersTimer = null;
let gainersBusy = false;

function ensureGainersSkeleton() {
    if (!gainersTable) return;
    if (gainersTable.dataset.ready === "1") return;

    gainersTable.innerHTML = `
    <div class="gRow gHead">
      <div>PAIR</div>
      <div style="text-align:right">PRICE</div>
      <div style="text-align:right">24H</div>
    </div>

    <div class="gSectionTitle"></div>
    <div id="gPinnedRows"></div>

    <div class="gSectionTitle"></div>
    <div id="gTopRows"></div>
  `;
    gainersTable.dataset.ready = "1";
}

function rowHtml(r) {
    const ch = Number(r.changePct);
    return `
    <div class="gRow">
      <div class="gPair">${esc(r.symbol)}</div>
      <div class="gPrice">${fmtPrice(r.price)}</div>
      <div class="gChg ${ch >= 0 ? "gUp" : "gDn"}">${fmtPct(ch)}</div>
    </div>`;
}

function setRows(id, rows, errText) {
    const el = document.getElementById(id);
    if (!el) return;

    if (errText) {
        el.innerHTML = `<div class="gainersEmpty">❌ ${esc(errText)}</div>`;
        return;
    }

    el.innerHTML = rows && rows.length ? rows.map(rowHtml).join("") : `<div class="gainersEmpty">No data</div>`;
}

function clearRows(id) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = "";
}

function bindGainerTabs() {
    const tabs = document.querySelectorAll(".gTab");
    if (!tabs.length) return;

    tabs.forEach((btn) => {
        btn.addEventListener("click", () => {
            tabs.forEach((x) => x.classList.remove("active"));
            btn.classList.add("active");

            activeGTab = btn.dataset.tab || "crypto";
            gainersBusy = false;

            updateGainers(true);
            resetGainersInterval();
        });
    });
}

function resetGainersInterval() {
    if (gainersTimer) clearInterval(gainersTimer);
    const ms = activeGTab === "crypto" ? 60000 : 120000;

    gainersTimer = setInterval(() => {
        if (document.visibilityState !== "visible") return;
        updateGainers(false);
    }, ms);
}

async function updateGainers() {
    if (!gainersTable || gainersBusy) return;
    if (document.visibilityState !== "visible") return;
    gainersBusy = true;

    try {
        ensureGainersSkeleton();

        if (activeGTab === "crypto") {
            const res = await fetch("https://api.binance.com/api/v3/ticker/24hr", { cache: "no-store" });
            if (!res.ok) throw new Error("Binance API error: " + res.status);

            const all = await res.json();

            const rows = all
                .filter((x) => typeof x.symbol === "string" && x.symbol.endsWith("USDT"))
                .filter((x) => !x.symbol.includes("UPUSDT") && !x.symbol.includes("DOWNUSDT"))
                .filter((x) => !x.symbol.includes("BULLUSDT") && !x.symbol.includes("BEARUSDT"))
                .map((x) => ({
                    symbol: x.symbol,
                    price: Number(x.lastPrice),
                    changePct: Number(x.priceChangePercent),
                    vol: Number(x.quoteVolume),
                }))
                .filter((x) => Number.isFinite(x.price) && Number.isFinite(x.changePct));

            const pinned = PINNED.map((sym) => rows.find((r) => r.symbol === sym)).filter(Boolean);

            const top = rows
                .filter((r) => !PINNED.includes(r.symbol))
                .filter((r) => r.vol > 5_000_000)
                .sort((a, b) => b.changePct - a.changePct)
                .slice(0, 10);

            setRows("gPinnedRows", pinned);
            setRows("gTopRows", top);
            return;
        }

        const r = await fetch(TD_GAINERS_ENDPOINT, { cache: "no-store" });
        if (!r.ok) throw new Error("Proxy API error: " + r.status);

        const j = await r.json();
        const list = Array.isArray(j?.[activeGTab]) ? j[activeGTab] : [];

        clearRows("gPinnedRows");
        setRows("gTopRows", list);
    } catch (err) {
        console.error("GAINERS ERROR:", err);
        ensureGainersSkeleton();
        const t = err?.message || "unknown";
        clearRows("gPinnedRows");
        setRows("gTopRows", null, t);
    } finally {
        gainersBusy = false;
    }
}

// =========================
// TIMERS CONTROL (PERF FIX)
// =========================
function stopAllTimers() {
    if (sliderTimer) { clearInterval(sliderTimer); sliderTimer = null; }
    if (gainersTimer) { clearInterval(gainersTimer); gainersTimer = null; }
}

function resumeTimersAndRefresh() {
    loadNewsSlider();
    updateGainers(true);
    resetGainersInterval();
}

// =========================
// INIT
// =========================
document.addEventListener("DOMContentLoaded", () => {
    loadFeed(true);
    loadNewsSlider();

    bindGainerTabs();
    updateGainers(true);
    resetGainersInterval();

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible") stopAllTimers();
        else resumeTimersAndRefresh();
    });
});
