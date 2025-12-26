// =========================
// /profile/profile.js (FULL)
// =========================
import { account } from "/assets/appwrite.js";

/* =========================
   SUPABASE (CDN global)
========================= */
const SUPABASE_URL = "https://yzrhqduuqvllatliulqv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_dN5E6cw7uaKj7Cmmpo7RJg_W4FWxjs_";

const sb = window.supabase?.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

/* =========================
   DOM
========================= */
const $ = (id) => document.getElementById(id);

const pAvatar = $("pAvatar");
const pName = $("pName");
const pUser = $("pUser");
const pMeta = $("pMeta");

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

/* ✅ modal DOM */
const openFollowers = $("openFollowers");
const openFollowing = $("openFollowing");

const fModal = $("fModal");
const fOverlay = $("fOverlay");
const fClose = $("fClose");
const fTitle = $("fTitle");
const fList = $("fList");
const fEmpty = $("fEmpty");

const fTabs = $("fTabs");
const tabFollowers = $("tabFollowers");
const tabFollowing = $("tabFollowing");

/* =========================
   Helpers
========================= */
function setMsg(t) {
    if (pMsg) pMsg.textContent = t || "";
}

function esc(str) {
    return String(str ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function initials(name) {
    const s = String(name || "").trim();
    if (!s) return "SM";
    return (
        s
            .split(/\s+/)
            .slice(0, 2)
            .map((x) => (x[0] || "").toUpperCase())
            .join("") || "SM"
    );
}

function fmtDate(iso) {
    try {
        const d = new Date(iso);
        return d.toLocaleDateString("tr-TR", {
            year: "numeric",
            month: "short",
            day: "2-digit",
        });
    } catch {
        return "—";
    }
}

function safeUrl(u) {
    const s = String(u || "").trim();
    if (!s) return "";
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
    return "https://" + s;
}

function setFollowUI(isFollowing) {
    followBtn.textContent = isFollowing ? "Following" : "Follow";
    followBtn.classList.toggle("primary", !isFollowing);
}

/* =========================
   Auth
========================= */
async function getMe() {
    try {
        return await account.get();
    } catch {
        return null;
    }
}

/* =========================
   Supabase reads
========================= */
async function loadProfileRow(userId) {
    const { data, error } = await sb
        .from("profiles")
        .select("user_id, username, display_name, bio, link, avatar_url, created_at")
        .eq("user_id", userId)
        .maybeSingle();

    if (error) console.warn("profiles read error:", error);
    return data || null;
}

async function countPosts(userId) {
    const { count, error } = await sb
        .from("analyses")
        .select("id", { count: "exact", head: true })
        .eq("author_id", userId);

    if (error) console.warn("countPosts error:", error);
    return count || 0;
}

// ✅ follows kolonları: follower_uid / following_uid
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

    if (error) {
        console.warn("isFollowing error:", error);
        return false;
    }
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

/* =========================
   Follow lists (NEW)
========================= */
async function loadFollowerIds(targetId, limit = 200) {
    const { data, error } = await sb
        .from("follows")
        .select("follower_uid")
        .eq("following_uid", targetId)
        .limit(limit);

    if (error) {
        console.warn("loadFollowerIds error:", error);
        return [];
    }
    return (data || [])
        .map((x) => String(x.follower_uid || "").trim())
        .filter(Boolean);
}

async function loadFollowingIds(targetId, limit = 200) {
    const { data, error } = await sb
        .from("follows")
        .select("following_uid")
        .eq("follower_uid", targetId)
        .limit(limit);

    if (error) {
        console.warn("loadFollowingIds error:", error);
        return [];
    }
    return (data || [])
        .map((x) => String(x.following_uid || "").trim())
        .filter(Boolean);
}

/* Load profiles map for ids */
async function loadProfilesMap(userIds) {
    const ids = Array.from(
        new Set((userIds || []).map((x) => String(x).trim()).filter(Boolean))
    );
    if (!ids.length) return new Map();

    try {
        const { data, error } = await sb
            .from("profiles")
            .select("user_id, username, display_name, avatar_url")
            .in("user_id", ids);

        if (error) {
            console.warn("loadProfilesMap error:", error);
            return new Map();
        }

        const m = new Map();
        (data || []).forEach((p) => {
            const k = String(p.user_id || "").trim();
            if (k) m.set(k, p);
        });
        return m;
    } catch (e) {
        console.warn("loadProfilesMap exception:", e);
        return new Map();
    }
}

/* =========================
   Render Posts
========================= */
function renderPosts(list) {
    postsGrid.innerHTML = "";

    if (!list || list.length === 0) {
        setMsg("No posts yet.");
        return;
    }
    setMsg("");

    const frag = document.createDocumentFragment();

    for (const it of list) {
        const card = document.createElement("div");
        card.className = "pPost";
        card.onclick = () => {
            location.href = `/view/view.html?id=${encodeURIComponent(it.id)}`;
        };

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
   Render Follow Modal List
========================= */
function renderFollowList(ids, profilesMap) {
    if (!fList) return;

    fList.innerHTML = "";
    fEmpty.style.display = ids.length ? "none" : "block";
    if (!ids.length) return;

    const frag = document.createDocumentFragment();

    for (const uid of ids) {
        const p = profilesMap?.get(uid);
        const display =
            (p?.display_name || "").trim() ||
            (p?.username ? `@${p.username}` : "") ||
            uid;

        const handle = p?.username ? `@${p.username}` : uid;
        const avatar = (p?.avatar_url || "").trim();
        const init = initials(display);

        const item = document.createElement("div");
        item.className = "fItem";

        const left = document.createElement("div");
        left.className = "fLeft";

        const av = document.createElement("div");
        av.className = "fAv";
        if (avatar) {
            av.innerHTML = `<img src="${esc(avatar)}" alt="">`;
        } else {
            av.textContent = init.slice(0, 1);
        }

        const names = document.createElement("div");
        names.className = "fNames";
        names.innerHTML = `
      <div class="fDisplay">${esc(display)}</div>
      <div class="fHandle">${esc(handle)}</div>
    `;

        left.appendChild(av);
        left.appendChild(names);

        const go = document.createElement("a");
        go.className = "fGo";
        go.href = `/profile/index.html?uid=${encodeURIComponent(uid)}`;
        go.textContent = "View";

        item.appendChild(left);
        item.appendChild(go);

        frag.appendChild(item);
    }

    fList.appendChild(frag);
}

/* =========================
   Modal open/close
========================= */
function openModal(title) {
    fTitle.textContent = title;
    fModal.style.display = "block";
    document.body.style.overflow = "hidden";
}
function closeModal() {
    fModal.style.display = "none";
    document.body.style.overflow = "";
}
fOverlay?.addEventListener("click", closeModal);
fClose?.addEventListener("click", closeModal);
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && fModal?.style.display !== "none") closeModal();
});

/* =========================
   Call toggle_follow function
========================= */
async function toggleFollow(targetUid) {
    const jwt = localStorage.getItem("sm_jwt") || "";
    if (!jwt) throw new Error("Missing JWT (sm_jwt)");

    const res = await fetch("/.netlify/functions/toggle_follow", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ following_uid: String(targetUid) }),
    });

    const text = await res.text();
    let data = {};
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { error: text };
    }

    if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
    }
    return data; // { ok:true, following:true/false }
}

