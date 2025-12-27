// /profile/profile.js (MODULE) ✅ FULL (Upload + Delete + Save + Cancel)
// Uses:
//  - /.netlify/functions/get_profile?uid=...
//  - /.netlify/functions/upsert_profile
//  - /.netlify/functions/upload_avatar
import { account } from "/assets/appwrite.js";

const FN_GET_PROFILE = "/.netlify/functions/get_profile";
const FN_UPSERT_PROFILE = "/.netlify/functions/upsert_profile";
const FN_UPLOAD_AVATAR = "/.netlify/functions/upload_avatar";

/* =========================
   DOM
========================= */
const $ = (id) => document.getElementById(id);

const avatarImg = $("pAvatarImg");
const avatarTxt = $("pAvatarTxt");
const avatarInput = $("avatarInput");

const uploadBtn = $("uploadBtn");
const deleteBtn = $("deleteBtn");

const pName = $("pName");
const bioInput = $("bioInput");
const link1Input = $("link1Input"); // only website for now

const cancelBtn = $("cancelBtn");
const saveBtn = $("saveBtn");
const pMsg = $("pMsg");

/* =========================
   Helpers
========================= */
function setMsg(t) { if (pMsg) pMsg.textContent = t || ""; }

function initials(name) {
    const s = String(name || "").trim();
    if (!s) return "SM";
    return s
        .split(/\s+/)
        .slice(0, 2)
        .map((x) => (x[0] || "").toUpperCase())
        .join("") || "SM";
}

function safeUrl(v) {
    const s = String(v || "").trim();
    if (!s) return "";
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
    return "https://" + s;
}

function setAvatar(url, displayName) {
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

function getJWT() {
    const jwt = window.SM_JWT || localStorage.getItem("sm_jwt") || "";
    if (!jwt) throw new Error("Missing sm_jwt (login required)");
    return jwt;
}

async function getMe() {
    try { return await account.get(); } catch { return null; }
}

/* =========================
   API
========================= */
async function apiGetProfile(uid) {
    const jwt = getJWT();
    const res = await fetch(`${FN_GET_PROFILE}?uid=${encodeURIComponent(uid)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${jwt}` },
    });

    const text = await res.text();
    let j = {};
    try { j = text ? JSON.parse(text) : {}; } catch { j = { error: text }; }

    if (!res.ok) throw new Error(j?.error || `get_profile ${res.status}`);
    return j.profile || null;
}

async function apiUpsertProfile(payload) {
    const jwt = getJWT();
    const res = await fetch(FN_UPSERT_PROFILE, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify(payload),
    });

    const text = await res.text();
    let j = {};
    try { j = text ? JSON.parse(text) : {}; } catch { j = { error: text }; }

    if (!res.ok) throw new Error(j?.error || `upsert_profile ${res.status}`);
    return j;
}

async function apiUploadAvatar(file) {
    const jwt = getJWT();
    const fd = new FormData();
    fd.append("file", file); // ✅ must be 'file'

    const res = await fetch(FN_UPLOAD_AVATAR, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
        body: fd,
    });

    const text = await res.text();
    let j = {};
    try { j = text ? JSON.parse(text) : {}; } catch { j = { error: text }; }

    if (!res.ok) throw new Error(j?.error || `upload_avatar ${res.status}`);
    return j.avatar_url || "";
}

/* =========================
   State
========================= */
let me = null;
let displayName = "User";

// current DB snapshot (for cancel)
let current = {
    name: "User",
    bio: "",
    website: "",
    avatar_url: "",
};

function readForm() {
    return {
        bio: (bioInput.value || "").trim(),
        website: safeUrl(link1Input.value || "").trim(),
    };
}

function applyForm(state) {
    bioInput.value = state.bio || "";
    link1Input.value = state.website || "";
}

function setDirty(dirty) {
    cancelBtn.disabled = !dirty;
    saveBtn.disabled = !dirty;
}

function computeDirty() {
    const now = readForm();
    return (now.bio !== (current.bio || "")) || (now.website !== (current.website || ""));
}

function bindDirtyListeners() {
    bioInput.addEventListener("input", () => setDirty(computeDirty()));
    link1Input.addEventListener("input", () => setDirty(computeDirty()));
}

