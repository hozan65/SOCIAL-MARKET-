// /profile/profile.js
import { account } from "/assets/appwrite.js";

console.log("✅ profile.js (jwt fixed)");

// endpoints
const FN_ENSURE = "/.netlify/functions/ensure_profile";
const FN_UPLOAD = "/.netlify/functions/upload_avatar";
const FN_DELETE = "/.netlify/functions/delete_avatar";
const FN_UPSERT = "/.netlify/functions/upsert_profile";
const FN_GET = "/.netlify/functions/get_profile";

const $ = (id) => document.getElementById(id);

const avatarImg = $("pAvatarImg");
const avatarTxt = $("pAvatarTxt");
const bioInput = $("bioInput");
const linkInput = $("link1Input");
const avatarInput = $("avatarInput");

const uploadBtn = $("uploadBtn");
const deleteBtn = $("deleteBtn");
const saveBtn = $("saveBtn");
const msg = $("pMsg");

function setMsg(t){ msg.textContent = t || ""; }

function fileToBase64(file){
    return new Promise((resolve, reject)=>{
        const fr = new FileReader();
        fr.onload = ()=> resolve(String(fr.result).split(",")[1] || "");
        fr.onerror = reject;
        fr.readAsDataURL(file);
    });
}

async function getJwtHeaders(){
    // ✅ login kontrol
    const jwtObj = await account.createJWT();
    const jwt = jwtObj?.jwt;
    if (!jwt) throw new Error("JWT could not be created");

    // ✅ bazı helper'lar Authorization, bazıları X-Appwrite-JWT bekler.
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${jwt}`,
        "X-Appwrite-JWT": jwt,
        "x-jwt": jwt
    };
}

(async function boot(){
    let user;
    try{
        user = await account.get();
    }catch{
        location.href = "/auth/login.html";
        return;
    }

    const uid = user.$id;

    // ✅ headers (jwt)
    let headers;
    try{
        headers = await getJwtHeaders();
    }catch(e){
        console.error(e);
        setMsg("JWT error (login again)");
        location.href = "/auth/login.html";
        return;
    }

    // ✅ ensure profile row
    await fetch(FN_ENSURE, {
        method:"POST",
        headers,
        body: JSON.stringify({ appwrite_user_id: uid, name: user.name || "" })
    });

    // ✅ load existing profile (public get_profile)
    const r = await fetch(`${FN_GET}?id=${encodeURIComponent(uid)}`, { cache: "no-store" });
    if (r.ok){
        const j = await r.json();
        bioInput.value = j?.profile?.bio || "";
        linkInput.value = j?.profile?.links?.[0]?.url || "";

        const av = j?.profile?.avatar_url;
        if (av){
            avatarImg.src = av;
            avatarImg.style.display = "block";
            avatarTxt.style.display = "none";
        }
    }

    // ✅ upload
    uploadBtn.onclick = ()=> avatarInput.click();

    avatarInput.onchange = async ()=>{
        const file = avatarInput.files?.[0];
        if (!file) return;

        setMsg("Uploading...");
        const b64 = await fileToBase64(file);

        const res = await fetch(FN_UPLOAD,{
            method:"POST",
            headers,
            body: JSON.stringify({
                appwrite_user_id: uid,
                file_base64: b64,
                content_type: file.type || "image/png"
            })
        });

        const out = await res.json().catch(()=> ({}));
        if (!res.ok){
            setMsg(out?.error || "Upload failed");
            return;
        }

        avatarImg.src = out.avatar_url;
        avatarImg.style.display = "block";
        avatarTxt.style.display = "none";
        setMsg("✅ Uploaded");
    };

    // ✅ delete
    deleteBtn.onclick = async ()=>{
        setMsg("Deleting...");

        const res = await fetch(FN_DELETE,{
            method:"POST",
            headers,
            body: JSON.stringify({ appwrite_user_id: uid })
        });

        const out = await res.json().catch(()=> ({}));
        if (!res.ok){
            setMsg(out?.error || "Delete failed");
            return;
        }

        avatarImg.removeAttribute("src");
        avatarImg.style.display = "none";
        avatarTxt.style.display = "block";
        setMsg("✅ Deleted");
    };

    // ✅ save (bio + website)
    saveBtn.onclick = async ()=>{
        setMsg("Saving...");

        const res = await fetch(FN_UPSERT,{
            method:"POST",
            headers,
            body: JSON.stringify({
                appwrite_user_id: uid,
                name: user.name || "",
                bio: bioInput.value || "",
                website: linkInput.value || ""
            })
        });

        const out = await res.json().catch(()=> ({}));
        setMsg(res.ok ? "✅ Saved" : (out?.error || "Save failed"));
    };
})();
