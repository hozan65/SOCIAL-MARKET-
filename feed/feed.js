/* =========================
  FEED.JS (NO MODULE / NO IMPORT)
  - Supabase CDN (READ ONLY)
  - Like / Comment / Follow: Netlify Functions (Appwrite JWT)
  - News slider (Supabase news table)
  - NEW:
    ✅ Full photo card UI (same)
    ✅ Image Lightbox (click photo -> zoom)
    ✅ Follow state hydrate on refresh (Supabase check + localStorage fallback)
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
const FN_AUTH_USER = "/.netlify/functions/_auth_user";

// =========================
// DOM
// =========================
const grid = document.getElementById("postsGrid");
const msg = document.getElementById("feedMsg");
const newsSlider = document.getElementById("feed-news-slider");

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

function shortText(s, max = 140) {
    const t = String(s ?? "").trim();
    if (t.length <= max) return t;
    return t.slice(0, max).trim() + "…";
}

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

async function toggleLike(postId) {
    return fnPost(FN_TOGGLE_LIKE, { post_id: String(postId) });
}

async function addComment(postId, text) {
    const content = String(text || "").trim();
    if (!content) throw new Error("Empty comment");
    return fnPost(FN_ADD_COMMENT, { post_id: String(postId), content });
}

/** ✅ FIX: field name must be following_uid (not following_id) */
async function toggleFollow(targetUserId) {
    const id = String(targetUserId || "").trim();
    if (!id) throw new Error("Author id missing");
    return fnPost(FN_TOGGLE_FOLLOW, { following_uid: id });
}

// =========================
// CURRENT USER (for follow hydrate)
// =========================
let _meCache = null;

async function getMyUserId() {
    if (_meCache) return _meCache;

    const jwt = getJWT();
    const r = await fetch(FN_AUTH_USER, {
        headers: { Authorization: `Bearer ${jwt}` },
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error || "Auth user failed");

    // common shapes
    const myUserId = String(j?.user?.$id || j?.user_id || j?.uid || "").trim();
    if (!myUserId) throw new Error("My user id missing");

    _meCache = myUserId;
    return myUserId;
}

// =========================
// FOLLOW CACHE (fallback if Supabase read blocked)
// =========================
function followCacheKey(myId) {
    return `sm_following:${myId}`;
}

function getFollowingSetFromCache(myId) {
    try {
        const raw = localStorage.getItem(followCacheKey(myId));
        const arr = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(arr)) return new Set();
        return new Set(arr.map((x) => String(x)));
    } catch {
        return new Set();
    }
}

function saveFollowingSetToCache(myId, set) {
    try {
        localStorage.setItem(followCacheKey(myId), JSON.stringify(Array.from(set)));
    } catch {}
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

/**
 * Follow check (hydrate)
 * 1) Try Supabase SELECT from follows table (if allowed)
 * 2) Fallback localStorage cache
 *
 * ⚠️ Eğer senin follow tablon/kolonların farklıysa aşağıdaki SELECT kısmını değiştiririz.
 */
async function isFollowingUser(targetUserId) {
    const myId = await getMyUserId();
    const target = String(targetUserId || "").trim();
    if (!target) return false;

    // 1) Try Supabase read
    if (sb) {
        try {
            // ✅ Varsayılan şema:
            // table: follows
            // columns: follower_uid (me), following_uid (target)
            const { data, error } = await sb
                .from("follows")
                .select("id")
                .eq("follower_uid", myId)
                .eq("following_uid", target)
                .limit(1);

            if (!error) return !!(data && data.length);
        } catch {}
    }

    // 2) fallback cache
    const set = getFollowingSetFromCache(myId);
    return set.has(target);
}

// =========================
// LIGHTBOX (Image zoom modal)
// =========================
function ensureLightbox() {
    if (document.getElementById("smLightbox")) return;

    const el = document.createElement("div");
    el.id = "smLightbox";
    el.style.cssText = `
    position:fixed; inset:0; z-index:99999;
    display:none;
    background: rgba(0,0,0,.82);
    backdrop-filter: blur(6px);
    align-items:center; justify-content:center;
    padding: 18px;
  `;

    el.innerHTML = `
    <div id="smLightboxInner" style="
      position:relative;
      width:min(1100px, 100%);
      height:min(78vh, 900px);
      border-radius:16px;
      overflow:hidden;
      background: rgba(15,23,42,.35);
      border:1px solid rgba(255,255,255,.12);
      box-shadow: 0 22px 60px rgba(0,0,0,.35);
    ">
      <button id="smLightboxClose" type="button" style="
        position:absolute; top:10px; right:10px;
        width:40px; height:40px;
        border-radius:999px;
        border:1px solid rgba(255,255,255,.18);
        background: rgba(0,0,0,.35);
        color:#fff;
        font-weight:900;
        cursor:pointer;
        z-index:2;
      ">✕</button>

      <img id="smLightboxImg" alt="" style="
        width:100%;
        height:100%;
        object-fit:contain;
        display:block;
        transform: scale(1);
        transition: transform .15s ease;
      "/>

      <div style="
        position:absolute; left:12px; bottom:12px;
        background: rgba(0,0,0,.40);
        border:1px solid rgba(255,255,255,.12);
        color:#fff;
        border-radius:999px;
        padding:8px 12px;
        font-weight:900;
        font-size:12px;
        z-index:2;
      ">Scroll ile zoom • Sürükle yok</div>
    </div>
  `;
    document.body.appendChild(el);

    // close handlers
    const close = () => {
        el.style.display = "none";
        const img = document.getElementById("smLightboxImg");
        if (img) img.style.transform = "scale(1)";
        el.dataset.zoom = "1";
    };

    el.addEventListener("click", (e) => {
        if (e.target.id === "smLightbox") close();
    });

    document.getElementById("smLightboxClose")?.addEventListener("click", close);

    // wheel zoom
    el.addEventListener(
        "wheel",
        (e) => {
            const img = document.getElementById("smLightboxImg");
            if (!img) return;
            e.preventDefault();

            const cur = Number(el.dataset.zoom || "1") || 1;
            const next = Math.min(3, Math.max(1, cur + (e.deltaY < 0 ? 0.12 : -0.12)));
            el.dataset.zoom = String(next);
            img.style.transform = `scale(${next})`;
        },
        { passive: false }
    );

    // esc close
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && el.style.display === "flex") close();
    });
}

