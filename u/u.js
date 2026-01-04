// /u/u.js  (FINAL — FAST + CACHE-FIRST + COUNTS FIX + NO UID IN UI)
console.log("✅ u.js loaded (FINAL FAST profile + follow + drawer)");

// ================== ENDPOINTS ==================
const FN_GET = "/.netlify/functions/get_profile";
const FN_ENSURE = "/.netlify/functions/ensure_profile";
const FN_LIST_FOLLOWERS = "/.netlify/functions/list_followers";
const FN_LIST_FOLLOWING = "/.netlify/functions/list_following";
const FN_IS_FOLLOWING = "/.netlify/functions/is_following";
const FN_TOGGLE_FOLLOW = "/.netlify/functions/toggle_follow";

const PROFILE_PAGE = "/u/index.html";
const MESSAGES_PAGE = "/messages/";
const VIEW_PAGE = "/view/view.html";

// ================== HELPERS ==================
const $ = (id) => document.getElementById(id);
const esc = (s) =>
    String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

const safeUrl = (u) => {
    const s = String(u || "").trim();
    return s.startsWith("http") ? s : "";
};

// ================== ELEMENTS ==================
const $avatar = $("uAvatar");
const $name = $("uName");
const $bio = $("uBio");
const $followers = $("uFollowers");
const $following = $("uFollowing");
const $postsCount = $("uPostsCount");
const $postsGrid = $("uPostsGrid");
const $msg = $("uMsg");

const $followBtn = $("uFollowBtn");
const $msgBtn = $("uMsgBtn");
const $visitBtn = $("uVisitBtn");

const $drawerBackdrop = $("uDrawerBackdrop");
const $drawer = $("uDrawer");
const $drawerTitle = $("uDrawerTitle");
const $drawerBody = $("uDrawerBody");
const $drawerClose = $("uDrawerClose");
const $followersBtn = $("uFollowersBtn");
const $followingBtn = $("uFollowingBtn");

// ================== JWT ==================
function getJWT() {
    return window.SM_JWT || localStorage.getItem("sm_jwt") || "";
}

async function ensureJWT() {
    if (window.SM_JWT_READY) {
        try { await window.SM_JWT_READY; } catch {}
    }
    if (!getJWT() && window.SM_REFRESH_JWT) {
        try { await window.SM_REFRESH_JWT(); } catch {}
    }
    if (!getJWT()) {
        if ($msg) $msg.textContent = "❌ Please login again.";
        setTimeout(() => location.href = "/auth/login.html", 300);
        return false;
    }
    return true;
}

// ================== FETCH ==================
async function fetchJson(url, options = {}, timeout = 6000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
        const r = await fetch(url, { ...options, signal: ctrl.signal });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || r.status);
        return j;
    } finally {
        clearTimeout(t);
    }
}

const fnGet = (url) =>
    fetchJson(url, { headers: { Authorization: `Bearer ${getJWT()}` } });

