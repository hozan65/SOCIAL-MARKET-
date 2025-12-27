// /profile/profile.js (MODULE) — FINAL (JWT-safe)
import { account } from "/assets/appwrite.js";

const SUPABASE_URL = "https://yzrhqduuqvllatliulqv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_dN5E6cw7uaKj7Cmmpo7RJg_W4FWxjs_";

const sb = window.supabase?.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

const $ = (id) => document.getElementById(id);

const avatarImg = $("pAvatarImg");
const avatarTxt = $("pAvatarTxt");
const avatarInput = $("avatarInput");
const changeAvatarBtn = $("changeAvatarBtn");

const pName = $("pName");
const pBio = $("pBio");
const pLink = $("pLink");

const postCount = $("postCount");
const followerCount = $("followerCount");
const followingCount = $("followingCount");
const joined = $("joined");

const editBtn = $("editBtn");
const followBtn = $("followBtn");
const msgBtn = $("msgBtn");

const editWrap = $("editWrap");
const bioInput = $("bioInput");
const linkInput = $("linkInput");
const cancelEdit = $("cancelEdit");
const saveEdit = $("saveEdit");

const postsGrid = $("postsGrid");
const pMsg = $("pMsg");

const openFollowers = $("openFollowers");
const openFollowing = $("openFollowing");

const followModal = $("followModal");
const fCloseBtn = $("fCloseBtn");
const fTitle = $("fTitle");
const fList = $("fList");
const fEmpty = $("fEmpty");

function setMsg(t){ if (pMsg) pMsg.textContent = t || ""; }

function initials(name){
    const s = String(name||"").trim();
    if(!s) return "SM";
    return s.split(/\s+/).slice(0,2).map(x => (x[0]||"").toUpperCase()).join("") || "SM";
}
function fmtDate(iso){
    try { return new Date(iso).toLocaleDateString("tr-TR",{year:"numeric",month:"short",day:"2-digit"}); }
    catch { return "—"; }
}
function safeUrl(u){
    const s = String(u||"").trim();
    if(!s) return "";
    if(s.startsWith("http://")||s.startsWith("https://")) return s;
    return "https://" + s;
}
function setAvatar(url, name){
    const u = String(url||"").trim();
    if (avatarImg && avatarTxt){
        if(u){
            avatarImg.src = u + (u.includes("?") ? "&" : "?") + "v=" + Date.now();
            avatarImg.style.display="block";
            avatarTxt.style.display="none";
        } else {
            avatarImg.style.display="none";
            avatarTxt.style.display="block";
            avatarTxt.textContent = initials(name);
        }
    }
}
function setFollowUI(isFollowing){
    if(!followBtn) return;
    followBtn.textContent = isFollowing ? "Following" : "Follow";
    followBtn.classList.toggle("primary", !isFollowing);
}
function escapeHtml(s){
    return String(s ?? "")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
}
function escapeAttr(s){ return escapeHtml(s).replaceAll("`",""); }

async function getMe(){
    try { return await account.get(); } catch { return null; }
}

/* ✅ JWT GUARANTEE (fixes Invalid Compact JWS) */
async function requireJWT(){
    // wait jwt.js initial refresh if present
    if (window.SM_JWT_READY) await window.SM_JWT_READY;

    let jwt = localStorage.getItem("sm_jwt") || "";
    const looksJwt = jwt && jwt.split(".").length === 3 && jwt.startsWith("ey");

    if (!looksJwt && window.SM_REFRESH_JWT) {
        jwt = (await window.SM_REFRESH_JWT()) || "";
    }

    if (!jwt || jwt.split(".").length !== 3) {
        throw new Error("Login required (sm_jwt missing/invalid)");
    }
    return jwt;
}

/* Supabase reads */
async function loadProfileRow(appwriteUserId){
    const { data } = await sb
        .from("profiles")
        .select("appwrite_user_id, name, bio, website, avatar_url, created_at, updated_at")
        .eq("appwrite_user_id", appwriteUserId)
        .maybeSingle();
    return data || null;
}
async function countPosts(userId){
    const { count } = await sb.from("analyses").select("id",{count:"exact",head:true}).eq("author_id", userId);
    return count || 0;
}
async function countFollowers(userId){
    const { count } = await sb.from("follows").select("follower_uid",{count:"exact",head:true}).eq("following_uid", userId);
    return count || 0;
}
async function countFollowing(userId){
    const { count } = await sb.from("follows").select("following_uid",{count:"exact",head:true}).eq("follower_uid", userId);
    return count || 0;
}
async function isFollowing(meId, targetId){
    const { data } = await sb.from("follows").select("follower_uid").eq("follower_uid",meId).eq("following_uid",targetId).limit(1);
    return Array.isArray(data) && data.length>0;
}
async function loadPosts(userId){
    const { data } = await sb.from("analyses").select("id, content, image_path, created_at").eq("author_id", userId)
        .order("created_at",{ascending:false}).limit(12);
    return data || [];
}
function renderPosts(list){
    postsGrid.innerHTML="";
    if(!list?.length){ setMsg("No posts yet."); return; }
    setMsg("");
    const frag=document.createDocumentFragment();
    for(const it of list){
        const card=document.createElement("div");
        card.className="pPost";
        card.onclick=()=>location.href=`/view/view.html?id=${encodeURIComponent(it.id)}`;
        if(it.image_path){
            const img=document.createElement("img");
            img.className="pPostImg";
            img.src=it.image_path;
            card.appendChild(img);
        }
        const body=document.createElement("div");
        body.className="pPostBody";
        const title=document.createElement("div");
        title.className="pPostTitle";
        title.textContent=(it.content||"").slice(0,90)||"Post";
        const time=document.createElement("div");
        time.className="pPostTime";
        time.textContent=fmtDate(it.created_at);
        body.appendChild(title);
        body.appendChild(time);
        card.appendChild(body);
        frag.appendChild(card);
    }
    postsGrid.appendChild(frag);
}

