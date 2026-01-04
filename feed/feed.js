

console.log("✅ feed.js running");

// =========================
// REALTIME (Socket.IO)
// =========================
function getSocket() {
    // feed.html içine eklediğin: window.rt.socket
    return window.rt?.socket || null;
}

function rtEmit(eventName, payload) {
    try {
        const s = getSocket();
        if (!s) return;
        s.emit(eventName, payload);
    } catch {}
}

function rtOn(eventName, handler) {
    try {
        const s = getSocket();
        if (!s) return;
        s.off?.(eventName);
        s.on(eventName, handler);
    } catch {}
}

// Like update geldiğinde UI güncelle
rtOn("post:like:update", ({ postId, likeCount }) => {
    try {
        const pid = String(postId || "").trim();
        if (!pid) return;

        const btns = document.querySelectorAll(`.likeBtn[data-post-id="${CSS.escape(pid)}"]`);
        btns.forEach((b) => {
            const span = b.querySelector(".likeCount");
            if (span) span.textContent = String(likeCount ?? 0);
        });
    } catch {}
});

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
const FN_TOGGLE_FOLLOW = "/.netlify/functions/toggle_follow";
const FN_AUTH_USER = "/.netlify/functions/_auth_user";
const FN_IS_FOLLOWING = "/.netlify/functions/is_following";

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

function oneLineText(s) {
    return String(s ?? "").trim();
}

function resolveImageUrl(image_path) {
    const p = String(image_path ?? "").trim();
    if (!p) return "";
    if (p.startsWith("http://") || p.startsWith("https://")) return p;
    return `${SUPABASE_URL}/storage/v1/object/public/analysis-images/${p}`;
}

function openPost(postId) {
    const id = String(postId || "").trim();
    if (!id) return;
    window.location.href = `/view/view.html?id=${encodeURIComponent(id)}`;
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
    const r = await fetch(FN_AUTH_USER, { headers: { Authorization: `Bearer ${jwt}` } });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error || "Auth user failed");

    const myUserId = String(j?.user?.$id || j?.user_id || j?.uid || "").trim();
    if (!myUserId) throw new Error("My user id missing");

    _meCache = myUserId;
    return myUserId;
}

// =========================
// FOLLOW CACHE (fallback)
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

/**
 * Follow check (hydrate)
 * ✅ cache first
 * ✅ definitive check via Netlify is_following (JWT) because RLS blocks anon reads
 */
async function isFollowingUser(targetUserId) {
    const target = String(targetUserId || "").trim();
    if (!target) return false;

    // 1) fast cache
    try {
        const myId = await getMyUserId();
        const set = getFollowingSetFromCache(myId);
        if (set.has(target)) return true;
    } catch {}

    // 2) definitive via function (JWT)
    try {
        const jwt = getJWT();
        const r = await fetch(`${FN_IS_FOLLOWING}?id=${encodeURIComponent(target)}`, {
            headers: { Authorization: `Bearer ${jwt}` },
            cache: "no-store",
        });

        const out = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(out?.error || `HTTP ${r.status}`);
        return !!out.is_following;
    } catch {
        // 3) fallback cache
        try {
            const myId = await getMyUserId();
            const set = getFollowingSetFromCache(myId);
            return set.has(target);
        } catch {
            return false;
        }
    }
}