const fnPost = (url, body) =>
    fetchJson(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getJWT()}`,
        },
        body: JSON.stringify(body || {}),
    });

// ================== TARGET ==================
const qs = new URLSearchParams(location.search);
let TARGET_UID = String(qs.get("id") || "").trim();
let isMe = qs.get("me") === "1";

if (!TARGET_UID && !isMe) {
    isMe = true;
    qs.set("me", "1");
    history.replaceState(null, "", `${location.pathname}?${qs}`);
}

// ================== CACHE ==================
const cacheKey = () => `sm_profile_v4:${isMe ? "me" : TARGET_UID}`;
const readCache = () => {
    try { return JSON.parse(localStorage.getItem(cacheKey())); } catch { return null; }
};
const writeCache = (p) => {
    try { localStorage.setItem(cacheKey(), JSON.stringify(p)); } catch {}
};

// ================== NORMALIZE ==================
function normalize(j) {
    const p = j?.profile || j || {};
    const c = j?.counts || j?.stats || {};
    return {
        user_id: p.id || p.user_id || p.appwrite_user_id || "",
        username: p.name || p.username || "—",
        bio: p.bio || "",
        avatar_url: safeUrl(p.avatar_url),
        followers: Number(c.followers ?? 0),
        following: Number(c.following ?? 0),
        posts_count: Number(c.posts ?? 0),
        posts: Array.isArray(j?.posts) ? j.posts : [],
    };
}

// ================== RENDER ==================
function renderProfile(p) {
    if (!p) return;
    $name.textContent = p.username;
    $bio.textContent = p.bio;
    $followers.textContent = p.followers;
    $following.textContent = p.following;
    $postsCount.textContent = p.posts_count;
    if (p.avatar_url) $avatar.src = p.avatar_url;

    if (!p.posts.length) {
        $postsGrid.innerHTML = `<div class="uEmpty">No posts yet.</div>`;
    } else {
        $postsGrid.innerHTML = p.posts.map(post => {
            const img = safeUrl(post.image_url);
            const href = `${VIEW_PAGE}?id=${post.id}`;
            return `
        <a class="uPostCard" href="${href}">
          ${img ? `<img src="${img}" loading="lazy">` : ""}
          <div class="uPostBody">${esc(post.caption || "Post")}</div>
        </a>
      `;
        }).join("");
    }
}

// ================== FOLLOW ==================
async function refreshFollowState() {
    if (isMe || !TARGET_UID) return;
    const r = await fnGet(`${FN_IS_FOLLOWING}?id=${encodeURIComponent(TARGET_UID)}`).catch(() => null);
    if (r) {
        $followBtn.textContent = r.is_following ? "Following" : "Follow";
    }
}

// ================== DRAWER (FIXED) ==================
async function loadDrawer(kind) {
    $drawerBackdrop.hidden = false;
    $drawer.classList.add("isOpen");
    $drawerTitle.textContent = kind === "followers" ? "Followers" : "Following";
    $drawerBody.innerHTML = `<div class="uDrawerLoading">Loading...</div>`;

    const myId = localStorage.getItem("sm_uid") || "";
    const uid = isMe ? myId : TARGET_UID;
    if (!uid) {
        $drawerBody.innerHTML = `<div class="uDrawerEmpty">Empty.</div>`;
        return;
    }

    const base = kind === "followers" ? FN_LIST_FOLLOWERS : FN_LIST_FOLLOWING;
    const j = await fnGet(`${base}?id=${encodeURIComponent(uid)}`).catch(() => null);
    const list = Array.isArray(j?.list) ? j.list : [];

    if (!list.length) {
        $drawerBody.innerHTML = `<div class="uDrawerEmpty">Empty.</div>`;
        return;
    }

    $drawerBody.innerHTML = list.map(u => {
        const href = `${PROFILE_PAGE}?id=${encodeURIComponent(u.user_id)}`;
        return `
      <a class="uDrawerItem" href="${href}">
        <div class="uDrawerAvatar">
          ${u.avatar_url ? `<img src="${u.avatar_url}">`
            : `<div class="uDrawerAvatarFallback">${u.username[0]}</div>`}
        </div>
        <div class="uDrawerName">${esc(u.username)}</div>
      </a>
    `;
    }).join("");
}

// ================== MAIN ==================
async function loadProfile() {
    const cached = readCache();
    if (cached) renderProfile(cached);

    if (!(await ensureJWT())) return;

    const url = isMe ? FN_GET : `${FN_GET}?id=${encodeURIComponent(TARGET_UID)}`;
    let j;
    try {
        j = await fnGet(url);
    } catch {
        await fnPost(FN_ENSURE, {});
        j = await fnGet(url);
    }

    const p = normalize(j);
    if (!isMe) TARGET_UID = p.user_id;

    renderProfile(p);
    writeCache(p);

    refreshFollowState();

    if (!isMe) {
        $msgBtn.hidden = false;
        $msgBtn.href = `${MESSAGES_PAGE}?id=${encodeURIComponent(TARGET_UID)}`;
    }
}

// ================== EVENTS ==================
$followersBtn?.addEventListener("click", () => loadDrawer("followers"));
$followingBtn?.addEventListener("click", () => loadDrawer("following"));
$drawerBackdrop?.addEventListener("click", () => {
    $drawerBackdrop.hidden = true;
    $drawer.classList.remove("isOpen");
});
$drawerClose?.addEventListener("click", () => {
    $drawerBackdrop.hidden = true;
    $drawer.classList.remove("isOpen");
});

$followBtn?.addEventListener("click", async () => {
    await fnPost(FN_TOGGLE_FOLLOW, { following_uid: TARGET_UID });
    refreshFollowState();
    $followers.textContent = Number($followers.textContent) + 1;
});

// ================== INIT ==================
document.addEventListener("DOMContentLoaded", loadProfile);
