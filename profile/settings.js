// /profile/settings.js (FINAL - sm-api only, NO Netlify)
// ✅ Tabs + delete modal + hard delete + password change
// ✅ Settings load/save via sm-api (JWT)
// ✅ Uses sm_uid only for UI; server uses JWT for identity

(() => {
    const $ = (id) => document.getElementById(id);

    const API_BASE = "https://api.chriontoken.com";

    // ✅ New endpoints (Hetzner / sm-api)
    const API_DELETE_HARD = `${API_BASE}/api/account/delete_hard`;
    const API_SETTINGS_ME_GET = `${API_BASE}/api/settings/me`;
    const API_SETTINGS_ME_PUT = `${API_BASE}/api/settings/me`;

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
    // Helpers
    // ------------------------
    function getJWT() {
        const jwt = (window.SM_JWT || localStorage.getItem("sm_jwt") || "").trim();
        if (!jwt) throw new Error("No token (sm_jwt). Logout/Login again.");
        return jwt;
    }

    async function apiJson(url, { method = "GET", body } = {}) {
        const jwt = getJWT();

        const r = await fetch(url, {
            method,
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + jwt,
            },
            body: body ? JSON.stringify(body) : undefined,
            cache: "no-store",
        });

        const out = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(out?.error || out?.detail || `${method} failed (${r.status})`);
        return out;
    }

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
    // Hard delete (sm-api)
    // ------------------------
    $("confirmDeleteBtn")?.addEventListener("click", async () => {
        try {
            setMsg("Deleting account...");

            // ✅ IMPORTANT: server MUST delete by JWT user (ignore any userId from client)
            await apiJson(API_DELETE_HARD, { method: "POST", body: { confirm: true } });

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
    // Password change (Appwrite)
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

    // ------------------------
    // SETTINGS (theme)
    // ------------------------
    async function loadSettings() {
        try {
            const r = await apiJson(API_SETTINGS_ME_GET);
            const themeEl = $("theme");
            if (themeEl && r?.settings?.theme) themeEl.value = r.settings.theme;
        } catch (e) {
            console.warn("loadSettings failed:", e);
            // sessiz geçebiliriz
        }
    }

    async function saveSettings() {
        try {
            setMsg("Saving settings...");

            await apiJson(API_SETTINGS_ME_PUT, {
                method: "PUT",
                body: { theme: $("theme")?.value || "system" },
            });

            setMsg("Settings saved.");
            setTimeout(() => setMsg(""), 1000);

        } catch (e) {
            console.error(e);
            setMsg(e?.message || "Save settings failed.", true);
        }
    }

    $("saveSettingsBtn")?.addEventListener("click", saveSettings);

    loadSettings();
})();
