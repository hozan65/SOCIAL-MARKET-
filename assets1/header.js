// /assets1/header.js
console.log("✅ header.js loaded (loader + behavior)");

document.addEventListener("DOMContentLoaded", async () => {
    const mount = document.getElementById("headerMount");
    if (!mount) return;

    try {
        /* ===============================
           1) HEADER HTML YÜKLE
        =============================== */
        const res = await fetch("/components/header.html", { cache: "no-store" });
        if (!res.ok) throw new Error("components/header.html bulunamadı");

        mount.innerHTML = await res.text();

        /* ===============================
           2) AKTİF MENÜ
        =============================== */
        const page = location.pathname.split("/")[1]; // feed, news, post...
        mount.querySelectorAll("[data-page]").forEach(a => {
            if (a.dataset.page === page) a.classList.add("active");
        });

        /* ===============================
           3) HAMBURGER / MOBILE MENU
        =============================== */
        const btn = document.getElementById("hamburgerBtn");
        const menu = document.getElementById("mobileMenu");
        const backdrop = document.getElementById("menuBackdrop");

        if (!btn || !menu || !backdrop) return;

        const open = () => {
            menu.classList.add("open");
            backdrop.classList.add("open");
            btn.setAttribute("aria-expanded", "true");
            menu.setAttribute("aria-hidden", "false");
        };

        const close = () => {
            menu.classList.remove("open");
            backdrop.classList.remove("open");
            btn.setAttribute("aria-expanded", "false");
            menu.setAttribute("aria-hidden", "true");
        };

        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            menu.classList.contains("open") ? close() : open();
        });

        backdrop.addEventListener("click", close);
        document.addEventListener("keydown", e => {
            if (e.key === "Escape") close();
        });

        console.log("✅ Header fully initialized");

    } catch (err) {
        console.error("❌ HEADER ERROR:", err);
    }
});
