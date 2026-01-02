// /u/u.js
import { account } from "/assets/appwrite.js";

console.log("✅ u.js loaded (profile + follow toggle + posts cards + drawer)");

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
const MESSAGES_PAGE = "/messages/"; // /messages/index.html
const VIEW_PAGE = "/view/view.html"; // post detail page

const qs = (k) => new URLSearchParams(location.search).get(k);
const $ = (id) => document.getElementById(id);

// elements
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

const $followBtn = $("uFollowBtn");
const $msgBtn = $("uMsgBtn");

// drawer
const $drawer = $("uDrawer");
const $drawerTitle = $("uDrawerTitle");
const $drawerBody = $("uDrawerBody");
const $drawerClose = $("uDrawerClose");
const $drawerBackdrop = $("uDrawerBackdrop");

// ---------- helpers ----------
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

function shortText(str, max = 120) {
    const s = String(str || "").trim();
    if (!s) return { short: "", long: "", isLong: false };
    if (s.length <= max) return { short: s, long: s, isLong: false };
    return { short: s.slice(0, max).trim() + "…", long: s, isLong: true };
}

// ✅ ALWAYS hide Message on own profile
function setMessageButton(isMe, profileUserId) {
    if (!$msgBtn) return;
    if (isMe) {
        $msgBtn.hidden = true;
        $msgBtn.href = "#";
        return;
    }
    $msgBtn.hidden = false;
    $msgBtn.href = `${MESSAGES_PAGE}?to=${encodeURIComponent(profileUserId)}`;
}

function setFollowButton(isMe) {
    if (!$followBtn) return;
    $followBtn.hidden = !!isMe;
}

// ===== FOLLOW TOGGLE UI =====
let _isFollowing = false;

function paintFollowBtn() {
    if (!$followBtn) return;
    $followBtn.textContent = _isFollowing ? "Unfollow" : "Follow";
    $followBtn.classList.toggle("isFollowing", _isFollowing);
}

// ---------- drawer ----------
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
        ${av ? `<img class="uUserAva" src="${av}" alt="">` : `<div class="uUserAva"></div>`}
        <div class="uUserName">${name}</div>
        <a class="uUserGo" href="${PROFILE_PAGE}?id=${encodeURIComponent(id)}">View</a>
      </div>
    `;
    }).join("");
}

// ---------- render profile ----------
function renderProfile(data) {
    const p = data?.profile || {};
    const c = data?.counts || {};
    const postsArr = Array.isArray(data?.posts) ? data.posts : [];

    if ($name) $name.textContent = p.name || "User";
    if ($bio) $bio.textContent = p.bio || "";

    if ($avatar) {
        if (p.avatar_url) {
            $avatar.src = p.avatar_url;
            $avatar.style.display = "block";
        } else {
            $avatar.removeAttribute("src");
            $avatar.style.display = "none";
        }
    }

    if ($followers) $followers.textContent = c.followers ?? 0;
    if ($following) $following.textContent = c.following ?? 0;
    if ($posts) $posts.textContent = c.posts ?? postsArr.length ?? 0;

    // links
    if ($links) {
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
    }

    // posts grid (cards)
    if (!$grid) return;
    $grid.innerHTML = "";

    postsArr.forEach((post) => {
        const id = post.id || post.post_id || post.uuid || post.slug || "";
        const imgUrl = post.image_url || post.image_path || post.image || post.photo_url || "";
        if (!imgUrl) return;

        const caption = post.caption || post.text || post.body || post.description || "";
        const coin = post.coin || post.symbol || post.crypto || post.asset || "CRYPTO";
        const tf = post.timeframe || post.tf || post.interval || "1M";

        const t = shortText(caption, 120);

        const card = document.createElement("article");
        card.className = "uPostCard";
        card.dataset.id = id;

        card.innerHTML = `
      <div class="uPostImg">
        <img loading="lazy" src="${esc(imgUrl)}" alt="">
      </div>

      <div class="uPostBody">
        <div class="uPostMeta">
          ${coin ? `<span class="uTag">${esc(coin)}</span>` : ""}
          ${tf ? `<span class="uTag">${esc(tf)}</span>` : ""}
        </div>

        ${caption ? `
          <div class="uPostText" data-open="0">
            <span class="uPostShort">${esc(t.short)}</span>
            ${t.isLong ? `<span class="uPostLong" hidden>${esc(t.long)}</span>` : ``}
            ${t.isLong ? `<button class="uMoreBtn" type="button">Show more</button>` : ``}
          </div>
        ` : ``}
      </div>
    `;

        // click -> view page (unless show more)
        card.addEventListener("click", (e) => {
            if (e.target?.classList?.contains("uMoreBtn")) return;
            if (!id) return;
            location.href = `${VIEW_PAGE}?id=${encodeURIComponent(id)}`;
        });

        // show more toggle
        const moreBtn = card.querySelector(".uMoreBtn");
        if (moreBtn) {
            moreBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();

                const box = card.querySelector(".uPostText");
                const shortEl = card.querySelector(".uPostShort");
                const longEl = card.querySelector(".uPostLong");
                const open = box?.getAttribute("data-open") === "1";

                if (!open) {
                    if (longEl) longEl.hidden = false;
                    if (shortEl) shortEl.hidden = true;
                    moreBtn.textContent = "Show less";
                    box?.setAttribute("data-open", "1");
                } else {
                    if (longEl) longEl.hidden = true;
                    if (shortEl) shortEl.hidden = false;
                    moreBtn.textContent = "Show more";
                    box?.setAttribute("data-open", "0");
                }
            });
        }

        $grid.appendChild(card);
    });
}

// ---------- API ----------
async function fetchProfile(uid) {
    const r = await fetch(`${FN_GET}?id=${encodeURIComponent(uid)}`, { cache: "no-store" });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(out?.error || `get_profile ${r.status}`);
    return out;
}

let _jwtCache = { jwt: null, ts: 0 };
const JWT_TTL_MS = 60_000;

async function getJwtHeaders() {
    const now = Date.now();
    if (_jwtCache.jwt && (now - _jwtCache.ts) < JWT_TTL_MS) {
        const jwt = _jwtCache.jwt;
        return {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${jwt}`,
            "X-Appwrite-JWT": jwt,
            "x-jwt": jwt
        };
    }

    const jwtObj = await account.createJWT();
    const jwt = jwtObj?.jwt;
    if (!jwt) throw new Error("JWT could not be created");

    _jwtCache = { jwt, ts: now };

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
        await fetch(FN_ENSURE, { method: "POST", headers, body: JSON.stringify({ ok: true }) });
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

