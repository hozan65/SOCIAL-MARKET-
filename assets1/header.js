// /assets1/header.js
console.log("✅ header.js loaded (loader + behavior)");

document.addEventListener("DOMContentLoaded", async () => {
    const mount = document.getElementById("headerMount");
    if (!mount) return;

    try {
        // 1) HEADER HTML YÜKLE (robust path)
        const candidates = [
            "/components/header.html",
            "./components/header.html",
            "../components/header.html",
        ];

        let html = null;
        let lastErr = null;

        for (const url of candidates) {
            try {
                const res = await fetch(url, { cache: "no-store" });
                if (!res.ok) throw new Error(`${url} -> ${res.status}`);
                html = await res.text();
                break;
            } catch (e) {
                lastErr = e;
            }
        }

        if (!html) throw lastErr || new Error("header.html load failed");

        mount.innerHTML = html;

        // 2) AKTİF MENÜ
        const path = location.pathname.replace(/\/+$/, "");
        let page = path.split("/")[1] || "";
        if (page.endsWith(".html")) page = page.replace(".html", "");
        if (!page) page = "feed";

        mount.querySelectorAll("[data-page]").forEach((a) => {
            if ((a.dataset.page || "").trim() === page) a.classList.add("active");
        });

        // 3) HAMBURGER / MOBILE MENU
        const btn = document.getElementById("hamburgerBtn");
        const menu = document.getElementById("mobileMenu");
        const backdrop = document.getElementById("menuBackdrop");

        if (btn && menu && backdrop) {
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

            backdrop.addEventListener("click", () => menu.classList.contains("open") && menu.classList.remove("open") && backdrop.classList.remove("open"));
            document.addEventListener("keydown", (e) => e.key === "Escape" && menu.classList.contains("open") && (menu.classList.remove("open"), backdrop.classList.remove("open")));
        }

        console.log("✅ Header fully initialized (clean)");

    } catch (err) {
        console.error("❌ HEADER ERROR:", err);
    }
});
