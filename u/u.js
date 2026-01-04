// /u/u.js  (FULL — FAST + ME-ID FIX + DRAWER NEVER EMPTY WHEN COUNT>0)
console.log("✅ u.js loaded (FAST profile + follow + drawer)");

// Netlify functions
const FN_GET = "/.netlify/functions/get_profile";
const FN_ENSURE = "/.netlify/functions/ensure_profile";
const FN_LIST_FOLLOWERS = "/.netlify/functions/list_followers";
const FN_LIST_FOLLOWING = "/.netlify/functions/list_following";
const FN_IS_FOLLOWING = "/.netlify/functions/is_following";
const FN_TOGGLE_FOLLOW = "/.netlify/functions/toggle_follow";

// pages
const PROFILE_PAGE = "/u/index.html";
const MESSAGES_PAGE = "/messages/index.html";
const VIEW_PAGE = "/view/view.html";

// helpers
const $ = (id) => document.getElementById(id);

// elements
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

// drawer
const $drawerBackdrop = $("uDrawerBackdrop");
const $drawer = $("uDrawer");
const $drawerTitle = $("uDrawerTitle");
const $drawerBody = $("uDrawerBody");
const $drawerClose = $("uDrawerClose");
const $followersBtn = $("uFollowersBtn");
const $followingBtn = $("uFollowingBtn");

// ---------------------------
// JWT helpers
// ---------------------------
function getJWT() {
    return window.SM_JWT || localStorage.getItem("sm_jwt") || "";
}

function getMyUidFast() {
    return (
        localStorage.getItem("sm_uid") ||
        localStorage.getItem("uid") ||
        ""
    ).trim();
}

async function ensureJWTOrRedirect() {
    if (window.SM_JWT_READY) {
        try { await window.SM_JWT_READY; } catch {}
    }
    if (!getJWT() && window.SM_REFRESH_JWT) {
        try { await window.SM_REFRESH_JWT(); } catch {}
    }
    if (!getJWT()) {
        setMsg("❌ Missing JWT. Please login again.");
        setTimeout(() => (location.href = "/auth/login.html"), 300);
        return false;
    }
    return true;
}

function setMsg(t) { if ($msg) $msg.textContent = t || ""; }

function esc(str) {
    return String(str ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function safeUrl(u) {
    const s = String(u || "").trim();
    if (!s) return "";
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
    return "";
}

async function fetchJson(url, options = {}, timeoutMs = 6500) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const r = await fetch(url, { ...options, signal: ctrl.signal });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || `${r.status}`);
        return j;
    } finally {
        clearTimeout(t);
    }
}

async function fnGet(url) {
    const jwt = getJWT();
    return fetchJson(url, { method: "GET", headers: { Authorization: `Bearer ${jwt}` } });
}
async function fnPost(url, body) {
    const jwt = getJWT();
    return fetchJson(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify(body || {}),
    });
}

// ---------------------------
// Determine target profile
// ---------------------------
const params = new URLSearchParams(location.search);
const targetIdFromQuery = String(params.get("id") || "").trim();

let isMe = params.get("me") === "1";
if (!isMe && !targetIdFromQuery) {
    isMe = true;
    const url = new URL(location.href);
    url.searchParams.set("me", "1");
    url.searchParams.delete("id");
    history.replaceState(null, "", url.toString());
}

let TARGET_UID = isMe ? "" : targetIdFromQuery;
let MY_UID = getMyUidFast(); // ✅ critical for speed

// ---------------------------
// UI visibility rules
// ---------------------------
function applyActionVisibility({ isMeProfile, targetUid, postsCount }) {
    if ($followBtn) $followBtn.hidden = !!isMeProfile || !targetUid;
    if ($msgBtn) $msgBtn.hidden = !!isMeProfile || !targetUid;

    if ($visitBtn) {
        if (isMeProfile) {
            $visitBtn.hidden = true;
            $visitBtn.removeAttribute("href");
        } else {
            const ok = !!targetUid && (Number(postsCount) || 0) > 0;
            $visitBtn.hidden = !ok;
            if (ok) $visitBtn.href = `${VIEW_PAGE}?id=${encodeURIComponent(targetUid)}`;
            else $visitBtn.removeAttribute("href");
        }
    }
}

