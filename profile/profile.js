// /profile/profile.js
import { account } from "/assets/appwrite.js";

console.log("✅ profile.js (clean + working)");

const FN_GET = "/.netlify/functions/get_profile";
const FN_UPSERT = "/.netlify/functions/upsert_profile";
const FN_ENSURE = "/.netlify/functions/ensure_profile";
const FN_UPLOAD = "/.netlify/functions/upload_avatar";
const FN_DELETE = "/.netlify/functions/delete_avatar";

const $ = (id) => document.getElementById(id);

const avatarImg = $("pAvatarImg");
const avatarTxt = $("pAvatarTxt");
const bioInput = $("bioInput");
const linkInput = $("link1Input");

const uploadBtn = $("uploadBtn");
const deleteBtn = $("deleteBtn");
const avatarInput = $("avatarInput");
const saveBtn = $("saveBtn");
const msg = $("pMsg");

function setMsg(t){ msg.textContent = t || ""; }

function toBase64(file){
    return new Promise(res=>{
        const r = new FileReader();
        r.onload = ()=>res(r.result.split(",")[1]);
        r.readAsDataURL(file);
    });
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

    // ✅ ensure profile
    await fetch(FN_ENSURE,{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ appwrite_user_id: uid, name: user.name })
    });

    // load
    const r = await fetch(`${FN_GET}?id=${uid}`);
    if (r.ok){
        const d = await r.json();
        bioInput.value = d.profile.bio || "";
        linkInput.value = d.profile.links?.[0]?.url || "";

        if (d.profile.avatar_url){
            avatarImg.src = d.profile.avatar_url;
            avatarImg.style.display = "block";
            avatarTxt.style.display = "none";
        }
    }

    // upload
    uploadBtn.onclick = ()=> avatarInput.click();

    avatarInput.onchange = async ()=>{
        const file = avatarInput.files[0];
        if (!file) return;

        setMsg("Uploading...");
        const b64 = await toBase64(file);

        const r = await fetch(FN_UPLOAD,{
            method:"POST",
            headers:{ "Content-Type":"application/json" },
            body: JSON.stringify({
                appwrite_user_id: uid,
                file_base64: b64,
                content_type: file.type
            })
        });

        const j = await r.json();
        if (r.ok){
            avatarImg.src = j.avatar_url;
            avatarImg.style.display = "block";
            avatarTxt.style.display = "none";
            setMsg("✅ Uploaded");
        }else{
            setMsg(j.error || "Upload failed");
        }
    };

    // delete
    deleteBtn.onclick = async ()=>{
        setMsg("Deleting...");
        const r = await fetch(FN_DELETE,{
            method:"POST",
            headers:{ "Content-Type":"application/json" },
            body: JSON.stringify({ appwrite_user_id: uid })
        });
        if (r.ok){
            avatarImg.style.display = "none";
            avatarTxt.style.display = "block";
            setMsg("✅ Deleted");
        }else{
            setMsg("Delete failed");
        }
    };

    // save
    saveBtn.onclick = async ()=>{
        setMsg("Saving...");
        const r = await fetch(FN_UPSERT,{
            method:"POST",
            headers:{ "Content-Type":"application/json" },
            body: JSON.stringify({
                appwrite_user_id: uid,
                name: user.name,
                bio: bioInput.value,
                website: linkInput.value
            })
        });
        setMsg(r.ok ? "✅ Saved" : "Save failed");
    };
})();
