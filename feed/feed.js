/* =========================
  FEED.JS (FINAL - sm-api)
  - Reads: /api/analyses, /api/news
  - Like/Follow: sm-api (JWT)
  - Realtime: Socket.IO (window.rt.socket)
========================= */

console.log("✅ feed.js running (FINAL sm-api)");

const API_BASE = "https://api.chriontoken.com";
const NEWS_PATH = "/api/news";

// realtime helpers
function getSocket(){ return window.rt?.socket || null; }
function rtEmit(name, payload){ try{ const s=getSocket(); if(s) s.emit(name,payload);}catch{} }
function rtOn(name, fn){ try{ const s=getSocket(); if(!s) return; s.off?.(name); s.on(name, fn);}catch{} }

rtOn("post:like:update", ({ postId, likeCount }) => {
    try {
        const pid = String(postId || "").trim();
        if (!pid) return;
        document.querySelectorAll(`.likeBtn[data-post-id="${CSS.escape(pid)}"]`).forEach((b) => {
            const span = b.querySelector(".likeCount");
            if (span) span.textContent = String(likeCount ?? 0);
        });
    } catch {}
});

// DOM
const grid = document.getElementById("postsGrid");
const msg = document.getElementById("feedMsg");
const newsSlider = document.getElementById("feed-news-slider");

