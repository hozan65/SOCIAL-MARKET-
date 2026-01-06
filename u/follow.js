// /u/follow.js
console.log("✅ follow.js loaded");

const API_BASE = "https://api.chriontoken.com";

const btn = document.getElementById("followBtn");
const msg = document.getElementById("followMsg");

function qs(k) { return new URLSearchParams(location.search).get(k); }
function jwt() { return (window.SM_JWT || localStorage.getItem("sm_jwt") || "").trim(); }

function setMsg(t) { if (msg) msg.textContent = t || ""; }

async function isFollowing(targetUuid) {
    const token = jwt();
    if (!token) return null;

    const r = await fetch(`${API_BASE}/api/follows/is_following?target=${encodeURIComponent(targetUuid)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return !!j.is_following;
}

async function toggleFollow(targetUuid) {
    const token = jwt();
    if (!token) throw new Error("Login required");

    const r = await fetch(`${API_BASE}/api/follows/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ target: targetUuid }),
        cache: "no-store",
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
}

async function init() {
    if (!btn) return;

    // hedef profil uuid: ?id=<USER_UUID>
    const targetUuid = String(qs("id") || "").trim();
    if (!targetUuid) {
        btn.disabled = true;
        btn.textContent = "Follow";
        return;
    }

    if (!jwt()) {
        btn.disabled = true;
        btn.textContent = "Login";
        setMsg("Login required");
        return;
    }

    // initial state
    try {
        const f = await isFollowing(targetUuid);
        btn.textContent = f ? "Following" : "Follow";
        btn.classList.toggle("isFollowing", !!f);
    } catch (e) {
        console.error(e);
        setMsg("❌ " + (e?.message || e));
    }

    btn.addEventListener("click", async () => {
        const prevText = btn.textContent;
        const prevFollowing = btn.classList.contains("isFollowing");

        // optimistic
        btn.textContent = prevFollowing ? "Follow" : "Following";
        btn.classList.toggle("isFollowing", !prevFollowing);
        btn.disabled = true;

        try {
            const out = await toggleFollow(targetUuid);
            const following = !!out.is_following;
            btn.textContent = following ? "Following" : "Follow";
            btn.classList.toggle("isFollowing", following);
            setMsg("✅ Updated");
            setTimeout(() => setMsg(""), 800);
        } catch (e) {
            console.error(e);
            btn.textContent = prevText;
            btn.classList.toggle("isFollowing", prevFollowing);
            setMsg("❌ " + (e?.message || e));
        } finally {
            btn.disabled = false;
        }
    });
}

init();
