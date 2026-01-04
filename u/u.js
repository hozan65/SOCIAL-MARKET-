// /u/u.js  (FINAL — STABLE + JWT READY + CACHE-FIRST + FOLLOW FIX + DRAWER FIX)
console.log("✅ u.js loaded (FINAL STABLE profile + follow + drawer)");

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
    // jwt.js promise varsa bekle
    if (window.SM_JWT_READY) {
        try {
            await window.SM_JWT_READY;
        } catch {}
    }

    // yoksa refresh dene
    if (!getJWT() && window.SM_REFRESH_JWT) {
        try {
            await window.SM_REFRESH_JWT();
        } catch {}
    }

    if (!getJWT()) {
        if ($msg) $msg.textContent = "❌ Please login again.";
        setTimeout(() => (location.href = "/auth/login.html"), 300);
        return false;
    }
    return true;
}

// ================== FETCH ==================
async function fetchJson(url, options = {}, timeout = 8000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);

    try {
        const r = await fetch(url, { ...options, signal: ctrl.signal });
        const txt = await r.text().catch(() => "");
        const j = txt ? JSON.parse(txt) : {};

        if (!r.ok) {
            throw new Error(j?.error || `${r.status}`);
        }
        return j;
    } finally {
        clearTimeout(t);
    }
}

const fnGet = (url) =>
    fetchJson(url, {
        headers: { Authorization: `Bearer ${getJWT()}` },
    });

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

// Eğer id yoksa otomatik "me"
if (!TARGET_UID && !isMe) {
    isMe = true;
    qs.set("me", "1");
    history.replaceState(null, "", `${location.pathname}?${qs}`);
}

// ================== CACHE ==================
const cacheKey = () => `sm_profile_v5:${isMe ? "me" : TARGET_UID}`;

const readCache = () => {
    try {
        return JSON.parse(localStorage.getItem(cacheKey()));
    } catch {
        return null;
    }
};

const writeCache = (p) => {
    try {
        localStorage.setItem(cacheKey(), JSON.stringify(p));
    } catch {}
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

    if ($name) $name.textContent = p.username || "—";
    if ($bio) $bio.textContent = p.bio || "";
    if ($followers) $followers.textContent = String(p.followers ?? 0);
    if ($following) $following.textContent = String(p.following ?? 0);
    if ($postsCount) $postsCount.textContent = String(p.posts_count ?? 0);

    if ($avatar && p.avatar_url) $avatar.src = p.avatar_url;

    // Follow butonu: kendi profilinde gizle
    if ($followBtn) $followBtn.hidden = !!isMe;

    if ($postsGrid) {
        if (!p.posts.length) {
            $postsGrid.innerHTML = `<div class="uEmpty">No posts yet.</div>`;
        } else {
            $postsGrid.innerHTML = p.posts
                .map((post) => {
                    const img = safeUrl(post.image_url);
                    const href = `${VIEW_PAGE}?id=${encodeURIComponent(post.id)}`;

                    return `
            <a class="uPostCard" href="${href}">
              ${img ? `<img src="${img}" loading="lazy" decoding="async">` : ""}
              <div class="uPostBody">${esc(post.caption || "Post")}</div>
            </a>
          `;
                })
                .join("");
        }
    }
}

// ================== FOLLOW ==================
let followBusy = false;

async function refreshFollowState() {
    if (isMe || !TARGET_UID || !$followBtn) return;

    const r = await fnGet(`${FN_IS_FOLLOWING}?id=${encodeURIComponent(TARGET_UID)}`).catch(() => null);
    if (!r) return;

    const on = !!r.is_following;
    $followBtn.textContent = on ? "Following" : "Follow";
    $followBtn.classList.toggle("isFollowing", on);
}

$followBtn?.addEventListener("click", async () => {
    if (followBusy) return;
    if (isMe || !TARGET_UID) return;

    followBusy = true;
    $followBtn.disabled = true;

    try {
        const r = await fnPost(FN_TOGGLE_FOLLOW, { following_uid: TARGET_UID });

        const on = !!r?.following;
        $followBtn.textContent = on ? "Following" : "Follow";
        $followBtn.classList.toggle("isFollowing", on);

        // ✅ Hedef profil sayfasında followers count doğru şekilde server’dan gelsin
        if ($followers && Number.isFinite(Number(r?.followers_count))) {
            $followers.textContent = String(r.followers_count);
        }
    } catch (e) {
        console.warn("follow failed:", e);
        if ($msg) $msg.textContent = "❌ Follow failed";
        setTimeout(() => {
            if ($msg) $msg.textContent = "";
        }, 1200);
    } finally {
        $followBtn.disabled = false;
        followBusy = false;
    }
});

