// /profile/profile.js
import { account } from "/assets/appwrite.js";

console.log("✅ profile.js (FAST cache-first)");

// Netlify functions
const FN_ENSURE = "/.netlify/functions/ensure_profile";
const FN_GET    = "/.netlify/functions/get_profile";
const FN_UPSERT = "/.netlify/functions/upsert_profile";
const FN_UPLOAD = "/.netlify/functions/upload_avatar";
const FN_DELETE = "/.netlify/functions/delete_avatar";

const $ = (id) => document.getElementById(id);

// elements (guardlı)
const pName = $("pName");
const pMsg  = $("pMsg");

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

// initial snapshot (dirty check için)
let initial = { bio: "", link1: "", link2: "", avatar_url: "" };

// ---------- UI helpers ----------
function setMsg(t) {
    if (pMsg) pMsg.textContent = t || "";
}

function setAvatar(url) {
    if (!pAvatarImg || !pAvatarTxt) return;

    if (url) {
        pAvatarImg.src = url;
        pAvatarImg.style.display = "block";
        pAvatarTxt.style.display = "none";
    } else {
        pAvatarImg.removeAttribute("src");
        pAvatarImg.style.display = "none";
        pAvatarTxt.style.display = "block";
    }
}

function getLink1(profile){
    return profile?.links?.[0]?.url || profile?.website || "";
}

function getLink2(profile){
    return profile?.links?.[1]?.url || profile?.link2 || "";
}

function markInitialFromData(profile) {
    initial.bio = profile?.bio || "";
    initial.link1 = getLink1(profile);
    initial.link2 = getLink2(profile);
    initial.avatar_url = profile?.avatar_url || "";
}

function setFormFromData(profile) {
    if (pName) pName.textContent = profile?.name || "User";
    if (bioInput) bioInput.value = profile?.bio || "";
    if (link1Input) link1Input.value = getLink1(profile);
    if (link2Input) link2Input.value = getLink2(profile);
    setAvatar(profile?.avatar_url || "");
}

function isDirty() {
    const bio  = (bioInput?.value || "");
    const l1   = (link1Input?.value || "");
    const l2   = (link2Input?.value || "");

    return (
        bio !== (initial.bio || "") ||
        l1  !== (initial.link1 || "") ||
        l2  !== (initial.link2 || "") ||
        // avatar da değişiklik say
        (initial.avatar_url || "") !== (readCachedProfile()?.profile?.avatar_url || initial.avatar_url || "")
    );
}

function updateButtons() {
    const dirty = isDirty();
    if (saveBtn) saveBtn.disabled = !dirty;
    if (cancelBtn) cancelBtn.disabled = !dirty;
}

// ---------- cache ----------
function cacheKey() {
    return uid ? `sm_profile_cache:${uid}` : null;
}

function readCachedProfile() {
    try {
        const k = cacheKey();
        if (!k) return null;
        const raw = localStorage.getItem(k);
        if (!raw) return null;
        const obj = JSON.parse(raw);
        return obj?.profile ? obj : null;
    } catch {
        return null;
    }
}

function writeCachedProfile(payload) {
    try {
        const k = cacheKey();
        if (!k) return;
        localStorage.setItem(k, JSON.stringify(payload));
    } catch {}
}

// ---------- file helper ----------
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
        fr.onerror = reject;
        fr.readAsDataURL(file);
    });
}

// ---------- JWT headers (memory cached) ----------
let _jwtCache = { jwt: null, ts: 0 };
const JWT_TTL_MS = 60_000;

async function getJwtHeaders() {
    const now = Date.now();
    if (_jwtCache.jwt && (now - _jwtCache.ts) < JWT_TTL_MS) {
        const jwt = _jwtCache.jwt;
        return {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${jwt}`,
            "X-Appwrite-JWT": jwt,
            "x-jwt": jwt,
        };
    }

    const jwtObj = await account.createJWT();
    const jwt = jwtObj?.jwt;
    if (!jwt) throw new Error("Missing JWT");

    _jwtCache = { jwt, ts: now };

    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${jwt}`,
        "X-Appwrite-JWT": jwt,
        "x-jwt": jwt,
    };
}

// ---------- API ----------
async function ensureProfile() {
    try {
        const headers = await getJwtHeaders();
        const res = await fetch(FN_ENSURE, {
            method: "POST",
            headers,
            body: JSON.stringify({ ok: true }),
        });
        if (!res.ok) {
            const out = await res.json().catch(() => ({}));
            console.warn("ensure_profile failed:", res.status, out);
        }
    } catch (e) {
        console.warn("ensure_profile error:", e);
    }
}

async function loadProfile({ fresh = false } = {}) {
    const url = `${FN_GET}?id=${encodeURIComponent(uid)}`;
    const r = await fetch(url, { cache: fresh ? "no-store" : "default" });
    if (!r.ok) {
        const out = await r.json().catch(() => ({}));
        throw new Error(out?.error || `get_profile failed (${r.status})`);
    }
    return r.json(); // expected: { profile: {...} }
}

// ✅ link2 dahil: backend destekliyorsa kaydeder
async function saveProfile() {
    const headers = await getJwtHeaders();

    const body = {
        bio: (bioInput?.value || ""),
        website: (link1Input?.value || ""),
        link2: (link2Input?.value || ""), // ⚠️ upsert_profile bunu kabul etmeli
    };

    const res = await fetch(FN_UPSERT, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });

    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out?.error || `Save failed (${res.status})`);

    // initial güncelle
    initial.bio = body.bio;
    initial.link1 = body.website;
    initial.link2 = body.link2;

    // cache’i de güncelle (links array mantığıyla)
    const cached = readCachedProfile();
    const prev = cached?.profile || {};

    const nextProfile = {
        ...prev,
        bio: body.bio,
        website: body.website,
        link2: body.link2,
        links: [
            { url: body.website || "" },
            { url: body.link2 || "" },
        ],
    };

    writeCachedProfile({ profile: nextProfile });
    updateButtons();

    return out;
}

