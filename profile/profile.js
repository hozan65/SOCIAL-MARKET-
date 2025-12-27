// /profile/profile.js (MODULE) ✅ AUTO-COLUMN FIX for 400
import { account } from "/assets/appwrite.js";

const SUPABASE_URL = "https://yzrhqduuqvllatliulqv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_dN5E6cw7uaKj7Cmmpo7RJg_W4FWxjs_";

const sb = window.supabase?.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

const PROFILE_TABLE = "profiles";

// UI columns (these exist in your table)
const COL_NAME = "name";
const COL_BIO = "bio";
const COL_WEBSITE = "website";
const COL_AVATAR = "avatar_url";
const COL_CREATED = "created_at";
const COL_UPDATED = "updated_at";

/* =========================
   DOM
========================= */
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

/* =========================
   Helpers
========================= */
function setMsg(t) { if (pMsg) pMsg.textContent = t || ""; }

function initials(name) {
    const s = String(name || "").trim();
    if (!s) return "SM";
    return s.split(/\s+/).slice(0, 2).map((x) => (x[0] || "").toUpperCase()).join("") || "SM";
}

function fmtDate(iso) {
    try {
        const d = new Date(iso);
        return d.toLocaleDateString("tr-TR", { year: "numeric", month: "short", day: "2-digit" });
    } catch { return "—"; }
}

function safeUrl(u) {
    const s = String(u || "").trim();
    if (!s) return "";
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
    return "https://" + s;
}

