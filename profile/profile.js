import { account } from "/assets/appwrite.js";

const SUPABASE_URL = "https://yzrhqduuqvllatliulqv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_dN5E6cw7uaKj7Cmmpo7RJg_W4FWxjs_";

const sb = window.supabase?.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

const el = (id) => document.getElementById(id);

const pAvatar = el("pAvatar");
const pName = el("pName");
const pUser = el("pUser");
const pMeta = el("pMeta");
const pBio = el("pBio");
const pLink = el("pLink");

const postCount = el("postCount");
const followerCount = el("followerCount");
const followingCount = el("followingCount");
const joined = el("joined");

const editBtn = el("editBtn");
const followBtn = el("followBtn");
const msgBtn = el("msgBtn");

const editWrap = el("editWrap");
const bioInput = el("bioInput");
const linkInput = el("linkInput");
const cancelEdit = el("cancelEdit");
const saveEdit = el("saveEdit");

const postsGrid = el("postsGrid");
const pMsg = el("pMsg");

const fmtDate = (iso) => {
    try {
        const d = new Date(iso);
        return d.toLocaleDateString("tr-TR", { year:"numeric", month:"short", day:"2-digit" });
    } catch { return "—"; }
};

function initials(name){
    const s = (name || "").trim();
    if (!s) return "SM";
    const parts = s.split(/\s+/).slice(0,2);
    return parts.map(x=>x[0]?.toUpperCase()).join("") || "SM";
}

function safeUrl(u){
    const s = (u || "").trim();
    if (!s) return "";
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
    return "https://" + s;
}

async function getMe(){
    try { return await account.get(); } catch { return null; }
}

function getTargetUid(me){
    const url = new URL(location.href);
    const uid = url.searchParams.get("uid");
    return uid || me?.$id || null;
}

async function loadProfileRow(userId){
    if (!sb) return null;
    const { data, error } = await sb
        .from("profiles")
        .select("user_id, username, display_name, bio, link, avatar_url, created_at")
        .eq("user_id", userId)
        .maybeSingle();
    if (error) console.warn("profiles read error:", error);
    return data || null;
}

async function countPosts(userId){
    if (!sb) return 0;
    // ⚠️ Post tablon: analyses (sende feed bu tabloyu kullanıyordu)
    const { count, error } = await sb
        .from("analyses")
        .select("id", { count: "exact", head: true })
        .eq("author_id", userId);
    if (error) console.warn("post count error:", error);
    return count || 0;
}

async function countFollowers(userId){
    if (!sb) return 0;
    const { count, error } = await sb
        .from("follows")
        .select("follower_id", { count: "exact", head: true })
        .eq("following_id", userId);
    if (error) console.warn("followers count error:", error);
    return count || 0;
}

async function countFollowing(userId){
    if (!sb) return 0;
    const { count, error } = await sb
        .from("follows")
        .select("following_id", { count: "exact", head: true })
        .eq("follower_id", userId);
    if (error) console.warn("following count error:", error);
    return count || 0;
}

async function isFollowing(meId, targetId){
    if (!sb || !meId || !targetId) return false;
    if (meId === targetId) return false;

    const { data, error } = await sb
        .from("follows")
        .select("follower_id")
        .eq("follower_id", meId)
        .eq("following_id", targetId)
        .limit(1);
    if (error) console.warn("isFollowing error:", error);
    return Array.isArray(data) && data.length > 0;
}

async function loadPosts(userId){
    if (!sb) return [];
    const { data, error } = await sb
        .from("analyses")
        .select("id, content, image_path, created_at")
        .eq("author_id", userId)
        .order("created_at", { ascending: false })
        .limit(12);
    if (error) console.warn("load posts error:", error);
    return data || [];
}

function renderPosts(list){
    postsGrid.innerHTML = "";
    if (!list?.length){
        pMsg.textContent = "No posts yet.";
        return;
    }
    pMsg.textContent = "";

    const frag = document.createDocumentFragment();
    for (const it of list){
        const card = document.createElement("div");
        card.className = "pPost";

        if (it.image_path){
            const img = document.createElement("img");
            img.className = "pPostImg";
            img.src = it.image_path; // sende public path ise
            img.alt = "post";
            card.appendChild(img);
        }

        const body = document.createElement("div");
        body.className = "pPostBody";

        const title = document.createElement("div");
        title.className = "pPostTitle";
        title.textContent = (it.content || "").slice(0, 90) || "Post";
        body.appendChild(title);

        const time = document.createElement("div");
        time.className = "pPostTime";
        time.textContent = fmtDate(it.created_at);
        body.appendChild(time);

        card.appendChild(body);
        frag.appendChild(card);
    }
    postsGrid.appendChild(frag);
}