function openLightbox(src) {
    const url = String(src || "").trim();
    if (!url) return;
    ensureLightbox();
    const box = document.getElementById("smLightbox");
    const img = document.getElementById("smLightboxImg");
    if (!box || !img) return;
    img.src = url;
    box.dataset.zoom = "1";
    img.style.transform = "scale(1)";
    box.style.display = "flex";
}

// =========================
// RENDER POST (full photo + overlay + thin action bar)
// =========================
function renderPost(row) {
    const market = esc(row.market);
    const category = esc(row.category);
    const timeframe = esc(row.timeframe);

    const pairsText = esc(formatPairs(row.pairs));
    const contentRaw = String(row.content ?? "");
    const content = esc(shortText(contentRaw, 140));

    const image = row.image_path || "";
    const created = esc(formatTime(row.created_at));

    const postId = esc(row.id);
    const authorId = esc(row.author_id || "");

    const cover = image
        ? `
      <div class="post-cover" data-open-post="${postId}">
        <img class="post-img" src="${esc(image)}" alt="chart" loading="lazy" decoding="async" data-img-src="${esc(image)}">

        <div class="post-tags">
          <span>${market || "MARKET"}</span>
          <span>${category || "Category"}</span>
          <span>${timeframe || "TF"}</span>
        </div>

        <div class="post-overlay">
          <div class="post-overlay-title">${pairsText || "PAIR"}</div>
          ${content ? `<div class="post-overlay-text">${content}</div>` : ""}
          <div class="post-overlay-meta">${created}</div>
        </div>
      </div>
    `
        : `
      <div class="post-cover noimg">
        <div class="chart-placeholder">NO IMAGE</div>
      </div>
    `;

    return `
  <article class="post-card post-photo" data-post-id="${postId}">
    ${cover}

    <div class="post-actionbar">
      <button class="likeBtn" data-post-id="${postId}" title="Like">
        ❤️ <span class="likeCount">0</span>
      </button>

      <button class="commentToggleBtn" data-post-id="${postId}" title="Comment">
        💬
      </button>

      <button class="followBtn" data-user-id="${authorId}" title="Follow" ${authorId ? "" : "disabled"}>
        Follow
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
// HYDRATE LIKE + FOLLOW STATES
// =========================
async function hydrateNewPosts(justAddedRows) {
    if (!grid) return;

    // Like counts
    for (const r of justAddedRows) {
        try {
            const postId = String(r.id);
            const c = await getLikeCount(postId);
            const btn = grid.querySelector(`.likeBtn[data-post-id="${CSS.escape(postId)}"]`);
            const span = btn?.querySelector(".likeCount");
            if (span) span.textContent = String(c);
        } catch {}
    }

    // Follow states
    for (const r of justAddedRows) {
        try {
            const authorId = String(r.author_id || "").trim();
            if (!authorId) continue;

            const btn = grid.querySelector(`.followBtn[data-user-id="${CSS.escape(authorId)}"]`);
            if (!btn || btn.disabled) continue;

            const following = await isFollowingUser(authorId);
            btn.textContent = following ? "Following" : "Follow";
            btn.classList.toggle("isFollowing", !!following);
        } catch {}
    }
}

// =========================
// POSTS SHOW MORE (6 by 6)
// =========================
const POSTS_STEP = 6;
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
    const time = esc(formatTime(n.created_at));

    return `
    <div class="newsSlide ${active ? "active" : ""}" data-url="${url}">
      ${
        img
            ? `<img class="newsSlideImg" src="${img}" alt="" loading="lazy" decoding="async">`
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
    }, 4200);
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

