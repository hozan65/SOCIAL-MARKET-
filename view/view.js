/* =========================
  VIEW.JS (NO MODULE / NO IMPORT) - FAST + CLEAN
  ✅ No "Loading..." message
  ✅ Delayed minimal loading (only if slow)
  ✅ Parallel requests
  ✅ Comment submit without full reload
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

function resolveImageUrl(image_path) {
    const p = String(image_path ?? "").trim();
    if (!p) return "";
    if (p.startsWith("http://") || p.startsWith("https://")) return p;
    return `${SUPABASE_URL}/storage/v1/object/public/analysis-images/${p}`;
}

// =========================
// DELAYED LOADING (no "delay feel")
// =========================
let _loadingTimer = null;
function startLoadingSoft() {
    clearTimeout(_loadingTimer);
    // 250ms altıysa hiç görünmesin
    _loadingTimer = setTimeout(() => {
        document.documentElement.classList.add("isLoading");
        if (postBox) postBox.setAttribute("aria-busy", "true");
        if (commentsList) commentsList.setAttribute("aria-busy", "true");
    }, 250);
}
function stopLoadingSoft() {
    clearTimeout(_loadingTimer);
    document.documentElement.classList.remove("isLoading");
    if (postBox) postBox.removeAttribute("aria-busy");
    if (commentsList) commentsList.removeAttribute("aria-busy");
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
// CURRENT USER
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
        .maybeSingle();

    if (error) throw error;
    return data || null;
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

// light fallback: only latest comment
async function loadLatestComment(postId) {
    if (!sb) throw new Error("Supabase CDN not loaded");
    const { data, error } = await sb
        .from("post_comments")
        .select("id, user_id, content, created_at")
        .eq("post_id", postId)
        .order("created_at", { ascending: false })
        .limit(1);

    if (error) throw error;
    return (data && data[0]) ? data[0] : null;
}

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
    const img = esc(resolveImageUrl(row.image_path));
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
      <div class="pvMeta">${market}${market && category ? " • " : ""}${category}${
        (market || category) && timeframe ? " • " : ""
    }${timeframe}</div>

      <div class="pvSub">
        <div class="pvAuthor">Author: <span class="pvMono">${authorId || "-"}</span></div>
        <div class="pvTime">${created}</div>
      </div>

      <div class="pvActions">
        <button id="pvLikeBtn" class="pvBtn" type="button">❤️ <span id="pvLikeCount">${likeCount}</span></button>
        <button id="pvFollowBtn" class="pvBtn ${isFollowing ? "isFollowing" : ""}" type="button" ${
        authorId ? "" : "disabled"
    }>
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
      <div class="cItem" data-comment-id="${esc(c.id)}">
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

function addCommentToUI(comment, profilesMap) {
    if (!commentsList) return;

    const cid = String(comment.comment_id || comment.id || "").trim();
    if (!cid) return;

    // duplicate guard
    if (commentsList.querySelector(`[data-comment-id="${CSS.escape(cid)}"]`)) return;

    const uid = String(comment.user_id || "").trim();
    const p = profilesMap?.get(uid);
    const name = esc(p?.username || uid || "user");
    const avatar = esc(p?.avatar_url || "");

    const html = `
    <div class="cItem" data-comment-id="${esc(cid)}">
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
          <div class="cTime">${esc(formatTime(comment.created_at))}</div>
        </div>
        <div class="cText">${esc(comment.content)}</div>
      </div>
    </div>
  `;

    const empty = commentsList.querySelector(".cEmpty");
    if (empty) empty.remove();

    commentsList.insertAdjacentHTML("beforeend", html);

    if (cCount) {
        const n = Number(cCount.textContent || "0") || 0;
        cCount.textContent = String(n + 1);
    }

    try {
        commentsList.scrollTop = commentsList.scrollHeight;
    } catch {}
}

// =========================
// MAIN LOAD
// =========================
let CURRENT_POST = null;
let CURRENT_POST_ID = null;
let CURRENT_AUTHOR_ID = null;

let _profilesForComments = new Map();

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
    if (!postBox) {
        setMsg("❌ postBox not found in view.html");
        return;
    }

    setMsg("");              // ✅ Loading yazısı yok
    startLoadingSoft();      // ✅ sadece yavaşsa görünür

    try {
        const row = await getPostById(CURRENT_POST_ID);
        if (!row) {
            setMsg("❌ Post not found");
            stopLoadingSoft();
            return;
        }

        CURRENT_POST = row;
        CURRENT_AUTHOR_ID = String(row.author_id || "").trim();

        // ✅ paralel çekim
        const likeP = getLikeCount(CURRENT_POST_ID).catch(() => 0);
        const followP = row.author_id ? isFollowingUser(row.author_id).catch(() => false) : Promise.resolve(false);
        const commentsP = loadComments(CURRENT_POST_ID).catch(() => []);

        const [likeCount, following, list] = await Promise.all([likeP, followP, commentsP]);

        postBox.innerHTML = renderPostView(row, likeCount, following);

        // expand
        const pvText = document.getElementById("pvText");
        const pvExpandBtn = document.getElementById("pvExpandBtn");
        pvExpandBtn?.addEventListener("click", () => {
            pvText?.classList.toggle("isClamp");
            pvExpandBtn.textContent = pvText?.classList.contains("isClamp") ? "Expand" : "Collapse";
        });

        // like
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

        // follow
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

        // comments
        if (cCount) cCount.textContent = `${list.length}`;

        _profilesForComments = await loadProfiles(list.map((x) => x.user_id));
        renderComments(list, _profilesForComments);

        stopLoadingSoft();
        setMsg("");
    } catch (err) {
        console.error(err);
        stopLoadingSoft();
        setMsg("❌ " + (err?.message || "unknown"));
    }
}

// =========================
// COMMENT SUBMIT (no full reload)
// =========================
commentForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!CURRENT_POST_ID) return;

    const text = String(commentInput?.value || "").trim();
    if (!text) return;

    const btn = commentForm.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;

    try {
        // post
        await addComment(CURRENT_POST_ID, text);
        if (commentInput) commentInput.value = "";

        // ✅ Realtime genelde zaten ekleyecek.
        // ✅ Fallback: 800ms sonra en son yorumu çek, UI'da yoksa ekle.
        setTimeout(async () => {
            try {
                const latest = await loadLatestComment(CURRENT_POST_ID);
                if (!latest) return;

                const cid = String(latest.id || "").trim();
                if (!cid) return;
                if (commentsList?.querySelector(`[data-comment-id="${CSS.escape(cid)}"]`)) return;

                // profile map'i genişlet (tek kullanıcı)
                const uid = String(latest.user_id || "").trim();
                if (uid && !_profilesForComments?.has(uid)) {
                    const m = await loadProfiles([uid]);
                    m.forEach((v, k) => _profilesForComments.set(k, v));
                }

                addCommentToUI(
                    {
                        post_id: CURRENT_POST_ID,
                        comment_id: latest.id,
                        user_id: latest.user_id,
                        content: latest.content,
                        created_at: latest.created_at || new Date().toISOString(),
                    },
                    _profilesForComments
                );
            } catch {}
        }, 800);
    } catch (err) {
        alert("❌ " + (err?.message || err));
    } finally {
        if (btn) btn.disabled = false;
    }
});

// ✅ REALTIME LISTENERS (from /assets1/realtime.js)
window.addEventListener("sm:comment_new", async (e) => {
    const p = e.detail || {};
    const postId = String(p.post_id || "").trim();
    if (!CURRENT_POST_ID || postId !== CURRENT_POST_ID) return;

    addCommentToUI(
        {
            post_id: postId,
            comment_id: p.comment_id || p.id,
            user_id: p.user_id,
            content: p.content,
            created_at: p.created_at || new Date().toISOString(),
        },
        _profilesForComments
    );
});

window.addEventListener("sm:like_update", (e) => {
    const p = e.detail || {};
    const postId = String(p.post_id || "").trim();
    if (!CURRENT_POST_ID || postId !== CURRENT_POST_ID) return;

    const likes = Number(p.likes_count);
    if (!Number.isFinite(likes)) return;

    const span = document.getElementById("pvLikeCount");
    if (span) span.textContent = String(likes);
});

window.addEventListener("sm:follow_update", async (e) => {
    const p = e.detail || {};
    const target = String(p.target_user_id || "").trim();
    if (!CURRENT_AUTHOR_ID || target !== CURRENT_AUTHOR_ID) return;

    const btn = document.getElementById("pvFollowBtn");
    if (!btn) return;

    try {
        const myId = await getMyUserId();
        const actor = String(p.actor_user_id || "").trim();
        if (actor && myId && actor !== myId) return;
    } catch {
        return;
    }

    const following = !!p.following;
    btn.textContent = following ? "Following" : "Follow";
    btn.classList.toggle("isFollowing", following);
});

// init
document.addEventListener("DOMContentLoaded", loadAll);
