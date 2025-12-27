// /u/u.js
console.log("✅ u.js (fixed to match get_profile.js response)");

const FN_GET = "/.netlify/functions/get_profile";

const $ = (id) => document.getElementById(id);
const qs = (k) => new URLSearchParams(location.search).get(k);

const $avatar = $("uAvatar");
const $name = $("uName");
const $bio = $("uBio");
const $followers = $("uFollowers");
const $following = $("uFollowing");
const $posts = $("uPostsCount");
const $links = $("uLinks");
const $grid = $("uPostsGrid");

function esc(s){
    return String(s ?? "")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
}

function safeHost(url){
    try { return new URL(url).hostname; } catch { return url; }
}

function render(data){
    // ✅ get_profile.js -> data.profile / data.counts / data.posts
    const p = data?.profile || {};
    const c = data?.counts || {};
    const posts = data?.posts || [];

    $name.textContent = p.name || "User";
    $bio.textContent = p.bio || "";

    const av = p.avatar_url;
    if (av){
        $avatar.src = av;
        $avatar.style.display = "block";
    } else {
        // placeholder
        $avatar.removeAttribute("src");
    }

    $followers.textContent = c.followers ?? 0;
    $following.textContent = c.following ?? 0;
    $posts.textContent = c.posts ?? 0;

    // Links
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

    // Posts (image only)
    $grid.innerHTML = "";
    posts.forEach((post) => {
        const imgUrl = post.image_url || post.image_path || post.image;
        if (!imgUrl) return;

        const card = document.createElement("div");
        card.className = "uPost";
        card.innerHTML = `<img loading="lazy" src="${esc(imgUrl)}" alt याद="">`;
        $grid.appendChild(card);
    });
}

(async function boot(){
    let uid = qs("id");
    if (!uid && qs("me") === "1") uid = localStorage.getItem("sm_uid");
    if (!uid){
        console.warn("No uid");
        return;
    }

    // ✅ hızlı açılış için cache
    const cacheKey = "profile_cache_" + uid;
    const cached = localStorage.getItem(cacheKey);
    if (cached){
        try { render(JSON.parse(cached)); } catch {}
    }

    const r = await fetch(`${FN_GET}?id=${encodeURIComponent(uid)}`, { cache: "no-store" });
    if (!r.ok){
        console.warn("get_profile failed", r.status);
        return;
    }

    const data = await r.json();
    render(data);
    localStorage.setItem(cacheKey, JSON.stringify(data));
})();
