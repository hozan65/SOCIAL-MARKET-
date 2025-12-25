// /profile/profile.js (MODULE)
import { account } from "/assets/appwrite.js";

console.log("✅ profile.js loaded");

// Supabase (sayıları DB'den çekmek için)
const SUPABASE_URL = "https://yzrhqduuqvllatliulqv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_dN5E6cw7uaKj7Cmmpo7RJg_W4FWxjs_";
const sb = window.supabase?.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

const pUsername = document.getElementById("pUsername");
const pEmail = document.getElementById("pEmail");
const pBio = document.getElementById("pBio");
const pAvatar = document.getElementById("pAvatar");

const statFollowers = document.getElementById("statFollowers");
const statFollowing = document.getElementById("statFollowing");
const statPosts = document.getElementById("statPosts");

const logoutBtn = document.getElementById("logoutBtn");

function safeText(el, t){ if (el) el.textContent = t ?? ""; }

async function requireLogin(){
    const uid = localStorage.getItem("sm_uid");
    if (!uid) {
        location.href = "/auth/login.html";
        return null;
    }
    try{
        const user = await account.get();
        return user; // user.$id, user.name, user.email
    }catch(e){
        localStorage.removeItem("sm_uid");
        localStorage.removeItem("sm_jwt");
        localStorage.removeItem("sm_name");
        localStorage.removeItem("sm_email");
        location.href = "/auth/login.html";
        return null;
    }
}

(async function init(){
    const user = await requireLogin();
    if (!user) return;

    // ✅ İSİM BURADA ÇIKAR:
    const name = localStorage.getItem("sm_name") || user.name || user.email?.split("@")[0] || "User";
    const email = localStorage.getItem("sm_email") || user.email || "";

    safeText(pUsername, name);
    safeText(pEmail, email);

    // Avatar yoksa default
    if (pAvatar) {
        pAvatar.src = "/assets/img/default-avatar.png";
        pAvatar.onerror = () => (pAvatar.src = "/assets/img/default-avatar.png");
    }

    // Bio şimdilik sabit (istersen Supabase profiles'a bağlarız)
    if (pBio) pBio.textContent = "Welcome to Social Market profile.";

    // Logout
    logoutBtn?.addEventListener("click", async ()=>{
        try { await account.deleteSession("current"); } catch {}
        localStorage.clear();
        location.href = "/auth/login.html";
    });

    // ✅ Sayılar (follows + analyses)
    if (!sb) return;

    const uid = user.$id;

    const followersRes = await sb
        .from("follows")
        .select("id", { count:"exact", head:true })
        .eq("following_uid", uid);

    const followingRes = await sb
        .from("follows")
        .select("id", { count:"exact", head:true })
        .eq("follower_uid", uid);

    // ⚠️ analyses tablosunda author_id farklıysa burayı değiştir:
    const postsRes = await sb
        .from("analyses")
        .select("id", { count:"exact", head:true })
        .eq("author_id", uid);

    safeText(statFollowers, String(followersRes.count ?? 0));
    safeText(statFollowing, String(followingRes.count ?? 0));
    safeText(statPosts, String(postsRes.count ?? 0));
})();