document.addEventListener("click", (e) => {
    const slide = e.target.closest(".newsSlide");
    if (!slide) return;
    const url = slide.dataset.url;
    if (url && url !== "#") window.open(url, "_blank", "noopener");
});

// =========================
// EVENTS (Like/Comment/Follow + Lightbox)
// =========================
document.addEventListener("click", async (e) => {
    // close comments
    const closeBtn = e.target.closest(".cClose");
    if (closeBtn) {
        const postId = closeBtn.dataset.postId;
        document
            .querySelector(`.post-card[data-post-id="${CSS.escape(postId)}"]`)
            ?.classList.remove("isCommentsOpen");
        return;
    }

    // image click -> lightbox
    const cover = e.target.closest(".post-cover");
    if (cover) {
        const img = cover.querySelector("img[data-img-src]");
        const src = img?.getAttribute("data-img-src") || img?.src;
        if (src) openLightbox(src);
        return;
    }

    // like
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

    // comments toggle
    const tgl = e.target.closest(".commentToggleBtn");
    if (tgl) {
        const postId = tgl.dataset.postId;
        const card = document.querySelector(`.post-card[data-post-id="${CSS.escape(postId)}"]`);
        if (!card) return;

        const isOpen = card.classList.contains("isCommentsOpen");
        document
            .querySelectorAll(".post-card.isCommentsOpen")
            .forEach((x) => x.classList.remove("isCommentsOpen"));

        if (!isOpen) {
            card.classList.add("isCommentsOpen");
            try {
                const list = await loadComments(postId);
                const box = card.querySelector(`.commentsWrap[data-post-id="${CSS.escape(postId)}"] .commentsList`);
                if (box) {
                    box.innerHTML = list
                        .map(
                            (c) => `
              <div class="commentItem">
                <div class="commentText">${esc(c.content)}</div>
                <div class="commentMeta">${esc(formatTime(c.created_at))}</div>
              </div>
            `
                        )
                        .join("");
                    box.scrollTop = box.scrollHeight;
                }
            } catch (err) {
                alert("❌ " + (err?.message || err));
            }
        }
        return;
    }

    // follow
    const followBtn = e.target.closest(".followBtn");
    if (followBtn) {
        const targetUserId = followBtn.dataset.userId;
        followBtn.disabled = true;

        try {
            const r = await toggleFollow(targetUserId);
            const isFollowing = !!r?.following;

            followBtn.textContent = isFollowing ? "Following" : "Follow";
            followBtn.classList.toggle("isFollowing", isFollowing);

            // ✅ update cache (so refresh still shows correctly even if Supabase read blocked)
            try {
                const myId = await getMyUserId();
                const set = getFollowingSetFromCache(myId);
                const tid = String(targetUserId || "").trim();
                if (tid) {
                    if (isFollowing) set.add(tid);
                    else set.delete(tid);
                    saveFollowingSetToCache(myId, set);
                }
            } catch {}
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

    const card = document.querySelector(`.post-card[data-post-id="${CSS.escape(postId)}"]`);
    const input = card?.querySelector(`.commentsWrap[data-post-id="${CSS.escape(postId)}"] .commentInput`);
    const text = input?.value || "";

    const btn = f.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;

    try {
        await addComment(postId, text);
        if (input) input.value = "";

        const list = await loadComments(postId);
        const box = card?.querySelector(`.commentsWrap[data-post-id="${CSS.escape(postId)}"] .commentsList`);
        if (box) {
            box.innerHTML = list
                .map(
                    (c) => `
          <div class="commentItem">
            <div class="commentText">${esc(c.content)}</div>
            <div class="commentMeta">${esc(formatTime(c.created_at))}</div>
          </div>
        `
                )
                .join("");
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
    ensureLightbox();
    loadNews();
    loadFeed(true);
});
