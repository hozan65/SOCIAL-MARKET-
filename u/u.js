// /u/u.js (NO MODULE)
// Public profile viewer + follow/unfollow

console.log("✅ u.js running");

const SUPABASE_URL = "https://yzrhqduuqvllatliulqv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_dN5E6cw7uaKj7Cmmpo7RJg_W4FWxjs_";

const sb = window.supabase?.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

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
    const { data, error } = await sb
        .from("follows")
        .select("follower_id")
        .eq("follower_id", viewerId)
        .eq("following_id", targetId)
        .maybeSingle();

    if (error) throw error;
    return !!data;
}

async function follow(viewerId, targetId) {
    const { error } = await sb.from("follows").insert({
        follower_id: viewerId,
        following_id: targetId,
    });
    if (error) throw error;
}

async function unfollow(viewerId, targetId) {
    const { error } = await sb
        .from("follows")
        .delete()
        .eq("follower_id", viewerId)
        .eq("following_id", targetId);
    if (error) throw error;
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

    // Load profile row (profiles table MUST exist)
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
    try {
        const counts = await getFollowCounts(targetId);
        $("followersNum").textContent = String(counts.followers);
        $("followingNum").textContent = String(counts.following);
    } catch (e) {
        console.warn("Count load failed:", e?.message || e);
    }

    // Follow button logic
    const followBtn = $("followBtn");

    // not logged in
    if (!viewerId) {
        followBtn.textContent = "Login to follow";
        followBtn.onclick = () => (location.href = "/auth/login.html");
        return;
    }

    // viewing own public profile -> disable follow
    if (viewerId === targetId) {
        followBtn.textContent = "This is you";
        followBtn.disabled = true;
        return;
    }

    async function refresh() {
        const ok = await isFollowing(viewerId, targetId);
        followBtn.textContent = ok ? "Following" : "Follow";
        followBtn.classList.toggle("isFollowing", ok);
    }

    await refresh();

    followBtn.onclick = async () => {
        followBtn.disabled = true;
        try {
            const ok = followBtn.classList.contains("isFollowing");
            if (ok) await unfollow(viewerId, targetId);
            else await follow(viewerId, targetId);

            await refresh();

            const counts = await getFollowCounts(targetId);
            $("followersNum").textContent = String(counts.followers);
            $("followingNum").textContent = String(counts.following);
        } catch (e) {
            console.error(e);
            alert(e?.message || "Follow action failed");
        } finally {
            followBtn.disabled = false;
        }
    };
})();
