// /assets1/header.js
console.log("✅ header.js loaded (loader + behavior)");

document.addEventListener("DOMContentLoaded", async () => {
    const mount = document.getElementById("headerMount");
    if (!mount) return;

    // ===============================
    // 0) THEME APPLY (early)
    // ===============================
    const THEME_KEY = "sm_theme"; // "dark" | "light"
    const LANG_KEY = "sm_lang";   // "tr" | "en"

    function applyTheme(theme) {
        const t = theme === "dark" ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", t);
        document.documentElement.classList.toggle("dark", t === "dark");
    }

    function getTheme() {
        const saved = localStorage.getItem(THEME_KEY);
        if (saved === "dark" || saved === "light") return saved;
        // default: light (istersen burada system theme'e bakarız)
        return "light";
    }

    function setTheme(theme) {
        localStorage.setItem(THEME_KEY, theme);
        applyTheme(theme);
    }

    applyTheme(getTheme());

    // ===============================
    // 1) HEADER HTML LOAD (robust)
    // ===============================
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

    if (!html) {
        console.error("❌ HEADER ERROR: header.html yüklenemedi", lastErr);
        return;
    }

    mount.innerHTML = html;

    // ===============================
    // 2) ACTIVE MENU (feed/news/post etc.)
    // ===============================
    const path = location.pathname.replace(/\/+$/, ""); // sondaki / sil
    let page = path.split("/")[1] || "";               // /feed -> feed
    if (page.endsWith(".html")) page = page.replace(".html", "");
    if (!page) page = "feed"; // root açılıyorsa

    mount.querySelectorAll("[data-page]").forEach((a) => {
        if ((a.dataset.page || "").trim() === page) a.classList.add("active");
    });

    // ===============================
    // 3) MOBILE MENU
    // ===============================
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
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") closeMenu();
        });
    }

    // ===============================
    // 4) SETTINGS (⚙️) + DARK MODE + LANGUAGE
    // ===============================
    // header.html içinde yoksa otomatik ekler:
    // - #settingsBtn
    // - #settingsMenu
    const rightArea =
        mount.querySelector("#headerRight") ||
        mount.querySelector(".headerRight") ||
        mount.querySelector(".topbar-right") ||
        mount.querySelector("header") ||
        mount;

    // logout varsa kaldır
    const oldLogout =
        mount.querySelector("#logoutBtn") ||
        mount.querySelector("[data-logout]") ||
        mount.querySelector(".logoutBtn");
    if (oldLogout) oldLogout.remove();

    // settings button yoksa ekle
    let settingsBtn = mount.querySelector("#settingsBtn");
    if (!settingsBtn) {
        settingsBtn = document.createElement("button");
        settingsBtn.id = "settingsBtn";
        settingsBtn.type = "button";
        settingsBtn.className = "iconBtn settingsBtn";
        settingsBtn.setAttribute("aria-haspopup", "true");
        settingsBtn.setAttribute("aria-expanded", "false");
        settingsBtn.title = "Settings";
        settingsBtn.textContent = "⚙️";
        rightArea.appendChild(settingsBtn);
    }

    // settings menu yoksa ekle
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

    // küçük inline CSS (header.css'in yoksa bile menü görünür)
    const styleId = "sm-settings-inline-style";
    if (!document.getElementById(styleId)) {
        const st = document.createElement("style");
        st.id = styleId;
        st.textContent = `
      #settingsBtn{cursor:pointer}
      .settingsMenu{
        position:absolute; right:12px; top:56px;
        min-width:200px;
        background:rgba(255,255,255,.96);
        border:1px solid rgba(0,0,0,.12);
        border-radius:14px;
        padding:10px;
        box-shadow:0 12px 30px rgba(0,0,0,.12);
        display:none;
        z-index:9999;
        backdrop-filter: blur(8px);
      }
      html.dark .settingsMenu{
        background:rgba(18,18,18,.96);
        border-color: rgba(255,255,255,.12);
        box-shadow:0 12px 30px rgba(0,0,0,.45);
      }
      .settingsMenu.open{display:block}
      .settingsRow{
        display:flex; align-items:center; justify-content:space-between;
        gap:12px; padding:8px 4px;
        font-weight:700;
      }
      .toggleBtn{
        padding:6px 10px; border-radius:999px;
        border:1px solid rgba(0,0,0,.14);
        background:rgba(0,0,0,.04);
        font-weight:900; cursor:pointer;
      }
      html.dark .toggleBtn{
        border-color: rgba(255,255,255,.14);
        background: rgba(255,255,255,.06);
        color:#fff;
      }
      .selectBtn{
        padding:6px 10px; border-radius:10px;
        border:1px solid rgba(0,0,0,.14);
        background:rgba(0,0,0,.03);
        font-weight:900;
      }
      html.dark .selectBtn{
        border-color: rgba(255,255,255,.14);
        background: rgba(255,255,255,.06);
        color:#fff;
      }
    `;
        document.head.appendChild(st);
    }

    function closeSettings() {
        settingsMenu.classList.remove("open");
        settingsBtn.setAttribute("aria-expanded", "false");
    }
    function openSettings() {
        settingsMenu.classList.add("open");
        settingsBtn.setAttribute("aria-expanded", "true");
    }

    settingsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        settingsMenu.classList.contains("open") ? closeSettings() : openSettings();
    });

    document.addEventListener("click", () => closeSettings());
    settingsMenu.addEventListener("click", (e) => e.stopPropagation());

    // theme toggle
    const themeToggle = settingsMenu.querySelector("#themeToggle");
    function syncThemeBtn() {
        const t = getTheme();
        themeToggle.textContent = t === "dark" ? "ON" : "OFF";
    }
    syncThemeBtn();

    themeToggle.addEventListener("click", () => {
        const next = getTheme() === "dark" ? "light" : "dark";
        setTheme(next);
        syncThemeBtn();
    });

    // language
    const langSelect = settingsMenu.querySelector("#langSelect");
    const savedLang = localStorage.getItem(LANG_KEY) || "tr";
    langSelect.value = savedLang;

    langSelect.addEventListener("change", () => {
        localStorage.setItem(LANG_KEY, langSelect.value);
        // şimdilik sadece kaydediyoruz
        // istersen burada sayfayı reload ya da i18n set ederiz
    });

    console.log("✅ Header fully initialized (robust load + settings)");
});
