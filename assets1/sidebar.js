// /assets1/sidebar.js
console.log("✅ sidebar.js loaded");

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

        // Sidebar css once
        if (!document.getElementById("smSidebarCss")) {
            const css = document.createElement("link");
            css.id = "smSidebarCss";
            css.rel = "stylesheet";
            css.href = "/styles/sidebar.css";
            document.head.appendChild(css);
        }

        // Load sidebar html
        const res = await fetch("/components/sidebar.html", { cache: "no-store" });
        if (!res.ok) throw new Error("sidebar.html bulunamadı");
        mount.innerHTML = await res.text();

        document.body.classList.add("hasSidebar");

        const sidebar = document.getElementById("smSidebar");
        const backdrop = document.getElementById("smSbBackdrop");
        const closeBtn = document.getElementById("smSbClose");
        const hamb = document.getElementById("smSbMobileHamb");

        // profile dropdown
        const profileBtn = document.getElementById("smSbProfileBtn");
        const menu = document.getElementById("smSbMenu");

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

        // active highlight by path folder
        const path = location.pathname.replace(/\/+$/, "");
        const seg = path.split("/")[1] || "feed";
        const page = seg.endsWith(".html") ? seg.replace(".html","") : seg;

        document.querySelectorAll("#smSidebar [data-page]").forEach((a) => {
            if ((a.dataset.page || "").trim().toLowerCase() === page.toLowerCase()) {
                a.classList.add("active");
            }
        });

        // MOBILE open/close
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

        // link click => close mobile
        document.querySelectorAll("#smSidebar a").forEach((a) => {
            a.addEventListener("click", () => closeMobile());
        });

        console.log("✅ sidebar initialized (hover desktop + mobile drawer)");

    } catch (err) {
        console.error("❌ sidebar error:", err);
    }
});

// keep support widget loader
(() => {
    if (document.getElementById("smSupportLoader")) return;
    const s = document.createElement("script");
    s.id = "smSupportLoader";
    s.src = "/assets1/ai_support_widget.js";
    s.defer = true;
    document.head.appendChild(s);
})();
