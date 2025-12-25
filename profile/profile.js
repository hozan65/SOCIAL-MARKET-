console.log("✅ profile.js loaded");

// =========================
// SUPABASE (senin değerlerin)
// =========================
const SUPABASE_URL = "https://yzrhqduuqvllatliulqv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_dN5E6cw7uaKj7Cmmpo7RJg_W4FWxjs_";

const sb = window.supabase?.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

if (!sb) console.warn("❌ Supabase client not found. CDN loaded mı?");

// =========================
// ELEMENTS
// =========================
const pAvatar = document.getElementById("pAvatar");
const pUsername = document.getElementById("pUsername");
const pHandle = document.getElementById("pHandle");
const pBio = document.getElementById("pBio");
const pJoined = document.getElementById("pJoined");
const pWebsite = document.getElementById("pWebsite");

const statFollowers = document.getElementById("statFollowers");
const statFollowing = document.getElementById("statFollowing");
const statPosts = document.getElementById("statPosts");

const followBtn = document.getElementById("followBtn");
const msgBtn = document.getElementById("msgBtn");

const postsList = document.getElementById("postsList");
const postsMsg = document.getElementById("postsMsg");

const logoutBtn = document.getElementById("logoutBtn");
const darkToggle = document.getElementById("darkToggle");

// =========================
// HELPERS
// =========================
const esc = (s) =>
    String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

function fmtJoined(iso){
    try{
        const d = new Date(iso);
        return d.toLocaleDateString("en-US", { year:"numeric", month:"short", day:"numeric" });
    }catch{
        return "—";
    }
}

function getProfileUserIdFromURL(){
    // /profile/?u=UUID  (başkasının profiline bakmak için)
    const u = new URLSearchParams(location.search).get("u");
    return u && u.length > 10 ? u : null;
}

function setThemeFromStorage(){
    const isDark = localStorage.getItem("theme") === "dark";
    document.documentElement.classList.toggle("dark", isDark);
    if (darkToggle) darkToggle.checked = isDark;
}

function toggleTheme(){
    const nowDark = !(localStorage.getItem("theme") === "dark");
    localStorage.setItem("theme", nowDark ? "dark" : "light");
    setThemeFromStorage();
}

// =========================
// TABS
// =========================
document.querySelectorAll(".tab").forEach(btn=>{
    btn.addEventListener("click", ()=>{
        document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
        btn.classList.add("active");
        const tab = btn.dataset.tab;

        document.querySelectorAll(".panel").forEach(p=>p.classList.remove("show"));
        document.getElementById(`panel-${tab}`).classList.add("show");
    });
});

// =========================
// MAIN
// =========================
let currentUser = null;   // logged-in user
let viewingUserId = null; // whose profile is displayed
let isOwnProfile = false;
let isFollowing = false;

(async function init(){
    setThemeFromStorage();
    darkToggle?.addEventListener("change", toggleTheme);

    // session
    const { data: { session } } = await sb.auth.getSession();
    currentUser = session?.user || null;

    if (!currentUser){
        // login yoksa feed'e dön veya login sayfası
        location.href = "/auth/login.html";
        return;
    }

    viewingUserId = getProfileUserIdFromURL() || currentUser.id;
    isOwnProfile = viewingUserId === currentUser.id;

    // buttons visibility
    followBtn.style.display = isOwnProfile ? "none" : "inline-flex";
    msgBtn.style.display = isOwnProfile ? "none" : "inline-flex";

    logoutBtn?.addEventListener("click", async ()=>{
        await sb.auth.signOut();
        location.href = "/auth/login.html";
    });

    // load
    await loadProfile();
    await loadCounts();
    await loadPosts();

    if (!isOwnProfile){
        await loadFollowState();
        renderFollowBtn();
        followBtn.addEventListener("click", onToggleFollow);

        // Message butonu şimdilik yönlendirme (DM'yi sonra ekleriz)
        msgBtn.addEventListener("click", ()=>{
            alert("DM sistemi sonraki adım. İstersen kurarız.");
        });
    }
})();

