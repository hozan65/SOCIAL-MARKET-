// /assets1/header.js
// HEADER LOADER + BEHAVIOR (SAFE + NO DOUBLE BIND)

(() => {
    if (window.__SM_HEADER_INIT__) return;
    window.__SM_HEADER_INIT__ = true;

    document.addEventListener("DOMContentLoaded", async () => {
        const mount = document.getElementById("headerMount");
        if (!mount) return;

        try {
            const res = await fetch("/components/header.html", { cache: "no-store" });
            if (!res.ok) throw new Error("header.html not found");

            mount.innerHTML = await res.text();

            // ✅ active menu (folder-based)
            const seg = (location.pathname.split("/")[1] || "").toLowerCase();

            // optional mapping (if your data-page names differ)
            const map = {
                "u": "profile",
                "view": "feed",         // post detail -> feed tab active (optional)
                "textnews": "news",     // optional
            };
            const page = map[seg] || seg;

            mount.querySelectorAll("[data-page]").forEach((a) => {
                a.classList.toggle("active", (a.dataset.page || "").toLowerCase() === page);
            });

            // hamburger
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
            document.addEventListener("keydown", (e) => {
                if (e.key === "Escape") close();
            });

            console.log("✅ Header loaded:", page);
        } catch (err) {
            console.error("❌ HEADER LOAD ERROR:", err);
        }
    });
})();