// ================== DRAWER ==================
function openDrawer(title) {
    if ($drawerBackdrop) $drawerBackdrop.hidden = false;
    $drawer?.classList.add("isOpen");
    if ($drawerTitle) $drawerTitle.textContent = title;
}

function closeDrawer() {
    if ($drawerBackdrop) $drawerBackdrop.hidden = true;
    $drawer?.classList.remove("isOpen");
}

async function loadDrawer(kind) {
    openDrawer(kind === "followers" ? "Followers" : "Following");
    if ($drawerBody) $drawerBody.innerHTML = `<div class="uDrawerLoading">Loading...</div>`;

    // isMe ise sm_uid’den al, değilse TARGET_UID
    const myId = localStorage.getItem("sm_uid") || "";
    const uid = isMe ? myId : TARGET_UID;

    if (!uid) {
        if ($drawerBody) $drawerBody.innerHTML = `<div class="uDrawerEmpty">Empty.</div>`;
        return;
    }

    const base = kind === "followers" ? FN_LIST_FOLLOWERS : FN_LIST_FOLLOWING;
    const j = await fnGet(`${base}?id=${encodeURIComponent(uid)}`).catch(() => null);
    const list = Array.isArray(j?.list) ? j.list : [];

    if (!list.length) {
        if ($drawerBody) $drawerBody.innerHTML = `<div class="uDrawerEmpty">Empty.</div>`;
        return;
    }

    if ($drawerBody) {
        $drawerBody.innerHTML = list
            .map((u) => {
                const href = `${PROFILE_PAGE}?id=${encodeURIComponent(u.user_id)}`;
                const av = safeUrl(u.avatar_url);

                return `
          <a class="uDrawerItem" href="${href}">
            <div class="uDrawerAvatar">
              ${
                    av
                        ? `<img src="${av}" loading="lazy" decoding="async">`
                        : `<div class="uDrawerAvatarFallback">${esc(String(u.username || "U")[0].toUpperCase())}</div>`
                }
            </div>
            <div class="uDrawerName">${esc(u.username || "user")}</div>
          </a>
        `;
            })
            .join("");
    }
}

// Drawer events
$followersBtn?.addEventListener("click", () => loadDrawer("followers"));
$followingBtn?.addEventListener("click", () => loadDrawer("following"));
$drawerBackdrop?.addEventListener("click", closeDrawer);
$drawerClose?.addEventListener("click", closeDrawer);

// ================== MAIN ==================
async function loadProfile() {
    // cache-first render
    const cached = readCache();
    if (cached) renderProfile(cached);

    if (!(await ensureJWT())) return;

    const url = isMe ? FN_GET : `${FN_GET}?id=${encodeURIComponent(TARGET_UID)}`;

    let j;
    try {
        j = await fnGet(url);
    } catch (e) {
        // ensure_profile sadece "me" için mantıklı
        if (isMe) {
            try {
                await fnPost(FN_ENSURE, {});
                j = await fnGet(url);
            } catch (e2) {
                console.warn(e2);
                if ($msg) $msg.textContent = "❌ Profile load failed";
                return;
            }
        } else {
            // başkasının profili yoksa create etmeye çalışma
            if ($msg) $msg.textContent = "❌ User profile not found";
            return;
        }
    }

    const p = normalize(j);

    // isMe sayfasında kendi uid’yi cache’le → drawer fix
    if (isMe && p.user_id) {
        try {
            localStorage.setItem("sm_uid", p.user_id);
        } catch {}
    }

    // target profil sayfasında TARGET_UID normalize ile güncellenebilir
    if (!isMe && p.user_id) TARGET_UID = p.user_id;

    renderProfile(p);
    writeCache(p);

    // follow state
    await refreshFollowState();

    // msg button
    if ($msgBtn) {
        if (!isMe && TARGET_UID) {
            $msgBtn.hidden = false;
            $msgBtn.href = `${MESSAGES_PAGE}?id=${encodeURIComponent(TARGET_UID)}`;
        } else {
            $msgBtn.hidden = true;
        }
    }
}

// ================== INIT ==================
if (!window.__SM_U_INIT__) {
    window.__SM_U_INIT__ = true;
    document.addEventListener("DOMContentLoaded", loadProfile);
} else {
    console.warn("u.js already initialized, skipping");
}