/* Netlify calls */
async function upsertProfile({ bio, website }){
    const jwt = await requireJWT();
    const res = await fetch("/.netlify/functions/upsert_profile",{
        method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:`Bearer ${jwt}` },
        body: JSON.stringify({ bio, website })
    });
    const t=await res.text();
    let j={}; try{ j=t?JSON.parse(t):{} }catch{ j={error:t} }
    if(!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
    return j;
}
async function uploadAvatar(file){
    const jwt = await requireJWT();
    const ext = (file.name.split(".").pop()||"jpg").toLowerCase();

    const base64 = await new Promise((resolve,reject)=>{
        const r=new FileReader();
        r.onload=()=>resolve(String(r.result).split(",")[1]||"");
        r.onerror=()=>reject(new Error("File read failed"));
        r.readAsDataURL(file);
    });

    const res = await fetch("/.netlify/functions/upload_avatar",{
        method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:`Bearer ${jwt}` },
        body: JSON.stringify({ base64, ext })
    });
    const t=await res.text();
    let j={}; try{ j=t?JSON.parse(t):{} }catch{ j={error:t} }
    if(!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
    return j.avatar_url || "";
}

/* Follow modal (optional) */
async function toggleFollow(targetUid){
    const jwt = await requireJWT();
    const res = await fetch("/.netlify/functions/toggle_follow",{
        method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:`Bearer ${jwt}` },
        body: JSON.stringify({ following_uid: String(targetUid) })
    });
    const t=await res.text();
    let j={}; try{ j=t?JSON.parse(t):{} }catch{ j={error:t} }
    if(!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
    return j;
}
async function listFollowers(targetId, limit=50){
    const { data } = await sb.from("follows").select("follower_uid, created_at").eq("following_uid",targetId).order("created_at",{ascending:false}).limit(limit);
    return data||[];
}
async function listFollowing(targetId, limit=50){
    const { data } = await sb.from("follows").select("following_uid, created_at").eq("follower_uid",targetId).order("created_at",{ascending:false}).limit(limit);
    return data||[];
}
async function loadProfiles(userIds){
    const ids=[...new Set((userIds||[]).map(x=>String(x).trim()).filter(Boolean))];
    if(!ids.length) return new Map();
    const { data } = await sb.from("profiles").select("appwrite_user_id, name, avatar_url").in("appwrite_user_id", ids);
    const m=new Map();
    (data||[]).forEach(p=>{
        const k=String(p.appwrite_user_id||"").trim();
        if(k) m.set(k,p);
    });
    return m;
}
function openFollowModal(title){
    if(!followModal) return;
    fTitle.textContent=title;
    fList.innerHTML="";
    fEmpty.style.display="none";
    followModal.style.display="block";
    document.body.style.overflow="hidden";
}
function closeFollowModal(){
    if(!followModal) return;
    followModal.style.display="none";
    document.body.style.overflow="";
}
function renderFollowList(userIds, profilesMap){
    fList.innerHTML="";
    if(!userIds.length){ fEmpty.style.display="block"; return; }
    fEmpty.style.display="none";
    const frag=document.createDocumentFragment();
    userIds.forEach(uid=>{
        const p=profilesMap?.get(uid);
        const name=p?.name || uid;
        const init=(String(name).trim()[0]||"U").toUpperCase();
        const row=document.createElement("div");
        row.className="fItem";
        row.innerHTML=`
      <div class="fLeft">
        <div class="fAvatar">${escapeHtml(init)}</div>
        <div style="min-width:0">
          <div class="fName">${escapeHtml(name)}</div>
          <div class="fSub">${escapeHtml(uid)}</div>
        </div>
      </div>
      <button class="fBtn" data-uid="${escapeAttr(uid)}" type="button">View</button>
    `;
        frag.appendChild(row);
    });
    fList.appendChild(frag);
}