function escapeHtml(s) {
    return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
function escapeAttr(s){ return escapeHtml(s).replaceAll("`",""); }

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

function renderProfileUI(row, me) {
    const displayName =
        (row?.[COL_NAME] && String(row[COL_NAME]).trim()) ||
        (me?.name && String(me.name).trim()) ||
        (me?.email ? me.email.split("@")[0] : "User");

    pName.textContent = displayName;

    pBio.textContent = row?.[COL_BIO] || "No bio yet.";

    const link = safeUrl(row?.[COL_WEBSITE] || "");
    if (link) {
        pLink.style.display = "inline-block";
        pLink.href = link;
        pLink.textContent = link.replace(/^https?:\/\//, "");
    } else {
        pLink.style.display = "none";
    }

    setAvatar(row?.[COL_AVATAR] || "", displayName);

    joined.textContent = fmtDate(row?.[COL_CREATED] || row?.[COL_UPDATED] || me?.$createdAt);
}

/* =========================
   Auth
========================= */
async function getMe() {
    try { return await account.get(); } catch { return null; }
}

/* =========================
   IMPORTANT: Detect correct UID column
   Because your request is 400, likely wrong column.
========================= */
let UID_COL = null;
const UID_COL_CANDIDATES = ["appwrite_user", "appwrite_user_id", "user_id"];

async function tryLoadWithCol(col, uid) {
    const { data, error } = await sb
        .from(PROFILE_TABLE)
        .select(`${col},${COL_NAME},${COL_BIO},${COL_WEBSITE},${COL_AVATAR},${COL_CREATED},${COL_UPDATED}`)
        .eq(col, uid)
        .maybeSingle();

    return { data: data || null, error };
}

async function detectUidColumn(uid) {
    for (const col of UID_COL_CANDIDATES) {
        const { data, error } = await tryLoadWithCol(col, uid);

        // If error exists and is a "column not found / bad request" -> try next.
        // Supabase-js error shape differs, so check loosely:
        const msg = String(error?.message || error?.hint || "");
        const bad =
            error &&
            (msg.includes("column") ||
                msg.includes("failed to parse") ||
                msg.includes("not found") ||
                msg.includes("bad request") ||
                msg.includes("PGRST"));

        if (!error || !bad) {
            // even if row doesn't exist, no column error means column is valid
            UID_COL = col;
            return { col, row: data };
        }
    }

    // fallback to first candidate
    UID_COL = UID_COL_CANDIDATES[0];
    return { col: UID_COL, row: null };
}

async function loadProfileRow(uid) {
    if (!UID_COL) await detectUidColumn(uid);

    const { data, error } = await sb
        .from(PROFILE_TABLE)
        .select(`${UID_COL},${COL_NAME},${COL_BIO},${COL_WEBSITE},${COL_AVATAR},${COL_CREATED},${COL_UPDATED}`)
        .eq(UID_COL, uid)
        .maybeSingle();

    if (error) console.warn("loadProfileRow error:", error);
    return data || null;
}

/* =========================
   Stats + Posts
========================= */
async function countPosts(userId) {
    const { count, error } = await sb
        .from("analyses")
        .select("id", { count: "exact", head: true })
        .eq("author_id", userId);
    if (error) console.warn("countPosts error:", error);
    return count || 0;
}

async function countFollowers(userId) {
    const { count, error } = await sb
        .from("follows")
        .select("follower_uid", { count: "exact", head: true })
        .eq("following_uid", userId);
    if (error) console.warn("countFollowers error:", error);
    return count || 0;
}

async function countFollowing(userId) {
    const { count, error } = await sb
        .from("follows")
        .select("following_uid", { count: "exact", head: true })
        .eq("follower_uid", userId);
    if (error) console.warn("countFollowing error:", error);
    return count || 0;
}

async function isFollowing(meId, targetId) {
    const { data, error } = await sb
        .from("follows")
        .select("follower_uid")
        .eq("follower_uid", meId)
        .eq("following_uid", targetId)
        .limit(1);

    if (error) { console.warn("isFollowing error:", error); return false; }
    return Array.isArray(data) && data.length > 0;
}

async function loadPosts(userId) {
    const { data, error } = await sb
        .from("analyses")
        .select("id, content, image_path, created_at")
        .eq("author_id", userId)
        .order("created_at", { ascending: false })
        .limit(12);

    if (error) console.warn("loadPosts error:", error);
    return data || [];
}

function renderPosts(list) {
    postsGrid.innerHTML = "";
    if (!list || list.length === 0) { setMsg("No posts yet."); return; }
    setMsg("");

    const frag = document.createDocumentFragment();

    for (const it of list) {
        const card = document.createElement("div");
        card.className = "pPost";
        card.addEventListener("click", () => {
            window.location.href = `/view/view.html?id=${encodeURIComponent(it.id)}`;
        });

        if (it.image_path) {
            const img = document.createElement("img");
            img.className = "pPostImg";
            img.src = it.image_path;
            img.alt = "post";
            card.appendChild(img);
        }

        const body = document.createElement("div");
        body.className = "pPostBody";

        const title = document.createElement("div");
        title.className = "pPostTitle";
        title.textContent = (it.content || "").slice(0, 90) || "Post";
        body.appendChild(title);

        const time = document.createElement("div");
        time.className = "pPostTime";
        time.textContent = fmtDate(it.created_at);
        body.appendChild(time);

        card.appendChild(body);
        frag.appendChild(card);
    }

    postsGrid.appendChild(frag);
}

/* =========================
   Netlify calls
========================= */
function getJWT() {
    const jwt = window.SM_JWT || localStorage.getItem("sm_jwt") || "";
    if (!jwt) throw new Error("Missing JWT (sm_jwt)");
    return jwt;
}

function setFollowUI(isF) {
    followBtn.textContent = isF ? "Following" : "Follow";
    followBtn.classList.toggle("primary", !isF);
}

async function toggleFollow(targetUid) {
    const jwt = getJWT();
    const res = await fetch("/.netlify/functions/toggle_follow", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ following_uid: String(targetUid) }),
    });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
}

async function upsertProfile({ bio, website }) {
    const jwt = getJWT();
    const res = await fetch("/.netlify/functions/upsert_profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ bio, website }),
    });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
}

async function uploadAvatar(file) {
    const jwt = getJWT();
    const fd = new FormData();
    fd.append("file", file);

    const res = await fetch("/.netlify/functions/upload_avatar", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
        body: fd,
    });

    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data.avatar_url || "";
}

/* =========================
   Follow modal
========================= */
function openFollowModal(title) {
    fTitle.textContent = title;
    fList.innerHTML = "";
    fEmpty.style.display = "none";
    followModal.style.display = "block";
    document.body.style.overflow = "hidden";
}
function closeFollowModal() {
    followModal.style.display = "none";
    document.body.style.overflow = "";
}

