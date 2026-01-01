// /assets/follow-ui.js
(() => {
    async function apiToggleFollow(targetUid) {
        const jwt = localStorage.getItem("sm_jwt");
        const r = await fetch("/.netlify/functions/toggle_follow", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(jwt ? { "X-Appwrite-JWT": jwt } : {}),
            },
            body: JSON.stringify({ following_uid: targetUid }),
        });

        const txt = await r.text().catch(() => "");
        let data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch { data = { raw: txt }; }

        if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
        return data; // { ok, following }
    }

    function setState(btn, isFollowing) {
        btn.dataset.following = isFollowing ? "1" : "0";
        btn.classList.toggle("isFollowing", !!isFollowing);
        btn.textContent = isFollowing ? "Following" : "Follow";
        btn.setAttribute("aria-pressed", isFollowing ? "true" : "false");
    }

    function bind(btn) {
        if (btn.dataset.bound === "1") return;
        btn.dataset.bound = "1";

        btn.addEventListener("click", async () => {
            if (btn.dataset.loading === "1") return;

            const targetUid = btn.dataset.targetUid;
            if (!targetUid) return;

            const prev = btn.dataset.following === "1";
            const next = !prev;

            // ✅ optimistic
            btn.dataset.loading = "1";
            btn.classList.add("isLoading");
            setState(btn, next);

            try {
                const res = await apiToggleFollow(targetUid);
                // ✅ server truth
                setState(btn, !!res.following);
            } catch (e) {
                // ❌ rollback
                console.error("toggle_follow failed:", e);
                setState(btn, prev);
                alert(e?.message || "Follow error");
            } finally {
                btn.dataset.loading = "0";
                btn.classList.remove("isLoading");
            }
        });
    }

    function attach(root = document) {
        root.querySelectorAll(".followBtn[data-target-uid]").forEach(bind);
    }

    // initial
    document.addEventListener("DOMContentLoaded", () => attach(document));

    // if feed loads dynamically, call this after rendering:
    window.attachFollowButtons = attach;
})();