/* =========================
   Main
========================= */
async function main() {
    if (!sb) {
        setMsg("Supabase CDN missing. Add supabase-js CDN script.");
        console.warn("Supabase CDN missing.");
        return;
    }

    const me = await getMe();
    if (!me) {
        location.href = "/auth/login.html";
        return;
    }

    const myId = me.$id;

    // ✅ URL: /profile/index.html?uid=HEDEF_UID
    const targetUidFromUrl = new URL(location.href).searchParams.get("uid");
    const targetId = targetUidFromUrl || myId;
    const isMe = !targetUidFromUrl || targetUidFromUrl === myId;

    // Profile row
    const row = await loadProfileRow(targetId);

    const name =
        row?.display_name ||
        me?.name ||
        me?.email?.split("@")[0] ||
        "User";

    pName.textContent = name;
    pUser.textContent = row?.username ? `@${row.username}` : "@user";
    pAvatar.textContent = initials(name);

    // meta: sadece kendinde email göster
    pMeta.textContent = isMe ? (me.email || "") : "";

    // joined
    joined.textContent = fmtDate(row?.created_at || me?.$createdAt);

    // bio + link
    pBio.textContent = row?.bio || "No bio yet.";
    const link = safeUrl(row?.link || "");
    if (link) {
        pLink.style.display = "inline-block";
        pLink.href = link;
        pLink.textContent = link.replace(/^https?:\/\//, "");
    } else {
        pLink.style.display = "none";
    }

    // counts + posts + follow state
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

    // Followers/Following modal handlers
    openFollowers?.addEventListener("click", async () => {
        try {
            openModal("Followers");
            fTabs.style.display = "flex";
            tabFollowers.classList.add("active");
            tabFollowing.classList.remove("active");
            fList.innerHTML = "";
            fEmpty.style.display = "none";

            const ids = await loadFollowerIds(targetId);
            const map = await loadProfilesMap(ids);
            renderFollowList(ids, map);
        } catch (e) {
            console.error(e);
            fList.innerHTML = "";
            fEmpty.style.display = "block";
        }
    });

    openFollowing?.addEventListener("click", async () => {
        try {
            openModal("Following");
            fTabs.style.display = "flex";
            tabFollowing.classList.add("active");
            tabFollowers.classList.remove("active");
            fList.innerHTML = "";
            fEmpty.style.display = "none";

            const ids = await loadFollowingIds(targetId);
            const map = await loadProfilesMap(ids);
            renderFollowList(ids, map);
        } catch (e) {
            console.error(e);
            fList.innerHTML = "";
            fEmpty.style.display = "block";
        }
    });

    tabFollowers?.addEventListener("click", () => openFollowers?.click());
    tabFollowing?.addEventListener("click", () => openFollowing?.click());

    // Buttons show/hide
    if (isMe) {
        editBtn.style.display = "inline-flex";
        followBtn.style.display = "none";
        msgBtn.style.display = "none";
    } else {
        editBtn.style.display = "none";
        followBtn.style.display = "inline-flex";
        msgBtn.style.display = "inline-flex";

        setFollowUI(following);

        followBtn.onclick = async () => {
            try {
                followBtn.disabled = true;
                const r = await toggleFollow(targetId);
                setFollowUI(!!r.following);

                // refresh counts
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

        msgBtn.onclick = () =>
            alert("Message sistemi sonra (conversations/messages tabloları).");
    }

    // Edit drawer (UI)
    editBtn.onclick = () => {
        editWrap.style.display = "block";
        bioInput.value = row?.bio || "";
        linkInput.value = row?.link || "";
    };

    cancelEdit.onclick = () => {
        editWrap.style.display = "none";
    };

    saveEdit.onclick = async () => {
        const newBio = (bioInput.value || "").trim();
        const newLink = (linkInput.value || "").trim();

        pBio.textContent = newBio || "No bio yet.";

        const link2 = safeUrl(newLink);
        if (link2) {
            pLink.style.display = "inline-block";
            pLink.href = link2;
            pLink.textContent = link2.replace(/^https?:\/\//, "");
        } else {
            pLink.style.display = "none";
        }

        editWrap.style.display = "none";
        alert("Bio/Link DB’ye kaydetmek için upsert_profile function ekleyeceğiz.");
    };
}

main().catch((e) => {
    console.error(e);
    setMsg("Profile load error.");
});
