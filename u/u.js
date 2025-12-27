// /u/u.js
console.log("✅ u.js loaded (fast)");

const FN_GET_PROFILE = "/.netlify/functions/get_profile";
const FN_LIST_FOLLOWERS = "/.netlify/functions/list_followers";
const FN_LIST_FOLLOWING = "/.netlify/functions/list_following";
const FN_TOGGLE_FOLLOW = "/.netlify/functions/toggle_follow"; // JWT required

const el = (id) => document.getElementById(id);
const qs = (k) => new URLSearchParams(location.search).get(k);

const $avatar = el("uAvatar");
const $name = el("uName");
const $bio = el("uBio");
const $followers = el("uFollowers");
const $following = el("uFollowing");
const $postsCount = el("uPostsCount");
const $links = el("uLinks");
const $grid = el("uPostsGrid");
const $msg = el("uMsg");

const $followBtn = el("uFollowBtn");
const $followersBtn = el("uFollowersBtn");
const $followingBtn = el("uFollowingBtn");

const $modal = el("uModal");
const $modalTitle = el("uModalTitle");
const $modalBody = el("uModalBody");
const $modalClose = el("uModalClose");

function setMsg(t) { $msg.textContent = t || ""; }

function closeModal(){
    $modal.hidden = true;
    $modalTitle.textContent = "—";
    $modalBody.innerHTML = "";
}
function openModal(title, html){
    $modalTitle.textContent = title;
    $modalBody.innerHTML = html;
    $modal.hidden = false;
}

$modalClose?.addEventListener("click", closeModal);
$modal?.addEventListener("click", (e) => { if (e.target === $modal) closeModal(); });

const esc = (s) =>
    String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

function linkLabel(url){
    try { return new URL(url).hostname; } catch { return "Link"; }
}

function renderLinks(list){
    $links.innerHTML = "";
    (list || []).forEach((x) => {
        if (!x?.url) return;
        const a = document.createElement("a");
        a.className = "uLink";
        a.href = x.url;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = x.label || linkLabel(x.url);
        $links.appendChild(a);
    });
}

function renderPosts(posts){
    $grid.innerHTML = "";
    (posts || []).forEach((p) => {
        const d = document.createElement("div");
        d.className = "uPost";
        d.innerHTML = `${p.image_url ? `<img src="${esc(p.image_url)}" alt="post">` : ""}`;
        $grid.appendChild(d);
    });
}

function renderAll(data){
    const p = data?.profile || {};
    const c = data?.counts || {};
    const posts = data?.posts || [];

    $name.textContent = p.name || "—";
    $bio.textContent = p.bio || "";
    $avatar.src = p.avatar_url || "/assets/img/avatar-placeholder.png";

    $followers.textContent = String(c.followers ?? 0);
    $following.textContent = String(c.following ?? 0);
    $postsCount.textContent = String(c.posts ?? 0);

    renderLinks(p.links || []);
    renderPosts(posts);
}

/* JWT helper (follow için) */
function getJWT(){
    return (
        localStorage.getItem("sm_jwt") ||
        localStorage.getItem("jwt") ||
        sessionStorage.getItem("sm_jwt") ||
        ""
    );
}

async function apiGet(url, params){
    const u = new URL(url, location.origin);
    Object.entries(params || {}).forEach(([k,v]) => v != null && u.searchParams.set(k, v));
    const res = await fetch(u.toString(), { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
}

async function apiPost(url, body, withJwt=false){
    const headers = { "Content-Type": "application/json" };
    if (withJwt){
        const jwt = getJWT();
        if (jwt) headers.Authorization = `Bearer ${jwt}`;
    }
    const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body || {})
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
}

/* Modal user list */
function renderUserList(list){
    if (!list?.length) return `<div class="uMsg">No users</div>`;

    return list.map((u) => `
    <div class="uUserRow">
      <img class="uUserAva" src="${esc(u.avatar_url || "/assets/img/avatar-placeholder.png")}" alt="avatar">
      <div class="uUserName">${esc(u.name || "User")}</div>
      <button class="uUserGo" data-id="${esc(u.id)}" type="button">Visit</button>
    </div>
  `).join("");
}
function attachVisitHandlers(){
    $modalBody.querySelectorAll("[data-id]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-id");
            closeModal();
            location.href = `/u/?id=${encodeURIComponent(id)}`;
        });
    });
}

