// /u/u.js
console.log("✅ u.js loaded (fast + mobile safe)");

const FN_GET_PROFILE = "/.netlify/functions/get_profile";
const FN_LIST_FOLLOWERS = "/.netlify/functions/list_followers";
const FN_LIST_FOLLOWING = "/.netlify/functions/list_following";

const el = (id) => document.getElementById(id);
const qs = (k) => new URLSearchParams(location.search).get(k);

const $avatar = el("uAvatar");
const $name = el("uName");
const $bio = el("uBio");
const $followers = el("uFollowers");
const $following = el("uFollowing");
const $postsCount = el("uPostsCount");
const $links = el("uLinks");
const $grid = el("uPostsGrid");
const $msg = el("uMsg");

const $followersBtn = el("uFollowersBtn");
const $followingBtn = el("uFollowingBtn");

const $modal = el("uModal");
const $modalTitle = el("uModalTitle");
const $modalBody = el("uModalBody");
const $modalClose = el("uModalClose");

function esc(s){
    return String(s ?? "")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;");
}

function closeModal(){
    $modal.hidden = true;
    $modalBody.innerHTML = "";
}
$modalClose?.addEventListener("click", closeModal);
$modal?.addEventListener("click", e => e.target === $modal && closeModal());

function renderLinks(list){
    $links.innerHTML = "";
    (list || []).forEach(l => {
        const a = document.createElement("a");
        a.className = "uLink";
        a.href = l.url;
        a.target = "_blank";
        a.textContent = l.label || new URL(l.url).hostname;
        $links.appendChild(a);
    });
}

function renderPosts(posts){
    $grid.innerHTML = "";
    (posts || []).forEach(p => {
        const d = document.createElement("div");
        d.className = "uPost";
        d.innerHTML = `<img src="${esc(p.image_url)}">`;
        $grid.appendChild(d);
    });
}

(async function boot(){
    let id = qs("id");
    const me = qs("me");

    if (!id && me === "1"){
        id = localStorage.getItem("sm_uid");
    }
    if (!id){
        $msg.textContent = "Login required";
        return;
    }

    const cacheKey = `profile_cache_${id}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached){
        try{
            const data = JSON.parse(cached);
            paint(data);
        }catch{}
    }

    const res = await fetch(`${FN_GET_PROFILE}?id=${encodeURIComponent(id)}`);
    const json = await res.json().catch(()=>null);
    if (!res.ok || !json){
        $msg.textContent = "Profile load failed";
        return;
    }

    paint(json);
    localStorage.setItem(cacheKey, JSON.stringify(json));

    $followersBtn.onclick = async () => {
        $modal.hidden = false;
        $modalTitle.textContent = "Followers";
        const r = await fetch(`${FN_LIST_FOLLOWERS}?id=${id}`);
        const j = await r.json();
        $modalBody.innerHTML = renderUserList(j.list || []);
        attachVisit();
    };

    $followingBtn.onclick = async () => {
        $modal.hidden = false;
        $modalTitle.textContent = "Following";
        const r = await fetch(`${FN_LIST_FOLLOWING}?id=${id}`);
        const j = await r.json();
        $modalBody.innerHTML = renderUserList(j.list || []);
        attachVisit();
    };

    function paint(data){
        const p = data.profile;
        const c = data.counts;
        $name.textContent = p.name || "—";
        $bio.textContent = p.bio || "";
        $avatar.src = p.avatar_url || "/assets/img/avatar-placeholder.png";
        $followers.textContent = c.followers;
        $following.textContent = c.following;
        $postsCount.textContent = c.posts;
        renderLinks(p.links);
        renderPosts(data.posts);
    }

    function renderUserList(list){
        return list.map(u => `
      <div class="uUserRow">
        <img src="${esc(u.avatar_url)}" class="uUserAva">
        <div class="uUserName">${esc(u.name)}</div>
        <button data-id="${u.id}" class="uUserGo">Visit</button>
      </div>
    `).join("");
    }

    function attachVisit(){
        $modalBody.querySelectorAll(".uUserGo").forEach(b=>{
            b.onclick = ()=>location.href = `/u/index.html?id=${b.dataset.id}`;
        });
    }
})();
