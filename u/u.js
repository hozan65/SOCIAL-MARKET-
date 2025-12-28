// /u/u.js
import { account } from "/assets/appwrite.js";

console.log("✅ u.js loaded (profile + followers/following modal)");

const FN_GET = "/.netlify/functions/get_profile";
const FN_ENSURE = "/.netlify/functions/ensure_profile";
const FN_LIST_FOLLOWERS = "/.netlify/functions/list_followers";
const FN_LIST_FOLLOWING = "/.netlify/functions/list_following";

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

// ---- modal elements ----
const $modal = $("uModal");
const $modalTitle = $("uModalTitle");
const $modalBody = $("uModalBody");
const $modalClose = $("uModalClose");

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
    try {
        return new URL(url).hostname;
    } catch {
        return url || "";
    }
}

function setMsg(t) {
    if ($msg) $msg.textContent = t || "";
}

function openModal(title) {
    $modalTitle.textContent = title || "—";
    $modal.hidden = false;
    $modalBody.innerHTML = `<div style="opacity:.7;padding:10px 0;">Loading...</div>`;
}

function closeModal() {
    $modal.hidden = true;
    $modalBody.innerHTML = "";
}

function renderUserList(list) {
    if (!list?.length) {
        $modalBody.innerHTML = `<div style="opacity:.7;padding:10px 0;">Empty</div>`;
        return;
    }

    $modalBody.innerHTML = list
        .map((u) => {
            const name = esc(u?.name || "User");
            const av = u?.avatar_url ? esc(u.avatar_url) : "";
            const id = u?.id || "";
            return `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.08);">
          ${
                av
                    ? `<img src="${av}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">`
                    : `<div style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.12);"></div>`
            }
          <div style="flex:1;">
            <div style="font-weight:600;">${name}</div>
          </div>
          <a href="/u/u.html?id=${encodeURIComponent(id)}" style="text-decoration:none;opacity:.9;">View</a>
        </div>
      `;
        })
        .join("");
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

// ensure_profile (JWT gerektirebilir; bu sayfada en azından deniyoruz)
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
        // ensure fail olsa da sayfa çalışsın
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

    // hiç uid yoksa: login kontrol edip kendi uid
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
        try {
            renderProfile(JSON.parse(cachedRaw));
        } catch {}
    }

    // ✅ load fresh
    try {
        const data = await fetchProfile(uid);
        renderProfile(data);
        localStorage.setItem(cacheKey, JSON.stringify(data));
        setMsg("");
    } catch (e) {
        console.warn("get_profile failed:", e?.message || e);
        // ilk login row yoksa ensure + retry
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

    // ✅ EVENTS: Followers / Following
    $followersBtn?.addEventListener("click", async () => {
        try {
            openModal("Followers");
            const list = await loadList(`${FN_LIST_FOLLOWERS}?id=${encodeURIComponent(uid)}`);
            renderUserList(list);
        } catch (e) {
            $modalBody.innerHTML = `<div style="color:#ff6b6b;padding:10px 0;">❌ ${esc(e?.message || e)}</div>`;
        }
    });

    $followingBtn?.addEventListener("click", async () => {
        try {
            openModal("Following");
            const list = await loadList(`${FN_LIST_FOLLOWING}?id=${encodeURIComponent(uid)}`);
            renderUserList(list);
        } catch (e) {
            $modalBody.innerHTML = `<div style="color:#ff6b6b;padding:10px 0;">❌ ${esc(e?.message || e)}</div>`;
        }
    });

    // ✅ modal close
    $modalClose?.addEventListener("click", closeModal);
    $modal?.addEventListener("click", (e) => {
        if (e.target === $modal) closeModal();
    });
})();
