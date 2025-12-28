// /u/u.js
import { account } from "/assets/appwrite.js";

console.log("✅ u.js loaded (profile + followers/following drawer)");

const FN_GET = "/.netlify/functions/get_profile";
const FN_ENSURE = "/.netlify/functions/ensure_profile";
const FN_LIST_FOLLOWERS = "/.netlify/functions/list_followers";
const FN_LIST_FOLLOWING = "/.netlify/functions/list_following";

// sayfa linki (/u/index.html)
const PROFILE_PAGE = "/u/index.html";

const qs = (k) => new URLSearchParams(location.search).get(k);
const $ = (id) => document.getElementById(id);

// ---- page elements ----
const $avatar = $("uAvatar");
const $name = $("uName");
const $bio = $("uBio");
const $followers = $("uFollowers");
const $following = $("uFollowing");
const $posts = $("uPostsCount");
const $links = $("uLinks");
const $grid = $("uPostsGrid");
const $msg = $("uMsg");

const $followersBtn = $("uFollowersBtn");
const $followingBtn = $("uFollowingBtn");

// ---- drawer elements ----
const $drawer = $("uDrawer");
const $drawerTitle = $("uDrawerTitle");
const $drawerBody = $("uDrawerBody");
const $drawerClose = $("uDrawerClose");
const $drawerBackdrop = $("uDrawerBackdrop");

// ---- helpers ----
function esc(s) {
    return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function safeHost(url) {
    try { return new URL(url).hostname; } catch { return url || ""; }
}

function setMsg(t) {
    if ($msg) $msg.textContent = t || "";
}

// ---- drawer control ----
function openDrawer(title) {
    $drawerTitle.textContent = title || "—";
    $drawerBody.innerHTML = `<div style="opacity:.7;padding:10px 0;">Loading...</div>`;

    $drawerBackdrop.hidden = false;
    $drawer.classList.add("open");
    $drawer.setAttribute("aria-hidden", "false");

    document.body.classList.add("uDrawerOpen");
    document.documentElement.style.overflow = "hidden";
}

function closeDrawer() {
    $drawer.classList.remove("open");
    $drawer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("uDrawerOpen");
    document.documentElement.style.overflow = "";

    setTimeout(() => {
        if (!$drawer.classList.contains("open")) $drawerBackdrop.hidden = true;
    }, 180);

    $drawerBody.innerHTML = "";
}

function renderUserList(list) {
    if (!list?.length) {
        $drawerBody.innerHTML = `<div style="opacity:.7;padding:10px 0;">Empty</div>`;
        return;
    }

    $drawerBody.innerHTML = list.map((u) => {
        const name = esc(u?.name || "User");
        const av = u?.avatar_url ? esc(u.avatar_url) : "";
        const id = u?.id || "";
        return `
      <div class="uUserRow">
        ${
            av
                ? `<img class="uUserAva" src="${av}" alt="">`
                : `<div class="uUserAva"></div>`
        }
        <div class="uUserName">${name}</div>
        <a class="uUserGo" href="${PROFILE_PAGE}?id=${encodeURIComponent(id)}">View</a>
      </div>
    `;
    }).join("");
}

// ---- render profile ----
function renderProfile(data) {
    const p = data?.profile || {};
    const c = data?.counts || {};
    const posts = data?.posts || [];

    $name.textContent = p.name || "User";
    $bio.textContent = p.bio || "";

    if (p.avatar_url) {
        $avatar.src = p.avatar_url;
        $avatar.style.display = "block";
    } else {
        $avatar.removeAttribute("src");
        $avatar.style.display = "none";
    }

    $followers.textContent = c.followers ?? 0;
    $following.textContent = c.following ?? 0;
    $posts.textContent = c.posts ?? 0;

    $links.innerHTML = "";
    (p.links || []).forEach((l) => {
        if (!l?.url) return;
        const a = document.createElement("a");
        a.className = "uLink";
        a.href = l.url;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = safeHost(l.url);
        $links.appendChild(a);
    });

    $grid.innerHTML = "";
    posts.forEach((post) => {
        const imgUrl = post.image_url || post.image_path || post.image;
        if (!imgUrl) return;
        const card = document.createElement("div");
        card.className = "uPost";
        card.innerHTML = `<img loading="lazy" src="${esc(imgUrl)}" alt="">`;
        $grid.appendChild(card);
    });
}

// ---- API ----
async function fetchProfile(uid) {
    const r = await fetch(`${FN_GET}?id=${encodeURIComponent(uid)}`, { cache: "no-store" });
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err?.error || `get_profile ${r.status}`);
    }
    return r.json();
}