/* ✅ FAST BOOT:
   - /u/?me=1 -> redirect yok, id = myId
   - cache -> hemen bas
   - sonra network ile güncelle
*/
(async function boot(){
    closeModal();

    let id = qs("id");
    const me = qs("me");

    if (!id && me === "1"){
        const myId = localStorage.getItem("sm_uid");
        if (!myId){
            setMsg("Login required.");
            return;
        }
        id = myId; // ✅ redirect yok
    }

    if (!id){
        setMsg("No user selected.");
        return;
    }

    const myId = localStorage.getItem("sm_uid");
    const isMe = myId && myId === id;

    // ✅ CACHE: önce cache bas (anında açılır)
    const cacheKey = `sm_profile_cache_${id}`;
    try {
        const cachedRaw = localStorage.getItem(cacheKey);
        if (cachedRaw){
            const cached = JSON.parse(cachedRaw);
            if (cached?.data) renderAll(cached.data);
        }
    } catch {}

    // UI: follow button visibility
    if (isMe){
        $followBtn.hidden = true;
    } else {
        $followBtn.hidden = false;
        $followBtn.textContent = "Follow";
        $followBtn.classList.remove("isFollowing");
    }

    // Followers/Following modal handlers (always)
    $followersBtn.onclick = async () => {
        openModal("Followers", `<div class="uMsg">Loading...</div>`);
        const rr = await apiGet(FN_LIST_FOLLOWERS, { id });
        if (!rr.ok){
            $modalBody.innerHTML = `<div class="uMsg">${esc(rr.json?.error || "Load failed")}</div>`;
            return;
        }
        $modalBody.innerHTML = renderUserList(rr.json.list || []);
        attachVisitHandlers();
    };

    $followingBtn.onclick = async () => {
        openModal("Following", `<div class="uMsg">Loading...</div>`);
        const rr = await apiGet(FN_LIST_FOLLOWING, { id });
        if (!rr.ok){
            $modalBody.innerHTML = `<div class="uMsg">${esc(rr.json?.error || "Load failed")}</div>`;
            return;
        }
        $modalBody.innerHTML = renderUserList(rr.json.list || []);
        attachVisitHandlers();
    };

    // ✅ NETWORK: güncel veriyi çek (sessiz)
    const r = await apiGet(FN_GET_PROFILE, { id });
    if (!r.ok){
        console.error("get_profile", r.status, r.json);
        // cache yoksa mesaj göster
        if (!$name.textContent || $name.textContent === "—") setMsg(r.json?.error || "Profile load failed.");
        return;
    }

    // bas
    renderAll(r.json);

    // cache yaz (60sn ttl gibi davranacağız)
    try {
        localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: r.json }));
    } catch {}

    // follow state (server false dönse bile buton çalışır)
    if (!isMe){
        const isFollowing = !!r.json.is_following;
        $followBtn.classList.toggle("isFollowing", isFollowing);
        $followBtn.textContent = isFollowing ? "Following" : "Follow";

        $followBtn.onclick = async () => {
            const jwt = getJWT();
            if (!jwt){
                setMsg("Login required to follow.");
                return;
            }
            $followBtn.disabled = true;
            const t = await apiPost(FN_TOGGLE_FOLLOW, { target_id: id }, true);
            $followBtn.disabled = false;

            if (!t.ok){
                console.error("toggle_follow", t.status, t.json);
                setMsg(t.json?.error || "Follow failed.");
                return;
            }

            const nowFollowing = !!t.json.following;
            $followBtn.classList.toggle("isFollowing", nowFollowing);
            $followBtn.textContent = nowFollowing ? "Following" : "Follow";
            if (t.json.followers_count != null) $followers.textContent = String(t.json.followers_count);
            setMsg("");
        };
    }

    setMsg("");
})();