// =========================
// RENDER POST (TradingView-like)
// =========================
function renderPost(row, index = 0) {
    const isFirst = (postsPage === 0 && index === 0); // LCP FIX
    const authorIdRaw = String(row.author_id || "").trim();

    const postId = esc(postIdRaw);
    const authorId = esc(authorIdRaw);

    const imgUrl = resolveImageUrl(row.image_path);
    const pairsText = esc(formatPairs(row.pairs));
    const created = esc(formatTime(row.created_at));

    const market = esc(row.market || "");
    const category = esc(row.category || "");
    const timeframe = esc(row.timeframe || "");

    const contentRaw = oneLineText(row.content);
    const content = esc(contentRaw);

    const metaLine =
        `${market}${market && category ? " • " : ""}${category}` +
        `${(market || category) && timeframe ? " • " : ""}${timeframe}`;

    return `
  <article class="tvCard" data-post-id="${postId}">
    <div class="tvMedia">
      ${
        imgUrl
            ? `<img src="${esc(imgUrl)}" alt="" loading="lazy" decoding="async">`
            : `<div class="tvNoImg">NO IMAGE</div>`
    }
    </div>

    <div class="tvBody">
      <div class="tvTitle">${pairsText || "PAIR"}</div>
      <div class="tvMeta">${metaLine}</div>

      <div class="tvDescRow">
        <div class="tvDesc">${content ? content : ""}</div>
        <div class="tvMore">Show more</div>
      </div>

      <div class="tvFooter">
        <div class="tvTime">${created}</div>
        <div class="tvActions">
          <button class="likeBtn" data-post-id="${postId}" title="Like" type="button">
            ❤️ <span class="likeCount">0</span>
          </button>

          <button class="followBtn ${authorId ? "" : "isDisabled"}"
            data-user-id="${authorId}"
            ${authorId ? "" : "disabled"}
            type="button">Follow</button>
        </div>
      </div>
    </div>
  </article>`;
}

