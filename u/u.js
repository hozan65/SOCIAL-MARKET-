console.log("✅ u.js loaded");

const FN_GET_PROFILE   = "/.netlify/functions/get_profile";
const FN_TOGGLE_FOLLOW = "/.netlify/functions/toggle_follow";
const FN_LIST_FOLLOWERS = "/.netlify/functions/list_followers";
const FN_LIST_FOLLOWING = "/.netlify/functions/list_following";

const el = (id) => document.getElementById(id);

const $avatar = el("uAvatar");
const $name = el("uName");
const $bio = el("uBio");
const $followers = el("uFollowers");
const $following = el("uFollowing");
const $postsCount = el("uPostsCount");
const $links = el("uLinks");
const $grid = el("uPostsGrid");
const $msg = el("uMsg");
const $followBtn = el("uFollowBtn");

const $followersBtn = el("uFollowersBtn");
const $followingBtn = el("uFollowingBtn");

const $modal = el("uModal");
const $modalTitle = el("uModalTitle");
const $modalBody = el("uModalBody");
const $modalClose = el("uModalClose");

const esc = (s) =>
    String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

function qs(name){
    return new URLSearchParams(location.search).get(name);
}

/**
 * Senin auth sistemin Appwrite JWT idi.
 * Bu projede genelde localStorage'da token tutuluyordu.
 * Aşağıdaki key adını kendi projenle aynı yap:
 */
function getJWT(){
    return localStorage.getItem("appwrite_jwt") || localStorage.getItem("jwt") || "";
}

function setMsg(t){ $msg.textContent = t || ""; }

function openModal(title, html){
    $modalTitle.textContent = title;
    $modalBody.innerHTML = html;
    $modal.hidden = false;
}
function closeModal(){
    $modal.hidden = true;
    $modalTitle.textContent = "—";
    $modalBody.innerHTML = "";
}

$modalClose?.addEventListener("click", closeModal);
$modal?.addEventListener("click", (e) => {
    if (e.target === $modal) closeModal();
});

let profileId = null;
let isMe = false;
let isFollowing = false;

async function loadProfile(){
    const id = qs("id");
    const u = qs("u"); // username support (opsiyonel)

    if (!id && !u){
        setMsg("No user selected.");
        return;
    }

    setMsg("Loading...");

    const url = new URL(FN_GET_PROFILE, location.origin);
    if (id) url.searchParams.set("id", id);
    if (u)  url.searchParams.set("username", u);

    const jwt = getJWT();

    const res = await fetch(url.toString(), {
        headers: jwt ? { "Authorization": `Bearer ${jwt}` } : {}
    });

    const data = await res.json().catch(()=> ({}));

    if (!res.ok){
        console.error("get_profile error", res.status, data);
        setMsg(data?.error || "Profile load failed.");
        return;
    }

    /**
     * Beklenen response örneği:
     * {
     *  profile: { id, name, bio, avatar_url, links:[{label,url}] },
     *  counts: { followers: 12, following: 3, posts: 8 },
     *  viewer: { is_me: false, is_following: true },
     *  posts: [ { id, image_url, caption } ]
     * }
     */
    const p = data.profile || {};
    const c = data.counts || {};
    const v = data.viewer || {};

    profileId = p.id;
    isMe = !!v.is_me;
    isFollowing = !!v.is_following;

    $name.textContent = p.name || "—";
    $bio.textContent = p.bio || "";

    $avatar.src = p.avatar_url || "/assets/img/avatar-placeholder.png";

    $followers.textContent = String(c.followers ?? 0);
    $following.textContent = String(c.following ?? 0);
    $postsCount.textContent = String(c.posts ?? 0);

    renderLinks(p.links || []);
    renderPosts(data.posts || []);

    // Follow button show/hide
    if (isMe){
        $followBtn.hidden = true;
    } else {
        $followBtn.hidden = false;
        syncFollowBtn();
    }

    setMsg("");
}

