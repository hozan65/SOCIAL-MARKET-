/* =========================
  POST VIEW (NO MODULE)
  - Reads post by id from Supabase (analyses)
  - Comments: Supabase SELECT + Netlify add_comment
  - Like/Follow: Netlify toggle + Supabase count + hydrate follow
========================= */

console.log("✅ view.js loaded");

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
const pvMsg = document.getElementById("pvMsg");
const pvImageWrap = document.getElementById("pvImageWrap");
const pvTitle = document.getElementById("pvTitle");
const pvMeta = document.getElementById("pvMeta");
const pvAuthor = document.getElementById("pvAuthor");
const pvDesc = document.getElementById("pvDesc");
const pvMore = document.getElementById("pvMore");

const pvLikeBtn = document.getElementById("pvLikeBtn");
const pvLikeCount = document.getElementById("pvLikeCount");
const pvFollowBtn = document.getElementById("pvFollowBtn");

const pvCommentsList = document.getElementById("pvCommentsList");
const pvCommentForm = document.getElementById("pvCommentForm");
const pvCommentInput = document.getElementById("pvCommentInput");

// =========================
// HELPERS
// =========================
function setMsg(t){ if (pvMsg) pvMsg.textContent = t || ""; }

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

function getIdFromUrl(){
    const u = new URL(window.location.href);
    return u.searchParams.get("id");
}

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

// =========================
// READ (Supabase)
// =========================
async function fetchPost(postId){
    if (!sb) throw new Error("Supabase CDN not loaded");
    const { data, error } = await sb
        .from("analyses")
        .select("id, author_id, market, category, timeframe, content, pairs, image_path, created_at")
        .eq("id", postId)
        .limit(1);

    if (error) throw error;
    return data?.[0] || null;
}

async function getLikeCount(postId){
    if (!sb) throw new Error("Supabase CDN not loaded");
    const { count, error } = await sb
        .from("post_likes")
        .select("*", { count:"exact", head:true })
        .eq("post_id", postId);

    if (error) throw error;
    return count || 0;
}

async function loadComments(postId, limit=50){
    if (!sb) throw new Error("Supabase CDN not loaded");
    const { data, error } = await sb
        .from("post_comments")
        .select("id, user_id, content, created_at")
        .eq("post_id", postId)
        .order("created_at", { ascending:true })
        .limit(limit);

    if (error) throw error;
    return data || [];
}

// =========================
// AUTH USER
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
// FOLLOW HYDRATE (Supabase if allowed + cache fallback)
// =========================
function followCacheKey(myId){ return `sm_following:${myId}`; }
function getFollowingSetFromCache(myId){
    try{
        const raw = localStorage.getItem(followCacheKey(myId));
        const arr = raw ? JSON.parse(raw) : [];
        return new Set(Array.isArray(arr) ? arr.map(String) : []);
    }catch{ return new Set(); }
}
function saveFollowingSetToCache(myId, set){
    try{ localStorage.setItem(followCacheKey(myId), JSON.stringify(Array.from(set))); }catch{}
}

async function isFollowingUser(targetUserId){
    const myId = await getMyUserId();
    const target = String(targetUserId || "").trim();
    if (!target) return false;

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

    const set = getFollowingSetFromCache(myId);
    return set.has(target);
}

// =========================
// RENDER
// =========================
function renderAuthor(authorId){
    // burada profile tablosu varsa çekip avatar/name gösterebiliriz.
    // şimdilik user id gösteriyoruz (NET).
    const id = String(authorId || "").trim();
    pvAuthor.innerHTML = `
    <img class="pvAvatar" src="/assets1/img/user.png" alt="" onerror="this.style.display='none'">
    <div class="pvAuthorName">
      <strong>${esc(id ? "User" : "Unknown")}</strong>
      <span>${esc(id || "")}</span>
    </div>
  `;
}

function renderPostUI(row){
    const pairs = Array.isArray(row.pairs) ? row.pairs.join(", ") : (row.pairs || "");
    const title = `${row.market || ""} • ${pairs || "PAIR"} • ${row.timeframe || ""}`.trim();

    pvTitle.textContent = title || "Post";
    pvMeta.textContent = `${row.category || ""}${row.category ? " • " : ""}${formatTime(row.created_at)}`;

    renderAuthor(row.author_id);

    const full = String(row.content || "");
    pvDesc.textContent = full;

    // Show more if long
    requestAnimationFrame(()=>{
        const isOverflow = pvDesc.scrollHeight > pvDesc.clientHeight + 6;
        pvMore.style.display = isOverflow ? "inline-flex" : "none";
    });

    // image
    const imgUrl = String(row.image_path || "").trim();
    if (imgUrl){
        pvImageWrap.innerHTML = `<img class="pvImage" id="pvImage" src="${esc(imgUrl)}" alt="chart" loading="lazy" decoding="async">`;
        const img = document.getElementById("pvImage");
        img?.addEventListener("click", ()=> window.open(imgUrl, "_blank", "noopener"));
    }else{
        pvImageWrap.innerHTML = `<div class="pvImgSkeleton">NO IMAGE</div>`;
    }
}

