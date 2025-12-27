/* profile/profile.js (v2) */
console.log("✅ profile.js v2 loaded");

// ===== Supabase (READ only) =====
const SUPABASE_URL = "https://yzrhqduuqvllatliulqv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_dN5E6cw7uaKj7Cmmpo7RJg_W4FWxjs_";

const sb = window.supabase?.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// ===== Elements =====
const el = (id) => document.getElementById(id);

const pAvatar = el("pAvatar");
const pName = el("pName");
const pEmail = el("pEmail");
const pBio = el("pBio");
const pLink = el("pLink");
const followersCount = el("followersCount");
const followingCount = el("followingCount");
const joined = el("joined");

const editBtn = el("editBtn");
const followBtn = el("followBtn");

const editWrap = el("editWrap");
const bioInput = el("bioInput");
const linkInput = el("linkInput");
const cancelEdit = el("cancelEdit");
const saveEdit = el("saveEdit");

const postsGrid = el("postsGrid");
const pMsg = el("pMsg");

const followersBtn = el("followersBtn");
const followingBtn = el("followingBtn");

// ===== Netlify Functions =====
const FN_TOGGLE_FOLLOW = "/.netlify/functions/toggle_follow";
const FN_UPSERT_PROFILE = "/.netlify/functions/upsert_profile";

// ===== Helpers =====
const esc = (s) =>
    String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

function getJWT() {
    // senin projede jwt.js "sm_jwt updated" yazıyor → localStorage sm_jwt kullanıyoruz
    return localStorage.getItem("sm_jwt") || "";
}

function initials(name) {
    const t = String(name || "").trim();
    if (!t) return "SM";
    const parts = t.split(/\s+/).slice(0, 2);
    return parts.map(x => x[0]?.toUpperCase() || "").join("") || "SM";
}

function fmtDate(iso) {
    try {
        const d = new Date(iso);
        return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
    } catch {
        return "—";
    }
}

async function fnPost(url, bodyObj) {
    const jwt = getJWT();
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {})
        },
        body: JSON.stringify(bodyObj || {})
    });

    // JSON olmayan hata dönünce "Unexpected token..." patlamasın:
    const txt = await res.text();
    let data = null;
    try { data = JSON.parse(txt); } catch { data = { raw: txt }; }

    if (!res.ok) {
        const msg = data?.error || data?.message || txt || `HTTP ${res.status}`;
        throw new Error(msg);
    }
    return data;
}

// ===== Determine which profile is being viewed =====
// /profile/index.html?uid=APPWRITE_UID  → başka profili gör
// yoksa kendi profilini görmeye çalışır (localStorage sm_uid varsa)
function getViewingUid() {
    const u = new URL(location.href);
    const uid = (u.searchParams.get("uid") || "").trim();
    if (uid) return uid;

    // fallback: projende eğer kullanıcı id saklıyorsan
    const cached = (localStorage.getItem("sm_uid") || "").trim();
    return cached || "";
}

let VIEW_UID = "";
let ME_UID = "";

// ===== Modal (Followers/Following) =====
function ensureModal() {
    if (document.getElementById("fModalBack")) return;

    const back = document.createElement("div");
    back.className = "fModalBack";
    back.id = "fModalBack";

    back.innerHTML = `
    <div class="fModal" role="dialog" aria-modal="true">
      <div class="fHead">
        <h3 id="fTitle">Followers</h3>
        <button class="fClose" id="fClose" type="button">×</button>
      </div>

      <div class="fTabs">
        <button class="fTab active" id="tabFollowers" type="button">Followers</button>
        <button class="fTab" id="tabFollowing" type="button">Following</button>
      </div>

      <div class="fList" id="fList"></div>
    </div>
  `;

    document.body.appendChild(back);

    const close = document.getElementById("fClose");
    close.onclick = () => back.classList.remove("open");

    back.addEventListener("click", (e) => {
        if (e.target === back) back.classList.remove("open");
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") back.classList.remove("open");
    });
}

function openModal(mode) {
    ensureModal();
    const back = document.getElementById("fModalBack");
    const tabFollowers = document.getElementById("tabFollowers");
    const tabFollowing = document.getElementById("tabFollowing");
    const fTitle = document.getElementById("fTitle");

    const setMode = (m) => {
        tabFollowers.classList.toggle("active", m === "followers");
        tabFollowing.classList.toggle("active", m === "following");
        fTitle.textContent = m === "followers" ? "Followers" : "Following";
        loadFollowList(m).catch(err => {
            const list = document.getElementById("fList");
            list.innerHTML = `<div style="padding:10px;font-weight:900;opacity:.8;">${esc(err.message)}</div>`;
        });
    };

    tabFollowers.onclick = () => setMode("followers");
    tabFollowing.onclick = () => setMode("following");

    back.classList.add("open");
    setMode(mode);
}

