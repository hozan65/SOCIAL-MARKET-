// /u/u.js
console.log("✅ u.js (clean + instant)");

const FN_GET = "/.netlify/functions/get_profile";
const FN_ENSURE = "/.netlify/functions/ensure_profile";

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
    return String(s ?? "").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

function render(profile){
    $name.textContent = profile.name || "User";
    $bio.textContent = profile.bio || "";
    $avatar.src = profile.avatar_url || "/assets/img/avatar-placeholder.png";

    $followers.textContent = profile.counts.followers;
    $following.textContent = profile.counts.following;
    $posts.textContent = profile.counts.posts;

    // links
    $links.innerHTML = "";
    (profile.profile.links || []).forEach(l=>{
        const a = document.createElement("a");
        a.className = "uLink";
        a.href = l.url;
        a.target = "_blank";
        a.textContent = new URL(l.url).hostname;
        $links.appendChild(a);
    });

    // posts (image only)
    $grid.innerHTML = "";
    (profile.posts || []).forEach(p=>{
        const d = document.createElement("div");
        d.className = "uPost";
        d.innerHTML = `<img src="${esc(p.image_url)}">`;
        $grid.appendChild(d);
    });
}

(async function boot(){
    // ✅ LOGIN ID
    let uid = qs("id");
    if (!uid && qs("me") === "1"){
        uid = localStorage.getItem("sm_uid");
    }
    if (!uid) return;

    // ✅ CACHE → ANINDA AÇILIR
    const cacheKey = "profile_cache_" + uid;
    const cached = localStorage.getItem(cacheKey);
    if (cached){
        try{
            render(JSON.parse(cached));
        }catch{}
    }

    // ✅ PROFILE ROW YOKSA OLUŞTUR
    fetch(FN_ENSURE, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ appwrite_user_id: uid })
    }).catch(()=>{});

    // ✅ GÜNCEL VERİ (sessiz)
    const r = await fetch(`${FN_GET}?id=${uid}`);
    if (!r.ok) return;

    const data = await r.json();
    render(data);
    localStorage.setItem(cacheKey, JSON.stringify(data));
})();
