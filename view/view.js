/* =========================
  VIEW.JS (FAST + NO REFRESH COMMENTS + USERNAME FIX)
  - NO supabase
  - NO netlify functions
  - sm-api only (/api/*)
========================= */

console.log("✅ view.js running (sm-api)");

/* =========================
   API ROUTES (adjust if needed)
========================= */
const API_POST = (id) => `/api/posts/${encodeURIComponent(id)}`;
const API_LIKES_COUNT = (id) => `/api/posts/${encodeURIComponent(id)}/likes_count`;
const API_LIKE_TOGGLE = (id) => `/api/posts/${encodeURIComponent(id)}/like_toggle`;

const API_COMMENTS_LIST = (id) => `/api/posts/${encodeURIComponent(id)}/comments?limit=200`;
const API_COMMENT_ADD = (id) => `/api/posts/${encodeURIComponent(id)}/comments`;

const API_IS_FOLLOWING = (authorId) => `/api/follow/is_following?id=${encodeURIComponent(authorId)}`;
const API_TOGGLE_FOLLOW = `/api/follow/toggle`;

const API_ME = `/api/me`; // (opsiyonel) varsa kullanır
const API_PROFILES = (idsCsv) => `/api/profiles?ids=${encodeURIComponent(idsCsv)}`; // opsiyonel

/* =========================
   DOM
========================= */
const postBox = document.getElementById("postBox");
const viewMsg = document.getElementById("viewMsg");

const commentsList = document.getElementById("commentsList");
const commentForm = document.getElementById("commentForm");
const commentInput = document.getElementById("commentInput");
const cCount = document.getElementById("cCount");

/* =========================
   HELPERS
========================= */
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

function safeUrl(u) {
    const s = String(u || "").trim();
    if (!s) return "";
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
    return "";
}

/* =========================
   AUTH / FETCH
========================= */
function getJWT() {
    const jwt = window.SM_JWT || localStorage.getItem("sm_jwt");
    if (!jwt) throw new Error("Login required");
    return jwt;
}

async function fetchJson(url, options = {}, timeoutMs = 8000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const r = await fetch(url, { ...options, signal: ctrl.signal });
        const txt = await r.text();
        let j = {};
        try { j = txt ? JSON.parse(txt) : {}; } catch { j = { raw: txt }; }
        if (!r.ok) throw new Error(j?.error || `Request failed (${r.status})`);
        return j;
    } finally {
        clearTimeout(t);
    }
}

async function apiGet(url) {
    const jwt = getJWT();
    return fetchJson(url, { method: "GET", headers: { Authorization: `Bearer ${jwt}` } });
}

async function apiPost(url, body) {
    const jwt = getJWT();
    return fetchJson(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify(body || {}),
    });
}

/* =========================
   ME (CACHE)
========================= */
let _meCache = null;

async function getMyUserId() {
    if (_meCache) return _meCache;

    // 1) localStorage hızlı
    const ls = String(localStorage.getItem("sm_uid") || "").trim();
    if (ls) {
        _meCache = ls;
        return ls;
    }

    // 2) /api/me varsa kullan
    try {
        const j = await apiGet(API_ME);
        const id = String(j?.id || j?.user_id || j?.uid || j?.user?.id || "").trim();
        if (id) {
            _meCache = id;
            try { localStorage.setItem("sm_uid", id); } catch {}
            return id;
        }
    } catch {}

    // 3) yoksa patlat
    throw new Error("My user id missing");
}

/* =========================
   FOLLOW CACHE
========================= */
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
    const target = String(targetUserId || "").trim();
    if (!target) return false;

    // fast cache
    try {
        const myId = await getMyUserId();
        const set = getFollowingSetFromCache(myId);
        if (set.has(target)) return true;
    } catch {}

    // server check
    try {
        const r = await apiGet(API_IS_FOLLOWING(target));
        return !!(r?.is_following ?? r?.following);
    } catch {
        return false;
    }
}

async function toggleFollow(targetUserId) {
    const id = String(targetUserId || "").trim();
    if (!id) throw new Error("Author id missing");
    return apiPost(API_TOGGLE_FOLLOW, { following_uid: id });
}

/* =========================
   PROFILES (USERNAME/AVATAR)
========================= */
async function loadProfiles(userIds) {
    const ids = Array.from(new Set((userIds || []).map((x) => String(x).trim()).filter(Boolean)));
    if (!ids.length) return new Map();

    // Backend list already include profiles? (optional)
    // We'll fetch via /api/profiles?ids=...
    try {
        const j = await apiGet(API_PROFILES(ids.join(",")));
        const arr = j?.list || j?.data || j?.profiles || j;
        const list = Array.isArray(arr) ? arr : [];
        const m = new Map();
        list.forEach((p) => {
            const k = String(p?.id || p?.user_id || p?.uid || p?.appwrite_user_id || "").trim();
            if (k) m.set(k, p);
        });
        return m;
    } catch {
        return new Map();
    }
}

