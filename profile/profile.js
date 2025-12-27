// /profile/profile.js
import { account } from "/assets/appwrite.js";

console.log("✅ profile.js loaded");

const FN_UPSERT = "/.netlify/functions/upsert_profile";
const FN_GET = "/.netlify/functions/get_profile"; // public

const $ = (id) => document.getElementById(id);

const pMsg = $("pMsg");
const pAvatarImg = $("pAvatarImg");
const pAvatarTxt = $("pAvatarTxt");
const pName = $("pName");

const bioInput = $("bioInput");
const link1Input = $("link1Input"); // biz bunu "website" gibi kullanacağız
const link2Input = $("link2Input"); // bunu istersen boş bırak (istersen sonra 2. alan ekleriz)

const saveBtn = $("saveBtn");

function setMsg(t){ pMsg.textContent = t || ""; }
function esc(s){
    return String(s ?? "")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
}

(async function boot(){
    try{
        const user = await account.get(); // ✅ login şart
        const uid = user.$id;

        pName.textContent = user.name || "User";
        pAvatarTxt.textContent = (user.name || "SM").slice(0,2).toUpperCase();

        // ✅ profil verisini çek (public function)
        const r = await fetch(`${FN_GET}?id=${encodeURIComponent(uid)}`, { cache: "no-store" });
        const j = await r.json().catch(()=> ({}));

        if (r.ok && j?.profile){
            const p = j.profile;
            bioInput.value = p.bio || "";

            // get_profile website'i links[] içinde döndürüyor
            const first = (p.links && p.links[0] && p.links[0].url) ? p.links[0].url : "";
            link1Input.value = first;
            link2Input.value = ""; // şimdilik kullanılmıyor

            if (p.avatar_url){
                pAvatarImg.src = p.avatar_url;
                pAvatarImg.style.display = "block";
                pAvatarTxt.style.display = "none";
            }
        }

        saveBtn.disabled = false;

        saveBtn.onclick = async () => {
            saveBtn.disabled = true;
            setMsg("Saving...");

            const website = (link1Input.value || "").trim();

            const res = await fetch(FN_UPSERT, {
                method:"POST",
                headers:{ "Content-Type":"application/json" },
                body: JSON.stringify({
                    appwrite_user_id: uid,
                    name: user.name || "",
                    bio: bioInput.value || "",
                    website,
                    // avatar upload varsa ayrıca bağlarız
                })
            });

            const out = await res.json().catch(()=> ({}));
            saveBtn.disabled = false;

            if (!res.ok){
                setMsg(out?.error || "Save failed");
                return;
            }
            setMsg("✅ Saved");
        };

    } catch (e){
        console.warn("profile settings needs login", e);
        location.href = "/auth/login.html";
    }
})();