// ---------------------------
// Normalize payload
// ---------------------------
function normalizeProfilePayload(j) {
    const p = j?.profile || j?.user || j?.data || j || {};
    const stats = j?.counts || j?.stats || {};

    const user_id = String(
        p.user_id || p.uid || p.id || p.appwrite_user_id || p.appwriteId || j?.user_id || ""
    ).trim();

    const username = String(p.username || p.name || p.display_name || "—").trim();
    const avatar_url = safeUrl(p.avatar_url || p.avatar || p.photo_url || "");
    const bio = String(p.bio || p.about || "").trim();

    const followers = Number(stats.followers ?? j?.followers ?? j?.followers_count ?? 0) || 0;
    const following = Number(stats.following ?? j?.following ?? j?.following_count ?? 0) || 0;
    const posts_count = Number(stats.posts ?? j?.posts ?? j?.posts_count ?? 0) || 0;

    const posts = Array.isArray(j?.posts) ? j.posts : [];

    return { user_id, username, avatar_url, bio, followers, following, posts_count, posts };
}

// ---------------------------
// Render
// ---------------------------
function renderPosts(posts) {
    if (!$postsGrid) return;
    if (!Array.isArray(posts) || !posts.length) {
        $postsGrid.innerHTML = `<div class="uEmpty">No posts yet.</div>`;
        return;
    }

    $postsGrid.innerHTML = posts.map((row) => {
        const id = String(row.id || row.post_id || "").trim();
        const titleRaw = row.title || row.caption || row.content || "Post";
        const title = esc(titleRaw);
        const time = esc(row.created_at || "");
        const img = safeUrl(row.image_url || row.image_path || row.image || "");
        const href = id ? `${VIEW_PAGE}?id=${encodeURIComponent(id)}` : "#";

        return `
      <a class="uPostCard" href="${href}">
        ${img ? `<img class="uPostImg" src="${esc(img)}" alt="" loading="lazy" decoding="async">`
            : `<div class="uPostNoImg">NO IMAGE</div>`}
        <div class="uPostBody">
          <div class="uPostTitle">${title}</div>
          <div class="uPostMeta">${time}</div>
        </div>
      </a>
    `;
    }).join("");
}



function renderProfile(p) {
    if (!p) return;
    if ($name) $name.textContent = p.username || "—";
    if ($bio) $bio.textContent = p.bio || "";
    if ($followers) $followers.textContent = String(p.followers || 0);
    if ($following) $following.textContent = String(p.following || 0);
    if ($postsCount) $postsCount.textContent = String(p.posts_count || 0);

    if ($avatar) {
        if (p.avatar_url) $avatar.src = p.avatar_url;
        else $avatar.removeAttribute("src");
    }

    renderPosts(p.posts);
    applyActionVisibility({ isMeProfile: isMe, targetUid: TARGET_UID, postsCount: p.posts_count || 0 });
}

// ---------------------------
// Cache-first
// ---------------------------
function cacheKey() {
    const key = isMe ? "me" : (TARGET_UID || "other");
    return `sm_profile_cache_v4:${key}`;
}
function readCache() { try { return JSON.parse(localStorage.getItem(cacheKey()) || "null"); } catch { return null; } }
function writeCache(p) { try { localStorage.setItem(cacheKey(), JSON.stringify(p)); } catch {} }

// ---------------------------
// Follow actions
// ---------------------------
async function isFollowing(targetUid) {
    const id = String(targetUid || "").trim();
    if (!id) return false;
    try {
        const r = await fnGet(`${FN_IS_FOLLOWING}?id=${encodeURIComponent(id)}`);
        return !!(r?.is_following ?? r?.following);
    } catch {
        return false;
    }
}

async function toggleFollow(targetUid) {
    const id = String(targetUid || "").trim();
    if (!id) throw new Error("Target id missing");
    return fnPost(FN_TOGGLE_FOLLOW, { following_uid: id });
}

function setFollowBtnState(following) {
    if (!$followBtn) return;
    $followBtn.textContent = following ? "Following" : "Follow";
    $followBtn.classList.toggle("isFollowing", !!following);
}

// ---------------------------
// Drawer
// ---------------------------
function openDrawer(title) {
    if ($drawerBackdrop) $drawerBackdrop.hidden = false;
    if ($drawer) { $drawer.setAttribute("aria-hidden", "false"); $drawer.classList.add("isOpen"); }
    if ($drawerTitle) $drawerTitle.textContent = title || "—";
}

function closeDrawer() {
    if ($drawerBackdrop) $drawerBackdrop.hidden = true;
    if ($drawer) { $drawer.setAttribute("aria-hidden", "true"); $drawer.classList.remove("isOpen"); }
    if ($drawerBody) $drawerBody.innerHTML = "";
}

