// /assets1/sidebar.js
// ✅ Loads /components/sidebar.html into #sidebarMount
// ✅ Active menu highlight
// ✅ Pin / collapse remember (localStorage)
// ✅ Mobile drawer (hamburger + backdrop + close)
// ✅ Profile dropdown
// ✅ Logout works (Appwrite)

(() => {
    const SIDEBAR_HTML = "/components/sidebar.html";
    const LS_PIN = "sm_sidebar_pinned"; // "1" pinned, "0" not pinned

    const mountId = "sidebarMount";

    function $(id) { return document.getElementById(id); }

    function setAria(el, key, val) {
        if (!el) return;
        el.setAttribute(key, String(val));
    }

    function pageKeyFromPath() {
        const seg = (location.pathname.split("/")[1] || "").toLowerCase();
        // examples: feed, post, signal, news, tools, marketplace, messages, u, profile, auth
        if (seg === "profile") return "settings"; // settings page
        if (seg === "u") return "profile";
        if (seg === "messages") return "messages";
        return seg;
    }

    function applyActive(sidebarEl) {
        const key = pageKeyFromPath();
        sidebarEl.querySelectorAll(".smSbItem").forEach(a => {
            const on = (a.dataset.page || "").toLowerCase() === key;
            a.classList.toggle("active", on);
        });
    }

    function applyPinState(sidebarEl) {
        const pinned = localStorage.getItem(LS_PIN) === "1";
        sidebarEl.classList.toggle("isPinned", pinned);

        const btn = $("smSbPinBtn");
        if (btn) setAria(btn, "aria-pressed", pinned ? "true" : "false");
    }

    function closeProfileMenu() {
        const btn = $("smSbProfileBtn");
        const menu = $("smSbMenu");
        if (!btn || !menu) return;
        btn.classList.remove("open");
        setAria(btn, "aria-expanded", "false");
        setAria(menu, "aria-hidden", "true");
    }

    function toggleProfileMenu() {
        const btn = $("smSbProfileBtn");
        const menu = $("smSbMenu");
        if (!btn || !menu) return;

        const open = btn.classList.toggle("open");
        setAria(btn, "aria-expanded", open ? "true" : "false");
        setAria(menu, "aria-hidden", open ? "false" : "true");
    }

    function closeMobileDrawer() {
        const sb = $("smSidebar");
        const bd = $("smSbBackdrop");
        const close = $("smSbClose");
        if (!sb || !bd || !close) return;

        sb.classList.remove("isMobileOpen");
        setAria(bd, "aria-hidden", "true");
    }

    function openMobileDrawer() {
        const sb = $("smSidebar");
        const bd = $("smSbBackdrop");
        const close = $("smSbClose");
        if (!sb || !bd || !close) return;

        sb.classList.add("isMobileOpen");
        setAria(bd, "aria-hidden", "false");
    }

    async function doLogout() {
        // 1) try Appwrite sign out
        try {
            const mod = await import("/assets/appwrite.js");
            if (mod?.account?.deleteSession) {
                await mod.account.deleteSession("current");
            }
        } catch (e) {
            console.warn("logout: appwrite deleteSession failed (non-blocking)", e);
        }

        // 2) clear local tokens
        try {
            localStorage.removeItem("sm_uid");
            localStorage.removeItem("sm_jwt");
        } catch (e) {}

        // 3) redirect login
        location.href = "/auth/login.html";
    }

    async function hydrateProfile() {
        // Sidebar name/mail/avatar initial
        const nameEl = $("smSbName");
        const mailEl = $("smSbMail");
        const avaEl  = $("smSbAvatar");

        // from localStorage first (fast)
        const cachedName = localStorage.getItem("sm_name");
        const cachedMail = localStorage.getItem("sm_email");
        if (cachedName && nameEl) nameEl.textContent = cachedName;
        if (cachedMail && mailEl) mailEl.textContent = cachedMail;
        if (avaEl && (cachedName || cachedMail)) {
            const letter = (cachedName || cachedMail || "S").trim()[0]?.toUpperCase() || "S";
            avaEl.textContent = letter;
        }

        // then Appwrite (truth)
        try {
            const mod = await import("/assets/appwrite.js");
            if (!mod?.account?.get) return;
            const user = await mod.account.get();

            const nm = (user?.name || "").trim();
            const em = (user?.email || "").trim();

            if (nm && nameEl) nameEl.textContent = nm;
            if (em && mailEl) mailEl.textContent = em;

            if (avaEl) {
                const letter = (nm || em || "S")[0]?.toUpperCase() || "S";
                avaEl.textContent = letter;
            }

            // cache
            if (nm) localStorage.setItem("sm_name", nm);
            if (em) localStorage.setItem("sm_email", em);
        } catch (e) {
            // not logged in or module fail -> keep cached
            console.warn("sidebar profile hydrate skipped:", e?.message || e);
        }
    }

    async function init() {
        const mount = document.getElementById(mountId);
        if (!mount) return; // some pages may not have sidebar

        // Load HTML
        const res = await fetch(SIDEBAR_HTML, { cache: "no-store" });
        if (!res.ok) {
            console.error("sidebar.html not found:", SIDEBAR_HTML);
            return;
        }
        mount.innerHTML = await res.text();

        const sidebarEl = $("smSidebar");
        if (!sidebarEl) return;

        // Active menu
        applyActive(sidebarEl);

        // Pin state
        applyPinState(sidebarEl);

        // Profile info
        hydrateProfile();

        // Pin button
        const pinBtn = $("smSbPinBtn");
        pinBtn?.addEventListener("click", () => {
            const pinned = !(localStorage.getItem(LS_PIN) === "1");
            localStorage.setItem(LS_PIN, pinned ? "1" : "0");
            applyPinState(sidebarEl);
        });

        // Profile dropdown
        const profileBtn = $("smSbProfileBtn");
        profileBtn?.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleProfileMenu();
        });

        // Outside click closes menu
        document.addEventListener("click", () => closeProfileMenu());

        // Escape closes menu + drawer
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                closeProfileMenu();
                closeMobileDrawer();
            }
        });

        // Mobile drawer controls
        $("smSbMobileHamb")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            openMobileDrawer();
        });

        $("smSbBackdrop")?.addEventListener("click", () => {
            closeMobileDrawer();
            closeProfileMenu();
        });

        $("smSbClose")?.addEventListener("click", () => {
            closeMobileDrawer();
            closeProfileMenu();
        });

        // Logout
        $("smSbLogout")?.addEventListener("click", async (e) => {
            e.preventDefault();
            await doLogout();
        });

        console.log("✅ sidebar.js loaded (hover + pin + menu + logout)");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
