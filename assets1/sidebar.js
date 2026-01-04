// /assets1/sidebar.js
console.log("✅ sidebar.js loaded (hover + pin clean)");

document.addEventListener("DOMContentLoaded", async () => {
    const mount = document.getElementById("sidebarMount");
    if (!mount) return;

    try {
        // Font Awesome once
        if (!document.getElementById("faCDN")) {
            const fa = document.createElement("link");
            fa.id = "faCDN";
            fa.rel = "stylesheet";
            fa.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css";
            document.head.appendChild(fa);
        }

        // CSS once
        if (!document.getElementById("smSidebarCss")) {
            const css = document.createElement("link");
            css.id = "smSidebarCss";
            css.rel = "stylesheet";
            css.href = "/styles/sidebar.css";
            document.head.appendChild(css);
        }

        // Load HTML
        const res = await fetch("/components/sidebar.html", { cache: "no-store" });
        if (!res.ok) throw new Error("sidebar.html not found");
        mount.innerHTML = await res.text();

        document.body.classList.add("hasSidebar");

        const sidebar = document.getElementById("smSidebar");
        const pinBtn = document.getElementById("smSbPinBtn");

        const backdrop = document.getElementById("smSbBackdrop");
        const closeBtn = document.getElementById("smSbClose");
        const hamb = document.getElementById("smSbMobileHamb");

        const profileBtn = document.getElementById("smSbProfileBtn");
        const menu = document.getElementById("smSbMenu");

        // Restore PIN
        const pinned = localStorage.getItem("sm_sidebar_pinned") === "1";
        sidebar.classList.toggle("isPinned", pinned);
        pinBtn?.setAttribute("aria-pressed", pinned ? "true" : "false");

        pinBtn?.addEventListener("click", (e) => {
            e.preventDefault();
            const next = !sidebar.classList.contains("isPinned");
            sidebar.classList.toggle("isPinned", next);
            localStorage.setItem("sm_sidebar_pinned", next ? "1" : "0");
            pinBtn.setAttribute("aria-pressed", next ? "true" : "false");

            // dropdown kapat
            menu?.classList.remove("open");
            profileBtn?.setAttribute("aria-expanded", "false");
            menu?.setAttribute("aria-hidden", "true");
        });

        // Active menu highlight
        const path = location.pathname.replace(/\/+$/, "");
        const seg = path.split("/")[1] || "feed";
        const page = seg.endsWith(".html") ? seg.replace(".html", "") : seg;

        document.querySelectorAll("#smSidebar [data-page]").forEach((a) => {
            if ((a.dataset.page || "").trim().toLowerCase() === page.toLowerCase()) {
                a.classList.add("active");
            }
        });

        // Dropdown
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

        // Mobile drawer
        const openMobile = () => {
            sidebar.classList.add("mobileOpen");
            backdrop.classList.add("open");
            closeBtn.classList.add("open");
            document.documentElement.style.overflow = "hidden";
            toggleMenu(false);
        };

        const closeMobile = () => {
            sidebar.classList.remove("mobileOpen");
            backdrop.classList.remove("open");
            closeBtn.classList.remove("open");
            document.documentElement.style.overflow = "";
            toggleMenu(false);
        };

        hamb?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            sidebar.classList.contains("mobileOpen") ? closeMobile() : openMobile();
        });

        closeBtn?.addEventListener("click", closeMobile);
        backdrop?.addEventListener("click", closeMobile);

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") closeMobile();
        });

        document.querySelectorAll("#smSidebar a").forEach((a) => {
            a.addEventListener("click", () => closeMobile());
        });

        console.log(" sidebar ready (clean layout + no overlap)");
    } catch (err) {
        console.error("sidebar error:", err);
    }
});

// AI support loader
(() => {
    if (document.getElementById("smSupportLoader")) return;
    const s = document.createElement("script");
    s.id = "smSupportLoader";
    s.src = "/assets1/ai_support_widget.js";
    s.defer = true;
    document.head.appendChild(s);
})();


// /assets1/sidebar.js  (ADD THIS PART)

// 1) auth kontrol (Appwrite varsa onu kullanırız, yoksa sm_uid ile fallback)
async function smIsLoggedIn() {
    // local hızlı kontrol
    const uid = localStorage.getItem("sm_uid");
    if (uid) return true;

    // Appwrite ile doğrula (varsa)
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

// 2) güvenli logout
async function smDoLogout() {
    try {
        const mod = await import("/assets/appwrite.js");
        if (mod?.account?.deleteSession) {
            await mod.account.deleteSession("current");
        }
    } catch (e) {
        console.warn("logout: deleteSession failed (non-blocking)", e?.message || e);
    }

    // local temizle
    localStorage.removeItem("sm_uid");
    localStorage.removeItem("sm_jwt");
    localStorage.removeItem("sm_name");
    localStorage.removeItem("sm_email");

    // login sayfasına
    location.href = "/auth/login.html";
}

// 3) butonu Login/Logout olarak ayarla
async function smSetupLoginLogoutButton() {
    const btn = document.getElementById("smSbLogout");
    if (!btn) return;

    const label = btn.querySelector("span");
    const icon = btn.querySelector("i");

    const loggedIn = await smIsLoggedIn();

    if (!loggedIn) {
        // ✅ LOGIN MODE
        if (label) label.textContent = "Login";
        if (icon) icon.className = "fa-solid fa-right-to-bracket";
        btn.classList.remove("danger");
        btn.dataset.mode = "login";
    } else {
        // ✅ LOGOUT MODE
        if (label) label.textContent = "Logout";
        if (icon) icon.className = "fa-solid fa-right-from-bracket";
        btn.classList.add("danger");
        btn.dataset.mode = "logout";
    }
}

// 4) tıklama: login mi logout mu?
document.addEventListener("click", async (e) => {
    const btn = e.target.closest("#smSbLogout");
    if (!btn) return;
    e.preventDefault();

    // buton mode yoksa, anlık kontrol yap
    const mode = btn.dataset.mode || (await smIsLoggedIn() ? "logout" : "login");

    if (mode === "login") {
        location.href = "/auth/login.html";
    } else {
        await smDoLogout();
    }
});

// 5) sidebar yüklendikten sonra çağır
// Eğer senin sidebar.js'de "mountSidebar()" gibi bir fonksiyon varsa,
// mount bitince smSetupLoginLogoutButton() çağır.
document.addEventListener("DOMContentLoaded", () => {
    // sidebar mount gecikebileceği için küçük retry
    let tries = 0;
    const t = setInterval(async () => {
        tries++;
        await smSetupLoginLogoutButton();
        if (document.getElementById("smSbLogout") || tries > 80) clearInterval(t);
    }, 50);
});