async function loadFollowList(mode) {
    if (!sb) throw new Error("Supabase client missing.");

    const list = document.getElementById("fList");
    list.innerHTML = `<div style="padding:10px;font-weight:900;opacity:.75;">Loading...</div>`;

    // follows table columns:
    // follower_uid (kim takip ediyor)
    // following_uid (kimi takip ediyor)

    let rows = [];
    if (mode === "followers") {
        // Benim followerlarım → following_uid = VIEW_UID, listede follower_uid göster
        const { data, error } = await sb
            .from("follows")
            .select("follower_uid, created_at")
            .eq("following_uid", VIEW_UID)
            .order("created_at", { ascending: false })
            .limit(60);
        if (error) throw error;
        rows = data || [];
    } else {
        // Ben kimi takip ediyorum → follower_uid = VIEW_UID, listede following_uid göster
        const { data, error } = await sb
            .from("follows")
            .select("following_uid, created_at")
            .eq("follower_uid", VIEW_UID)
            .order("created_at", { ascending: false })
            .limit(60);
        if (error) throw error;
        rows = data || [];
    }

    const uids = rows.map(r => (mode === "followers" ? r.follower_uid : r.following_uid)).filter(Boolean);

    // Profiles from profiles table (appwrite_user_id)
    let profMap = new Map();
    if (uids.length) {
        const { data: profs, error: pErr } = await sb
            .from("profiles")
            .select("appwrite_user_id,name,email,avatar_url,created_at")
            .in("appwrite_user_id", uids);
        if (pErr) throw pErr;

        (profs || []).forEach(p => profMap.set(p.appwrite_user_id, p));
    }

    if (!uids.length) {
        list.innerHTML = `<div style="padding:10px;font-weight:900;opacity:.75;">Empty.</div>`;
        return;
    }

    list.innerHTML = uids.map((uid) => {
        const p = profMap.get(uid);
        const name = p?.name || uid.slice(0, 10);
        const sub = p?.email || uid;
        const ava = initials(p?.name || uid);

        return `
      <div class="fRow">
        <div class="fLeft">
          <div class="fAva">${esc(ava)}</div>
          <div class="fNames">
            <div class="fName">${esc(name)}</div>
            <div class="fSub">${esc(sub)}</div>
          </div>
        </div>
        <button class="fView" type="button" data-uid="${esc(uid)}">View</button>
      </div>
    `;
    }).join("");

    list.querySelectorAll(".fView").forEach(btn => {
        btn.addEventListener("click", () => {
            const uid = btn.getAttribute("data-uid");
            if (!uid) return;
            location.href = `/profile/index.html?uid=${encodeURIComponent(uid)}`;
        });
    });
}

// ===== Data loaders =====
async function loadCounts() {
    if (!sb) throw new Error("Supabase client missing.");

    // followers: following_uid = VIEW_UID
    const { count: followers, error: e1 } = await sb
        .from("follows")
        .select("id", { count: "exact", head: true })
        .eq("following_uid", VIEW_UID);
    if (e1) throw e1;

    // following: follower_uid = VIEW_UID
    const { count: following, error: e2 } = await sb
        .from("follows")
        .select("id", { count: "exact", head: true })
        .eq("follower_uid", VIEW_UID);
    if (e2) throw e2;

    followersCount.textContent = String(followers || 0);
    followingCount.textContent = String(following || 0);
}

async function loadProfile() {
    if (!sb) throw new Error("Supabase client missing.");

    // profiles table: appwrite_user_id
    const { data, error } = await sb
        .from("profiles")
        .select("appwrite_user_id,name,email,avatar_url,bio,website,created_at")
        .eq("appwrite_user_id", VIEW_UID)
        .maybeSingle();

    if (error) throw error;

    const prof = data || {};
    const name = prof.name || "User";
    const email = prof.email || "—";
    const bio = (prof.bio || "").trim();
    const link = (prof.website || "").trim();
    const created = prof.created_at || null;

    pName.textContent = name;
    pEmail.textContent = email;

    pAvatar.textContent = initials(name);

    pBio.textContent = bio ? bio : "No bio yet.";

    if (link) {
        pLink.style.display = "";
        pLink.href = link.startsWith("http") ? link : `https://${link}`;
        pLink.textContent = link;
    } else {
        pLink.style.display = "none";
    }

    joined.textContent = created ? `Joined ${fmtDate(created)}` : "Joined —";

    // Fill edit inputs
    bioInput.value = bio;
    linkInput.value = link;
}

async function loadPosts() {
    // Senin post kaynağın projede farklı olabilir.
    // Burada "analyses" tablosundan author_id = VIEW_UID diye çekiyoruz (senin feed mantığına uyuyor)
    if (!sb) throw new Error("Supabase client missing.");

    pMsg.textContent = "Loading posts...";
    postsGrid.innerHTML = "";

    const { data, error } = await sb
        .from("analyses")
        .select("id,title,content,image_path,created_at,author_id")
        .eq("author_id", VIEW_UID)
        .order("created_at", { ascending: false })
        .limit(30);

    if (error) {
        // tablo/kolon farklıysa en azından sayfa patlamasın
        console.warn("posts load error:", error);
        pMsg.textContent = "Posts load error.";
        return;
    }

    const list = data || [];
    if (!list.length) {
        pMsg.textContent = "No posts yet.";
        return;
    }

    pMsg.textContent = "";

    postsGrid.innerHTML = list.map((x) => {
        const title = x.title || "Post";
        const date = fmtDate(x.created_at);
        const img = (x.image_path || "").trim();

        const imgHtml = img
            ? `<img class="postImg" src="${esc(img)}" alt="${esc(title)}">`
            : `<div class="postImg ph">No image</div>`;

        return `
      <article class="pPost">
        ${imgHtml}
        <div class="pPostBody">
          <div class="pPostTitle">${esc(title)}</div>
          <div class="pPostMeta">${esc(date)}</div>
        </div>
      </article>
    `;
    }).join("");

    // post cards small css injection (minimum)
    injectPostCssOnce();
}