// =========================
// DATA LOADERS
// =========================
async function loadProfile(){
    // profiles: id, username, avatar_url, bio, created_at
    const { data, error } = await sb
        .from("profiles")
        .select("id, username, avatar_url, bio, created_at")
        .eq("id", viewingUserId)
        .maybeSingle();

    if (error){
        console.warn("❌ profile load error:", error);
    }

    const username = data?.username || "User";
    const avatar = data?.avatar_url || "/assets/img/default-avatar.png";
    const bio = data?.bio || "No bio yet.";
    const joined = data?.created_at || currentUser.created_at;

    pUsername.textContent = username;
    pHandle.textContent = "@" + username.toLowerCase().replace(/\s+/g,"");
    pBio.innerHTML = esc(bio);
    pJoined.textContent = `Joined ${fmtJoined(joined)}`;

    pAvatar.src = avatar;
    pAvatar.onerror = () => { pAvatar.src = "/assets/img/default-avatar.png"; };

    // website yok şimdilik (istersen profiles'a ekleriz)
    pWebsite.style.display = "none";
}

async function loadCounts(){
    // Followers: following_uid == viewingUserId
    const followersRes = await sb
        .from("follows")
        .select("id", { count: "exact", head: true })
        .eq("following_uid", viewingUserId);

    // Following: follower_uid == viewingUserId
    const followingRes = await sb
        .from("follows")
        .select("id", { count: "exact", head: true })
        .eq("follower_uid", viewingUserId);

    // Posts: analyses tablosunda author_id alanı varsa onu kullanırız.
    // Sende analyses var. Author alanı farklıysa burayı değiştir.
    const postsRes = await sb
        .from("analyses")
        .select("id", { count: "exact", head: true })
        .eq("author_id", viewingUserId);

    statFollowers.textContent = String(followersRes.count ?? 0);
    statFollowing.textContent = String(followingRes.count ?? 0);
    statPosts.textContent = String(postsRes.count ?? 0);
}

async function loadPosts(){
    postsMsg.textContent = "Loading posts...";
    postsList.innerHTML = "";

    // analyses tablosundan çekiyoruz (senin feed postların)
    const { data, error } = await sb
        .from("analyses")
        .select("id, title, content, image_path, created_at, market, category, timeframe")
        .eq("author_id", viewingUserId)
        .order("created_at", { ascending: false })
        .limit(12);

    if (error){
        console.warn("❌ posts load error:", error);
        postsMsg.textContent = "Posts yüklenemedi. (RLS / kolon adı kontrol)";
        return;
    }

    if (!data || data.length === 0){
        postsMsg.textContent = "No posts yet.";
        return;
    }

    postsMsg.textContent = "";
    postsList.innerHTML = data.map(renderPostCard).join("");
}

function renderPostCard(p){
    const img = p.image_path ? esc(p.image_path) : "";
    const title = esc(p.title || "Post");
    const text = esc(p.content || "");
    const meta = `${esc(p.market || "")} • ${esc(p.category || "")} • ${esc(p.timeframe || "")}`;

    return `
    <article class="postCard">
      ${img ? `<img class="postImg" src="${img}" alt="post"/>` : `<div class="postImg"></div>`}
      <div class="postBody">
        <h3 class="postTitle">${title}</h3>
        <div class="postMeta">${meta}</div>
        <div class="postText">${text}</div>
      </div>
    </article>
  `;
}

// =========================
// FOLLOW STATE
// =========================
async function loadFollowState(){
    // currentUser -> follower_uid
    // viewingUserId -> following_uid
    const { data, error } = await sb
        .from("follows")
        .select("id")
        .eq("follower_uid", currentUser.id)
        .eq("following_uid", viewingUserId)
        .maybeSingle();

    if (error){
        console.warn("❌ follow state error:", error);
    }

    isFollowing = !!data?.id;
}

function renderFollowBtn(){
    if (isOwnProfile) return;
    followBtn.textContent = isFollowing ? "Following" : "Follow";
    followBtn.classList.toggle("primary", !isFollowing);
}

async function onToggleFollow(){
    followBtn.disabled = true;

    try{
        if (!isFollowing){
            // insert
            const { error } = await sb.from("follows").insert({
                follower_uid: currentUser.id,
                following_uid: viewingUserId
            });
            if (error) throw error;
            isFollowing = true;
        }else{
            // delete
            const { error } = await sb.from("follows")
                .delete()
                .eq("follower_uid", currentUser.id)
                .eq("following_uid", viewingUserId);
            if (error) throw error;
            isFollowing = false;
        }

        renderFollowBtn();
        await loadCounts();
    }catch(e){
        console.warn("❌ follow toggle failed:", e);
        alert("Follow işlemi başarısız. RLS / policy kontrol et.");
    }finally{
        followBtn.disabled = false;
    }
}
