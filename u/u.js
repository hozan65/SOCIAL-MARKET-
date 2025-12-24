// /u/u.js (NO MODULE)
// Public profile viewer + follow/unfollow (SAFE)
// - READ: Supabase anon
// - WRITE: Netlify Function toggle_follow (Appwrite JWT)

console.log("✅ u.js running");

const SUPABASE_URL = "https://yzrhqduuqvllatliulqv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_dN5E6cw7uaKj7Cmmpo7RJg_W4FWxjs_";

const sb = window.supabase?.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

const FN_TOGGLE_FOLLOW = "/.netlify/functions/toggle_follow";

const $ = (id) => document.getElementById(id);

function avatarFromEmail(email) {
    const seed = encodeURIComponent(String(email || "user").trim().toLowerCase());
    return `https://api.dicebear.com/7.x/identicon/svg?seed=${seed}`;
}

function getTargetUserId() {
    const u = new URLSearchParams(location.search).get("u");
    return u && u.trim() ? u.trim() : null;
}

function getViewerId() {
    // auth-ui.js logged-in olunca set ediyor: localStorage.setItem("sm_uid", user.$id)
    return localStorage.getItem("sm_uid") || "";
}

function getJWT() {
    const jwt = window.SM_JWT || localStorage.getItem("sm_jwt");
    if (!jwt) throw new Error("Login required");
    return jwt;
}

async function fnPost(url, body) {
    const jwt = getJWT();
    const r = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify(body || {}),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || `Request failed (${r.status})`);
    return j;
}

async function getFollowCounts(targetId) {
    const [a, b] = await Promise.all([
        sb.from("follows").select("*", { count: "exact", head: true }).eq("following_id", targetId),
        sb.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", targetId),
    ]);

    return {
        followers: Number(a.count || 0),
        following: Number(b.count || 0),
    };
}

async function isFollowing(viewerId, targetId) {
    // READ ok (anon)
    const { data, error } = await sb
        .from("follows")
        .select("follower_id")
        .eq("follower_id", viewerId)
        .eq("following_id", targetId)
        .maybeSingle();

    if (error) throw error;
    return !!data;
}

async function toggleFollow(targetId) {
    // WRITE via function
    return fnPost(FN_TOGGLE_FOLLOW, { following_id: String(targetId) }); // { ok, following }
}

(async function boot() {
    if (!sb) {
        console.error("❌ Supabase CDN not loaded (missing <script src='@supabase/supabase-js@2'>)");
        alert("Supabase CDN not loaded");
        return;
    }

    const targetId = getTargetUserId();
    if (!targetId) {
        alert("Missing user id. Use /u/u.html?u=USER_ID");
        return;
    }

    const viewerId = getViewerId();

    // Load profile (profiles table must exist)
    const { data: profile, error } = await sb
        .from("profiles")
        .select("*")
        .eq("appwrite_user_id", targetId)
        .maybeSingle();

    if (error) {
        console.error(error);
        alert(error.message || "Profile load error");
        return;
    }
    if (!profile) {
        alert("Profile not found");
        return;
    }

    $("nameText").textContent = profile.name || "User";
    $("emailText").textContent = profile.email || "";

    $("skillsInput").value = profile.skills || "";
    $("descInput").value = profile.description || "";
    $("bioInput").value = profile.bio || "";

    $("xInput").value = profile.x || "";
    $("ytInput").value = profile.youtube || "";
    $("fbInput").value = profile.facebook || "";
    $("igInput").value = profile.instagram || "";
    $("webInput").value = profile.website || "";

    $("avatarImg").src = profile.avatar_url || avatarFromEmail(profile.email);

    // Counts
    async function refreshCounts() {
        try {
            const counts = await getFollowCounts(targetId);
            $("followersNum").textContent = String(counts.followers);
            $("followingNum").textContent = String(counts.following);
        } catch (e) {
            console.warn("Count load failed:", e?.message || e);
        }
    }
    await refreshCounts();

    const followBtn = $("followBtn");

    // not logged in
    if (!viewerId) {
        followBtn.textContent = "Login to follow";
        followBtn.onclick = () => (location.href = "/auth/login.html");
        return;
    }

    // viewing own profile -> disable follow
    if (viewerId === targetId) {
        followBtn.textContent = "This is you";
        followBtn.disabled = true;
        return;
    }

    async function refreshFollowState() {
        const ok = await isFollowing(viewerId, targetId);
        followBtn.textContent = ok ? "Following" : "Follow";
        followBtn.classList.toggle("isFollowing", ok);
    }

    await refreshFollowState();

    followBtn.onclick = async () => {
        followBtn.disabled = true;
        try {
            const res = await toggleFollow(targetId); // { following: true/false }
            followBtn.textContent = res?.following ? "Following" : "Follow";
            followBtn.classList.toggle("isFollowing", !!res?.following);

            await refreshCounts();
        } catch (e) {
            console.error(e);
            alert(e?.message || "Follow action failed");
        } finally {
            followBtn.disabled = false;
        }
    };
})();
