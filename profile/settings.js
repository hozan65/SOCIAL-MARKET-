// /profile/settings.js (NO IMPORT - works as normal script)
// Tabs + modal + hard delete + password change via window.account

(() => {
    const $ = (id) => document.getElementById(id);

    // ---- tabs
    const btns = document.querySelectorAll(".pNavItem[data-tab]");
    const panels = {
        public: $("tab-public"),
        security: $("tab-security"),
        social: $("tab-social"),
        email: $("tab-email"),
    };

    function openTab(key) {
        btns.forEach((b) => b.classList.toggle("active", b.dataset.tab === key));
        Object.entries(panels).forEach(([k, el]) => el && el.classList.toggle("show", k === key));
        history.replaceState(null, "", "#" + key);
    }

    btns.forEach((b) => b.addEventListener("click", () => openTab(b.dataset.tab)));
    const hash = (location.hash || "").replace("#", "");
    openTab(hash && panels[hash] ? hash : "public");

    // ---- msg helper
    const secMsg = $("secMsg") || $("pMsg");
    const setMsg = (t, err = false) => {
        if (!secMsg) return;
        secMsg.textContent = t || "";
        secMsg.className = "pMsg " + (err ? "err" : "ok");
    };

    // ---- delete modal
    const modal = $("deleteModal");
    const openM = () => { if (modal) modal.hidden = false; };
    const closeM = () => { if (modal) modal.hidden = true; };

    $("deleteAccountBtn")?.addEventListener("click", openM);
    $("cancelDeleteBtn")?.addEventListener("click", closeM);
    modal?.addEventListener("click", (e) => { if (e.target?.dataset?.close) closeM(); });

    // ---- hard delete
    $("confirmDeleteBtn")?.addEventListener("click", async () => {
        const jwt = localStorage.getItem("sm_jwt");
        const uid = localStorage.getItem("sm_uid");
        if (!jwt) return setMsg("No token (sm_jwt). Logout/Login again.", true);
        if (!uid) return setMsg("No user id (sm_uid). Logout/Login again.", true);

        try {
            setMsg("Deleting account...");
            const res = await fetch("/.netlify/functions/account_delete_hard", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + jwt,
                },
                body: JSON.stringify({ confirm: true, userId: uid }),
            });

            const raw = await res.text();
            let data = {};
            try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }

            if (!res.ok) return setMsg(`Delete failed (${res.status}): ${data.error || data.detail || data.raw || "Unknown"}`, true);

            localStorage.clear();
            sessionStorage.clear();
            closeM();
            setMsg("Account deleted. Redirecting...");
            setTimeout(() => (location.href = "/index.html"), 250);
        } catch (e) {
            console.error(e);
            setMsg("Delete error: " + (e?.message || e), true);
        }
    });

    // ---- password change (needs window.account from appwrite-init.js)
    $("updatePasswordBtn")?.addEventListener("click", async () => {
        const cur = $("curPass")?.value?.trim() || "";
        const n1 = $("newPass")?.value?.trim() || "";
        const n2 = $("newPass2")?.value?.trim() || "";

        if (!cur || !n1 || !n2) return setMsg("All password fields are required.", true);
        if (n1.length < 8) return setMsg("New password must be at least 8 characters.", true);
        if (n1 !== n2) return setMsg("New passwords do not match.", true);

        // ✅ window.account yoksa password change yapamaz
        if (!window.account?.updatePassword) {
            return setMsg("Appwrite account client not ready (window.account missing).", true);
        }

        try {
            setMsg("Updating password...");
            await window.account.updatePassword(n1, cur);
            setMsg("Password updated successfully.");
            $("curPass").value = "";
            $("newPass").value = "";
            $("newPass2").value = "";
        } catch (e) {
            console.error(e);
            setMsg(e?.message || "Password update failed.", true);
        }
    });
})();
