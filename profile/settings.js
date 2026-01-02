// /profile/settings.js
(() => {
    /* =========================
       HELPERS
    ========================= */
    const $ = (id) => document.getElementById(id);

    function setMsg(id, text, type) {
        const el = $(id);
        if (!el) return;
        el.textContent = text || "";
        el.className = "pMsg" + (type ? " " + type : "");
    }

    /* =========================
       TAB SWITCH (SAME PAGE)
    ========================= */
    const tabButtons = document.querySelectorAll(".pNavItem[data-tab]");
    const panels = {
        public: $("tab-public"),
        security: $("tab-security"),
        social: $("tab-social"),
        email: $("tab-email"),
    };

    function openTab(key) {
        tabButtons.forEach((btn) =>
            btn.classList.toggle("active", btn.dataset.tab === key)
        );

        Object.entries(panels).forEach(([k, panel]) => {
            if (!panel) return;
            panel.classList.toggle("show", k === key);
        });

        history.replaceState(null, "", "#" + key);
    }

    tabButtons.forEach((btn) => {
        btn.addEventListener("click", () => openTab(btn.dataset.tab));
    });

    // initial tab
    const hash = (location.hash || "").replace("#", "");
    if (hash && panels[hash]) openTab(hash);
    else openTab("public");

    /* =========================
       DELETE ACCOUNT MODAL
    ========================= */
    const deleteModal = $("deleteModal");

    function openDeleteModal() {
        if (deleteModal) deleteModal.hidden = false;
    }
    function closeDeleteModal() {
        if (deleteModal) deleteModal.hidden = true;
    }

    $("deleteAccountBtn")?.addEventListener("click", openDeleteModal);
    $("cancelDeleteBtn")?.addEventListener("click", closeDeleteModal);

    deleteModal?.addEventListener("click", (e) => {
        if (e.target?.dataset?.close) closeDeleteModal();
    });

    /* =========================
       HARD DELETE ACCOUNT
    ========================= */
    async function deleteAccountHard() {
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
            if (!res.ok) {
                throw new Error(data?.error || "Delete failed");
            }

            // ✅ client cleanup
            localStorage.removeItem("sm_jwt");
            localStorage.removeItem("sm_uid");

            // ✅ redirect home
            closeDeleteModal();
            location.href = "/";

        } catch (err) {
            closeDeleteModal();
            setMsg("secMsg", err?.message || "Delete failed", "err");
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    $("confirmDeleteBtn")?.addEventListener("click", deleteAccountHard);

})();
