/* =========================
  FEED.JS (NO MODULE / NO IMPORT)
  - Supabase CDN (READ ONLY)
  - Like / Follow: Netlify Functions (Appwrite JWT)
  - News slider (Supabase news table)
  - NEW:
    ✅ Post click -> /post/view.html?id=...
    ✅ Follow state hydrate on refresh (Supabase check + localStorage fallback)
    ✅ Comments drawer REMOVED from feed
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
function setMsg(t){ if (msg) msg.textContent = t || ""; }

function esc(str){
    return String(str ?? "")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
}

function formatTime(ts){
    if (!ts) return "";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("tr-TR", { dateStyle:"short", timeStyle:"short" });
}

function formatPairs(pairs){
    if (Array.isArray(pairs)) return pairs.join(", ");
    return String(pairs ?? "");
}

function shortText(s, max=140){
    const t = String(s ?? "").trim();
    if (t.length <= max) return t;
    return t.slice(0, max).trim() + "…";
}

// =========================
// AUTH (JWT)
// =========================
function getJWT(){
    const jwt = window.SM_JWT || localStorage.getItem("sm_jwt");
    if (!jwt) throw new Error("Login required");
    return jwt;
}

async function fnPost(url, body){
    const jwt = getJWT();

    const r = await fetch(url, {
        method:"POST",
        headers:{
            "Content-Type":"application/json",
            "Authorization": `Bearer ${jwt}`,
        },
        body: JSON.stringify(body || {})
    });

    const j = await r.json().catch(()=>null);
    if (!r.ok) throw new Error(j?.error || `Request failed (${r.status})`);
    return j;
}

async function toggleLike(postId){
    return fnPost(FN_TOGGLE_LIKE, { post_id: String(postId) });
}

async function toggleFollow(targetUserId){
    const id = String(targetUserId || "").trim();
    if (!id) throw new Error("Author id missing");
    return fnPost(FN_TOGGLE_FOLLOW, { following_uid: id });
}

// =========================
// CURRENT USER (for follow hydrate)
// =========================
let _meCache = null;

async function getMyUserId(){
    if (_meCache) return _meCache;

    const jwt = getJWT();
    const r = await fetch(FN_AUTH_USER, { headers:{ Authorization:`Bearer ${jwt}` }});
    const j = await r.json().catch(()=>null);
    if (!r.ok) throw new Error(j?.error || "Auth user failed");

    const myUserId = String(j?.user?.$id || j?.user_id || j?.uid || "").trim();
    if (!myUserId) throw new Error("My user id missing");
    _meCache = myUserId;
    return myUserId;
}

// =========================
// FOLLOW CACHE (fallback)
// =========================
function followCacheKey(myId){ return `sm_following:${myId}`; }

function getFollowingSetFromCache(myId){
    try{
        const raw = localStorage.getItem(followCacheKey(myId));
        const arr = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(arr)) return new Set();
        return new Set(arr.map((x)=>String(x)));
    }catch{
        return new Set();
    }
}

function saveFollowingSetToCache(myId, set){
    try{
        localStorage.setItem(followCacheKey(myId), JSON.stringify(Array.from(set)));
    }catch{}
}

// =========================
// READ HELPERS (Supabase SELECT)
// =========================
async function getLikeCount(postId){
    if (!sb) throw new Error("Supabase CDN not loaded");
    const { count, error } = await sb
        .from("post_likes")
        .select("*", { count:"exact", head:true })
        .eq("post_id", postId);

    if (error) throw error;
    return count || 0;
}

async function isFollowingUser(targetUserId){
    const myId = await getMyUserId();
    const target = String(targetUserId || "").trim();
    if (!target) return false;

    // 1) Supabase read
    if (sb){
        try{
            const { data, error } = await sb
                .from("follows")
                .select("id")
                .eq("follower_uid", myId)
                .eq("following_uid", target)
                .limit(1);

            if (!error) return !!(data && data.length);
        }catch{}
    }

    // 2) cache
    const set = getFollowingSetFromCache(myId);
    return set.has(target);
}

// =========================
// RENDER POST (same UI, no comments)
// =========================
function renderPost(row){
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
        <img class="post-img" src="${esc(image)}" alt="chart" loading="lazy" decoding="async">

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
      <div class="post-cover noimg" data-open-post="${postId}">
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

      <button class="openBtn" data-open-post="${postId}" title="Open">
        🔎
      </button>

      <button class="followBtn" data-user-id="${authorId}" title="Follow" ${authorId ? "" : "disabled"}>
        Follow
      </button>
    </div>
  </article>`;
}

// =========================
// HYDRATE LIKE + FOLLOW
// =========================
async function hydrateNewPosts(justAddedRows){
    if (!grid) return;

    for (const r of justAddedRows){
        try{
            const postId = String(r.id);
            const c = await getLikeCount(postId);
            const btn = grid.querySelector(`.likeBtn[data-post-id="${CSS.escape(postId)}"]`);
            const span = btn?.querySelector(".likeCount");
            if (span) span.textContent = String(c);
        }catch{}
    }

    for (const r of justAddedRows){
        try{
            const authorId = String(r.author_id || "").trim();
            if (!authorId) continue;

            const btn = grid.querySelector(`.followBtn[data-user-id="${CSS.escape(authorId)}"]`);
            if (!btn || btn.disabled) continue;

            const following = await isFollowingUser(authorId);
            btn.textContent = following ? "Following" : "Follow";
            btn.classList.toggle("isFollowing", !!following);
        }catch{}
    }
}

// =========================
// POSTS SHOW MORE
// =========================
const POSTS_STEP = 6;
let postsPage = 0;
let postsBusy = false;
let postsHasMore = true;

function ensurePostsMoreUI(){
    if (!grid) return;

    let wrap = document.getElementById("postsMoreWrap");
    if (!wrap){
        wrap = document.createElement("div");
        wrap.id = "postsMoreWrap";
        wrap.className = "postsMoreWrap";
        grid.insertAdjacentElement("afterend", wrap);
    }

    if (!postsHasMore){
        wrap.innerHTML = `<div class="postsMoreEnd">No more posts</div>`;
        return;
    }

    wrap.innerHTML = `<button id="postsMoreBtn" class="postsMoreBtn" type="button">Show more</button>`;
    const btn = document.getElementById("postsMoreBtn");
    if (btn) btn.onclick = () => loadFeedMore();
}

function setPostsMoreLoading(){
    const wrap = document.getElementById("postsMoreWrap");
    if (wrap) wrap.innerHTML = `<button class="postsMoreBtn" type="button" disabled>Loading…</button>`;
}

async function loadFeed(reset=false){
    if (!grid) return;
    if (!sb){ setMsg("❌ Supabase CDN not loaded"); return; }

    if (reset){
        postsPage = 0;
        postsBusy = false;
        postsHasMore = true;
        grid.innerHTML = "";
        setMsg("Loading feed...");
    }

    await loadFeedMore();
}

async function loadFeedMore(){
    if (!grid || !sb || postsBusy || !postsHasMore) return;
    postsBusy = true;
    setMsg("");

    try{
        ensurePostsMoreUI();
        setPostsMoreLoading();

        const from = postsPage * POSTS_STEP;
        const to = from + POSTS_STEP - 1;

        const { data, error } = await sb
            .from("analyses")
            .select("id, author_id, market, category, timeframe, content, pairs, image_path, created_at")
            .order("created_at", { ascending:false })
            .range(from, to);

        if (error) throw error;

        const rows = data || [];

        if (postsPage === 0 && rows.length === 0){
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
    }catch(err){
        console.error(err);
        setMsg("❌ Feed error: " + (err?.message || "unknown"));
        ensurePostsMoreUI();
    }finally{
        postsBusy = false;
    }
}

// =========================
// NEWS
// =========================
async function fetchNews(limit=6){
    if (!sb) throw new Error("Supabase CDN not loaded");

    const { data, error } = await sb
        .from("news")
        .select("id, title, image_url, url, source, created_at")
        .order("created_at", { ascending:false })
        .limit(limit);

    if (error) throw error;
    return data || [];
}

function renderNewsSlide(n, active=false){
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

function startNewsAutoRotate(){
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

async function loadNews(){
    if (!newsSlider) return;

    newsSlider.innerHTML = `<div class="newsSlideSkeleton">Loading news…</div>`;

    try{
        const items = await fetchNews(6);
        if (!items.length){
            newsSlider.innerHTML = `<div class="newsSlideSkeleton">No news yet.</div>`;
            return;
        }

        newsSlider.innerHTML = items.map((n,i)=>renderNewsSlide(n,i===0)).join("");
        startNewsAutoRotate();
    }catch(err){
        console.error("❌ News error:", err);
        newsSlider.innerHTML = `<div class="newsSlideSkeleton">News unavailable</div>`;
    }
}

document.addEventListener("click", (e) => {
    const slide = e.target.closest(".newsSlide");
    if (slide){
        const url = slide.dataset.url;
        if (url && url !== "#") window.open(url, "_blank", "noopener");
        return;
    }

    // open post (cover or open btn)
    const open = e.target.closest("[data-open-post]");
    if (open){
        const postId = open.getAttribute("data-open-post");
        if (postId) window.location.href = `/post/view.html?id=${encodeURIComponent(postId)}`;
        return;
    }
});

// like/follow
document.addEventListener("click", async (e) => {
    const likeBtn = e.target.closest(".likeBtn");
    if (likeBtn){
        const postId = likeBtn.dataset.postId;
        likeBtn.disabled = true;
        try{
            await toggleLike(postId);
            const c = await getLikeCount(postId);
            likeBtn.querySelector(".likeCount").textContent = String(c);
        }catch(err){
            alert("❌ " + (err?.message || err));
        }finally{
            likeBtn.disabled = false;
        }
        return;
    }

    const followBtn = e.target.closest(".followBtn");
    if (followBtn){
        const targetUserId = followBtn.dataset.userId;
        followBtn.disabled = true;

        try{
            const r = await toggleFollow(targetUserId);
            const isFollowing = !!r?.following;

            followBtn.textContent = isFollowing ? "Following" : "Follow";
            followBtn.classList.toggle("isFollowing", isFollowing);

            // cache update
            try{
                const myId = await getMyUserId();
                const set = getFollowingSetFromCache(myId);
                const tid = String(targetUserId || "").trim();
                if (tid){
                    if (isFollowing) set.add(tid);
                    else set.delete(tid);
                    saveFollowingSetToCache(myId, set);
                }
            }catch{}
        }catch(err){
            alert("❌ " + (err?.message || err));
        }finally{
            followBtn.disabled = false;
        }
    }
});

// init
document.addEventListener("DOMContentLoaded", () => {
    loadNews();
    loadFeed(true);
});
