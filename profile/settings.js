// /profile/settings.js
// ✅ NO IMPORT (normal script)
// ✅ Tabs + delete modal + hard delete + password change
// ✅ Settings load/save via window.smGet/window.smPut (or fallback fetch)
// ✅ Uses sm_uid (not appwrite_uid)

(() => {
    const $ = (id) => document.getElementById(id);

    // ------------------------
    // Tabs
    // ------------------------
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

    // ------------------------
    // Msg helper
    // ------------------------
    const secMsg = $("secMsg") || $("pMsg");
    const setMsg = (t, err = false) => {
        if (!secMsg) return;
        secMsg.textContent = t || "";
        secMsg.className = "pMsg " + (err ? "err" : "ok");
    };

    // ------------------------
    // Delete modal
    // ------------------------
    const modal = $("deleteModal");
    const openM = () => { if (modal) modal.hidden = false; };
    const closeM = () => { if (modal) modal.hidden = true; };

    $("deleteAccountBtn")?.addEventListener("click", openM);
    $("cancelDeleteBtn")?.addEventListener("click", closeM);
    modal?.addEventListener("click", (e) => { if (e.target?.dataset?.close) closeM(); });

    // ------------------------
    // Hard delete
    // ------------------------
    $("confirmDeleteBtn")?.addEventListener("click", async () => {
        const jwt = localStorage.getItem("sm_jwt");
        const uid = localStorage.getItem("sm_uid"); // ✅ doğru key

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

            if (!res.ok) {
                return setMsg(
                    `Delete failed (${res.status}): ${data.error || data.detail || data.raw || "Unknown"}`,
                    true
                );
            }

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

    // ------------------------
    // Password change
    // ------------------------
    $("updatePasswordBtn")?.addEventListener("click", async () => {
        const cur = $("curPass")?.value?.trim() || "";
        const n1 = $("newPass")?.value?.trim() || "";
        const n2 = $("newPass2")?.value?.trim() || "";

        if (!cur || !n1 || !n2) return setMsg("All password fields are required.", true);
        if (n1.length < 8) return setMsg("New password must be at least 8 characters.", true);
        if (n1 !== n2) return setMsg("New passwords do not match.", true);

        if (!window.account?.updatePassword) {
            return setMsg("Appwrite account client not ready (window.account missing).", true);
        }

        try {
            setMsg("Updating password...");
            await window.account.updatePassword(n1, cur);
            setMsg("Password updated successfully.");

            if ($("curPass")) $("curPass").value = "";
            if ($("newPass")) $("newPass").value = "";
            if ($("newPass2")) $("newPass2").value = "";

        } catch (e) {
            console.error(e);
            setMsg(e?.message || "Password update failed.", true);
        }
    });

    // ==========================================================
    // SETTINGS (theme vs) - NO IMPORT
    // ==========================================================
    const me = localStorage.getItem("sm_uid") || localStorage.getItem("appwrite_uid") || "";

    // fallback smGet/smPut yoksa fetch ile çalış
    async function apiGet(path) {
        if (window.smGet) return window.smGet(path);

        const jwt = localStorage.getItem("sm_jwt");
        const res = await fetch(path, {
            headers: jwt ? { "Authorization": "Bearer " + jwt } : {}
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(out?.error || `GET failed (${res.status})`);
        return out;
    }

    async function apiPut(path, body) {
        if (window.smPut) return window.smPut(path, body);

        const jwt = localStorage.getItem("sm_jwt");
        const res = await fetch(path, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                ...(jwt ? { "Authorization": "Bearer " + jwt } : {})
            },
            body: JSON.stringify(body || {})
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(out?.error || `PUT failed (${res.status})`);
        return out;
    }

    async function loadSettings() {
        if (!me) return;

        try {
            const r = await apiGet(`/api/settings?me=${encodeURIComponent(me)}`);

            const themeEl = $("theme");
            if (themeEl && r?.settings?.theme) themeEl.value = r.settings.theme;

        } catch (e) {
            console.warn("loadSettings failed:", e);
            // sessiz geçebiliriz
        }
    }

    async function saveSettings() {
        if (!me) return setMsg("Missing user id.", true);

        try {
            setMsg("Saving settings...");

            await apiPut("/api/settings", {
                me,
                theme: $("theme")?.value || "system",
            });

            setMsg("Settings saved.");
            setTimeout(() => setMsg(""), 1000);

        } catch (e) {
            console.error(e);
            setMsg(e?.message || "Save settings failed.", true);
        }
    }

    // ✅ Save button varsa bağla
    $("saveSettingsBtn")?.addEventListener("click", saveSettings);

    // theme değişince auto-save istersen:
    // $("theme")?.addEventListener("change", saveSettings);

    loadSettings();
})();