/* =========================
   Main
========================= */
async function main() {
    if (!sb) { setMsg("Supabase CDN missing."); return; }

    const me = await getMe();
    if (!me) { location.href = "/auth/login.html"; return; }

    const myId = me.$id;

    // detect UID column once
    await detectUidColumn(myId);
    console.log("✅ Detected UID_COL:", UID_COL);

    const targetUidFromUrl = new URL(location.href).searchParams.get("uid");
    const targetId = targetUidFromUrl || myId;
    const isMe = !targetUidFromUrl || targetUidFromUrl === myId;

    let row = await loadProfileRow(targetId);
    renderProfileUI(row, me);

    const [pc, fc, fg, posts, following] = await Promise.all([
        countPosts(targetId),
        countFollowers(targetId),
        countFollowing(targetId),
        loadPosts(targetId),
        isMe ? Promise.resolve(false) : isFollowing(myId, targetId),
    ]);

    postCount.textContent = String(pc || 0);
    followerCount.textContent = String(fc || 0);
    followingCount.textContent = String(fg || 0);

    renderPosts(posts);

    if (isMe) {
        editBtn.style.display = "inline-flex";
        followBtn.style.display = "none";
        msgBtn.style.display = "none";

        changeAvatarBtn.style.display = "inline-flex";
        changeAvatarBtn.onclick = () => avatarInput.click();

        avatarInput.onchange = async () => {
            const file = avatarInput.files?.[0];
            if (!file) return;

            try {
                changeAvatarBtn.disabled = true;
                if (file.size > 3 * 1024 * 1024) throw new Error("Max 3MB");

                await uploadAvatar(file);

                // refresh from DB
                row = await loadProfileRow(myId);
                renderProfileUI(row, me);

                alert("Photo updated ✅");
            } catch (e) {
                alert(e?.message || "Upload failed");
            } finally {
                changeAvatarBtn.disabled = false;
                avatarInput.value = "";
            }
        };
    } else {
        editBtn.style.display = "none";
        followBtn.style.display = "inline-flex";
        msgBtn.style.display = "inline-flex";

        setFollowUI(!!following);

        followBtn.onclick = async () => {
            try {
                followBtn.disabled = true;
                const r = await toggleFollow(targetId);
                setFollowUI(!!r.following);

                const [fc2, fg2] = await Promise.all([
                    countFollowers(targetId),
                    countFollowing(targetId),
                ]);
                followerCount.textContent = String(fc2 || 0);
                followingCount.textContent = String(fg2 || 0);
            } catch (e) {
                alert(e?.message || "Follow error");
            } finally {
                followBtn.disabled = false;
            }
        };

        msgBtn.onclick = () => alert("Message sistemi sonra.");
        changeAvatarBtn.style.display = "none";
    }

    editBtn.onclick = () => {
        editWrap.style.display = "block";
        bioInput.value = row?.[COL_BIO] || "";
        linkInput.value = row?.[COL_WEBSITE] || "";
    };

    cancelEdit.onclick = () => { editWrap.style.display = "none"; };

    saveEdit.onclick = async () => {
        try {
            saveEdit.disabled = true;
            const newBio = (bioInput.value || "").trim();
            const newWebsite = (linkInput.value || "").trim();

            await upsertProfile({ bio: newBio, website: newWebsite });

            // refresh from DB
            row = await loadProfileRow(myId);
            renderProfileUI(row, me);

            editWrap.style.display = "none";
            alert("Saved ");
        } catch (e) {
            alert(e?.message || "Save failed");
        } finally {
            saveEdit.disabled = false;
        }
    };
}

/* Modal events */
fCloseBtn?.addEventListener("click", closeFollowModal);
followModal?.addEventListener("click", (e) => { if (e.target?.dataset?.close) closeFollowModal(); });

fList?.addEventListener("click", (e) => {
    const btn = e.target.closest(".fBtn");
    if (!btn) return;
    const uid = btn.dataset.uid;
    if (!uid) return;
    window.location.href = `/profile/index.html?uid=${encodeURIComponent(uid)}`;
});

main().catch((e) => {
    console.error(e);
    setMsg("Profile load error.");
});
