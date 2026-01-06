// /profile/profile.js (FULL FIX - sm-api single server.js uyumlu)
import { account } from "/assets/appwrite.js";

console.log("✅ profile.js (FIX)");

// sm-api
const API_BASE = "https://api.chriontoken.com";
const EP_ME = `${API_BASE}/api/auth/me`;
const EP_UPLOAD_AVATAR = `${API_BASE}/api/upload/avatar`;
const EP_SET_AVATAR = `${API_BASE}/api/profile/avatar`;
const EP_PROFILE_UPDATE = `${API_BASE}/api/profile/update`;

const $ = (id) => document.getElementById(id);

// elements
const pName = $("pName");
const pMsg = $("pMsg");

const pAvatarImg = $("pAvatarImg");
const pAvatarTxt = $("pAvatarTxt");
const avatarInput = $("avatarInput");
const uploadBtn = $("uploadBtn");
const deleteBtn = $("deleteBtn");

const bioInput = $("bioInput");
const link1Input = $("link1Input");
const link2Input = $("link2Input");

const saveBtn = $("saveBtn");
const cancelBtn = $("cancelBtn");

let busy = false;
let initial = { bio: "", website: "", link2: "", avatar_url: "" };

function setMsg(t) { if (pMsg) pMsg.textContent = t || ""; }

function setBusy(b){
    busy = !!b;
    if (saveBtn) saveBtn.disabled = busy;
    if (cancelBtn) cancelBtn.disabled = busy;
    if (uploadBtn) uploadBtn.disabled = busy;
    if (deleteBtn) deleteBtn.disabled = busy;
}

function getJWT(){
    const jwt = (window.SM_JWT || localStorage.getItem("sm_jwt") || "").trim();
    if (!jwt) throw new Error("missing sm_jwt");
    return jwt;
}

async function apiJson(url, { method="GET", body } = {}){
    const jwt = getJWT();
    const r = await fetch(url, {
        method,
        headers: {
            "Content-Type":"application/json",
            "Authorization": `Bearer ${jwt}`,
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
    });
    const j = await r.json().catch(()=> ({}));
    if(!r.ok || j?.ok === false) throw new Error(j?.error || j?.detail || `HTTP ${r.status}`);
    return j;
}

function setAvatar(url){
    const u = String(url || "").trim();
    if(u){
        pAvatarImg.src = u;
        pAvatarImg.style.display = "block";
        pAvatarTxt.style.display = "none";
    }else{
        pAvatarImg.removeAttribute("src");
        pAvatarImg.style.display = "none";
        pAvatarTxt.style.display = "block";
    }
}

function fillForm(me, fallbackName){
    if (pName) pName.textContent = fallbackName;
    if (bioInput) bioInput.value = me?.bio || "";
    if (link1Input) link1Input.value = me?.website || "";
    if (link2Input) link2Input.value = ""; // server şimdilik 1 website tutuyor
    setAvatar(me?.avatar_url || "");
}

function snapshotFrom(me){
    initial.bio = me?.bio || "";
    initial.website = me?.website || "";
    initial.link2 = ""; // şimdilik yok
    initial.avatar_url = me?.avatar_url || "";
}

async function uploadAvatarFile(file){
    const jwt = getJWT();
    const fd = new FormData();
    fd.append("file", file);

    const r = await fetch(EP_UPLOAD_AVATAR, {
        method:"POST",
        headers: { "Authorization": `Bearer ${jwt}` },
        body: fd,
    });
    const j = await r.json().catch(()=> ({}));
    if(!r.ok || !j.ok) throw new Error(j?.error || `upload failed (${r.status})`);

    // server: { ok:true, url, path }
    const url = String(j.url || "").trim();
    if(!url) throw new Error("upload response missing url");
    return url;
}

async function setAvatarOnServer(avatarUrl){
    return apiJson(EP_SET_AVATAR, { method:"POST", body:{ avatar_url: avatarUrl } });
}

async function saveProfile(){
    const body = {
        bio: (bioInput?.value || "").trim(),
        website: (link1Input?.value || "").trim(),
    };
    return apiJson(EP_PROFILE_UPDATE, { method:"POST", body });
}

// ===== BOOT =====
(async function boot(){
    // ensure login
    let user;
    try{
        user = await account.get();
    }catch{
        location.href = "/auth/login.html";
        return;
    }

    const fallbackName =
        user?.name || (user?.email ? user.email.split("@")[0] : "") || "User";

    setMsg("");
    setBusy(false);

    // load me (sm-api)
    let me = null;
    try{
        me = await apiJson(EP_ME);
    }catch(e){
        console.error(e);
        setMsg("❌ ME error: " + (e?.message || e));
        // yine de formu boş bas
        fillForm({}, fallbackName);
        snapshotFrom({});
        return;
    }

    // me: { ok:true, user_uuid, appwrite_uid, avatar_url, website, bio }
    fillForm(me, fallbackName);
    snapshotFrom(me);

    // cancel
    cancelBtn?.addEventListener("click", () => {
        if(bioInput) bioInput.value = initial.bio || "";
        if(link1Input) link1Input.value = initial.website || "";
        if(link2Input) link2Input.value = initial.link2 || "";
        setAvatar(initial.avatar_url || "");
        setMsg("");
    });

    // save
    saveBtn?.addEventListener("click", async () => {
        try{
            setBusy(true);
            setMsg("Saving...");
            await saveProfile();

            initial.bio = (bioInput?.value || "").trim();
            initial.website = (link1Input?.value || "").trim();

            setMsg("✅ Saved");
            setTimeout(()=>setMsg(""), 900);
        }catch(e){
            console.error(e);
            setMsg("❌ " + (e?.message || e));
        }finally{
            setBusy(false);
        }
    });

    // avatar upload
    uploadBtn?.addEventListener("click", () => avatarInput?.click());

    avatarInput?.addEventListener("change", async () => {
        const file = avatarInput.files?.[0];
        if(!file) return;
        try{
            setBusy(true);
            setMsg("Uploading...");
            const url = await uploadAvatarFile(file);

            setMsg("Saving avatar...");
            await setAvatarOnServer(url);

            setAvatar(url);
            initial.avatar_url = url;

            setMsg("✅ Avatar updated");
            setTimeout(()=>setMsg(""), 900);
        }catch(e){
            console.error(e);
            setMsg("❌ " + (e?.message || e));
        }finally{
            avatarInput.value = "";
            setBusy(false);
        }
    });

    // delete avatar (server’da “delete endpoint” yok, bu yüzden boş string setliyoruz)
    deleteBtn?.addEventListener("click", async () => {
        try{
            setBusy(true);
            setMsg("Deleting...");
            await setAvatarOnServer(""); // avatar_url empty
            setAvatar("");
            initial.avatar_url = "";
            setMsg("✅ Deleted");
            setTimeout(()=>setMsg(""), 900);
        }catch(e){
            console.error(e);
            setMsg("❌ " + (e?.message || e));
        }finally{
            setBusy(false);
        }
    });
})();
