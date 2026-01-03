// /assets1/sidebar.js
console.log("✅ sidebar.js loaded (loader + behavior)");

document.addEventListener("DOMContentLoaded", async () => {
    const mount = document.getElementById("sidebarMount");
    if (!mount) {
        console.warn("sidebarMount yok → sidebar yüklenmedi");
        return;
    }

    try {
        // Font Awesome (tek kez)
        if (!document.getElementById("faCDN")) {
            const fa = document.createElement("link");
            fa.id = "faCDN";
            fa.rel = "stylesheet";
            fa.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css";
            document.head.appendChild(fa);
        }

        // Sidebar CSS (tek kez)
        if (!document.getElementById("smSidebarCss")) {
            const css = document.createElement("link");
            css.id = "smSidebarCss";
            css.rel = "stylesheet";
            css.href = "/styles/sidebar.css";
            document.head.appendChild(css);
        }

        // Sidebar HTML load
        const res = await fetch("/components/sidebar.html", { cache: "no-store" });
        if (!res.ok) throw new Error("sidebar.html bulunamadı");
        mount.innerHTML = await res.text();

        const sidebar = document.getElementById("smSidebar");
        const burger = document.getElementById("smSbBurger");
        const closeBtn = document.getElementById("smSbClose");
        const backdrop = document.getElementById("smSbBackdrop");

        const pinBtn = document.getElementById("smSbPin");
        const profileBtn = document.getElementById("smSbProfileBtn");
        const menu = document.getElementById("smSbMenu");
        const logoutBtn = document.getElementById("smSbLogout");

        // Body flags (content offset)
        document.body.classList.add("hasSidebar");

        // ===== Restore collapsed/unpin state
        const collapsed = localStorage.getItem("sm_sb_collapsed") === "1";
        sidebar.classList.toggle("isCollapsed", collapsed);
        document.body.classList.toggle("sidebarCollapsed", collapsed);
        pinBtn?.setAttribute("aria-pressed", collapsed ? "false" : "true");

        // ===== Active menu (sayfanın folder'ına göre)
        const path = location.pathname.replace(/\/+$/, "");
        const seg = path.split("/")[1] || "feed";
        const page = seg.endsWith(".html") ? seg.replace(".html","") : seg;

        document.querySelectorAll("#smSidebar [data-page]").forEach((a) => {
            if ((a.dataset.page || "").trim().toLowerCase() === page.toLowerCase()) {
                a.classList.add("active");
            }
        });

        // ===== Pin/Unpin (collapsed toggle)
        pinBtn?.addEventListener("click", () => {
            const next = !sidebar.classList.contains("isCollapsed");
            sidebar.classList.toggle("isCollapsed", next);
            document.body.classList.toggle("sidebarCollapsed", next);
            localStorage.setItem("sm_sb_collapsed", next ? "1" : "0");

            // dropdown kapat
            menu?.classList.remove("open");
            profileBtn?.setAttribute("aria-expanded", "false");
            if (menu) menu.setAttribute("aria-hidden", "true");
        });

        // ===== Profile dropdown
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
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                toggleMenu(false);
                closeMobile();
            }
        });

        // ===== Mobile open/close
        const openMobile = () => {
            sidebar.classList.add("mobileOpen");
            backdrop?.classList.add("open");
            closeBtn?.classList.add("open");
            burger?.setAttribute("aria-expanded", "true");
            document.documentElement.style.overflow = "hidden";
        };

        const closeMobile = () => {
            sidebar.classList.remove("mobileOpen");
            backdrop?.classList.remove("open");
            closeBtn?.classList.remove("open");
            burger?.setAttribute("aria-expanded", "false");
            document.documentElement.style.overflow = "";
        };

        burger?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            sidebar.classList.contains("mobileOpen") ? closeMobile() : openMobile();
        });

        closeBtn?.addEventListener("click", () => closeMobile());
        backdrop?.addEventListener("click", () => closeMobile());

        // mobile menu link click => close
        document.querySelectorAll("#smSidebar a").forEach((a) => {
            a.addEventListener("click", () => closeMobile());
        });

        // ===== Profile info (senin auth sisteminden okunabilir)
        // Şimdilik localStorage varsa oradan dene; yoksa default kalsın.
        const $name = document.getElementById("smSbName");
        const $mail = document.getElementById("smSbMail");
        const $avatar = document.getElementById("smSbAvatar");

        const guessName =
            localStorage.getItem("user_name") ||
            localStorage.getItem("name") ||
            "Hozan Bilaloglu";
        const guessMail =
            localStorage.getItem("user_email") ||
            localStorage.getItem("email") ||
            "—";

        if ($name) $name.textContent = guessName;
        if ($mail) $mail.textContent = guessMail;
        if ($avatar) $avatar.textContent = (guessName?.trim()?.[0] || "U").toUpperCase();

        // ===== Logout (senin auth logout fonksiyonun varsa buraya bağlarız)
        logoutBtn?.addEventListener("click", () => {
            // örnek: token temizle
            localStorage.removeItem("jwt");
            localStorage.removeItem("access_token");
            // yönlendirme
            location.href = "/login/";
        });

        console.log("✅ Sidebar fully initialized");
    } catch (err) {
        console.error("❌ SIDEBAR ERROR:", err);
    }
});

// ✅ Load AI Support widget (external JS) — header.js yerine burada
(() => {
    if (document.getElementById("smSupportLoader")) return;
    const s = document.createElement("script");
    s.id = "smSupportLoader";
    s.src = "/assets1/ai_support_widget.js";
    s.defer = true;
    document.head.appendChild(s);
})();
