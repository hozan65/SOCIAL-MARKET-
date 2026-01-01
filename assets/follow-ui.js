// /assets/follow-ui.js
(function () {
    function $(sel, root = document) { return root.querySelector(sel); }
    function toInt(x) { const n = parseInt(String(x ?? "0"), 10); return Number.isFinite(n) ? n : 0; }

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

        const text = await r.text().catch(() => "");
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

        if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
        return data; // { ok, following, followers_count, following_count }
    }

    function setBtnState(btn, isFollowing) {
        btn.dataset.following = isFollowing ? "1" : "0";
        btn.classList.toggle("isFollowing", !!isFollowing);
        btn.textContent = isFollowing ? "Following" : "Follow";
    }

    function bump(el, delta) {
        if (!el) return;
        el.textContent = String(Math.max(0, toInt(el.textContent) + delta));
    }

    // ✅ Public: attachFollowButtons()
    window.attachFollowButtons = function attachFollowButtons(root = document) {
        root.querySelectorAll(".followBtn[data-target-uid]").forEach((btn) => {
            if (btn.dataset.bound === "1") return;
            btn.dataset.bound = "1";

            btn.addEventListener("click", async () => {
                if (btn.dataset.loading === "1") return;

                const targetUid = btn.dataset.targetUid;
                if (!targetUid) return;

                // --- optimistic snapshot
                const prevFollowing = btn.dataset.following === "1";
                const prevText = btn.textContent;

                const followersEl = $("#followersCount");   // profil sahibinin follower sayısı
                const followingEl = $("#followingCount");   // benim following sayım (profilde göstermek istiyorsan)

                // --- optimistic apply
                btn.dataset.loading = "1";
                btn.classList.add("isLoading");

                const nextFollowing = !prevFollowing;
                setBtnState(btn, nextFollowing);

                // takip ediyorsam followers +1, bırakırsam -1
                bump(followersEl, nextFollowing ? +1 : -1);

                try {
                    const data = await apiToggleFollow(targetUid);

                    // --- authoritative set (server’dan gelen kesin sayılar)
                    setBtnState(btn, !!data.following);

                    if (followersEl && data.followers_count != null) {
                        followersEl.textContent = String(data.followers_count);
                    }
                    if (followingEl && data.following_count != null) {
                        followingEl.textContent = String(data.following_count);
                    }

                    // ✅ realtime broadcast varsa (aşağıdaki bölüm) burada tetikleyebiliriz:
                    if (window.rt?.socket) {
                        window.rt.socket.emit("follow:changed", {
                            target_uid: targetUid,
                            following: !!data.following,
                            followers_count: data.followers_count,
                        });
                    }
                } catch (err) {
                    // --- rollback
                    console.error("toggle_follow failed:", err);
                    btn.textContent = prevText;
                    setBtnState(btn, prevFollowing);
                    bump(followersEl, prevFollowing ? 0 : (nextFollowing ? -1 : +1)); // güvenli geri dönüş
                    alert(err?.message || "Follow error");
                } finally {
                    btn.dataset.loading = "0";
                    btn.classList.remove("isLoading");
                }
            });
        });
    };

    // Auto-bind
    document.addEventListener("DOMContentLoaded", () => {
        window.attachFollowButtons(document);
    });
})();