function setFollowUI(following){
    followBtn.textContent = following ? "Following" : "Follow";
    followBtn.classList.toggle("primary", !following);
}

async function main(){
    const me = await getMe();
    if (!me){
        // login değilse auth sayfasına at
        location.href = "/auth/login.html";
        return;
    }

    const myId = me.$id;
    const targetId = getTargetUid(me);

    // Profil sahibi ben miyim?
    const isMe = (targetId === myId);

    // Appwrite basic
    const displayName = me.name || me.email?.split("@")[0] || "User";

    // Supabase profile row
    const row = await loadProfileRow(targetId);

    const name = isMe
        ? (row?.display_name || me.name || displayName)
        : (row?.display_name || row?.username || "User");

    pName.textContent = name;
    pUser.textContent = row?.username ? `@${row.username}` : `@user`;
    pAvatar.textContent = initials(name);

    // Meta & Joined
    const joinedIso = isMe ? me.$createdAt : (row?.created_at || me.$createdAt);
    pMeta.textContent = isMe ? (me.email || "") : "";
    joined.textContent = fmtDate(joinedIso);

    // Bio & link
    pBio.textContent = row?.bio || "No bio yet.";
    const link = safeUrl(row?.link || "");
    if (link){
        pLink.style.display = "inline-block";
        pLink.href = link;
        pLink.textContent = link.replace(/^https?:\/\//, "");
    } else {
        pLink.style.display = "none";
    }

    // Counts
    const [pc, fc, fg] = await Promise.all([
        countPostsuf(countPosts(targetId)),
        countFollowers(targetId),
        countFollowing(targetId),
    ]).catch(async () => [await countPosts(targetId), await countFollowers(targetId), await countFollowing(targetId)]);

    postCount.textContent = String(pc || 0);
    followerCount.textContent = String(fc || 0);
    followingCount.textContent = String(fg || 0);

    // Posts
    const posts = await loadPosts(targetId);
    renderPosts(posts);

    // Buttons
    if (isMe){
        editBtn.style.display = "inline-flex";
        followBtn.style.display = "none";
        msgBtn.style.display = "none";
    } else {
        editBtn.style.display = "none";
        followBtn.style.display = "inline-flex";
        msgBtn.style.display = "inline-flex";

        const following = await isFollowing(myId, targetId);
        setFollowUI(following);

        followBtn.onclick = async () => {
            // ⚠️ Burada insert/delete için Netlify Function öneriyorum.
            // Şimdilik UI toggle (test).
            const nowFollowing = (followBtn.textContent !== "Following");
            setFollowUI(nowFollowing);
            alert("Follow/Unfollow backend için Netlify function ekleyeceğiz.");
        };

        msgBtn.onclick = () => {
            alert("Message sistemi sonra: conversations/messages tabloları ile ekleriz.");
        };
    }

    // Edit profile (bio/link)
    editBtn.onclick = () => {
        editWrap.style.display = "block";
        bioInput.value = row?.bio || "";
        linkInput.value = row?.link || "";
    };

    cancelEdit.onclick = () => {
        editWrap.style.display = "none";
    };

    saveEdit.onclick = async () => {
        // ⚠️ RLS nedeniyle frontend insert/update çoğu zaman hata verir.
        // En güvenlisi: Netlify function + service_role ile upsert.
        // Şimdilik sadece UI güncellemesi:
        const newBio = (bioInput.value || "").trim();
        const newLink = (linkInput.value || "").trim();

        pBio.textContent = newBio || "No bio yet.";
        const link2 = safeUrl(newLink);
        if (link2){
            pLink.style.display = "inline-block";
            pLink.href = link2;
            pLink.textContent = link2.replace(/^https?:\/\//, "");
        } else {
            pLink.style.display = "none";
        }

        editWrap.style.display = "none";
        alert("Kaydetme için Netlify function ekleyeceğiz (RLS).");
    };
}

// küçük helper (Promise.all bug önlemek için)
function countuf(p){ return p; }

main().catch((e) => {
    console.error(e);
    pMsg.textContent = "Profile load error.";
});
