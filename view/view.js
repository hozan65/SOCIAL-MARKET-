/* =========================
  VIEW.JS (NO MODULE / NO IMPORT)
  - Loads single post by ?id=
  - Renders: image + meta + author + created_at + content (expand)
  - Comments list + add comment
  - Like + Follow
========================= */

console.log("✅ view.js running");

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
const postBox = document.getElementById("postBox");
const viewMsg = document.getElementById("viewMsg");

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

function getPostIdFromQuery() {
    const u = new URL(window.location.href);
    return String(u.searchParams.get("id") || "").trim();
}

// =========================
// AUTH
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
async function isFollowingUser(targetUserId) {
    const myId = await getMyUserId();
    const target = String(targetUserId || "").trim();
    if (!target) return false;

    if (sb) {
        try {
            const { data, error } = await sb
                .from("follows")
                .select("id")
                .eq("follower_uid", myId)
                .eq("following_uid", target)
                .limit(1);

            if (!error) return !!(data && data.length);
        } catch {}
    }

    const set = getFollowingSetFromCache(myId);
    return set.has(target);
}

// =========================
// SUPABASE READS
// =========================
async function getPostById(postId) {
    if (!sb) throw new Error("Supabase CDN not loaded");

    const { data, error } = await sb
        .from("analyses")
        .select("id, author_id, market, category, timeframe, content, pairs, image_path, created_at")
        .eq("id", postId)
        .limit(1);

    if (error) throw error;
    return (data && data[0]) || null;
}

async function getLikeCount(postId) {
    if (!sb) throw new Error("Supabase CDN not loaded");
    const { count, error } = await sb
        .from("post_likes")
        .select("*", { count: "exact", head: true })
        .eq("post_id", postId);

    if (error) throw error;
    return count || 0;
}