async function main(){
    if(!sb){ setMsg("Supabase CDN missing."); return; }

    const me = await getMe();
    if(!me){ location.href="/auth/login.html"; return; }

    const myId = me.$id;
    const targetUidFromUrl = new URL(location.href).searchParams.get("uid");
    const targetId = targetUidFromUrl || myId;
    const isMe = !targetUidFromUrl || targetUidFromUrl === myId;

    const row = await loadProfileRow(targetId);

    const displayName =
        (row?.name && String(row.name).trim()) ||
        (me?.name && String(me.name).trim()) ||
        (me?.email ? me.email.split("@")[0] : "User");

    pName.textContent = displayName;
    setAvatar(row?.avatar_url || "", displayName);

    joined.textContent = fmtDate(row?.created_at || me?.$createdAt);

    pBio.textContent = row?.bio || "No bio yet.";
    const link = safeUrl(row?.website || "");
    if(link){
        pLink.style.display="inline-block";
        pLink.href=link;
        pLink.textContent=link.replace(/^https?:\/\//,"");
    } else {
        pLink.style.display="none";
    }

    const [pc, fc, fg, posts, following] = await Promise.all([
        countPosts(targetId),
        countFollowers(targetId),
        countFollowing(targetId),
        loadPosts(targetId),
        isMe ? Promise.resolve(false) : isFollowing(myId, targetId),
    ]);

    postCount.textContent=String(pc||0);
    followerCount.textContent=String(fc||0);
    followingCount.textContent=String(fg||0);
    renderPosts(posts);

    if(isMe){
        editBtn.style.display="inline-flex";
        followBtn.style.display="none";
        msgBtn.style.display="none";
        changeAvatarBtn && (changeAvatarBtn.style.display="inline-flex");

        changeAvatarBtn?.addEventListener("click", ()=>avatarInput?.click());
        avatarInput?.addEventListener("change", async ()=>{
            const file=avatarInput.files?.[0];
            if(!file) return;
            try{
                changeAvatarBtn.disabled=true;
                if(file.size > 3*1024*1024) throw new Error("Max 3MB");
                const url = await uploadAvatar(file);
                setAvatar(url, displayName);
            } catch(e){
                alert(e?.message || "Upload failed");
            } finally{
                changeAvatarBtn.disabled=false;
                avatarInput.value="";
            }
        });
    } else {
        editBtn.style.display="none";
        followBtn.style.display="inline-flex";
        msgBtn.style.display="inline-flex";
        changeAvatarBtn && (changeAvatarBtn.style.display="none");

        setFollowUI(!!following);
        followBtn.onclick = async ()=>{
            try{
                followBtn.disabled=true;
                const r = await toggleFollow(targetId);
                setFollowUI(!!r.following);
                const [fc2, fg2] = await Promise.all([countFollowers(targetId), countFollowing(targetId)]);
                followerCount.textContent=String(fc2||0);
                followingCount.textContent=String(fg2||0);
            } catch(e){
                alert(e?.message || "Follow error");
            } finally{
                followBtn.disabled=false;
            }
        };
        msgBtn.onclick=()=>alert("Message sistemi sonra.");
    }

    // edit
    editBtn.onclick=()=>{
        editWrap.style.display="block";
        bioInput.value = row?.bio || "";
        linkInput.value = row?.website || "";
    };
    cancelEdit.onclick=()=>{ editWrap.style.display="none"; };
    saveEdit.onclick=async ()=>{
        try{
            saveEdit.disabled=true;
            const newBio=(bioInput.value||"").trim();
            const newWebsite=(linkInput.value||"").trim();

            pBio.textContent=newBio || "No bio yet.";
            const link2=safeUrl(newWebsite);
            if(link2){
                pLink.style.display="inline-block";
                pLink.href=link2;
                pLink.textContent=link2.replace(/^https?:\/\//,"");
            } else {
                pLink.style.display="none";
            }

            await upsertProfile({ bio:newBio, website:newWebsite });
            editWrap.style.display="none";
        } catch(e){
            alert(e?.message || "Save failed");
        } finally{
            saveEdit.disabled=false;
        }
    };

    // followers/following modal
    openFollowers?.addEventListener("click", async ()=>{
        openFollowModal("Followers");
        const rows=await listFollowers(targetId,50);
        const ids=rows.map(x=>String(x.follower_uid||"").trim()).filter(Boolean);
        const profiles=await loadProfiles(ids);
        renderFollowList(ids, profiles);
    });
    openFollowing?.addEventListener("click", async ()=>{
        openFollowModal("Following");
        const rows=await listFollowing(targetId,50);
        const ids=rows.map(x=>String(x.following_uid||"").trim()).filter(Boolean);
        const profiles=await loadProfiles(ids);
        renderFollowList(ids, profiles);
    });
}

fCloseBtn?.addEventListener("click", closeFollowModal);
followModal?.addEventListener("click",(e)=>{ if(e.target?.dataset?.close) closeFollowModal(); });
fList?.addEventListener("click",(e)=>{
    const btn = e.target.closest(".fBtn");
    if(!btn) return;
    const uid = btn.dataset.uid;
    if(!uid) return;
    location.href = `/profile/index.html?uid=${encodeURIComponent(uid)}`;
});

main().catch((e)=>{ console.error(e); setMsg("Profile load error."); });
