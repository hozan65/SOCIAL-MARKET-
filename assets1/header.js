// /assets1/header.js
console.log("✅ header.js loaded (loader + behavior)");

document.addEventListener("DOMContentLoaded", async () => {
    const mount = document.getElementById("headerMount");
    if (!mount) return;

    const THEME_KEY = "sm_theme";
    const LANG_KEY = "sm_lang";

    const applyTheme = (theme) => {
        const t = theme === "dark" ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", t);
        document.documentElement.classList.toggle("dark", t === "dark");
    };

    const getTheme = () => {
        const saved = localStorage.getItem(THEME_KEY);
        if (saved === "dark" || saved === "light") return saved;
        return "light";
    };

    const setTheme = (theme) => {
        localStorage.setItem(THEME_KEY, theme);
        applyTheme(theme);
    };

    // apply theme early
    applyTheme(getTheme());

    // load header.html (robust)
    const candidates = ["/components/header.html", "./components/header.html", "../components/header.html"];
    let html = null, lastErr = null;

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
    if (!html) {
        console.error("❌ HEADER ERROR: header.html yüklenemedi", lastErr);
        return;
    }

    mount.innerHTML = html;

    // ACTIVE MENU
    const path = location.pathname.replace(/\/+$/, "");
    let page = path.split("/")[1] || "";
    if (page.endsWith(".html")) page = page.replace(".html", "");
    if (!page) page = "feed";

    mount.querySelectorAll("[data-page]").forEach((a) => {
        if ((a.dataset.page || "").trim() === page) a.classList.add("active");
    });

    // MOBILE MENU
    const btn = document.getElementById("hamburgerBtn");
    const menu = document.getElementById("mobileMenu");
    const backdrop = document.getElementById("menuBackdrop");

    const openMenu = () => {
        if (!menu || !backdrop || !btn) return;
        menu.classList.add("open");
        backdrop.classList.add("open");
        btn.setAttribute("aria-expanded", "true");
        menu.setAttribute("aria-hidden", "false");
    };

    const closeMenu = () => {
        if (!menu || !backdrop || !btn) return;
        menu.classList.remove("open");
        backdrop.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
        menu.setAttribute("aria-hidden", "true");
    };

    if (btn && menu && backdrop) {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            menu.classList.contains("open") ? closeMenu() : openMenu();
        });
        backdrop.addEventListener("click", closeMenu);
        document.addEventListener("keydown", (e) => e.key === "Escape" && closeMenu());
    }

    // ===============================
    // LOGOUT'U KESİN KALDIR
    // (id/class/text/href ne olursa olsun)
    // ===============================
    const killLogout = () => {
        // 1) id/class ile
        mount.querySelectorAll("#logoutBtn,[data-logout],.logoutBtn,.logout,.btn-logout").forEach((el) => el.remove());

        // 2) link/button text "Logout" olanlar
        mount.querySelectorAll("a,button").forEach((el) => {
            const t = (el.textContent || "").trim().toLowerCase();
            const href = (el.getAttribute("href") || "").toLowerCase();
            if (t === "logout" || t === "çıkış" || t === "cikis" || href.includes("logout") || href.includes("cikis")) {
                el.remove();
            }
        });
    };
    killLogout();

    // ===============================
    // SETTINGS (YUVARLAK EMOJI İÇİNDE)
    // ===============================
    const rightArea =
        mount.querySelector("#headerRight") ||
        mount.querySelector(".headerRight") ||
        mount.querySelector(".topbar-right") ||
        mount.querySelector("header") ||
        mount;

    // settings button ekle / bul
    let settingsBtn = mount.querySelector("#settingsBtn");
    if (!settingsBtn) {
        settingsBtn = document.createElement("button");
        settingsBtn.id = "settingsBtn";
        settingsBtn.type = "button";
        settingsBtn.className = "smIconCircle"; // ✅ yuvarlak class
        settingsBtn.setAttribute("aria-haspopup", "true");
        settingsBtn.setAttribute("aria-expanded", "false");
        settingsBtn.title = "Settings";
        settingsBtn.innerHTML = `<span class="emoji">⚙️</span>`;
        rightArea.appendChild(settingsBtn);
    } else {
        // varsa bile yuvarlak class bas
        settingsBtn.classList.add("smIconCircle");
        if (!settingsBtn.querySelector(".emoji")) settingsBtn.innerHTML = `<span class="emoji">⚙️</span>`;
    }

    // settings menu ekle / bul
    let settingsMenu = mount.querySelector("#settingsMenu");
    if (!settingsMenu) {
        settingsMenu = document.createElement("div");
        settingsMenu.id = "settingsMenu";
        settingsMenu.className = "settingsMenu";
        settingsMenu.innerHTML = `
      <div class="settingsRow">
        <span>Dark mode</span>
        <button type="button" id="themeToggle" class="toggleBtn"></button>
      </div>
      <div class="settingsRow">
        <span>Language</span>
        <select id="langSelect" class="selectBtn">
          <option value="tr">TR</option>
          <option value="en">EN</option>
        </select>
      </div>
    `;
        rightArea.appendChild(settingsMenu);
    }

    // menu open/close
    const closeSettings = () => {
        settingsMenu.classList.remove("open");
        settingsBtn.setAttribute("aria-expanded", "false");
    };
    const openSettings = () => {
        settingsMenu.classList.add("open");
        settingsBtn.setAttribute("aria-expanded", "true");
    };

    settingsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        settingsMenu.classList.contains("open") ? closeSettings() : openSettings();
    });
    document.addEventListener("click", closeSettings);
    settingsMenu.addEventListener("click", (e) => e.stopPropagation());

    // theme toggle
    const themeToggle = settingsMenu.querySelector("#themeToggle");
    const syncThemeBtn = () => (themeToggle.textContent = getTheme() === "dark" ? "ON" : "OFF");
    syncThemeBtn();

    themeToggle.addEventListener("click", () => {
        setTheme(getTheme() === "dark" ? "light" : "dark");
        syncThemeBtn();
    });

    // language
    const langSelect = settingsMenu.querySelector("#langSelect");
    langSelect.value = localStorage.getItem(LANG_KEY) || "tr";
    langSelect.addEventListener("change", () => localStorage.setItem(LANG_KEY, langSelect.value));

    console.log("✅ Header fully initialized (logout removed + round settings)");
});