// =========================
// HYDRATE LIKE + FOLLOW STATES
// =========================
async function hydrateNewPosts(justAddedRows) {
    if (!grid) return;

    // like counts + realtime room join
    for (const r of justAddedRows) {
        try {
            const postId = String(r.id);
            const c = await getLikeCount(postId);

            const btn = grid.querySelector(`.likeBtn[data-post-id="${CSS.escape(postId)}"]`);
            const span = btn?.querySelector(".likeCount");
            if (span) span.textContent = String(c);

            rtEmit("join:post", postId);
        } catch {}
    }

    // follow states
    for (const r of justAddedRows) {
        try {
            const authorId = String(r.author_id || "").trim();
            if (!authorId) continue;

            const btn = grid.querySelector(`.followBtn[data-user-id="${CSS.escape(authorId)}"]`);
            if (!btn || btn.disabled) continue;

            try {
                const myId = await getMyUserId();
                if (myId && authorId === myId) {
                    btn.textContent = "You";
                    btn.disabled = true;
                    btn.classList.add("isDisabled");
                    continue;
                }
            } catch {}

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
        setMsg(" Supabase CDN not loaded");
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

        // ✅ card click => view (butonlar hariç)
        for (const r of rows) {
            const pid = String(r.id || "").trim();
            const card = grid.querySelector(`.tvCard[data-post-id="${CSS.escape(pid)}"]`);
            if (!card || card.__bound) continue;
            card.__bound = true;

            card.addEventListener("click", (e) => {
                const btn = e.target.closest("button");
                if (btn) return;
                openPost(pid);
            });

            card.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openPost(pid);
                }
            });

            card.tabIndex = 0;
            card.setAttribute("role", "button");
        }

        if (rows.length < POSTS_STEP) postsHasMore = false;
        else postsPage++;

        ensurePostsMoreUI();
        setMsg("");
    } catch (err) {
        console.error(err);
        setMsg(" Feed error: " + (err?.message || "unknown"));
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

// ✅ DEĞİŞTİR: renderNewsSlide (LCP FIX)
function renderNewsSlide(n, active = false, isFirst = false) {
    const title = esc(n.title || "");
    const img = esc(n.image_url || "");
    const url = esc(n.url || "#");
    const source = esc(n.source || "");
    const time = esc(formatTime(n.created_at));

    // ✅ İlk görsel LCP: eager + fetchpriority high
    const loading = isFirst ? "eager" : "lazy";
    const fetchp = isFirst ? ' fetchpriority="high"' : "";

    // ✅ CLS için yer ayır (reserve)
    const wh = ' width="1200" height="675"';

    return `
    <div class="newsSlide ${active ? "active" : ""}" data-url="${url}">
      ${
        img
            ? `<img class="newsSlideImg" src="${img}" alt="" loading="${loading}" decoding="async"${fetchp}${wh}>`
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

        // ✅ DEĞİŞTİR: map satırı (ilk slide isFirst=true)
        newsSlider.innerHTML = items
            .map((n, i) => renderNewsSlide(n, i === 0, i === 0))
            .join("");

        startNewsAutoRotate();
    } catch (err) {
        console.error(" News error:", err);
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
// EVENTS (Like/Follow)
// =========================
document.addEventListener("click", async (e) => {
    const likeBtn = e.target.closest(".likeBtn");
    if (likeBtn) {
        const postId = String(likeBtn.dataset.postId || "").trim();
        if (!postId) return;

        const countSpan = likeBtn.querySelector(".likeCount");
        const prevCount = countSpan ? Number(countSpan.textContent || 0) : 0;

        const prevLiked = likeBtn.classList.contains("isLiked");
        const nextLiked = !prevLiked;

        // ✅ OPTIMISTIC (ANINDA)
        likeBtn.classList.toggle("isLiked", nextLiked);
        if (countSpan) {
            const nextCount = Math.max(0, prevCount + (nextLiked ? 1 : -1));
            countSpan.textContent = String(nextCount);
        }

        likeBtn.disabled = true;
        likeBtn.classList.add("isLoading");

        try {
            // ✅ server truth: toggle_like zaten { liked, likes_count } döndürüyor
            const out = await toggleLike(postId);
            const liked = !!out?.liked;
            const likesCount = Number(out?.likes_count || 0);

            likeBtn.classList.toggle("isLiked", liked);
            if (countSpan) countSpan.textContent = String(likesCount);

            // ✅ REALTIME: herkese yayın
            let userId = "";
            try { userId = await getMyUserId(); } catch {}
            rtEmit("like:toggle", { postId: String(postId), userId, likeCount: likesCount });

        } catch (err) {
            // ❌ rollback
            console.error("❌ toggleLike failed:", err);
            likeBtn.classList.toggle("isLiked", prevLiked);
            if (countSpan) countSpan.textContent = String(Math.max(0, prevCount));
            alert("❌ " + (err?.message || err));
        } finally {
            likeBtn.disabled = false;
            likeBtn.classList.remove("isLoading");
        }
        return;
    }


    // ✅✅✅ OPTIMISTIC FOLLOW (FIX)
    const followBtn = e.target.closest(".followBtn");
    if (followBtn && !followBtn.disabled) {
        const targetUserId = String(followBtn.dataset.userId || "").trim();
        if (!targetUserId) return;

        // snapshot
        const prevText = followBtn.textContent;
        const prevFollowing = followBtn.classList.contains("isFollowing");

        // optimistic apply (ANINDA)
        const nextFollowing = !prevFollowing;
        followBtn.textContent = nextFollowing ? "Following" : "Follow";
        followBtn.classList.toggle("isFollowing", nextFollowing);

        followBtn.disabled = true;
        followBtn.classList.add("isLoading");

        try {
            const r = await toggleFollow(targetUserId);
            const isFollowing = !!r?.following;

            // server truth
            followBtn.textContent = isFollowing ? "Following" : "Follow";
            followBtn.classList.toggle("isFollowing", isFollowing);

            // cache update
            try {
                const myId = await getMyUserId();
                const set = getFollowingSetFromCache(myId);
                if (isFollowing) set.add(targetUserId);
                else set.delete(targetUserId);
                saveFollowingSetToCache(myId, set);
            } catch {}
        } catch (err) {
            // rollback
            console.error("❌ toggleFollow failed:", err);
            followBtn.textContent = prevText;
            followBtn.classList.toggle("isFollowing", prevFollowing);
            alert("❌ " + (err?.message || err));
        } finally {
            followBtn.disabled = false;
            followBtn.classList.remove("isLoading");
        }
        return;
    }
});

// =========================
// INIT
// =========================
document.addEventListener("DOMContentLoaded", () => {
    loadNews();
    loadFeed(true);
});
