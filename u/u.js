// /u/u.js  (FULL — LINKS FIX + DRAWER CACHE + FAST)
console.log("✅ u.js loaded (FINAL FAST profile + links + drawer cache)");

// Netlify functions
const FN_GET = "/.netlify/functions/get_profile";
const FN_ENSURE = "/.netlify/functions/ensure_profile";
const FN_LIST_FOLLOWERS = "/.netlify/functions/list_followers";
const FN_LIST_FOLLOWING = "/.netlify/functions/list_following";

// follow
const FN_IS_FOLLOWING = "/.netlify/functions/is_following";     // GET ?id=TARGET_UID
const FN_TOGGLE_FOLLOW = "/.netlify/functions/toggle_follow";   // POST { following_uid }

// pages
const PROFILE_PAGE = "/u/index.html";
const MESSAGES_PAGE = "/messages/";
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
const $links = $("uLinks"); // ✅ LINKS

const $followBtn = $("uFollowBtn");
const $msgBtn = $("uMsgBtn");
const $visitBtn = $("uVisitBtn"); // sen kaldıracaksın ama dursa da bozmuyor

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

function setMsg(t) {
    if ($msg) $msg.textContent = t || "";
}

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

// ---- fetch helpers with timeout (prevents “hang”)
async function fetchJson(url, options = {}, timeoutMs = 6500) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
        const r = await fetch(url, { ...options, signal: ctrl.signal });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
            const err = new Error(j?.error || String(r.status));
            err.status = r.status;
            throw err;
        }
        return j;
    } finally {
        clearTimeout(t);
    }
}

async function fnGet(url) {
    const jwt = getJWT();
    return fetchJson(url, { method: "GET", headers: { Authorization: `Bearer ${jwt}` } }, 6500);
}

async function fnPost(url, body) {
    const jwt = getJWT();
    return fetchJson(
        url,
        {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
            body: JSON.stringify(body || {}),
        },
        6500
    );
}

// ---------------------------
// Determine target profile
// ---------------------------
const params = new URLSearchParams(location.search);
const targetIdFromQuery = String(params.get("id") || "").trim();

// If neither id nor me=1 exists => treat as MY profile
let isMe = params.get("me") === "1";
if (!isMe && !targetIdFromQuery) {
    isMe = true;
    const url = new URL(location.href);
    url.searchParams.delete("id");
    url.searchParams.set("me", "1");
    history.replaceState(null, "", url.toString());
}

let TARGET_UID = isMe ? "" : targetIdFromQuery;

