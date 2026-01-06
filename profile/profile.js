// /profile/profile.js (FINAL - sm-api ONLY, NO Netlify)
import { account } from "/assets/appwrite.js";

console.log("✅ profile.js (sm-api)");

// sm-api base (aynı domain reverse-proxy ise "/api" de olur)
const API_BASE = "https://api.chriontoken.com";
const API_ME = `${API_BASE}/api/profile/me`;
const API_SAVE = `${API_BASE}/api/profile/me`;
const API_AVA_UPLOAD = `${API_BASE}/api/upload/avatar`;
const API_AVA_DELETE = `${API_BASE}/api/profile/me/avatar/delete`;

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

let uid = null;
let busy = false;

// initial snapshot (dirty check)
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

function markInitialFromData(profile) {
    initial.bio = profile?.bio || "";
    initial.link1 = profile?.website || "";
    initial.link2 = profile?.link2 || "";
    initial.avatar_url = profile?.avatar_url || "";
}

function setFormFromData(profile, fallbackName = "User") {
    if (pName) pName.textContent = profile?.name || fallbackName;
    if (bioInput) bioInput.value = profile?.bio || "";
    if (link1Input) link1Input.value = profile?.website || "";
    if (link2Input) link2Input.value = profile?.link2 || "";
    setAvatar(profile?.avatar_url || "");
}

function isDirty() {
    const bio = (bioInput?.value || "");
    const l1 = (link1Input?.value || "");
    const l2 = (link2Input?.value || "");
    const ava = (pAvatarImg?.getAttribute("src") || "").trim();

    return (
        bio !== (initial.bio || "") ||
        l1 !== (initial.link1 || "") ||
        l2 !== (initial.link2 || "") ||
        (ava || "") !== (initial.avatar_url || "")
    );
}

function updateButtons() {
    const dirty = isDirty();
    if (saveBtn) saveBtn.disabled = !dirty || busy;
    if (cancelBtn) cancelBtn.disabled = !dirty || busy;
    if (uploadBtn) uploadBtn.disabled = busy;
    if (deleteBtn) deleteBtn.disabled = busy;
}

function setBusy(b) {
    busy = !!b;
    updateButtons();
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

// ---------- JWT headers ----------
let _jwtCache = { jwt: null, ts: 0 };
const JWT_TTL_MS = 60_000;

async function getJwt() {
    const now = Date.now();
    if (_jwtCache.jwt && (now - _jwtCache.ts) < JWT_TTL_MS) return _jwtCache.jwt;

    // if you already store it (jwt.js), use it
    const cached = (window.SM_JWT || localStorage.getItem("sm_jwt") || "").trim();
    if (cached) {
        _jwtCache = { jwt: cached, ts: now };
        return cached;
    }

    const jwtObj = await account.createJWT();
    const jwt = jwtObj?.jwt;
    if (!jwt) throw new Error("Missing JWT");
    localStorage.setItem("sm_jwt", jwt);

    _jwtCache = { jwt, ts: now };
    return jwt;
}

async function apiJson(url, { method = "GET", body } = {}) {
    const jwt = await getJwt();

    const r = await fetch(url, {
        method,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
    });

    const out = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(out?.error || `${method} ${url} failed (${r.status})`);
    return out;
}

// ---------- API ----------
async function loadMeProfile() {
    // expected: { ok:true, profile:{...} }
    const out = await apiJson(API_ME);
    return out?.profile || out;
}

async function saveProfile() {
    const body = {
        bio: (bioInput?.value || "").trim(),
        website: (link1Input?.value || "").trim(),
        link2: (link2Input?.value || "").trim(),
    };

    const out = await apiJson(API_SAVE, { method: "POST", body });

    // update initial snapshot
    initial.bio = body.bio;
    initial.link1 = body.website;
    initial.link2 = body.link2;

    // cache update
    const cached = readCachedProfile();
    const prev = cached?.profile || {};
    const nextProfile = { ...prev, ...body };
    writeCachedProfile({ profile: nextProfile });

    return out;
}

async function uploadAvatar(file) {
    const jwt = await getJwt();

    const fd = new FormData();
    fd.append("file", file);

    const r = await fetch(API_AVA_UPLOAD, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
        body: fd,
    });

    const out = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(out?.error || `Upload failed (${r.status})`);

    const url = String(out?.avatar_url || "").trim();
    if (!url) throw new Error("avatar_url missing from server response");

    // cache update
    const cached = readCachedProfile();
    const prev = cached?.profile || {};
    writeCachedProfile({ profile: { ...prev, avatar_url: url } });

    return url;
}

