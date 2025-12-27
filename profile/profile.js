// /profile/profile.js
import { account } from "/assets/appwrite.js";

console.log("✅ profile.js (FULL working)");

const FN_ENSURE = "/.netlify/functions/ensure_profile";
const FN_GET = "/.netlify/functions/get_profile";
const FN_UPSERT = "/.netlify/functions/upsert_profile";
const FN_UPLOAD = "/.netlify/functions/upload_avatar";
const FN_DELETE = "/.netlify/functions/delete_avatar";

const $ = (id) => document.getElementById(id);

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

let uid = null;
let initial = { bio: "", link1: "", link2: "", avatar_url: "" };

function setMsg(t) { pMsg.textContent = t || ""; }

function fileToBase64(file){
    return new Promise((resolve, reject)=>{
        const fr = new FileReader();
        fr.onload = ()=> resolve(String(fr.result).split(",")[1] || "");
        fr.onerror = reject;
        fr.readAsDataURL(file);
    });
}

async function getJwtHeaders(){
    const jwtObj = await account.createJWT();
    const jwt = jwtObj?.jwt;
    if (!jwt) throw new Error("Missing JWT");

    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${jwt}`,
        "X-Appwrite-JWT": jwt,
        "x-jwt": jwt
    };
}

function setAvatar(url){
    if (url){
        pAvatarImg.src = url;
        pAvatarImg.style.display = "block";
        pAvatarTxt.style.display = "none";
    } else {
        pAvatarImg.removeAttribute("src");
        pAvatarImg.style.display = "none";
        pAvatarTxt.style.display = "block";
    }
}

function markInitialFromData(profile){
    initial.bio = profile?.bio || "";
    initial.link1 = profile?.links?.[0]?.url || profile?.website || "";
    initial.link2 = profile?.links?.[1]?.url || "";
    initial.avatar_url = profile?.avatar_url || "";
}

function setFormFromData(profile){
    pName.textContent = profile?.name || "User";
    bioInput.value = profile?.bio || "";
    link1Input.value = profile?.links?.[0]?.url || profile?.website || "";
    link2Input.value = profile?.links?.[1]?.url || "";
    setAvatar(profile?.avatar_url || "");
}

function isDirty(){
    return (
        (bioInput.value || "") !== (initial.bio || "") ||
        (link1Input.value || "") !== (initial.link1 || "") ||
        (link2Input.value || "") !== (initial.link2 || "")
    );
}

function updateButtons(){
    saveBtn.disabled = !isDirty();
    cancelBtn.disabled = !isDirty();
}

async function ensureProfile(){
    const headers = await getJwtHeaders();
    const res = await fetch(FN_ENSURE, { method:"POST", headers, body: JSON.stringify({ ok:true }) });
    // ensure fail bile olsa devam edelim (ama loglayalım)
    if (!res.ok){
        const out = await res.json().catch(()=> ({}));
        console.warn("ensure_profile failed:", res.status, out);
    }
}

async function loadProfile(){
    const r = await fetch(`${FN_GET}?id=${encodeURIComponent(uid)}`, { cache:"no-store" });
    if (!r.ok){
        const out = await r.json().catch(()=> ({}));
        throw new Error(out?.error || `get_profile failed (${r.status})`);
    }
    return r.json();
}

async function saveProfile(){
    const headers = await getJwtHeaders();

    // senin DB tasarımında website tek alan, link2’yi şimdilik ignore ediyoruz
    const body = {
        bio: bioInput.value || "",
        website: link1Input.value || ""
    };

    const res = await fetch(FN_UPSERT, { method:"POST", headers, body: JSON.stringify(body) });
    const out = await res.json().catch(()=> ({}));
    if (!res.ok) throw new Error(out?.error || `Save failed (${res.status})`);

    // saved -> initial güncelle
    initial.bio = body.bio;
    initial.link1 = body.website;
    initial.link2 = link2Input.value || "";
    updateButtons();
    return out;
}

async function uploadAvatar(file){
    const headers = await getJwtHeaders();
    const b64 = await fileToBase64(file);

    const res = await fetch(FN_UPLOAD, {
        method:"POST",
        headers,
        body: JSON.stringify({
            appwrite_user_id: uid,
            file_base64: b64,
            content_type: file.type || "image/png"
        })
    });

    const out = await res.json().catch(()=> ({}));
    if (!res.ok) throw new Error(out?.error || `Upload failed (${res.status})`);
    return out?.avatar_url;
}

async function deleteAvatar(){
    const headers = await getJwtHeaders();
    const res = await fetch(FN_DELETE, {
        method:"POST",
        headers,
        body: JSON.stringify({ appwrite_user_id: uid })
    });
    const out = await res.json().catch(()=> ({}));
    if (!res.ok) throw new Error(out?.error || `Delete failed (${res.status})`);
    return true;
}

// ===== BOOT =====
(async function boot(){
    let user;
    try {
        user = await account.get();
    } catch {
        location.href = "/auth/login.html";
        return;
    }

    uid = user.$id;
    localStorage.setItem("sm_uid", uid);

    // name göster
    const fallbackName = user?.name || (user?.email ? user.email.split("@")[0] : "") || "User";
    pName.textContent = fallbackName;

    setMsg("");

    // ✅ profil row garanti
    await ensureProfile();

    // ✅ yükle
    try{
        const data = await loadProfile();
        markInitialFromData(data?.profile);
        setFormFromData(data?.profile);
        updateButtons();
    }catch(e){
        console.warn(e);
        // boş ama çalışır kalsın
        markInitialFromData({});
        setFormFromData({ name: fallbackName });
        updateButtons();
    }

    // input değişince butonlar
    [bioInput, link1Input, link2Input].forEach(el => {
        el.addEventListener("input", updateButtons);
    });

    // cancel: initial geri yükle
    cancelBtn.onclick = async ()=>{
        try{
            setMsg("Reverting...");
            const data = await loadProfile();
            markInitialFromData(data?.profile);
            setFormFromData(data?.profile);
            updateButtons();
            setMsg("");
        }catch{
            // fallback: initial state
            bioInput.value = initial.bio || "";
            link1Input.value = initial.link1 || "";
            link2Input.value = initial.link2 || "";
            updateButtons();
            setMsg("");
        }
    };

    // save
    saveBtn.onclick = async ()=>{
        try{
            setMsg("Saving...");
            await saveProfile();
            setMsg("✅ Saved");
            setTimeout(()=> setMsg(""), 1200);
        }catch(e){
            console.error(e);
            setMsg("❌ " + (e?.message || e));
        }
    };

    // upload
    uploadBtn.onclick = ()=> avatarInput.click();
    avatarInput.onchange = async ()=>{
        const file = avatarInput.files?.[0];
        if (!file) return;
        try{
            setMsg("Uploading...");
            const url = await uploadAvatar(file);
            setAvatar(url);
            initial.avatar_url = url || "";
            setMsg("✅ Uploaded");
            setTimeout(()=> setMsg(""), 1200);
        }catch(e){
            console.error(e);
            setMsg("❌ " + (e?.message || e));
        }finally{
            avatarInput.value = "";
        }
    };

    // delete
    deleteBtn.onclick = async ()=>{
        try{
            setMsg("Deleting...");
            await deleteAvatar();
            setAvatar("");
            initial.avatar_url = "";
            setMsg("✅ Deleted");
            setTimeout(()=> setMsg(""), 1200);
        }catch(e){
            console.error(e);
            setMsg("❌ " + (e?.message || e));
        }
    };
})();
