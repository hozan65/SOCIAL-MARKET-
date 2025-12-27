console.log("✅ u.js loaded");

const FN_GET_PROFILE = "/.netlify/functions/get_profile";
// Follow/list endpointlerin varsa sonra ekleriz. Şimdilik görünüm için yeterli.

const el = (id) => document.getElementById(id);
const qs = (name) => new URLSearchParams(location.search).get(name);

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
const $settingsBtn = el("uSettingsBtn");

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

function setMsg(t) { $msg.textContent = t || ""; }

function closeModal() {
    if ($modal) $modal.hidden = true;
    if ($modalTitle) $modalTitle.textContent = "—";
    if ($modalBody) $modalBody.innerHTML = "";
}

function openModal(title, html) {
    $modalTitle.textContent = title;
    $modalBody.innerHTML = html;
    $modal.hidden = false;
}

$modalClose?.addEventListener("click", closeModal);
$modal?.addEventListener("click", (e) => { if (e.target === $modal) closeModal(); });

function renderLinks(list) {
    $links.innerHTML = "";
    (list || []).forEach((x) => {
        if (!x?.url) return;
        const a = document.createElement("a");
        a.className = "uLink";
        a.href = x.url;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = x.label ? x.label : (() => {
            try { return new URL(x.url).hostname; } catch { return "Link"; }
        })();
        $links.appendChild(a);
    });
}

function renderPosts(posts) {
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

async function loadProfile() {
    closeModal(); // ✅ gri ekran bug fix

    let id = qs("id");
    const me = qs("me");

    // ✅ /u/?me=1 -> localStorage sm_uid ile /u/?id=... yap
    if (!id && me === "1") {
        const myId = localStorage.getItem("sm_uid");
        if (!myId) {
            setMsg("Login required.");
            return;
        }
        location.replace(`/u/?id=${encodeURIComponent(myId)}`);
        return;
    }

    if (!id) {
        setMsg("No user selected.");
        return;
    }

    setMsg("Loading...");

    const url = new URL(FN_GET_PROFILE, location.origin);
    url.searchParams.set("id", id);

    const res = await fetch(url.toString());
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        console.error("get_profile error", res.status, data);
        setMsg(data?.error || "Profile load failed.");
        return;
    }

    // Beklenen format:
    // { profile:{id,name,bio,avatar_url,links:[]}, counts:{followers,following,posts}, posts:[...] }
    const p = data.profile || {};
    const c = data.counts || {};

    $name.textContent = p.name || "—";
    $bio.textContent = p.bio || "";
    $avatar.src = p.avatar_url || "/assets/img/avatar-placeholder.png";

    $followers.textContent = String(c.followers ?? 0);
    $following.textContent = String(c.following ?? 0);
    $postsCount.textContent = String(c.posts ?? 0);

    renderLinks(p.links || []);
    renderPosts(data.posts || []);

    // ✅ My profile ise settings butonu göster, follow gizle
    const myId = localStorage.getItem("sm_uid");
    const isMe = myId && p.id && myId === p.id;

    $settingsBtn.hidden = !isMe;
    $followBtn.hidden = true; // follow kısmını sonra ekleyeceğiz

    // Followers/Following tıklanınca şimdilik bilgi modalı (list fonksiyonlarını sonra bağlarız)
    $followersBtn.onclick = () => openModal("Followers", `<div class="uMsg">Coming soon</div>`);
    $followingBtn.onclick = () => openModal("Following", `<div class="uMsg">Coming soon</div>`);

    setMsg("");
}

loadProfile();
