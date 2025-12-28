// /u/u.js
import { account } from "/assets/appwrite.js";

console.log("✅ u.js loaded (followers/following working)");

const FN_GET = "/.netlify/functions/get_profile";
const FN_ENSURE = "/.netlify/functions/ensure_profile";
const FN_LIST_FOLLOWERS = "/.netlify/functions/list_followers";
const FN_LIST_FOLLOWING = "/.netlify/functions/list_following";

const qs = (k) => new URLSearchParams(location.search).get(k);
const $ = (id) => document.getElementById(id);

const $avatar = $("uAvatar");
const $name = $("uName");
const $bio = $("uBio");
const $followers = $("uFollowers");
const $following = $("uFollowing");
const $posts = $("uPostsCount");
const $links = $("uLinks");
const $grid = $("uPostsGrid");

const $followersBtn = $("uFollowersBtn");
const $followingBtn = $("uFollowingBtn");

const $modal = $("uModal");
const $modalTitle = $("uModalTitle");
const $modalBody = $("uModalBody");
const $modalClose = $("uModalClose");

function esc(s){
    return String(s ?? "")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
}

function renderProfile(data){
    const p = data?.profile || {};
    const c = data?.counts || {};
    const posts = data?.posts || [];

    $name.textContent = p.name || "User";
    $bio.textContent = p.bio || "";

    if (p.avatar_url){
        $avatar.src = p.avatar_url;
        $avatar.style.display = "block";
    } else {
        $avatar.style.display = "none";
    }

    $followers.textContent = c.followers ?? 0;
    $following.textContent = c.following ?? 0;
    $posts.textContent = c.posts ?? 0;

    $links.innerHTML = "";
    (p.links || []).forEach(l=>{
        if(!l?.url) return;
        const a = document.createElement("a");
        a.href = l.url;
        a.target = "_blank";
        a.textContent = l.url;
        $links.appendChild(a);
    });

    $grid.innerHTML = "";
    posts.forEach(post=>{
        if(!post.image_url) return;
        const d = document.createElement("div");
        d.className = "uPost";
        d.innerHTML = `<img src="${esc(post.image_url)}">`;
        $grid.appendChild(d);
    });
}

// ================= MODAL =================
function openModal(title){
    $modalTitle.textContent = title;
    $modal.hidden = false;
    $modalBody.innerHTML = `<div style="opacity:.7">Loading...</div>`;
}
function closeModal(){
    $modal.hidden = true;
    $modalBody.innerHTML = "";
}

function renderList(list){
    if(!list.length){
        $modalBody.innerHTML = `<div style="opacity:.6">Empty</div>`;
        return;
    }

    $modalBody.innerHTML = list.map(u=>`
        <div style="display:flex;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid #222">
            ${u.avatar_url
        ? `<img src="${esc(u.avatar_url)}" style="width:36px;height:36px;border-radius:50%">`
        : `<div style="width:36px;height:36px;border-radius:50%;background:#333"></div>`
    }
            <div style="flex:1">${esc(u.name || "User")}</div>
            <a href="/u/u.html?id=${esc(u.id)}">View</a>
        </div>
    `).join("");
}

async function loadFollowers(uid){
    const r = await fetch(`${FN_LIST_FOLLOWERS}?id=${uid}`);
    const j = await r.json();
    if(!r.ok) throw new Error(j.error);
    return j.list || [];
}

async function loadFollowing(uid){
    const r = await fetch(`${FN_LIST_FOLLOWING}?id=${uid}`);
    const j = await r.json();
    if(!r.ok) throw new Error(j.error);
    return j.list || [];
}

// ================= BOOT =================
(async function boot(){
    let uid = qs("id");

    if(!uid){
        try{
            const me = await account.get();
            uid = me.$id;
            localStorage.setItem("sm_uid", uid);
        }catch{
            location.href = "/auth/login.html";
            return;
        }
    }

    // profile load
    try{
        const r = await fetch(`${FN_GET}?id=${uid}`);
        const data = await r.json();
        renderProfile(data);
    }catch(e){
        await fetch(FN_ENSURE, { method:"POST" });
    }

    // EVENTS (EN ÖNEMLİ KISIM)
    $followersBtn.onclick = async ()=>{
        openModal("Followers");
        try{
            const list = await loadFollowers(uid);
            renderList(list);
        }catch(e){
            $modalBody.innerHTML = "❌ " + esc(e.message);
        }
    };

    $followingBtn.onclick = async ()=>{
        openModal("Following");
        try{
            const list = await loadFollowing(uid);
            renderList(list);
        }catch(e){
            $modalBody.innerHTML = "❌ " + esc(e.message);
        }
    };

    $modalClose.onclick = closeModal;
    $modal.onclick = (e)=>{ if(e.target === $modal) closeModal(); };
})();
