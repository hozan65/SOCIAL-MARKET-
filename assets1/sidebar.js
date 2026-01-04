// /assets1/sidebar.js
console.log("✅ sidebar.js loaded (MOBILE FIXED CLOSE + NO OVERLAP)");

/* =======================
   AUTH HELPERS
======================= */
async function smIsLoggedIn() {
    const uid = localStorage.getItem("sm_uid");
    if (uid) return true;

    try {
        const mod = await import("/assets/appwrite.js");
        if (mod?.account?.get) {
            const u = await mod.account.get();
            if (u?.$id) {
                localStorage.setItem("sm_uid", u.$id);
                return true;
            }
        }
    } catch {}
    return false;
}

async function smDoLogout() {
    try {
        const mod = await import("/assets/appwrite.js");
        if (mod?.account?.deleteSession) {
            await mod.account.deleteSession("current");
        }
    } catch (e) {
        console.warn("logout: deleteSession failed", e?.message || e);
    }

    localStorage.removeItem("sm_uid");
    localStorage.removeItem("sm_jwt");
    localStorage.removeItem("sm_name");
    localStorage.removeItem("sm_email");

    location.href = "/auth/login.html";
}

function smSetBtnMode(btn, loggedIn) {
    const label = btn.querySelector("span");
    const icon = btn.querySelector("i");

    if (!loggedIn) {
        if (label) label.textContent = "Login";
        if (icon) icon.className = "fa-solid fa-right-to-bracket";
        btn.dataset.mode = "login";
    } else {
        if (label) label.textContent = "Logout";
        if (icon) icon.className = "fa-solid fa-right-from-bracket";
        btn.dataset.mode = "logout";
    }
}

/* =======================
   SIDEBAR MOUNT
======================= */
document.addEventListener("DOMContentLoaded", async () => {
    const mount = document.getElementById("sidebarMount");
    if (!mount) return;

    try {
        /* Font Awesome */
        if (!document.getElementById("faCDN")) {
            const fa = document.createElement("link");
            fa.id = "faCDN";
            fa.rel = "stylesheet";
            fa.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css";
            document.head.appendChild(fa);
        }

        /* Sidebar CSS */
        if (!document.getElementById("smSidebarCss")) {
            const css = document.createElement("link");
            css.id = "smSidebarCss";
            css.rel = "stylesheet";
            css.href = "/styles/sidebar.css";
            document.head.appendChild(css);
        }

        /* Load sidebar HTML */
        const res = await fetch("/components/sidebar.html", { cache: "no-store" });
        if (!res.ok) throw new Error("sidebar.html not found");
        mount.innerHTML = await res.text();

        document.body.classList.add("hasSidebar");

        const sidebar = document.getElementById("smSidebar");
        const pinBtn = document.getElementById("smSbPinBtn");

        const backdrop = document.getElementById("smSbBackdrop");
        const closeBtn = document.getElementById("smSbClose");      // X
        const hamb = document.getElementById("smSbMobileHamb");     // hamburger

        const profileBtn = document.getElementById("smSbProfileBtn");
        const menu = document.getElementById("smSbMenu");

        /* Restore pin */
        const pinned = localStorage.getItem("sm_sidebar_pinned") === "1";
        sidebar?.classList.toggle("isPinned", pinned);
        pinBtn?.setAttribute("aria-pressed", pinned ? "true" : "false");

        pinBtn?.addEventListener("click", (e) => {
            e.preventDefault();
            const next = !sidebar.classList.contains("isPinned");
            sidebar.classList.toggle("isPinned", next);
            localStorage.setItem("sm_sidebar_pinned", next ? "1" : "0");
            pinBtn.setAttribute("aria-pressed", next ? "true" : "false");

            menu?.classList.remove("open");
            profileBtn?.setAttribute("aria-expanded", "false");
            menu?.setAttribute("aria-hidden", "true");
        });

        /* Active page */
        const path = location.pathname.replace(/\/+$/, "");
        const seg = path.split("/")[1] || "feed";
        const page = seg.endsWith(".html") ? seg.replace(".html", "") : seg;

        document.querySelectorAll("#smSidebar [data-page]").forEach((a) => {
            if ((a.dataset.page || "").toLowerCase() === page.toLowerCase()) {
                a.classList.add("active");
            }
        });

        /* Profile dropdown */
        const toggleMenu = (force) => {
            if (!menu) return;
            const open = force ?? !menu.classList.contains("open");
            menu.classList.toggle("open", open);
            profileBtn?.setAttribute("aria-expanded", open ? "true" : "false");
            menu.setAttribute("aria-hidden", open ? "false" : "true");
        };

        profileBtn?.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleMenu();
        });

        menu?.addEventListener("click", (e) => e.stopPropagation());
        document.addEventListener("click", () => toggleMenu(false));

        /* =======================
           MOBILE DRAWER (FIXED)
        ======================= */
        const openMobile = () => {
            if (!sidebar) return;

            sidebar.classList.add("mobileOpen");
            backdrop?.classList.add("open");

            // ✅ X butonu sidebar içinde absolute -> class gerek yok ama istersen dursun
            closeBtn?.classList.add("open");

            // ✅ hamburger üst üste binmesin
            document.body.classList.add("smSbOpen");

            // ✅ scroll kilidi
            document.documentElement.style.overflow = "hidden";
            toggleMenu(false);
        };

        const closeMobile = () => {
            sidebar?.classList.remove("mobileOpen");
            backdrop?.classList.remove("open");
            closeBtn?.classList.remove("open");

            document.body.classList.remove("smSbOpen");
            document.documentElement.style.overflow = "";
            toggleMenu(false);
        };

        hamb?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            sidebar.classList.contains("mobileOpen") ? closeMobile() : openMobile();
        });

        closeBtn?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeMobile();
        });

        backdrop?.addEventListener("click", closeMobile);
        document.addEventListener("keydown", (e) => e.key === "Escape" && closeMobile());

        /* =======================
           LOGIN / LOGOUT BUTTON
        ======================= */
        const logoutBtn = document.getElementById("smSbLogout");
        if (logoutBtn) {
            const loggedIn = await smIsLoggedIn();
            smSetBtnMode(logoutBtn, loggedIn);

            logoutBtn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();

                const mode = logoutBtn.dataset.mode;
                if (mode === "login") {
                    location.href = "/auth/login.html";
                } else {
                    await smDoLogout();
                }
            });
        }

        console.log("✅ sidebar ready (MOBILE CLOSE FIXED)");
    } catch (err) {
        console.error("sidebar error:", err);
    }
});

/* =======================
   AI SUPPORT LOADER
   (Widget zaten feed değilse çalışmıyor)
======================= */
(() => {
    if (document.getElementById("smSupportLoader")) return;
    const s = document.createElement("script");
    s.id = "smSupportLoader";
    s.src = "/assets1/ai_support_widget.js";
    s.defer = true;
    document.head.appendChild(s);
})();