async function deleteAvatar() {
    await apiJson(API_AVA_DELETE, { method: "POST", body: {} });

    const cached = readCachedProfile();
    const prev = cached?.profile || {};
    writeCachedProfile({ profile: { ...prev, avatar_url: "" } });

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
        user?.name || (user?.email ? user.email.split("@")[0] : "") || "User";

    if (pName) pName.textContent = fallbackName;
    setMsg("");
    updateButtons();

    // 1) CACHE-FIRST
    const cached = readCachedProfile();
    if (cached?.profile) {
        markInitialFromData(cached.profile);
        setFormFromData({ ...cached.profile, name: cached.profile.name || fallbackName }, fallbackName);
        updateButtons();
    } else {
        markInitialFromData({});
        setFormFromData({ name: fallbackName }, fallbackName);
        updateButtons();
    }

    // 2) fresh fetch
    try {
        const prof = await loadMeProfile();
        writeCachedProfile({ profile: prof });

        markInitialFromData(prof);
        setFormFromData({ ...prof, name: prof?.name || fallbackName }, fallbackName);
        updateButtons();
    } catch (e) {
        console.warn("load profile failed:", e);
    }

    // input -> buttons
    [bioInput, link1Input, link2Input].filter(Boolean).forEach((el) => {
        el.addEventListener("input", updateButtons);
    });

    // cancel
    cancelBtn?.addEventListener("click", async () => {
        try {
            setBusy(true);
            setMsg("Reverting...");
            const prof = await loadMeProfile();
            writeCachedProfile({ profile: prof });
            markInitialFromData(prof);
            setFormFromData(prof, fallbackName);
            setMsg("");
        } catch (e) {
            // fallback: local initial
            if (bioInput) bioInput.value = initial.bio || "";
            if (link1Input) link1Input.value = initial.link1 || "";
            if (link2Input) link2Input.value = initial.link2 || "";
            setAvatar(initial.avatar_url || "");
            setMsg("");
        } finally {
            setBusy(false);
        }
    });

    // save
    saveBtn?.addEventListener("click", async () => {
        try {
            setBusy(true);
            setMsg("Saving...");
            await saveProfile();
            setMsg("Saved");
            setTimeout(() => setMsg(""), 900);
        } catch (e) {
            console.error(e);
            setMsg(e?.message || String(e));
        } finally {
            setBusy(false);
        }
    });

    // upload
    if (uploadBtn && avatarInput) {
        uploadBtn.addEventListener("click", () => avatarInput.click());

        avatarInput.addEventListener("change", async () => {
            const file = avatarInput.files?.[0];
            if (!file) return;

            try {
                setBusy(true);
                setMsg("Uploading...");
                const url = await uploadAvatar(file);
                setAvatar(url);
                initial.avatar_url = url || "";
                setMsg("Uploaded");
                setTimeout(() => setMsg(""), 900);
            } catch (e) {
                console.error(e);
                setMsg(e?.message || String(e));
            } finally {
                avatarInput.value = "";
                setBusy(false);
            }
        });
    }

    // delete
    deleteBtn?.addEventListener("click", async () => {
        try {
            setBusy(true);
            setMsg("Deleting...");
            await deleteAvatar();
            setAvatar("");
            initial.avatar_url = "";
            setMsg("Deleted");
            setTimeout(() => setMsg(""), 900);
        } catch (e) {
            console.error(e);
            setMsg(e?.message || String(e));
        } finally {
            setBusy(false);
        }
    });
})();
