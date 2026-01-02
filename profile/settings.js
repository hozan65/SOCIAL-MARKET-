// /profile/settings.js (FULL)
(() => {
    const $ = (id) => document.getElementById(id);

    function setMsg(id, text, type) {
        const el = $(id);
        if (!el) return;
        el.textContent = text || "";
        el.className = "pMsg" + (type ? " " + type : "");
    }

    // ===== Tabs (same page) =====
    const btns = document.querySelectorAll(".pNavItem[data-tab]");
    const panels = {
        public: $("tab-public"),
        security: $("tab-security"),
        social: $("tab-social"),
        email: $("tab-email"),
    };

    function openTab(key) {
        btns.forEach((b) => b.classList.toggle("active", b.dataset.tab === key));
        Object.entries(panels).forEach(([k, el]) => {
            if (!el) return;
            el.classList.toggle("show", k === key);
        });
        history.replaceState(null, "", "#" + key);
    }

    btns.forEach((b) => b.addEventListener("click", () => openTab(b.dataset.tab)));
    const hash = (location.hash || "").replace("#", "");
    openTab(panels[hash] ? hash : "public");

    // ===== Delete modal =====
    const modal = $("deleteModal");
    const openM = () => { if (modal) modal.hidden = false; };
    const closeM = () => { if (modal) modal.hidden = true; };

    $("deleteAccountBtn")?.addEventListener("click", openM);
    $("cancelDeleteBtn")?.addEventListener("click", closeM);
    modal?.addEventListener("click", (e) => {
        if (e.target?.dataset?.close) closeM();
    });

    // ===== HARD DELETE =====
    $("confirmDeleteBtn")?.addEventListener("click", async () => {
        const btn = $("confirmDeleteBtn");
        try {
            if (btn) btn.disabled = true;
            setMsg("secMsg", "Deleting account...", "");

            const jwt = localStorage.getItem("sm_jwt");
            if (!jwt) throw new Error("Missing JWT. Please login again.");

            const res = await fetch("/.netlify/functions/account_delete_hard", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + jwt,
                },
                body: JSON.stringify({ hard: true }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.error || "Delete failed");

            // cleanup + redirect
            localStorage.removeItem("sm_jwt");
            localStorage.removeItem("sm_uid");

            closeM();
            location.href = "/";

        } catch (e) {
            closeM();
            setMsg("secMsg", e?.message || "Delete failed", "err");
            alert(e?.message || "Delete failed");
        } finally {
            if (btn) btn.disabled = false;
        }
    });
})();
