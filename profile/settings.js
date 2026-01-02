// /profile/settings.js (FULL)
// Tabs + Delete modal + Hard delete + Change password (Appwrite)

import { account } from "/assets/appwrite.js";

(() => {
    const $ = (id) => document.getElementById(id);

    // =========================
    // Tabs
    // =========================
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
    openTab(hash && panels[hash] ? hash : "public");

    // =========================
    // Helpers (msgs)
    // =========================
    const secMsg = $("secMsg");
    function showSec(text, isErr = false) {
        if (!secMsg) return;
        secMsg.textContent = text || "";
        secMsg.className = "pMsg " + (isErr ? "err" : "ok");
    }

    // =========================
    // Password change (Appwrite)
    // =========================
    const updatePasswordBtn = $("updatePasswordBtn");
    updatePasswordBtn?.addEventListener("click", async () => {
        const cur = $("curPass")?.value?.trim() || "";
        const n1 = $("newPass")?.value?.trim() || "";
        const n2 = $("newPass2")?.value?.trim() || "";

        if (!cur || !n1 || !n2) return showSec("All password fields are required.", true);
        if (n1.length < 8) return showSec("New password must be at least 8 characters.", true);
        if (n1 !== n2) return showSec("New passwords do not match.", true);

        updatePasswordBtn.disabled = true;

        try {
            showSec("Updating password...");
            await account.updatePassword(n1, cur); // ✅ Appwrite

            // ✅ Şifre değişti -> login düşmez, user içeride kalır
            showSec("Password updated successfully.", false);

            $("curPass").value = "";
            $("newPass").value = "";
            $("newPass2").value = "";

        } catch (e) {
            console.error("updatePassword failed:", e);
            showSec(e?.message || "Password update failed.", true);
        } finally {
            updatePasswordBtn.disabled = false;
        }
    });

    // =========================
    // Delete Modal open/close
    // =========================
    const modal = $("deleteModal");
    const openM = () => { if (modal) modal.hidden = false; };
    const closeM = () => { if (modal) modal.hidden = true; };

    $("deleteAccountBtn")?.addEventListener("click", openM);
    $("cancelDeleteBtn")?.addEventListener("click", closeM);

    modal?.addEventListener("click", (e) => {
        if (e.target?.dataset?.close) closeM();
    });

    // =========================
    // Hard Delete (Netlify function)
    // =========================
    const confirmDeleteBtn = $("confirmDeleteBtn");

    async function hardDelete() {
        const msg = $("secMsg") || $("pMsg");

        const jwt = localStorage.getItem("sm_jwt");
        const uid = localStorage.getItem("sm_uid");

        if (!jwt) {
            if (msg) { msg.className = "pMsg err"; msg.textContent = "No token (sm_jwt). Logout/Login again."; }
            return;
        }
        if (!uid) {
            if (msg) { msg.className = "pMsg err"; msg.textContent = "No user id (sm_uid). Logout/Login again."; }
            return;
        }

        try {
            if (msg) { msg.className = "pMsg"; msg.textContent = "Deleting account..."; }
            confirmDeleteBtn && (confirmDeleteBtn.disabled = true);

            const res = await fetch("/.netlify/functions/account_delete_hard", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${jwt}`,
                },
                // ✅ userId gönderiyoruz (backend isterse hazır)
                body: JSON.stringify({ confirm: true, userId: uid }),
            });

            const text = await res.text();
            let data = {};
            try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

            if (!res.ok) {
                console.error("delete failed:", res.status, data);
                if (msg) {
                    msg.className = "pMsg err";
                    msg.textContent = `Delete failed (${res.status}): ${data?.error || data?.detail || data?.raw || "Unknown error"}`;
                }
                return;
            }

            // ✅ başarılı: local temizle + anasayfa
            localStorage.clear();
            sessionStorage.clear();

            closeM();

            if (msg) { msg.className = "pMsg ok"; msg.textContent = "Account deleted. Redirecting..."; }

            setTimeout(() => {
                location.href = "/index.html";
            }, 300);

        } catch (e) {
            console.error("hardDelete exception:", e);
            if (msg) { msg.className = "pMsg err"; msg.textContent = "Delete error: " + (e?.message || e); }
        } finally {
            confirmDeleteBtn && (confirmDeleteBtn.disabled = false);
        }
    }

    confirmDeleteBtn?.addEventListener("click", hardDelete);

})();