/* =========================
   API READS (sm-api)
========================= */
async function getPostById(postId) {
    const j = await apiGet(API_POST(postId));
    return j?.post || j?.data || j || null;
}

async function getLikeCount(postId) {
    const j = await apiGet(API_LIKES_COUNT(postId));
    const c = Number(j?.count ?? j?.likes ?? j?.likes_count ?? 0);
    return Number.isFinite(c) ? c : 0;
}

async function loadComments(postId) {
    const j = await apiGet(API_COMMENTS_LIST(postId));
    const arr = j?.list || j?.data || j?.comments || j;
    return Array.isArray(arr) ? arr : [];
}

async function addComment(postId, text) {
    const content = String(text || "").trim();
    if (!content) throw new Error("Empty comment");
    const j = await apiPost(API_COMMENT_ADD(postId), { content });
    return j;
}

async function toggleLike(postId) {
    return apiPost(API_LIKE_TOGGLE(postId), { ok: true });
}

/* =========================
   RENDER
========================= */
function resolveImageUrlFromPost(row) {
    // backend ideally returns full image_url
    const url = safeUrl(row?.image_url || row?.image || row?.image_path || "");
    return url || "";
}

function renderPostView(row, likeCount, following, hideFollowBtn, authorProfile) {
    const img = esc(resolveImageUrlFromPost(row));
    const pairsText = esc(formatPairs(row.pairs));
    const created = esc(formatTime(row.created_at));

    const market = esc(row.market || "");
    const category = esc(row.category || "");
    const timeframe = esc(row.timeframe || "");

    const authorId = String(row.author_id || row.user_id || "").trim();

    const authorName = authorProfile?.username || authorProfile?.name || authorProfile?.display_name || authorId || "-";
    const content = esc(String(row.content || row.body || "").trim());

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
        <div class="pvAuthor">Author: <span class="pvMono">${esc(authorName)}</span></div>
        <div class="pvTime">${created}</div>
      </div>

      <div class="pvActions">
        <button id="pvLikeBtn" class="pvBtn" type="button">❤️ <span id="pvLikeCount">${likeCount}</span></button>

        ${
        hideFollowBtn
            ? ""
            : `<button id="pvFollowBtn" class="pvBtn ${following ? "isFollowing" : ""}" type="button" ${
                authorId ? "" : "disabled"
            }>${following ? "Following" : "Follow"}</button>`
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
            const uid = String(c.user_id || c.author_id || "").trim();
            const p = profilesMap?.get(uid);
            const name = esc(p?.username || p?.name || "user");
            const avatar = esc(safeUrl(p?.avatar_url || p?.avatar || ""));

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
    const name = esc(p?.username || p?.name || "user");
    const avatar = esc(safeUrl(p?.avatar_url || p?.avatar || ""));

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

    try { commentsList.scrollTop = commentsList.scrollHeight; } catch {}
}

/* =========================
   MAIN LOAD
========================= */
let CURRENT_POST_ID = null;
let CURRENT_AUTHOR_ID = null;
let _profilesForComments = new Map();

async function loadAll() {
    CURRENT_POST_ID = getPostIdFromQuery();

    if (!CURRENT_POST_ID) {
        setMsg("❌ Missing id");
        return;
    }
    if (!postBox) {
        setMsg("❌ postBox not found in view.html");
        return;
    }

    setMsg("");

    try {
        const [post, likeCount, list] = await Promise.all([
            getPostById(CURRENT_POST_ID),
            getLikeCount(CURRENT_POST_ID).catch(() => 0),
            loadComments(CURRENT_POST_ID).catch(() => []),
        ]);

        if (!post) {
            setMsg("❌ Post not found");
            return;
        }

        CURRENT_AUTHOR_ID = String(post.author_id || post.user_id || "").trim();

        // my id for follow hide
        let myId = "";
        try { myId = await getMyUserId(); } catch {}

        const hideFollowBtn = !!(myId && CURRENT_AUTHOR_ID && myId === CURRENT_AUTHOR_ID);

        // following state
        let following = false;
        if (!hideFollowBtn && CURRENT_AUTHOR_ID) {
            try { following = await isFollowingUser(CURRENT_AUTHOR_ID); } catch {}
        }

        // profiles for author + commenters
        const idsNeeded = [
            CURRENT_AUTHOR_ID,
            ...list.map((x) => x.user_id || x.author_id).filter(Boolean),
        ].map(String);

        _profilesForComments = await loadProfiles(idsNeeded);

        const authorProfile = _profilesForComments.get(CURRENT_AUTHOR_ID);

        // render post
        postBox.innerHTML = renderPostView(post, likeCount, following, hideFollowBtn, authorProfile);

        // expand
        const pvText = document.getElementById("pvText");
        const pvExpandBtn = document.getElementById("pvExpandBtn");
        pvExpandBtn?.addEventListener("click", () => {
            pvText?.classList.toggle("isClamp");
            pvExpandBtn.textContent = pvText?.classList.contains("isClamp") ? "Expand" : "Collapse";
        });

        // like optimistic
        const likeBtn = document.getElementById("pvLikeBtn");
        likeBtn?.addEventListener("click", async () => {
            const span = document.getElementById("pvLikeCount");
            const old = Number(span?.textContent || "0") || 0;
            if (span) span.textContent = String(old + 1);

            likeBtn.disabled = true;
            try {
                await toggleLike(CURRENT_POST_ID);
                const c = await getLikeCount(CURRENT_POST_ID).catch(() => old + 1);
                if (span) span.textContent = String(c);
            } catch (err) {
                if (span) span.textContent = String(old);
                alert("❌ " + (err?.message || err));
            } finally {
                likeBtn.disabled = false;
            }
        });

        // follow
        const followBtn = document.getElementById("pvFollowBtn");
        followBtn?.addEventListener("click", async () => {
            if (!CURRENT_AUTHOR_ID) return;
            followBtn.disabled = true;
            try {
                const r = await toggleFollow(CURRENT_AUTHOR_ID);
                const isF = !!(r?.following ?? r?.is_following);
                followBtn.textContent = isF ? "Following" : "Follow";
                followBtn.classList.toggle("isFollowing", isF);

                // cache update
                try {
                    const myId2 = await getMyUserId();
                    const set = getFollowingSetFromCache(myId2);
                    if (isF) set.add(CURRENT_AUTHOR_ID);
                    else set.delete(CURRENT_AUTHOR_ID);
                    saveFollowingSetToCache(myId2, set);
                } catch {}
            } catch (err) {
                alert("❌ " + (err?.message || err));
            } finally {
                followBtn.disabled = false;
            }
        });

        // comments render
        if (cCount) cCount.textContent = `${list.length}`;
        renderComments(list, _profilesForComments);

    } catch (err) {
        console.error(err);
        setMsg("❌ " + (err?.message || "unknown"));
    }
}

/* =========================
   COMMENT SUBMIT (NO REFRESH)
========================= */
commentForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!CURRENT_POST_ID) return;

    const text = String(commentInput?.value || "").trim();
    if (!text) return;

    const btn = commentForm.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;

    try {
        const r = await addComment(CURRENT_POST_ID, text);
        if (commentInput) commentInput.value = "";

        const c = r?.comment || r?.data || r?.item || null;
        if (c) {
            const uid = String(c.user_id || "").trim();

            if (uid && !_profilesForComments.has(uid)) {
                try {
                    const m = await loadProfiles([uid]);
                    const p = m.get(uid);
                    if (p) _profilesForComments.set(uid, p);
                } catch {}
            }

            addCommentToUI(
                {
                    id: c.id,
                    comment_id: c.id,
                    post_id: c.post_id || CURRENT_POST_ID,
                    user_id: c.user_id,
                    content: c.content,
                    created_at: c.created_at || new Date().toISOString(),
                },
                _profilesForComments
            );
        }
    } catch (err) {
        alert("❌ " + (err?.message || err));
    } finally {
        if (btn) btn.disabled = false;
    }
});

/* =========================
   REALTIME EVENTS (optional)
========================= */
window.addEventListener("sm:comment_new", async (e) => {
    const p = e.detail || {};
    const postId = String(p.post_id || "").trim();
    if (!CURRENT_POST_ID || postId !== CURRENT_POST_ID) return;

    const uid = String(p.user_id || "").trim();
    if (uid && !_profilesForComments.has(uid)) {
        try {
            const m = await loadProfiles([uid]);
            const pr = m.get(uid);
            if (pr) _profilesForComments.set(uid, pr);
        } catch {}
    }

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

/* =========================
   INIT
========================= */
document.addEventListener("DOMContentLoaded", loadAll);