async function uploadAvatar(file) {
    const headers = await getJwtHeaders();
    const b64 = await fileToBase64(file);

    const res = await fetch(FN_UPLOAD, {
        method: "POST",
        headers,
        body: JSON.stringify({
            appwrite_user_id: uid,
            file_base64: b64,
            content_type: file.type || "image/png",
        }),
    });

    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out?.error || `Upload failed (${res.status})`);

    const url = out?.avatar_url || "";

    const cached = readCachedProfile();
    const prev = cached?.profile || {};
    const nextProfile = { ...prev, avatar_url: url };
    writeCachedProfile({ profile: nextProfile });

    return url;
}

async function deleteAvatar() {
    const headers = await getJwtHeaders();
    const res = await fetch(FN_DELETE, {
        method: "POST",
        headers,
        body: JSON.stringify({ appwrite_user_id: uid }),
    });

    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out?.error || `Delete failed (${res.status})`);

    const cached = readCachedProfile();
    const prev = cached?.profile || {};
    const nextProfile = { ...prev, avatar_url: "" };
    writeCachedProfile({ profile: nextProfile });

    return true;
}

// ===== BOOT =====
(async function boot() {
    let user;
    try {
        user = await account.get();
    } catch {
        location.href = "/auth/login.html";
        return;
    }

    uid = user.$id;
    localStorage.setItem("sm_uid", uid);

    const fallbackName =
        user?.name ||
        (user?.email ? user.email.split("@")[0] : "") ||
        "User";

    if (pName) pName.textContent = fallbackName;
    setMsg("");

    // ✅ 1) CACHE-FIRST (instant paint)
    const cached = readCachedProfile();
    if (cached?.profile) {
        markInitialFromData(cached.profile);
        setFormFromData({ ...cached.profile, name: cached.profile.name || fallbackName });
        updateButtons();
    } else {
        markInitialFromData({});
        setFormFromData({ name: fallbackName });
        updateButtons();
    }

    // ✅ 2) ensureProfile background
    ensureProfile();

    // ✅ 3) fresh fetch
    try {
        const data = await loadProfile({ fresh: true });
        writeCachedProfile(data);

        markInitialFromData(data?.profile);
        setFormFromData(data?.profile || { name: fallbackName });
        updateButtons();
    } catch (e) {
        console.warn("loadProfile fresh failed:", e);
    }

    // input -> buttons
    [bioInput, link1Input, link2Input].filter(Boolean).forEach((el) => {
        el.addEventListener("input", updateButtons);
    });

    // cancel
    if (cancelBtn) {
        cancelBtn.onclick = async () => {
            try {
                setMsg("Reverting...");
                const data = await loadProfile({ fresh: true });
                writeCachedProfile(data);

                markInitialFromData(data?.profile);
                setFormFromData(data?.profile);
                updateButtons();
                setMsg("");
            } catch {
                if (bioInput) bioInput.value = initial.bio || "";
                if (link1Input) link1Input.value = initial.link1 || "";
                if (link2Input) link2Input.value = initial.link2 || "";
                updateButtons();
                setMsg("");
            }
        };
    }

    // save
    if (saveBtn) {
        saveBtn.onclick = async () => {
            try {
                setMsg("Saving...");
                await saveProfile();
                setMsg("Saved");
                setTimeout(() => setMsg(""), 1200);
            } catch (e) {
                console.error(e);
                setMsg(e?.message || String(e));
            }
        };
    }

    // upload
    if (uploadBtn && avatarInput) {
        uploadBtn.onclick = () => avatarInput.click();

        avatarInput.onchange = async () => {
            const file = avatarInput.files?.[0];
            if (!file) return;

            try {
                setMsg("Uploading...");
                const url = await uploadAvatar(file);
                setAvatar(url);
                initial.avatar_url = url || "";
                updateButtons();
                setMsg("Uploaded");
                setTimeout(() => setMsg(""), 1200);
            } catch (e) {
                console.error(e);
                setMsg(e?.message || String(e));
            } finally {
                avatarInput.value = "";
            }
        };
    }

    // delete
    if (deleteBtn) {
        deleteBtn.onclick = async () => {
            try {
                setMsg("Deleting...");
                await deleteAvatar();
                setAvatar("");
                initial.avatar_url = "";
                updateButtons();
                setMsg("Deleted");
                setTimeout(() => setMsg(""), 1200);
            } catch (e) {
                console.error(e);
                setMsg(e?.message || String(e));
            }
        };
    }
})();