function renderComments(list){
    if (!pvCommentsList) return;

    if (!list.length){
        pvCommentsList.innerHTML = `<div style="font-weight:900;opacity:.7;color:var(--muted);">No comments yet.</div>`;
        return;
    }

    pvCommentsList.innerHTML = list.map(c => {
        const userId = esc(c.user_id || "");
        const time = esc(formatTime(c.created_at));
        const text = esc(c.content || "");
        return `
      <div class="pvComment">
        <div class="pvCommentTop">
          <div class="pvCommentUser">
            <strong>${userId || "User"}</strong>
          </div>
          <div>${time}</div>
        </div>
        <div class="pvCommentText">${text}</div>
      </div>
    `;
    }).join("");
}

// =========================
// ACTIONS
// =========================
async function toggleLike(postId){
    return fnPost(FN_TOGGLE_LIKE, { post_id: String(postId) });
}

async function addComment(postId, text){
    const content = String(text || "").trim();
    if (!content) throw new Error("Empty comment");
    return fnPost(FN_ADD_COMMENT, { post_id: String(postId), content });
}

async function toggleFollow(targetUserId){
    const id = String(targetUserId || "").trim();
    if (!id) throw new Error("Author id missing");
    return fnPost(FN_TOGGLE_FOLLOW, { following_uid: id });
}

// =========================
// INIT
// =========================
let CURRENT_POST = null;

document.addEventListener("DOMContentLoaded", async () => {
    try{
        const id = getIdFromUrl();
        if (!id) throw new Error("Missing id");

        setMsg("Loading…");

        const row = await fetchPost(id);
        if (!row) throw new Error("Post not found");

        CURRENT_POST = row;
        renderPostUI(row);

        // likes
        try{
            const c = await getLikeCount(id);
            pvLikeCount.textContent = String(c);
        }catch{}

        // follow hydrate
        try{
            const authorId = String(row.author_id || "").trim();
            if (authorId){
                pvFollowBtn.disabled = false;
                const following = await isFollowingUser(authorId);
                pvFollowBtn.textContent = following ? "Following" : "Follow";
                pvFollowBtn.classList.toggle("pvFollowOn", following);
            }
        }catch{}

        // comments
        const list = await loadComments(id);
        renderComments(list);

        setMsg("");
    }catch(err){
        console.error(err);
        setMsg("❌ " + (err?.message || "Error"));
        if (pvImageWrap) pvImageWrap.innerHTML = `<div class="pvImgSkeleton">Error</div>`;
    }
});

// show more
pvMore?.addEventListener("click", ()=>{
    if (!pvDesc) return;
    const expanded = pvDesc.dataset.expanded === "1";
    pvDesc.dataset.expanded = expanded ? "0" : "1";
    pvDesc.style.maxHeight = expanded ? "150px" : "none";
    pvMore.textContent = expanded ? "Show more" : "Show less";
});

// like click
pvLikeBtn?.addEventListener("click", async ()=>{
    const id = getIdFromUrl();
    if (!id) return;
    pvLikeBtn.disabled = true;
    try{
        await toggleLike(id);
        const c = await getLikeCount(id);
        pvLikeCount.textContent = String(c);
    }catch(err){
        alert("❌ " + (err?.message || err));
    }finally{
        pvLikeBtn.disabled = false;
    }
});

// follow click
pvFollowBtn?.addEventListener("click", async ()=>{
    const authorId = String(CURRENT_POST?.author_id || "").trim();
    if (!authorId) return;

    pvFollowBtn.disabled = true;
    try{
        const r = await toggleFollow(authorId);
        const isFollowing = !!r?.following;
        pvFollowBtn.textContent = isFollowing ? "Following" : "Follow";
        pvFollowBtn.classList.toggle("pvFollowOn", isFollowing);

        // cache update
        try{
            const myId = await getMyUserId();
            const set = getFollowingSetFromCache(myId);
            if (isFollowing) set.add(authorId);
            else set.delete(authorId);
            saveFollowingSetToCache(myId, set);
        }catch{}
    }catch(err){
        alert("❌ " + (err?.message || err));
    }finally{
        pvFollowBtn.disabled = false;
    }
});

// comment submit
pvCommentForm?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const id = getIdFromUrl();
    if (!id) return;

    const text = pvCommentInput?.value || "";
    const btn = pvCommentForm.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;

    try{
        await addComment(id, text);
        if (pvCommentInput) pvCommentInput.value = "";

        const list = await loadComments(id);
        renderComments(list);
    }catch(err){
        alert("❌ " + (err?.message || err));
    }finally{
        if (btn) btn.disabled = false;
    }
});
