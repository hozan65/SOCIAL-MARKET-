// /profile/settings.js (FULL)
// Tabs + Delete modal + Hard delete call (expects Authorization Bearer token)

(() => {
    /* ---------------------------
       Helpers
    --------------------------- */
    const $ = (id) => document.getElementById(id);

    function setMsg(el, text, ok = false) {
        if (!el) return;
        el.textContent = text || "";
        el.classList.remove("ok", "err");
        if (text) el.classList.add(ok ? "ok" : "err");
    }

    // Try to find a token from common places
    function getAuthToken() {
        // 1) direct keys
        const direct =
            localStorage.getItem("appwrite_jwt") ||
            localStorage.getItem("jwt") ||
            localStorage.getItem("token") ||
            localStorage.getItem("access_token") ||
            sessionStorage.getItem("appwrite_jwt") ||
            sessionStorage.getItem("jwt") ||
            sessionStorage.getItem("token") ||
            sessionStorage.getItem("access_token");

        if (direct && direct.length > 10) return direct;

        // 2) supabase auth storage (common)
        // examples:
        // sb-xxxx-auth-token : {"access_token":"...","refresh_token":"..."}
        for (const k of Object.keys(localStorage)) {
            if (!k) continue;
            if (k.includes("sb-") && k.includes("auth-token")) {
                try {
                    const obj = JSON.parse(localStorage.getItem(k) || "{}");
                    if (obj?.access_token) return obj.access_token;
                } catch {}
            }
        }

        // 3) appwrite session stored as json (if you store it)
        // e.g. appwrite_session: {"jwt":"..."}
        for (const k of Object.keys(localStorage)) {
            try {
                const raw = localStorage.getItem(k);
                if (!raw || raw.length < 20) continue;
                if (raw.trim().startsWith("{")) {
                    const obj = JSON.parse(raw);
                    if (obj?.jwt && String(obj.jwt).length > 10) return obj.jwt;
                    if (obj?.token && String(obj.token).length > 10) return obj.token;
                    if (obj?.access_token && String(obj.access_token).length > 10) return obj.access_token;
                }
            } catch {}
        }

        return null;
    }

    /* ---------------------------
       Tabs (same-page panels)
    --------------------------- */
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
    if (hash && panels[hash]) openTab(hash);
    else openTab("public");

    /* ---------------------------
       Delete modal
    --------------------------- */
    const modal = $("deleteModal");
    const openM = () => { if (modal) modal.hidden = false; };
    const closeM = () => { if (modal) modal.hidden = true; };

    $("deleteAccountBtn")?.addEventListener("click", openM);
    $("cancelDeleteBtn")?.addEventListener("click", closeM);
    modal?.addEventListener("click", (e) => {
        if (e.target && e.target.dataset && e.target.dataset.close) closeM();
    });

    /* ---------------------------
       HARD DELETE call
       - expects /.netlify/functions/account_delete_hard
       - requires Authorization Bearer <token>
    --------------------------- */
    async function hardDeleteAccount() {
        const token = getAuthToken();

        if (!token) {
            closeM();
            alert("Token yok. Önce giriş yapmalısın. (Login ekranına atıyorum)");
            location.href = "/login/index.html";
            return;
        }

        // Disable button while running
        const btn = $("confirmDeleteBtn");
        if (btn) {
            btn.disabled = true;
            btn.textContent = "Deleting...";
        }

        try {
            const res = await fetch("/.netlify/functions/account_delete_hard", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + token,
                },
                body: JSON.stringify({ hard: true }),
            });

            let data = {};
            try { data = await res.json(); } catch {}

            if (!res.ok) {
                console.error("hard delete failed:", res.status, data);
                alert((data && (data.error || data.message)) || ("Delete failed: " + res.status));
                return;
            }

            // Success: wipe storage and redirect home
            localStorage.clear();
            sessionStorage.clear();
            closeM();
            location.href = "/index.html";

        } catch (err) {
            console.error(err);
            alert("Network error while deleting account.");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = "Delete";
            }
        }
    }

    $("confirmDeleteBtn")?.addEventListener("click", hardDeleteAccount);

})();
