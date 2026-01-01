// /assets1/header.js
// HEADER LOADER + BEHAVIOR (SAFE)

document.addEventListener("DOMContentLoaded", async () => {
    const mount = document.getElementById("headerMount");
    if (!mount) {
        console.warn("headerMount yok → header yüklenmedi");
        return;
    }

    try {
        // 1) HEADER HTML YÜKLE
        const res = await fetch("/components/header.html", { cache: "no-store" });
        if (!res.ok) throw new Error("header.html bulunamadı");

        mount.innerHTML = await res.text();

        // 2) AKTİF MENÜ
        const page = location.pathname.split("/")[1]; // feed, news, post...
        mount.querySelectorAll("[data-page]").forEach((a) => {
            if (a.dataset.page === page) a.classList.add("active");
        });

        // 3) HAMBURGER / MOBILE MENU
        const btn = document.getElementById("hamburgerBtn");
        const menu = document.getElementById("mobileMenu");
        const backdrop = document.getElementById("menuBackdrop");

        if (!btn || !menu || !backdrop) {
            console.log("Header loaded (no mobile menu elements).");
            return;
        }

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
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") close();
        });

        console.log("✅ Header yüklendi:", page);
    } catch (err) {
        console.error("❌ HEADER LOAD ERROR:", err);
    }
});