// ✅ Get REAL viewer id from Appwrite (do not trust localStorage)
async function getViewerIdStrict() {
    const me = await account.get(); // if not logged -> throws
    const id = me?.$id || "";
    if (!id) throw new Error("Missing viewer id");
    localStorage.setItem("sm_uid", id);
    return id;
}

// ✅ Follow status
async function loadFollowStatus(targetUid) {
    const headers = await getJwtHeaders();
    const r = await fetch(`${FN_IS_FOLLOWING}?id=${encodeURIComponent(targetUid)}`, {
        method: "GET",
        headers,
        cache: "no-store"
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(out?.error || `is_following ${r.status}`);
    return !!out?.is_following;
}

// ✅ Toggle follow
async function toggleFollow(targetUid) {
    const headers = await getJwtHeaders();
    const r = await fetch(FN_TOGGLE_FOLLOW, {
        method: "POST",
        headers,
        body: JSON.stringify({
            following_uid: targetUid, // main
            id: targetUid,            // fallback
            target_uid: targetUid     // fallback
        })
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(out?.error || `toggle_follow ${r.status}`);

    if (typeof out?.is_following === "boolean") return out.is_following;
    if (typeof out?.following === "boolean") return out.following;

    return await loadFollowStatus(targetUid);
}

// ---------- BOOT ----------
(async function boot() {
    // 1) resolve profile uid
    let uid = qs("id");

    // me=1 => show my own profile explicitly
    if (!uid && qs("me") === "1") {
        try {
            uid = await getViewerIdStrict();
        } catch {
            location.href = "/auth/login.html";
            return;
        }
    }

    // if still no uid => default to my profile
    if (!uid) {
        try {
            uid = await getViewerIdStrict();
        } catch {
            location.href = "/auth/login.html";
            return;
        }
    }

    // 2) viewer id (strict)
    let viewerId = "";
    try {
        viewerId = await getViewerIdStrict();
    } catch {
        location.href = "/auth/login.html";
        return;
    }

    const isMe = String(viewerId) === String(uid);

    // show/hide actions
    setFollowButton(isMe);
    setMessageButton(isMe, uid);

    // follow init + click
    if (!isMe && $followBtn) {
        try {
            _isFollowing = await loadFollowStatus(uid);
            paintFollowBtn();
        } catch (e) {
            console.warn("loadFollowStatus failed:", e?.message || e);
            _isFollowing = false;
            paintFollowBtn();
        }

        $followBtn.addEventListener("click", async () => {
            try {
                $followBtn.disabled = true;

                const newVal = await toggleFollow(uid);
                _isFollowing = !!newVal;
                paintFollowBtn();

                // local UI followers count update
                const cur = parseInt($followers?.textContent || "0", 10) || 0;
                $followers.textContent = String(_isFollowing ? cur + 1 : Math.max(0, cur - 1));
            } catch (e) {
                console.error(e);
                setMsg("❌ " + (e?.message || e));
            } finally {
                $followBtn.disabled = false;
            }
        });
    }

    // cache-first
    const cacheKey = "profile_cache_" + uid;
    const cachedRaw = localStorage.getItem(cacheKey);
    if (cachedRaw) {
        try { renderProfile(JSON.parse(cachedRaw)); } catch {}
    }

    // load fresh (with ensure fallback)
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

    // drawer events
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

    // drawer close handlers
    $drawerClose?.addEventListener("click", closeDrawer);
    $drawerBackdrop?.addEventListener("click", closeDrawer);

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && $drawer.classList.contains("open")) closeDrawer();
    });
})();
