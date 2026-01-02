// /profile/settings.js (FULL)

(() => {
    const $ = (id) => document.getElementById(id);

    // Tabs
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

    // Modal
    const modal = $("deleteModal");
    const openM = () => { if (modal) modal.hidden = false; };
    const closeM = () => { if (modal) modal.hidden = true; };

    $("deleteAccountBtn")?.addEventListener("click", openM);
    $("cancelDeleteBtn")?.addEventListener("click", closeM);
    modal?.addEventListener("click", (e) => {
        if (e.target?.dataset?.close) closeM();
    });

    // HARD DELETE
    async function hardDelete() {
        const jwt = localStorage.getItem("sm_jwt"); // ✅ auth-ui.js artık bunu üretiyor
        if (!jwt) {
            closeM();
            alert("JWT yok. Çıkış yapıp tekrar giriş yap.");
            location.href = "/auth/login.html";
            return;
        }

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

            // ✅ başarılı: her şeyi temizle + ana sayfa
            localStorage.clear();
            sessionStorage.clear();
            closeM();
            location.href = "/index.html";
        } catch (e) {
            console.error(e);
            alert("Network error");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = "Delete";
            }
        }