// ui helpers
function setMsg(t){ if(msg) msg.textContent = t || ""; }
function esc(s){
    return String(s ?? "")
        .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
        .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function formatTime(ts){
    if(!ts) return "";
    const d = new Date(ts);
    if(Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("tr-TR", { dateStyle:"short", timeStyle:"short" });
}
function formatPairs(pairs){ return Array.isArray(pairs) ? pairs.join(", ") : String(pairs ?? ""); }
function oneLineText(s){ return String(s ?? "").trim(); }

function resolveImageUrl(image_path){
    const p = String(image_path ?? "").trim();
    if(!p) return "";
    if(p.startsWith("http://") || p.startsWith("https://")) return p;
    if(p.startsWith("/uploads/")) return `${API_BASE}${p}`;
    if(!p.startsWith("/")) return `${API_BASE}/uploads/${p}`;
    return p;
}

function openPost(postId){
    const id = String(postId || "").trim();
    if(!id) return;
    location.href = `/view/view.html?id=${encodeURIComponent(id)}`;
}

// -------------------------
// sm-api helpers (uses sm-api.js if exists)
// -------------------------
async function apiGet(path){
    if (window.smGet) return window.smGet(path);
    const r = await fetch(`${API_BASE}${path}`, { cache:"no-store" });
    const j = await r.json().catch(()=> ({}));
    if(!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    return j;
}
async function apiPost(path, body){
    if (window.smPost) return window.smPost(path, body);
    const jwt = (window.SM_JWT || localStorage.getItem("sm_jwt") || "").trim();
    if(!jwt) throw new Error("Login required (sm_jwt)");
    const r = await fetch(`${API_BASE}${path}`, {
        method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:`Bearer ${jwt}` },
        body: JSON.stringify(body || {}),
        cache:"no-store"
    });
    const j = await r.json().catch(()=> ({}));
    if(!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    return j;
}

// -------------------------
// Auth (my uid)
// -------------------------
let _meCache = null;
async function getMyUserId(){
    if(_meCache) return _meCache;
    // prefer local
    const ls = (localStorage.getItem("sm_uid") || "").trim();
    if(ls){ _meCache = ls; return ls; }

    const out = await apiGet("/api/auth/me");
    const uid = String(out?.uid || out?.user_id || "").trim();
    if(!uid) throw new Error("me uid missing");
    localStorage.setItem("sm_uid", uid);
    _meCache = uid;
    return uid;
}

// -------------------------
// Reads
// -------------------------
async function getLikeCount(id){
    try{
        const out = await apiGet(`/api/analyses/${encodeURIComponent(id)}/likes_count`);
        return Number(out?.likes_count || 0);
    }catch{ return 0; }
}
async function fetchAnalyses(limit, offset){
    const out = await apiGet(`/api/analyses?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`);
    return Array.isArray(out?.items) ? out.items : (Array.isArray(out?.list) ? out.list : []);
}
async function fetchNews(limit=6){
    const out = await apiGet(`${NEWS_PATH}?limit=${encodeURIComponent(limit)}`);
    return Array.isArray(out?.items) ? out.items : (Array.isArray(out?.list) ? out.list : []);
}

// -------------------------
// Like/Follow (sm-api)
// -------------------------
async function toggleLike(postId){
    return apiPost("/api/likes/toggle", { post_id: String(postId) });
}
async function toggleFollow(targetUserId){
    return apiPost("/api/follow/toggle", { target_user_id: String(targetUserId) });
}
async function isFollowingUser(targetUserId){
    try{
        const out = await apiGet(`/api/follow/is_following?target=${encodeURIComponent(targetUserId)}`);
        return !!out?.is_following;
    }catch{ return false; }
}

// -------------------------
// Render
// -------------------------
const POSTS_STEP = 6;
let postsPage = 0;
let postsBusy = false;
let postsHasMore = true;

function renderPost(row, index=0){
    const isFirst = postsPage===0 && index===0;

    const postIdRaw = String(row.id || "").trim();
    const authorIdRaw = String(row.author_id || "").trim();

    const postId = esc(postIdRaw);
    const authorId = esc(authorIdRaw);

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

    const loading = isFirst ? "eager" : "lazy";
    const fetchp = isFirst ? ' fetchpriority="high"' : "";

    return `
  <article class="tvCard" data-post-id="${postId}">
    <div class="tvMedia">
      ${imgUrl
        ? `<img src="${esc(imgUrl)}" alt="" decoding="async" loading="${loading}"${fetchp}>`
        : `<div class="tvNoImg">NO IMAGE</div>`
    }
    </div>

    <div class="tvBody">
      <div class="tvTitle">${pairsText || "PAIR"}</div>
      <div class="tvMeta">${metaLine}</div>

      <div class="tvDescRow">
        <div class="tvDesc">${content || ""}</div>
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

async function hydrateNewPosts(rows){
    if(!grid) return;

    for(const r of rows){
        try{
            const pid = String(r.id || "").trim();
            if(!pid) continue;
            const c = await getLikeCount(pid);
            const btn = grid.querySelector(`.likeBtn[data-post-id="${CSS.escape(pid)}"]`);
            const span = btn?.querySelector(".likeCount");
            if(span) span.textContent = String(c);
            rtEmit("join:post", pid);
        }catch{}
    }

    for(const r of rows){
        try{
            const authorId = String(r.author_id || "").trim();
            if(!authorId) continue;

            const btn = grid.querySelector(`.followBtn[data-user-id="${CSS.escape(authorId)}"]`);
            if(!btn || btn.disabled) continue;

            try{
                const myId = await getMyUserId();
                if(myId && authorId === myId){
                    btn.textContent = "You";
                    btn.disabled = true;
                    btn.classList.add("isDisabled");
                    continue;
                }
            }catch{}

            const following = await isFollowingUser(authorId);
            btn.textContent = following ? "Following" : "Follow";
            btn.classList.toggle("isFollowing", !!following);
        }catch{}
    }
}

// show more ui
function ensurePostsMoreUI(){
    if(!grid) return;
    let wrap = document.getElementById("postsMoreWrap");
    if(!wrap){
        wrap = document.createElement("div");
        wrap.id="postsMoreWrap";
        wrap.className="postsMoreWrap";
        grid.insertAdjacentElement("afterend", wrap);
    }
    if(!postsHasMore){
        wrap.innerHTML = `<div class="postsMoreEnd">No more posts</div>`;
        return;
    }
    wrap.innerHTML = `<button id="postsMoreBtn" class="postsMoreBtn" type="button">Show more</button>`;
    document.getElementById("postsMoreBtn")?.addEventListener("click", loadFeedMore);
}
function setPostsMoreLoading(){
    const wrap = document.getElementById("postsMoreWrap");
    if(wrap) wrap.innerHTML = `<button class="postsMoreBtn" type="button" disabled>Loading…</button>`;
}

async function loadFeed(reset=false){
    if(!grid) return;
    if(reset){
        postsPage=0; postsBusy=false; postsHasMore=true;
        grid.innerHTML="";
        setMsg("Loading feed...");
    }
    await loadFeedMore();
}

async function loadFeedMore(){
    if(!grid || postsBusy || !postsHasMore) return;
    postsBusy=true;
    setMsg("");

    try{
        ensurePostsMoreUI();
        setPostsMoreLoading();

        const from = postsPage * POSTS_STEP;
        const rows = await fetchAnalyses(POSTS_STEP, from);

        if(postsPage===0 && rows.length===0){
            setMsg("No analyses yet.");
            postsHasMore=false;
            ensurePostsMoreUI();
            return;
        }

        grid.insertAdjacentHTML("beforeend", rows.map((r,i)=>renderPost(r,i)).join(""));
        await hydrateNewPosts(rows);

        for(const r of rows){
            const pid = String(r.id || "").trim();
            const card = grid.querySelector(`.tvCard[data-post-id="${CSS.escape(pid)}"]`);
            if(!card || card.__bound) continue;
            card.__bound = true;

            card.addEventListener("click", (e)=>{ if(e.target.closest("button")) return; openPost(pid); });
            card.addEventListener("keydown", (e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); openPost(pid);} });
            card.tabIndex=0;
            card.setAttribute("role","button");
        }

        if(rows.length < POSTS_STEP) postsHasMore=false;
        else postsPage++;

        ensurePostsMoreUI();
        setMsg("");
    }catch(e){
        console.error(e);
        setMsg("❌ Feed error: " + (e?.message || "unknown"));
        ensurePostsMoreUI();
    }finally{
        postsBusy=false;
    }
}

// -------------------------
// NEWS slider
// -------------------------
function renderNewsSlide(n, active=false, isFirst=false){
    const title = esc(n.title || "");
    const img = esc(n.image_url || "");
    const url = esc(n.url || "#");
    const source = esc(n.source || "");
    const time = esc(formatTime(n.created_at || n.published_at));

    const loading = isFirst ? "eager" : "lazy";
    const fetchp = isFirst ? ' fetchpriority="high"' : "";
    const wh = ' width="1200" height="675"';

    return `
    <div class="newsSlide ${active ? "active" : ""}" data-url="${url}">
      ${img
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

let newsTimer=null;
function startNewsAutoRotate(){
    if(!newsSlider) return;
    const slides = Array.from(newsSlider.querySelectorAll(".newsSlide"));
    if(slides.length <= 1) return;

    let idx=0;
    clearInterval(newsTimer);
    newsTimer = setInterval(()=>{
        slides[idx]?.classList.remove("active");
        idx = (idx+1) % slides.length;
        slides[idx]?.classList.add("active");
    }, 4200);
}

async function loadNews(){
    if(!newsSlider) return;
    newsSlider.innerHTML = `<div class="newsSlideSkeleton">Loading news…</div>`;
    try{
        const items = await fetchNews(6);
        if(!items.length){
            newsSlider.innerHTML = `<div class="newsSlideSkeleton">No news yet.</div>`;
            return;
        }
        newsSlider.innerHTML = items.map((n,i)=>renderNewsSlide(n,i===0,i===0)).join("");
        startNewsAutoRotate();
    }catch(e){
        console.error(e);
        newsSlider.innerHTML = `<div class="newsSlideSkeleton">News unavailable</div>`;
    }
}

document.addEventListener("click", async (e) => {
    const slide = e.target.closest(".newsSlide");
    if(slide){
        const url = slide.dataset.url;
        if(url && url !== "#") window.open(url, "_blank", "noopener");
        return;
    }

    const likeBtn = e.target.closest(".likeBtn");
    if(likeBtn){
        const postId = String(likeBtn.dataset.postId || "").trim();
        if(!postId) return;

        const span = likeBtn.querySelector(".likeCount");
        const prevCount = span ? Number(span.textContent || 0) : 0;
        const prevLiked = likeBtn.classList.contains("isLiked");

        // optimistic
        likeBtn.classList.toggle("isLiked", !prevLiked);
        if(span) span.textContent = String(Math.max(0, prevCount + (!prevLiked ? 1 : -1)));

        likeBtn.disabled=true; likeBtn.classList.add("isLoading");
        try{
            const out = await toggleLike(postId);
            const liked = !!out?.liked;
            const likesCount = Number(out?.likes_count || out?.count || 0);

            likeBtn.classList.toggle("isLiked", liked);
            if(span) span.textContent = String(likesCount);

            let userId="";
            try{ userId = await getMyUserId(); }catch{}
            rtEmit("like:toggle", { postId, userId, likeCount: likesCount });
        }catch(err){
            console.error(err);
            likeBtn.classList.toggle("isLiked", prevLiked);
            if(span) span.textContent = String(prevCount);
            alert("❌ " + (err?.message || err));
        }finally{
            likeBtn.disabled=false; likeBtn.classList.remove("isLoading");
        }
        return;
    }

    const followBtn = e.target.closest(".followBtn");
    if(followBtn && !followBtn.disabled){
        const targetUserId = String(followBtn.dataset.userId || "").trim();
        if(!targetUserId) return;

        const prevText = followBtn.textContent;
        const prevFollowing = followBtn.classList.contains("isFollowing");

        followBtn.textContent = prevFollowing ? "Follow" : "Following";
        followBtn.classList.toggle("isFollowing", !prevFollowing);

        followBtn.disabled=true; followBtn.classList.add("isLoading");
        try{
            const out = await toggleFollow(targetUserId);
            const following = !!out?.following;

            followBtn.textContent = following ? "Following" : "Follow";
            followBtn.classList.toggle("isFollowing", following);
        }catch(err){
            console.error(err);
            followBtn.textContent = prevText;
            followBtn.classList.toggle("isFollowing", prevFollowing);
            alert("❌ " + (err?.message || err));
        }finally{
            followBtn.disabled=false; followBtn.classList.remove("isLoading");
        }
        return;
    }
});

document.addEventListener("DOMContentLoaded", () => {
    loadNews();
    loadFeed(true);
});
