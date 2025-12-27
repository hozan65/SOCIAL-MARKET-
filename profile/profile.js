// /profile/profile.js (MODULE) ✅ Settings UI
import { account } from "/assets/appwrite.js";

const FN_GET_PROFILE = "/.netlify/functions/get_profile";
const FN_UPSERT_PROFILE = "/.netlify/functions/upsert_profile";
const FN_UPLOAD_AVATAR = "/.netlify/functions/upload_avatar";

/* DOM */
const $ = (id) => document.getElementById(id);

const avatarImg = $("pAvatarImg");
const avatarTxt = $("pAvatarTxt");
const avatarInput = $("avatarInput");

const uploadBtn = $("uploadBtn");
const deleteBtn = $("deleteBtn");

const pName = $("pName");
const bioInput = $("bioInput");
const link1Input = $("link1Input");
const link2Input = $("link2Input");

const cancelBtn = $("cancelBtn");
const saveBtn = $("saveBtn");
const pMsg = $("pMsg");

function setMsg(t){ pMsg.textContent = t || ""; }

function initials(name) {
    const s = String(name || "").trim();
    if (!s) return "SM";
    return s.split(/\s+/).slice(0, 2).map(x => (x[0]||"").toUpperCase()).join("") || "SM";
}

function safeUrl(v){
    const s = String(v || "").trim();
    if (!s) return "";
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
    return "https://" + s;
}

function getJWT(){
    const jwt = window.SM_JWT || localStorage.getItem("sm_jwt") || "";
    if (!jwt) throw new Error("Missing sm_jwt (login required)");
    return jwt;
}

function setAvatar(url, displayName){
    const u = String(url || "").trim();
    if (u) {
        avatarImg.src = u + (u.includes("?") ? "&" : "?") + "v=" + Date.now();
        avatarImg.style.display = "block";
        avatarTxt.style.display = "none";
    } else {
        avatarImg.style.display = "none";
        avatarTxt.style.display = "block";
        avatarTxt.textContent = initials(displayName);
    }
}

async function getMe(){
    try { return await account.get(); } catch { return null; }
}

/* API */
async function apiGetProfile(uid){
    const jwt = getJWT();
    const res = await fetch(`${FN_GET_PROFILE}?uid=${encodeURIComponent(uid)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${jwt}` }
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j?.error || `get_profile ${res.status}`);
    return j.profile || null;
}

async function apiSaveProfile(payload){
    const jwt = getJWT();
    const res = await fetch(FN_UPSERT_PROFILE, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j?.error || `upsert_profile ${res.status}`);
    return j;
}

async function apiUploadAvatar(file){
    const jwt = getJWT();
    const fd = new FormData();
    fd.append("file", file); // field name must be 'file'

    const res = await fetch(FN_UPLOAD_AVATAR, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
        body: fd,
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j?.error || `upload_avatar ${res.status}`);
    return j.avatar_url || "";
}

/* State */
let me = null;
let current = { name:"", bio:"", link1:"", link2:"", avatar_url:"" };
let original = null;

function setDirtyUI(dirty){
    cancelBtn.disabled = !dirty;
    saveBtn.disabled = !dirty;
}

function readInputs(){
    return {
        name: current.name, // name’i değiştirmiyoruz (istersen ekleriz)
        bio: (bioInput.value || "").trim(),
        link1: safeUrl(link1Input.value || "").trim(),
        link2: safeUrl(link2Input.value || "").trim(),
        avatar_url: current.avatar_url,
    };
}

function applyToInputs(state){
    bioInput.value = state.bio || "";
    link1Input.value = state.link1 || "";
    link2Input.value = state.link2 || "";
}

function computeDirty(){
    const now = readInputs();
    return JSON.stringify(now) !== JSON.stringify(original);
}

function onAnyChange(){
    setDirtyUI(computeDirty());
}

