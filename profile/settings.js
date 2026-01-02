// /profile/settings.js (FULL, NO MODULE)
// Tabs + Delete modal + Hard delete call via sm_jwt

(() => {
    const $ = (id) => document.getElementById(id);

    // -------------------------
    // Tabs (same page panels)
    // -------------------------
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

    btns.forEach((b) =>
        b.addEventListener("click", () => openTab(b.dataset.tab))
    );

    const hash = (location.hash || "").replace("#", "");
    openTab(hash && panels[hash] ? hash : "public");

    // -------------------------
    // Delete modal open/close
    // -------------------------
    const modal = $("deleteModal");
    const openM = () => { if (modal) modal.hidden = false; };
    const closeM = () => { if (modal) modal.hidden = true; };

    const deleteBtn = $("deleteAccountBtn");
    const cancelBtn = $("cancelDeleteBtn");
    const confirmBtn = $("confirmDeleteBtn");

    deleteBtn && deleteBtn.addEventListener("click", openM);
    cancelBtn && cancelBtn.addEventListener("click", closeM);

    if (modal) {
        modal.addEventListener("click", (e) => {
            if (e.target && e.target.dataset && e.target.dataset.close) closeM();
        });
    }

    // -------------------------
    // Hard delete
    // -------------------------
    async function hardDelete() {
        const jwt = localStorage.getItem("sm_jwt");

        if (!jwt) {
            closeM();
            alert("JWT yok. Logout/Login yap.");
            location.href = "/auth/login.html";
            return;
        }

        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = "Deleting...";
        }

        try {
            const res = await fetch("/.netlify/functions/account_delete_hard", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + jwt,
                },
                body: JSON.stringify({ hard: true }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                console.error("delete failed:", res.status, data);
                alert(data?.error || data?.message || ("Delete failed: " + res.status));
                return;
            }

            // success
            localStorage.clear();
            sessionStorage.clear();
            closeM();
            location.href = "/index.html";
        } catch (err) {
            console.error(err);
            alert("Network error while deleting account.");
        } finally {
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = "Delete";
            }
        }
    }

    confirmBtn && confirmBtn.addEventListener("click", hardDelete);
})();
