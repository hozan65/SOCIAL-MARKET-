// /u/u.js
import { account } from "/assets/appwrite.js";

console.log("✅ u.js (first-login fix + ensure_profile retry)");

const FN_GET = "/.netlify/functions/get_profile";
const FN_ENSURE = "/.netlify/functions/ensure_profile";

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
    const p = data?.profile || {};
    const c = data?.counts || {};
    const posts = data?.posts || [];

    $name.textContent = p.name || "User";
    $bio.textContent = p.bio || "";

    if (p.avatar_url){
        $avatar.src = p.avatar_url;
        $avatar.style.display = "block";
    } else {
        $avatar.removeAttribute("src");
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

async function getJwtHeaders(){
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

async function ensureProfileIfNeeded(){
    const headers = await getJwtHeaders();
    // ensure_profile backend user’ı JWT’den alacak, body şart değil ama gönderiyoruz
    await fetch(FN_ENSURE, {
        method: "POST",
        headers,
        body: JSON.stringify({ ok: true })
    });
}

async function fetchProfile(uid){
    const r = await fetch(`${FN_GET}?id=${encodeURIComponent(uid)}`, { cache: "no-store" });
    if (!r.ok) {
        const err = await r.json().catch(()=> ({}));
        throw new Error(err?.error || `get_profile ${r.status}`);
    }
    return r.json();
}

(async function boot(){
    let uid = qs("id");

    // ✅ me=1 ise: önce localStorage, yoksa Appwrite’dan çek (ilk login fix)
    if (!uid && qs("me") === "1") {
        uid = localStorage.getItem("sm_uid");
        if (!uid) {
            try {
                const u = await account.get();
                uid = u?.$id;
                if (uid) localStorage.setItem("sm_uid", uid);
            } catch {
                // login yoksa auth sayfasına
                location.href = "/auth/login.html";
                return;
            }
        }
    }

    if (!uid) {
        console.warn("No uid, profile cannot load.");
        return;
    }

    // ✅ hızlı açılış: cache render
    const cacheKey = "profile_cache_" + uid;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        try { render(JSON.parse(cached)); } catch {}
    }

    try {
        const data = await fetchProfile(uid);
        render(data);
        localStorage.setItem(cacheKey, JSON.stringify(data));
        return;
    } catch (e) {
        // ✅ İlk login’de row yoksa: ensure_profile çalıştır, 1 kez daha dene
        console.warn("First load failed, trying ensure_profile...", e?.message || e);
        try {
            await ensureProfileIfNeeded();
            const data2 = await fetchProfile(uid);
            render(data2);
            localStorage.setItem(cacheKey, JSON.stringify(data2));
            return;
        } catch (e2) {
            console.error("Profile still cannot load:", e2);
            // en azından boş kalmasın:
            $name.textContent = "User";
        }
    }
})();