/* Main */
async function main(){
    me = await getMe();
    if (!me) { location.href = "/auth/login.html"; return; }

    // show name
    const displayName = (me?.name && String(me.name).trim()) || (me?.email ? me.email.split("@")[0] : "User");
    pName.textContent = displayName;

    setMsg("Loading...");
    const row = await apiGetProfile(me.$id);

    // DB -> current
    current = {
        name: (row?.name && String(row.name).trim()) || displayName,
        bio: row?.bio || "",
        link1: row?.website || "",     // 1. link: website
        link2: row?.x || "",           // 2. link: x (yada youtube vs)
        avatar_url: row?.avatar_url || "",
    };

    // render
    setAvatar(current.avatar_url, current.name);
    applyToInputs(current);

    // snapshot
    original = readInputs();
    setDirtyUI(false);
    setMsg("");

    // listeners
    bioInput.addEventListener("input", onAnyChange);
    link1Input.addEventListener("input", onAnyChange);
    link2Input.addEventListener("input", onAnyChange);

    cancelBtn.onclick = () => {
        applyToInputs(current);         // current zaten DB’den gelen son değer
        original = readInputs();        // reset dirty baseline
        setDirtyUI(false);
        setMsg("Canceled.");
        setTimeout(() => setMsg(""), 800);
    };

    saveBtn.onclick = async () => {
        try{
            saveBtn.disabled = true;
            cancelBtn.disabled = true;
            setMsg("Saving...");

            const now = readInputs();

            // ✅ DB schema’ya yaz: bio + website + x (2 link)
            await apiSaveProfile({
                name: current.name,
                bio: now.bio,
                website: now.link1,
                x: now.link2,
            });

            // refresh from server (kalıcı olsun)
            const fresh = await apiGetProfile(me.$id);

            current = {
                name: (fresh?.name && String(fresh.name).trim()) || current.name,
                bio: fresh?.bio || "",
                link1: fresh?.website || "",
                link2: fresh?.x || "",
                avatar_url: fresh?.avatar_url || current.avatar_url,
            };

            applyToInputs(current);
            setAvatar(current.avatar_url, current.name);

            original = readInputs();
            setDirtyUI(false);

            setMsg("Saved ✅");
            setTimeout(() => setMsg(""), 1200);
        }catch(e){
            setMsg(e?.message || "Save failed");
            setDirtyUI(true);
        }
    };

    // Upload
    uploadBtn.onclick = () => avatarInput.click();
    avatarInput.onchange = async () => {
        const file = avatarInput.files?.[0];
        if (!file) return;

        try{
            uploadBtn.disabled = true;
            deleteBtn.disabled = true;
            setMsg("Uploading...");

            await apiUploadAvatar(file);

            // refresh
            const fresh = await apiGetProfile(me.$id);
            current.avatar_url = fresh?.avatar_url || "";

            setAvatar(current.avatar_url, current.name);
            setMsg("Photo updated ✅");
            setTimeout(() => setMsg(""), 1200);
        }catch(e){
            setMsg(e?.message || "Upload failed");
        }finally{
            uploadBtn.disabled = false;
            deleteBtn.disabled = false;
            avatarInput.value = "";
        }
    };

    // Delete photo
    deleteBtn.onclick = async () => {
        try{
            uploadBtn.disabled = true;
            deleteBtn.disabled = true;
            setMsg("Deleting...");

            await apiSaveProfile({
                name: current.name,
                bio: (bioInput.value || "").trim(),
                website: safeUrl(link1Input.value || ""),
                x: safeUrl(link2Input.value || ""),
                avatar_url: "", // clear
            });

            const fresh = await apiGetProfile(me.$id);
            current.avatar_url = fresh?.avatar_url || "";

            setAvatar("", current.name);
            setMsg("Deleted ✅");
            setTimeout(() => setMsg(""), 1200);
        }catch(e){
            setMsg(e?.message || "Delete failed");
        }finally{
            uploadBtn.disabled = false;
            deleteBtn.disabled = false;
        }
    };
}

main().catch((e) => {
    console.error(e);
    setMsg("Page error.");
});