function injectPostCssOnce() {
    if (document.getElementById("postCssMini")) return;
    const s = document.createElement("style");
    s.id = "postCssMini";
    s.textContent = `
    .pPost{
      border-radius:16px;
      overflow:hidden;
      border:1px solid rgba(15,23,42,.10);
      background: rgba(255,255,255,.92);
      box-shadow: var(--softShadow);
    }
    html[data-theme="dark"] .pPost{
      border-color: rgba(255,255,255,.10);
      background: rgba(255,255,255,.06);
    }
    .postImg{ width:100%; height:170px; object-fit:cover; display:block; background: rgba(37,99,235,.06); }
    .postImg.ph{ display:grid; place-items:center; font-weight:1000; opacity:.65; }
    .pPostBody{ padding:10px 12px; }
    .pPostTitle{ font-weight:1000; font-size:14px; line-height:1.25; }
    .pPostMeta{ margin-top:6px; font-weight:900; font-size:12px; opacity:.7; }
  `;
    document.head.appendChild(s);
}

// ===== Actions =====
function wireEdit() {
    editBtn.addEventListener("click", () => {
        editWrap.style.display = "";
        editBtn.style.display = "none";
    });

    cancelEdit.addEventListener("click", () => {
        editWrap.style.display = "none";
        editBtn.style.display = "";
        // revert to loaded
        loadProfile().catch(() => {});
    });

    saveEdit.addEventListener("click", async () => {
        saveEdit.disabled = true;
        try {
            const bio = String(bioInput.value || "").trim();
            const link = String(linkInput.value || "").trim();

            // upsert_profile function (Authorization: Bearer sm_jwt gerekiyor)
            await fnPost(FN_UPSERT_PROFILE, {
                bio,
                website: link
            });

            editWrap.style.display = "none";
            editBtn.style.display = "";
            await loadProfile();
        } catch (e) {
            alert(e.message || "Save failed");
        } finally {
            saveEdit.disabled = false;
        }
    });
}

function wireFollow() {
    followBtn.addEventListener("click", async () => {
        followBtn.disabled = true;
        try {
            // toggle_follow: { following_uid }
            const out = await fnPost(FN_TOGGLE_FOLLOW, { following_uid: VIEW_UID });

            // UI
            const following = !!out.following;
            followBtn.textContent = following ? "Following" : "Follow";
            followBtn.classList.toggle("primary", !following);

            await loadCounts();
        } catch (e) {
            alert(e.message || "Follow failed");
        } finally {
            followBtn.disabled = false;
        }
    });
}

async function detectMeUid() {
    // Eğer login akışında sm_uid set ediyorsan onu alır
    ME_UID = (localStorage.getItem("sm_uid") || "").trim();

    // yoksa yine de follow/edit mantığını çalıştıracağız:
    // - ME_UID yoksa Edit gösteremeyiz
    // - follow için JWT yoksa function 401 döner
}

// ===== Main =====
async function main() {
    if (!sb) {
        pMsg.textContent = "Supabase client not found (CDN missing).";
        return;
    }

    VIEW_UID = getViewingUid();
    if (!VIEW_UID) {
        pMsg.textContent = "Missing uid. (Try /profile/index.html?uid=...)";
        return;
    }

    await detectMeUid();

    // show correct buttons
    const isMe = ME_UID && VIEW_UID === ME_UID;

    editBtn.style.display = isMe ? "" : "none";
    followBtn.style.display = !isMe ? "" : "none";

    // initial follow button text (optional)
    if (!isMe) {
        // check if ME follows VIEW
        try {
            const { data, error } = await sb
                .from("follows")
                .select("id")
                .eq("follower_uid", ME_UID)
                .eq("following_uid", VIEW_UID)
                .maybeSingle();
            if (!error && data?.id) {
                followBtn.textContent = "Following";
                followBtn.classList.remove("primary");
            } else {
                followBtn.textContent = "Follow";
                followBtn.classList.add("primary");
            }
        } catch {}
    }

    // click stats open modal
    followersBtn.addEventListener("click", () => openModal("followers"));
    followingBtn.addEventListener("click", () => openModal("following"));

    wireEdit();
    wireFollow();

    // load data
    await loadProfile();
    await loadCounts();
    await loadPosts();
}

main().catch((e) => {
    console.error("profile main error:", e);
    pMsg.textContent = e.message || "Profile load error.";
});