async function loadComments(postId, limit = 100) {
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
 * OPTIONAL profiles hydrate (fallback’lı)
 * Eğer sende profiles tablosu yoksa, user_id gösterir.
 * Eğer varsa:
 * table: profiles
 * columns: user_id, username, avatar_url
 */
const PROFILES_TABLE = "profiles";
async function loadProfiles(userIds) {
    const ids = Array.from(new Set((userIds || []).map((x) => String(x).trim()).filter(Boolean)));
    if (!ids.length) return new Map();
    if (!sb) return new Map();

    try {
        const { data, error } = await sb
            .from(PROFILES_TABLE)
            .select("user_id, username, avatar_url")
            .in("user_id", ids);

        if (error) return new Map();

        const m = new Map();
        (data || []).forEach((p) => {
            const k = String(p.user_id || "").trim();
            if (k) m.set(k, p);
        });
        return m;
    } catch {
        return new Map();
    }
}

// =========================
// RENDER
// =========================
function renderPostView(row, likeCount, isFollowing) {
    const img = esc(row.image_path || "");
    const pairsText = esc(formatPairs(row.pairs));
    const created = esc(formatTime(row.created_at));

    const market = esc(row.market || "");
    const category = esc(row.category || "");
    const timeframe = esc(row.timeframe || "");
    const authorId = esc(row.author_id || "");

    const content = esc(String(row.content || "").trim());

    return `
    <div class="pvMedia">
      ${
        img
            ? `<img class="pvImg" src="${img}" alt="" loading="lazy" decoding="async">`
            : `<div class="pvNoImg">NO IMAGE</div>`
    }
    </div>

    <div class="pvHead">
      <div class="pvTitle">${pairsText || "PAIR"}</div>
      <div class="pvMeta">${market}${market && category ? " • " : ""}${category}${(market||category) && timeframe ? " • " : ""}${timeframe}</div>
      <div class="pvSub">
        <div class="pvAuthor">Author: <span class="pvMono">${authorId || "-"}</span></div>
        <div class="pvTime">${created}</div>
      </div>

      <div class="pvActions">
        <button id="pvLikeBtn" class="pvBtn" type="button">❤️ <span id="pvLikeCount">${likeCount}</span></button>
        <button id="pvFollowBtn" class="pvBtn ${isFollowing ? "isFollowing" : ""}" type="button" ${authorId ? "" : "disabled"}>
          ${isFollowing ? "Following" : "Follow"}
        </button>
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

function renderComments(list, profilesMap) {
    if (!commentsList) return;

    if (!list.length) {
        commentsList.innerHTML = `<div class="cEmpty">No comments yet.</div>`;
        return;
    }

    commentsList.innerHTML = list
        .map((c) => {
            const uid = String(c.user_id || "").trim();
            const p = profilesMap?.get(uid);
            const name = esc(p?.username || uid || "user");
            const avatar = esc(p?.avatar_url || "");

            return `
      <div class="cItem">
        <div class="cAvatar">
          ${
                avatar
                    ? `<img src="${avatar}" alt="" loading="lazy" decoding="async">`
                    : `<div class="cAvatarFallback">${esc(name.slice(0, 1).toUpperCase())}</div>`
            }
        </div>

        <div class="cBody">
          <div class="cRow">
            <div class="cName">${name}</div>
            <div class="cTime">${esc(formatTime(c.created_at))}</div>
          </div>
          <div class="cText">${esc(c.content)}</div>
        </div>
      </div>`;
        })
        .join("");
}

// =========================
// MAIN LOAD
// =========================
let CURRENT_POST = null;
let CURRENT_POST_ID = null;

async function loadAll() {
    CURRENT_POST_ID = getPostIdFromQuery();
    if (!CURRENT_POST_ID) {
        setMsg("❌ Missing id");
        return;
    }
    if (!sb) {
        setMsg("❌ Supabase CDN not loaded");
        return;
    }

    setMsg("Loading...");
    try {
        const row = await getPostById(CURRENT_POST_ID);
        if (!row) {
            setMsg("❌ Post not found");
            return;
        }
        CURRENT_POST = row;

        const likeCount = await getLikeCount(CURRENT_POST_ID).catch(() => 0);

        let following = false;
        try {
            if (row.author_id) following = await isFollowingUser(row.author_id);
        } catch {}

        if (postBox) postBox.innerHTML = renderPostView(row, likeCount, following);

        // expand handler
        const pvText = document.getElementById("pvText");
        const pvExpandBtn = document.getElementById("pvExpandBtn");
        pvExpandBtn?.addEventListener("click", () => {
            pvText?.classList.toggle("isClamp");
            pvExpandBtn.textContent = pvText?.classList.contains("isClamp") ? "Expand" : "Collapse";
        });

        // like handler
        const likeBtn = document.getElementById("pvLikeBtn");
        likeBtn?.addEventListener("click", async () => {
            likeBtn.disabled = true;
            try {
                await toggleLike(CURRENT_POST_ID);
                const c = await getLikeCount(CURRENT_POST_ID);
                const span = document.getElementById("pvLikeCount");
                if (span) span.textContent = String(c);
            } catch (err) {
                alert("❌ " + (err?.message || err));
            } finally {
                likeBtn.disabled = false;
            }
        });

        // follow handler
        const followBtn = document.getElementById("pvFollowBtn");
        followBtn?.addEventListener("click", async () => {
            if (!row.author_id) return;
            followBtn.disabled = true;
            try {
                const r = await toggleFollow(row.author_id);
                const isFollowing = !!r?.following;
                followBtn.textContent = isFollowing ? "Following" : "Follow";
                followBtn.classList.toggle("isFollowing", isFollowing);

                // cache update
                try {
                    const myId = await getMyUserId();
                    const set = getFollowingSetFromCache(myId);
                    const tid = String(row.author_id || "").trim();
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
        });

        // comments load
        const list = await loadComments(CURRENT_POST_ID);
        if (cCount) cCount.textContent = `${list.length}`;

        const profiles = await loadProfiles(list.map((x) => x.user_id));
        renderComments(list, profiles);

        setMsg("");
    } catch (err) {
        console.error(err);
        setMsg("❌ " + (err?.message || "unknown"));
    }
}

// comment submit
commentForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!CURRENT_POST_ID) return;

    const text = String(commentInput?.value || "").trim();
    if (!text) return;

    const btn = commentForm.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;

    try {
        await addComment(CURRENT_POST_ID, text);
        if (commentInput) commentInput.value = "";

        const list = await loadComments(CURRENT_POST_ID);
        if (cCount) cCount.textContent = `${list.length}`;
        const profiles = await loadProfiles(list.map((x) => x.user_id));
        renderComments(list, profiles);
    } catch (err) {
        alert("❌ " + (err?.message || err));
    } finally {
        if (btn) btn.disabled = false;
    }
});

// init
document.addEventListener("DOMContentLoaded", loadAll);
