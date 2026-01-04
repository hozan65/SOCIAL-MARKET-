/* =========================
  VIEW.JS (NO MODULE / NO IMPORT) - FIXED
  ✅ No self-follow button
  ✅ Wait JWT readiness (SM_JWT_READY)
  ✅ Better Netlify error debug (502 etc.)
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
// DELAYED LOADING (soft)
// =========================
let _loadingTimer = null;
function startLoadingSoft() {
    clearTimeout(_loadingTimer);
    _loadingTimer = setTimeout(() => {
        document.documentElement.classList.add("isLoading");
    }, 250);
}
function stopLoadingSoft() {
    clearTimeout(_loadingTimer);
    document.documentElement.classList.remove("isLoading");
}

// =========================
// AUTH (wait JWT ready)
// =========================
async function ensureJWTReady() {
    // jwt.js set ediyorsa, onu bekle
    try {
        if (window.SM_JWT_READY && typeof window.SM_JWT_READY.then === "function") {
            await window.SM_JWT_READY;
        }
    } catch {}
}

function getJWTUnsafe() {
    return window.SM_JWT || localStorage.getItem("sm_jwt") || "";
}

async function getJWT() {
    await ensureJWTReady();
    const jwt = getJWTUnsafe();
    if (!jwt) throw new Error("Login required");
    return jwt;
}

async function fnPost(url, body) {
    const jwt = await getJWT();

    const r = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify(body || {}),
    });

    // Netlify 502 bazen HTML döndürür -> json parse patlar
    const txt = await r.text().catch(() => "");
    let j = null;
    try { j = txt ? JSON.parse(txt) : null; } catch { j = null; }

    if (!r.ok) {
        console.error("❌ fnPost error:", url, "status:", r.status, "body:", txt);
        throw new Error(j?.error || `Request failed (${r.status})`);
    }
    return j || {};
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

    const jwt = await getJWT();
    const r = await fetch(FN_AUTH_USER, { headers: { Authorization: `Bearer ${jwt}` } });
    const txt = await r.text().catch(() => "");
    let j = null;
    try { j = txt ? JSON.parse(txt) : null; } catch { j = null; }

    if (!r.ok) {
        console.error("❌ _auth_user error:", r.status, txt);
        throw new Error(j?.error || "Auth user failed");
    }

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

    // ✅ kendini takip kontrolü
    if (target === myId) return false;

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
function renderPostView(row, likeCount, isFollowing, hideFollow) {
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
        ${
        hideFollow
            ? ``
            : `<button id="pvFollowBtn" class="pvBtn ${isFollowing ? "isFollowing" : ""}" type="button" ${
                authorId ? "" : "disabled"
            }>${isFollowing ? "Following" : "Follow"}</button>`
    }
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
}

// =========================
// MAIN LOAD
// =========================
let CURRENT_POST_ID = null;
let CURRENT_AUTHOR_ID = null;
let _profilesForComments = new Map();

async function loadAll() {
    CURRENT_POST_ID = getPostIdFromQuery();

    if (!CURRENT_POST_ID) return setMsg("❌ Missing id");
    if (!sb) return setMsg("❌ Supabase CDN not loaded");
    if (!postBox) return setMsg("❌ postBox not found in view.html");

    setMsg("");
    startLoadingSoft();

    try {
        const row = await getPostById(CURRENT_POST_ID);
        if (!row) {
            stopLoadingSoft();
            return setMsg("❌ Post not found");
        }

        CURRENT_AUTHOR_ID = String(row.author_id || "").trim();

        // ✅ my id al (self check için)
        let myId = "";
        try { myId = await getMyUserId(); } catch { myId = ""; }

        const hideFollow = !!(myId && CURRENT_AUTHOR_ID && myId === CURRENT_AUTHOR_ID);

        // paralel
        const likeP = getLikeCount(CURRENT_POST_ID).catch(() => 0);
        const followP = (!hideFollow && row.author_id) ? isFollowingUser(row.author_id).catch(() => false) : Promise.resolve(false);
        const commentsP = loadComments(CURRENT_POST_ID).catch(() => []);

        const [likeCount, following, list] = await Promise.all([likeP, followP, commentsP]);

        postBox.innerHTML = renderPostView(row, likeCount, following, hideFollow);

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

        // follow (sadece show varsa)
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
                    const myId2 = await getMyUserId();
                    const set = getFollowingSetFromCache(myId2);
                    const tid = String(row.author_id || "").trim();
                    if (tid) {
                        if (isFollowing) set.add(tid);
                        else set.delete(tid);
                        saveFollowingSetToCache(myId2, set);
                    }
                } catch {}
            } catch (err) {
                alert("❌ " + (err?.message || err));
            } finally {
                followBtn.disabled = false;
            }
        });

        // comments
        if (cCount) cCount.textContent = String(list.length);
        _profilesForComments = await loadProfiles(list.map((x) => x.user_id));
        renderComments(list, _profilesForComments);

        stopLoadingSoft();
    } catch (err) {
        console.error(err);
        stopLoadingSoft();
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
        // realtime gelirse zaten UI ekleyecek
    } catch (err) {
        alert("❌ " + (err?.message || err));
    } finally {
        if (btn) btn.disabled = false;
    }
});

// realtime listeners
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

document.addEventListener("DOMContentLoaded", loadAll);