async function loadDrawerList(kind) {
    if ($drawerBody) $drawerBody.innerHTML = `<div class="uDrawerLoading">Loading...</div>`;

    const base = kind === "followers" ? FN_LIST_FOLLOWERS : FN_LIST_FOLLOWING;

    // ✅ ALWAYS send id (prevents JWT->Appwrite lookup delay + prevents “missing id”)
    const uid = (isMe ? (MY_UID || getMyUidFast()) : TARGET_UID).trim();
    if (!uid) {
        if ($drawerBody) $drawerBody.innerHTML = `<div class="uDrawerEmpty">Empty.</div>`;
        return;
    }

    const url = `${base}?id=${encodeURIComponent(uid)}`;

    const j = await fnGet(url).catch((e) => ({ error: e?.message || "failed" }));

    const list = Array.isArray(j?.list) ? j.list : [];

    if (!$drawerBody) return;

    if (!list.length) {
        $drawerBody.innerHTML = `<div class="uDrawerEmpty">Empty.</div>`;
        return;
    }

    $drawerBody.innerHTML = list.map((x) => {
        const uid2 = String(x.user_id || x.uid || x.id || x.appwrite_user_id || "").trim();
        const username = esc(x.username || x.name || "User");
        const avatar = safeUrl(x.avatar_url || x.avatar || "");
        const href = uid2 ? `${PROFILE_PAGE}?id=${encodeURIComponent(uid2)}` : "#";

        return `
      <a class="uDrawerItem" href="${href}">
        <div class="uDrawerAvatar">
          ${avatar ? `<img src="${esc(avatar)}" alt="" loading="lazy" decoding="async">`
            : `<div class="uDrawerAvatarFallback">${username.slice(0,1).toUpperCase()}</div>`}
        </div>
        <div class="uDrawerInfo">
          <div class="uDrawerName">${username}</div>
        </div>
      </a>
    `;
    }).join("");
}

// ---------------------------
// MAIN
// ---------------------------
async function loadProfile() {
    setMsg("");

    // ✅ paint cache instantly
    const cached = readCache();
    if (cached) renderProfile(cached);

    const ok = await ensureJWTOrRedirect();
    if (!ok) return;

    // refresh MY_UID after jwt init (sidebar may have set it)
    MY_UID = getMyUidFast();

    if (!isMe && !TARGET_UID) {
        setMsg("❌ Missing profile id");
        applyActionVisibility({ isMeProfile: false, targetUid: "", postsCount: 0 });
        return;
    }

    try {
        // ✅ SPEED: if me and we have uid, call get_profile?id=MY_UID (skips Appwrite /account)
        const url =
            isMe && MY_UID
                ? `${FN_GET}?id=${encodeURIComponent(MY_UID)}`
                : (isMe ? FN_GET : `${FN_GET}?id=${encodeURIComponent(TARGET_UID)}`);

        let j;
        try {
            j = await fnGet(url);
        } catch (e) {
            const msg = String(e?.message || "");
            const isNotFound = msg === "404" || msg.toLowerCase().includes("not found");
            if (isNotFound) {
                await fnPost(FN_ENSURE, {});
                j = await fnGet(url);
            } else {
                throw e;
            }
        }

        const p = normalizeProfilePayload(j);

        if (isMe && p.user_id) {
            MY_UID = p.user_id;
            try { localStorage.setItem("sm_uid", MY_UID); } catch {}
        }
        if (!isMe && p.user_id) TARGET_UID = p.user_id;

        renderProfile(p);
        writeCache(p);

        if (!isMe && TARGET_UID) {
            if ($msgBtn) { $msgBtn.hidden = false; $msgBtn.href = `${MESSAGES_PAGE}?id=${encodeURIComponent(TARGET_UID)}`; }
            if ($followBtn) { $followBtn.hidden = false; isFollowing(TARGET_UID).then(setFollowBtnState); }
        }
    } catch (err) {
        console.error(err);
        setMsg("❌ " + (err?.message || "unknown error"));
    }
}

// ---------------------------
// EVENTS
// ---------------------------
$followBtn?.addEventListener("click", async () => {
    if (!TARGET_UID) return;

    $followBtn.disabled = true;
    try {
        const r = await toggleFollow(TARGET_UID);
        const following = !!(r?.following ?? r?.is_following);
        setFollowBtnState(following);

        if ($followers) {
            const n = Number($followers.textContent || "0") || 0;
            $followers.textContent = String(following ? n + 1 : Math.max(0, n - 1));
        }
    } catch (err) {
        alert("❌ " + (err?.message || err));
    } finally {
        $followBtn.disabled = false;
    }
});

$followersBtn?.addEventListener("click", async () => { openDrawer("Followers"); await loadDrawerList("followers"); });
$followingBtn?.addEventListener("click", async () => { openDrawer("Following"); await loadDrawerList("following"); });

$drawerBackdrop?.addEventListener("click", closeDrawer);
$drawerClose?.addEventListener("click", closeDrawer);
document.addEventListener("keydown", (e) => e.key === "Escape" && closeDrawer());

document.addEventListener("DOMContentLoaded", loadProfile);