// ---------------------------
// UI visibility rules
// ---------------------------
function applyActionVisibility({ isMeProfile, targetUid, postsCount }) {
    if ($followBtn) $followBtn.hidden = !!isMeProfile || !targetUid;
    if ($msgBtn) $msgBtn.hidden = !!isMeProfile || !targetUid;

    // Visit butonunu zaten kaldıracaksın; kalsın dersen çalışır
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
// Normalize payload (counts + links compatible)
// ---------------------------
function normalizeProfilePayload(j) {
    const p = j?.profile || j?.user || j?.data || j || {};
    const stats = j?.stats || j?.counts || {};

    const user_id = String(
        p.user_id || p.uid || p.id || p.appwrite_user_id || j?.user_id || j?.uid || ""
    ).trim();

    const username = String(p.username || p.name || p.display_name || "—").trim();
    const avatar_url = safeUrl(p.avatar_url || p.avatar || p.photo_url || "");
    const bio = String(p.bio || p.about || "").trim();

    const followers = Number(stats.followers ?? j?.followers_count ?? j?.followers ?? 0) || 0;
    const following = Number(stats.following ?? j?.following_count ?? j?.following ?? 0) || 0;
    const posts_count = Number(stats.posts ?? j?.posts_count ?? j?.posts ?? 0) || 0;

    const posts = Array.isArray(j?.posts) ? j.posts : Array.isArray(p?.posts) ? p.posts : [];

    // ✅ LINKS (get_profile -> profile.links)
    const links = Array.isArray(p?.links) ? p.links : Array.isArray(j?.links) ? j.links : [];

    return { user_id, username, avatar_url, bio, followers, following, posts_count, posts, links };
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

    $postsGrid.innerHTML = posts
        .map((row) => {
            const id = String(row.id || row.post_id || "").trim();
            const titleRaw = row.title || row.caption || row.content || row.pairs || row.market || "Post";
            const title = esc(titleRaw);
            const time = esc(row.created_at || row.time || "");
            const img = safeUrl(row.image_url || row.image_path || row.image || "");
            const href = id ? `${VIEW_PAGE}?id=${encodeURIComponent(id)}` : "#";

            return `
        <a class="uPostCard" href="${href}">
          ${
                img
                    ? `<img class="uPostImg" src="${esc(img)}" alt="" loading="lazy" decoding="async">`
                    : `<div class="uPostNoImg">NO IMAGE</div>`
            }
          <div class="uPostBody">
            <div class="uPostTitle">${title}</div>
            <div class="uPostMeta">${esc(time)}</div>
          </div>
        </a>
      `;
        })
        .join("");
}

function renderLinks(links) {
    if (!$links) return;

    const arr = Array.isArray(links) ? links : [];
    const clean = arr
        .map((x) => ({
            url: safeUrl(x?.url || x?.href || ""),
            label: String(x?.label || "").trim(),
        }))
        .filter((x) => !!x.url);

    if (!clean.length) {
        $links.innerHTML = "";
        return;
    }

    $links.innerHTML = clean
        .map((x) => {
            const label = esc(x.label || x.url.replace(/^https?:\/\//, ""));
            return `<a class="uLink" href="${esc(x.url)}" target="_blank" rel="noopener">${label}</a>`;
        })
        .join("");
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

    // ✅ URL/LINK render
    renderLinks(p.links);

    renderPosts(p.posts);

    applyActionVisibility({
        isMeProfile: isMe,
        targetUid: TARGET_UID,
        postsCount: p.posts_count || 0,
    });
}

// ---------------------------
// Cache-first (profile)
// ---------------------------
function cacheKey() {
    const key = isMe ? "me" : (TARGET_UID || "other");
    return `sm_profile_cache_v4:${key}`;
}

function readCache() {
    try {
        const raw = localStorage.getItem(cacheKey());
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function writeCache(p) {
    try { localStorage.setItem(cacheKey(), JSON.stringify(p)); } catch {}
}

// ---------------------------
// Follow actions
// ---------------------------
async function isFollowing(targetUid) {
    const id = String(targetUid || "").trim();
    if (!id) return false;
    try {
        const r = await fnGet(`${FN_IS_FOLLOWING}?id=${encodeURIComponent(id)}`);
        return !!(r?.is_following ?? r?.following ?? r?.data?.following);
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
// Drawer cache (followers/following)
// ---------------------------
function drawerCacheKey(kind) {
    const who = (!isMe && TARGET_UID) ? TARGET_UID : "me";
    return `sm_drawer_cache_v1:${kind}:${who}`;
}

function readDrawerCache(kind) {
    try {
        const raw = localStorage.getItem(drawerCacheKey(kind));
        if (!raw) return null;
        const obj = JSON.parse(raw);
        // 2 dakika cache
        if (Date.now() - (obj.t || 0) > 120000) return null;
        return Array.isArray(obj.list) ? obj.list : null;
    } catch {
        return null;
    }
}

function writeDrawerCache(kind, list) {
    try {
        localStorage.setItem(drawerCacheKey(kind), JSON.stringify({ t: Date.now(), list }));
    } catch {}
}

function openDrawer(title) {
    if ($drawerBackdrop) $drawerBackdrop.hidden = false;
    if ($drawer) {
        $drawer.setAttribute("aria-hidden", "false");
        $drawer.classList.add("isOpen");
    }
    if ($drawerTitle) $drawerTitle.textContent = title || "—";
}

function closeDrawer() {
    if ($drawerBackdrop) $drawerBackdrop.hidden = true;
    if ($drawer) {
        $drawer.setAttribute("aria-hidden", "true");
        $drawer.classList.remove("isOpen");
    }
    if ($drawerBody) $drawerBody.innerHTML = "";
}

function renderDrawerList(list) {
    if (!$drawerBody) return;

    if (!Array.isArray(list) || !list.length) {
        $drawerBody.innerHTML = `<div class="uDrawerEmpty">Empty.</div>`;
        return;
    }

    // ✅ render items WITHOUT showing id
    $drawerBody.innerHTML = list
        .map((x) => {
            const uid = String(x.user_id || x.uid || x.id || "").trim();
            const username = esc(x.username || x.name || "user");
            const avatar = safeUrl(x.avatar_url || x.avatar || "");
            const href = uid ? `${PROFILE_PAGE}?id=${encodeURIComponent(uid)}` : "#";

            return `
        <a class="uDrawerItem" href="${href}">
          <div class="uDrawerAvatar">
            ${
                avatar
                    ? `<img src="${esc(avatar)}" alt="" loading="lazy" decoding="async">`
                    : `<div class="uDrawerAvatarFallback">${username.slice(0,1).toUpperCase()}</div>`
            }
          </div>
          <div class="uDrawerInfo">
            <div class="uDrawerName">${username}</div>
          </div>
        </a>
      `;
        })
        .join("");
}

async function loadDrawerList(kind) {
    if ($drawerBody) $drawerBody.innerHTML = `<div class="uDrawerLoading">Loading...</div>`;

    // ✅ show cache instantly (if any)
    const cached = readDrawerCache(kind);
    if (cached?.length) renderDrawerList(cached);

    const base = kind === "followers" ? FN_LIST_FOLLOWERS : FN_LIST_FOLLOWING;

    const url =
        (!isMe && TARGET_UID)
            ? `${base}?id=${encodeURIComponent(TARGET_UID)}`
            : base;

    const j = await fnGet(url).catch((e) => ({ error: e?.message || "failed" }));

    const list = Array.isArray(j?.list)
        ? j.list
        : Array.isArray(j?.data)
            ? j.data
            : Array.isArray(j)
                ? j
                : [];

    // ✅ write cache & render
    writeDrawerCache(kind, list);
    renderDrawerList(list);
}

// ---------------------------
// MAIN
// ---------------------------
async function loadProfile() {
    setMsg("");

    // paint cache immediately
    const cached = readCache();
    if (cached) renderProfile(cached);

    const ok = await ensureJWTOrRedirect();
    if (!ok) return;

    if (!isMe && !TARGET_UID) {
        setMsg("❌ Missing profile id");
        applyActionVisibility({ isMeProfile: false, targetUid: "", postsCount: 0 });
        return;
    }

    applyActionVisibility({
        isMeProfile: isMe,
        targetUid: TARGET_UID,
        postsCount: cached?.posts_count || 0
    });

    try {
        const url = isMe ? FN_GET : `${FN_GET}?id=${encodeURIComponent(TARGET_UID)}`;

        let j;
        try {
            j = await fnGet(url);
        } catch (e) {
            const msg = String(e?.message || "");
            const isNotFound =
                msg.includes("404") ||
                msg.toLowerCase().includes("not found") ||
                msg.toLowerCase().includes("profile not found");

            // only ensure on 404
            if (isNotFound) {
                await fnPost(FN_ENSURE, {});
                j = await fnGet(url);
            } else {
                throw e;
            }
        }

        const p = normalizeProfilePayload(j);

        if (!isMe && p.user_id) TARGET_UID = p.user_id;

        renderProfile(p);
        writeCache(p);

        // post-render: msg & follow check non-blocking
        if (!isMe && TARGET_UID) {
            if ($msgBtn) {
                $msgBtn.hidden = false;
                $msgBtn.href = `${MESSAGES_PAGE}?id=${encodeURIComponent(TARGET_UID)}`;
            }
            if ($followBtn) {
                $followBtn.hidden = false;
                isFollowing(TARGET_UID).then(setFollowBtnState);
            }
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
        const following = !!(r?.following ?? r?.is_following ?? r?.data?.following);
        setFollowBtnState(following);

        // optimistic followers count
        if ($followers) {
            const n = Number($followers.textContent || "0") || 0;
            $followers.textContent = String(following ? n + 1 : Math.max(0, n - 1));
        }

        // update cache too
        const c = readCache();
        if (c) {
            const cur = Number(c.followers || 0) || 0;
            c.followers = following ? cur + 1 : Math.max(0, cur - 1);
            writeCache(c);
        }
    } catch (err) {
        alert("❌ " + (err?.message || err));
    } finally {
        $followBtn.disabled = false;
    }
});

$followersBtn?.addEventListener("click", async () => {
    openDrawer("Followers");
    try { await loadDrawerList("followers"); } catch (e) { console.error(e); }
});

$followingBtn?.addEventListener("click", async () => {
    openDrawer("Following");
    try { await loadDrawerList("following"); } catch (e) { console.error(e); }
});

$drawerBackdrop?.addEventListener("click", closeDrawer);
$drawerClose?.addEventListener("click", closeDrawer);
document.addEventListener("keydown", (e) => e.key === "Escape" && closeDrawer());

// init
document.addEventListener("DOMContentLoaded", loadProfile);