// ensure_profile (JWT gerektirir)
async function getJwtHeaders() {
    const jwtObj = await account.createJWT();
    const jwt = jwtObj?.jwt;
    if (!jwt) throw new Error("JWT could not be created");
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${jwt}`,
        "X-Appwrite-JWT": jwt,
        "x-jwt": jwt
    };
}

async function ensureProfile() {
    try {
        const headers = await getJwtHeaders();
        await fetch(FN_ENSURE, {
            method: "POST",
            headers,
            body: JSON.stringify({ ok: true })
        });
    } catch (e) {
        console.warn("ensure_profile failed:", e?.message || e);
    }
}

async function loadList(url) {
    const r = await fetch(url, { cache: "no-store" });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(out?.error || `HTTP ${r.status}`);
    return out?.list || [];
}

// ---- BOOT ----
(async function boot() {
    let uid = qs("id");

    // me=1 => kendi profil
    if (!uid && qs("me") === "1") {
        uid = localStorage.getItem("sm_uid");
        if (!uid) {
            try {
                const me = await account.get();
                uid = me?.$id;
                if (uid) localStorage.setItem("sm_uid", uid);
            } catch {
                location.href = "/auth/login.html";
                return;
            }
        }
    }

    // uid yoksa: login kontrol edip kendi uid
    if (!uid) {
        try {
            const me = await account.get();
            uid = me?.$id;
            if (uid) localStorage.setItem("sm_uid", uid);
        } catch {
            location.href = "/auth/login.html";
            return;
        }
    }

    if (!uid) {
        setMsg("❌ Missing user id");
        return;
    }

    // ✅ cache-first (instant)
    const cacheKey = "profile_cache_" + uid;
    const cachedRaw = localStorage.getItem(cacheKey);
    if (cachedRaw) {
        try { renderProfile(JSON.parse(cachedRaw)); } catch {}
    }

    // ✅ load fresh
    try {
        const data = await fetchProfile(uid);
        renderProfile(data);
        localStorage.setItem(cacheKey, JSON.stringify(data));
        setMsg("");
    } catch (e) {
        console.warn("get_profile failed:", e?.message || e);
        await ensureProfile();
        try {
            const data2 = await fetchProfile(uid);
            renderProfile(data2);
            localStorage.setItem(cacheKey, JSON.stringify(data2));
            setMsg("");
        } catch (e2) {
            console.error("Profile still cannot load:", e2);
            setMsg("❌ Profile could not load");
        }
    }

    // ✅ EVENTS: Followers / Following -> Drawer
    $followersBtn?.addEventListener("click", async () => {
        try {
            openDrawer("Followers");
            const list = await loadList(`${FN_LIST_FOLLOWERS}?id=${encodeURIComponent(uid)}`);
            renderUserList(list);
        } catch (e) {
            $drawerBody.innerHTML = `<div style="color:#ff6b6b;padding:10px 0;">❌ ${esc(e?.message || e)}</div>`;
        }
    });

    $followingBtn?.addEventListener("click", async () => {
        try {
            openDrawer("Following");
            const list = await loadList(`${FN_LIST_FOLLOWING}?id=${encodeURIComponent(uid)}`);
            renderUserList(list);
        } catch (e) {
            $drawerBody.innerHTML = `<div style="color:#ff6b6b;padding:10px 0;">❌ ${esc(e?.message || e)}</div>`;
        }
    });

    // ✅ Drawer close handlers
    $drawerClose?.addEventListener("click", closeDrawer);
    $drawerBackdrop?.addEventListener("click", closeDrawer);

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && $drawer.classList.contains("open")) closeDrawer();
    });
})();