function syncFollowBtn(){
    if (!$followBtn) return;
    if (isFollowing){
        $followBtn.textContent = "Following";
        $followBtn.classList.add("isFollowing");
    } else {
        $followBtn.textContent = "Follow";
        $followBtn.classList.remove("isFollowing");
    }
}

function renderLinks(list){
    $links.innerHTML = "";
    (list || []).forEach((x) => {
        if (!x?.url) return;
        const a = document.createElement("a");
        a.className = "uLink";
        a.href = x.url;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = x.label ? x.label : new URL(x.url).hostname;
        $links.appendChild(a);
    });
}

function renderPosts(posts){
    $grid.innerHTML = "";
    (posts || []).forEach((post) => {
        const wrap = document.createElement("div");
        wrap.className = "uPost";
        wrap.innerHTML = `
      ${post.image_url ? `<img src="${esc(post.image_url)}" alt="post">` : ""}
      ${post.caption ? `<div class="uPostCap">${esc(post.caption)}</div>` : ""}
    `;
        $grid.appendChild(wrap);
    });
}

$followBtn?.addEventListener("click", async () => {
    if (!profileId) return;

    const jwt = getJWT();
    if (!jwt){
        alert("Login required.");
        return;
    }

    $followBtn.disabled = true;

    try{
        const res = await fetch(FN_TOGGLE_FOLLOW, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${jwt}`,
            },
            body: JSON.stringify({ target_id: profileId })
        });

        const data = await res.json().catch(()=> ({}));

        if (!res.ok){
            console.error("toggle_follow error", res.status, data);
            alert(data?.error || "Follow failed.");
            return;
        }

        // beklenen: { following: true/false, followers_count: n }
        isFollowing = !!data.following;
        if (typeof data.followers_count === "number"){
            $followers.textContent = String(data.followers_count);
        } else {
            // fallback
            const current = parseInt($followers.textContent || "0", 10) || 0;
            $followers.textContent = String(isFollowing ? current + 1 : Math.max(0, current - 1));
        }

        syncFollowBtn();
    } finally{
        $followBtn.disabled = false;
    }
});

// Followers list
$followersBtn?.addEventListener("click", async () => {
    if (!profileId) return;

    openModal("Followers", `<div class="uMsg">Loading...</div>`);
    const res = await fetch(`${FN_LIST_FOLLOWERS}?id=${encodeURIComponent(profileId)}`);
    const data = await res.json().catch(()=> ({}));

    if (!res.ok){
        openModal("Followers", `<div class="uMsg">${esc(data?.error || "Failed")}</div>`);
        return;
    }
    openModal("Followers", renderUserListHTML(data.list || []));
});

// Following list
$followingBtn?.addEventListener("click", async () => {
    if (!profileId) return;

    openModal("Following", `<div class="uMsg">Loading...</div>`);
    const res = await fetch(`${FN_LIST_FOLLOWING}?id=${encodeURIComponent(profileId)}`);
    const data = await res.json().catch(()=> ({}));

    if (!res.ok){
        openModal("Following", `<div class="uMsg">${esc(data?.error || "Failed")}</div>`);
        return;
    }
    openModal("Following", renderUserListHTML(data.list || []));
});

function renderUserListHTML(list){
    if (!list.length) return `<div class="uMsg">No users.</div>`;

    return list.map(u => `
    <div class="uUserRow">
      <img class="uUserAva" src="${esc(u.avatar_url || "/assets/img/avatar-placeholder.png")}" alt="">
      <div class="uUserName">${esc(u.name || "User")}</div>
      <button class="uUserGo" data-id="${esc(u.id)}">Visit</button>
    </div>
  `).join("") + attachVisitHandlers();
}

function attachVisitHandlers(){
    setTimeout(() => {
        document.querySelectorAll(".uUserGo").forEach(btn => {
            btn.addEventListener("click", () => {
                const id = btn.getAttribute("data-id");
                if (!id) return;
                location.href = `/u/?id=${encodeURIComponent(id)}`;
            });
        });
    }, 0);
    return "";
}

loadProfile();