/* =========================
   Main
========================= */
async function main() {
    me = await getMe();
    if (!me) {
        location.href = "/auth/login.html";
        return;
    }

    displayName =
        (me?.name && String(me.name).trim()) ||
        (me?.email ? me.email.split("@")[0] : "User");

    pName.textContent = displayName;

    setMsg("Loading...");
    const row = await apiGetProfile(me.$id);

    // load current from DB
    current = {
        name: (row?.name && String(row.name).trim()) || displayName,
        bio: row?.bio || "",
        website: row?.website || "",
        avatar_url: row?.avatar_url || "",
    };

    // render
    pName.textContent = current.name || displayName;
    setAvatar(current.avatar_url, current.name || displayName);
    applyForm(current);

    setDirty(false);
    setMsg("");

    bindDirtyListeners();

    /* ===== Upload photo ===== */
    uploadBtn.onclick = () => avatarInput.click();

    avatarInput.onchange = async () => {
        const file = avatarInput.files?.[0];
        if (!file) return;

        try {
            uploadBtn.disabled = true;
            deleteBtn.disabled = true;
            setMsg("Uploading...");

            if (file.size > 3 * 1024 * 1024) throw new Error("Max 3MB");

            await apiUploadAvatar(file);

            // ✅ refresh from server so reload is consistent
            const fresh = await apiGetProfile(me.$id);
            current.avatar_url = fresh?.avatar_url || "";
            setAvatar(current.avatar_url, current.name || displayName);

            setMsg("Photo updated ✅");
            setTimeout(() => setMsg(""), 1200);
        } catch (e) {
            setMsg(e?.message || "Upload failed");
        } finally {
            uploadBtn.disabled = false;
            deleteBtn.disabled = false;
            avatarInput.value = "";
        }
    };

    /* ===== Delete photo (DB: avatar_url = "") ===== */
    deleteBtn.onclick = async () => {
        try {
            uploadBtn.disabled = true;
            deleteBtn.disabled = true;
            setMsg("Deleting...");

            // ✅ 1) DB'ye avatar_url boş gönder
            const form = readForm();
            await apiUpsertProfile({
                name: current.name || displayName,
                bio: form.bio,
                website: form.website,
                avatar_url: "", // ✅ CRITICAL: clears DB
            });

            // ✅ 2) serverdan tekrar oku (kesinleşsin)
            const fresh = await apiGetProfile(me.$id);

            current = {
                name: (fresh?.name && String(fresh.name).trim()) || (current.name || displayName),
                bio: fresh?.bio || "",
                website: fresh?.website || "",
                avatar_url: fresh?.avatar_url || "", // should be ""
            };

            // ✅ 3) UI temizle
            setAvatar(current.avatar_url, current.name || displayName);

            setMsg("Photo deleted ✅");
            setTimeout(() => setMsg(""), 1200);
        } catch (e) {
            setMsg(e?.message || "Delete failed");
        } finally {
            uploadBtn.disabled = false;
            deleteBtn.disabled = false;
        }
    };

    /* ===== Cancel ===== */
    cancelBtn.onclick = () => {
        applyForm(current);
        setDirty(false);
        setMsg("Canceled.");
        setTimeout(() => setMsg(""), 800);
    };

    /* ===== Save ===== */
    saveBtn.onclick = async () => {
        try {
            saveBtn.disabled = true;
            cancelBtn.disabled = true;
            setMsg("Saving...");

            const form = readForm();

            await apiUpsertProfile({
                name: current.name || displayName,
                bio: form.bio,
                website: form.website,
                // avatar_url göndermiyoruz -> mevcut değer kalsın
            });

            // refresh from server (kalıcı)
            const fresh = await apiGetProfile(me.$id);

            current = {
                name: (fresh?.name && String(fresh.name).trim()) || (current.name || displayName),
                bio: fresh?.bio || "",
                website: fresh?.website || "",
                avatar_url: fresh?.avatar_url || current.avatar_url || "",
            };

            applyForm(current);
            setAvatar(current.avatar_url, current.name || displayName);

            setDirty(false);
            setMsg("Saved ✅");
            setTimeout(() => setMsg(""), 1200);
        } catch (e) {
            setMsg(e?.message || "Save failed");
            setDirty(true);
        } finally {
            // only enable based on dirty again
            setDirty(computeDirty());
            saveBtn.disabled = !computeDirty();
            cancelBtn.disabled = !computeDirty();
        }
    };
}

main().catch((e) => {
    console.error(e);
    setMsg("Profile page error.");
});
