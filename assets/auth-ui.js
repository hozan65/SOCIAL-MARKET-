// /assets/auth-ui.js
import { account } from "/assets/appwrite.js";

console.log("✅ auth-ui.js loaded");

// Wait for header slot
waitFor("#authSlot", 6000).then(init).catch((e) => {
    console.warn("❌ auth-ui: authSlot not found", e);
});

function waitFor(selector, timeoutMs = 4000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
            const el = document.querySelector(selector);
            if (el) return resolve(el);
            if (Date.now() - start > timeoutMs) return reject(new Error("timeout"));
            setTimeout(tick, 50);
        };
        tick();
    });
}

let ctrl = null; // abort old listeners on rerender

async function init(slot) {
    slot.classList.add("authSlot");

    // ✅ KALAN ESKİ SETTINGS VARSA TEMİZLE (duplicate fix)
    document
        .querySelectorAll("#settingsBtn,#settingsMenu,.settingsMenu,.smIconCircle")
        .forEach((el) => {
            // authSlot içindekini silme
            if (!el.closest("#authSlot")) el.remove();
        });

    renderLoggedOut(slot);

    try {
        const user = await account.get();
        renderLoggedIn(slot, user);
    } catch {
        renderLoggedOut(slot);
    }
}

function renderLoggedOut(slot) {
    localStorage.removeItem("sm_uid");

    if (ctrl) {
        ctrl.abort();
        ctrl = null;
    }

    slot.innerHTML = `
    <button class="authBtn" id="getStartedBtn">Get Started</button>
  `;
    slot.querySelector("#getStartedBtn").onclick = () => {
        location.href = "/auth/login.html";
    };
}

function renderLoggedIn(slot, user) {
    localStorage.setItem("sm_uid", user.$id);

    if (ctrl) {
        ctrl.abort();
        ctrl = null;
    }

    const name = escapeHtml(user?.name || "Profile");

    // ✅ ÜST BAR: Profile + Settings (Logout yok)
    slot.innerHTML = `
    <div class="authWrap">
      <button class="authBtn" id="profileBtn">👤 ${name}</button>

      <button class="authIconCircle" id="authSettingsBtn" type="button"
        aria-haspopup="true" aria-expanded="false" title="Settings">
        <span class="emoji">⚙️</span>
      </button>

      <div class="authSettingsMenu" id="authSettingsMenu" aria-hidden="true">
        <div class="settingsRow">
          <span>Dark mode</span>
          <button type="button" id="themeToggle" class="toggleBtn">OFF</button>
        </div>

        <div class="settingsRow">
          <span>Language</span>
          <select id="langSelect" class="selectBtn">
            <option value="tr">TR</option>
            <option value="en">EN</option>
          </select>
        </div>
      </div>
    </div>
  `;

    // Profile
    slot.querySelector("#profileBtn").onclick = () => {
        location.href = "../profile/index.html";
    };

    // Settings open/close
    const settingsBtn = slot.querySelector("#authSettingsBtn");
    const settingsMenu = slot.querySelector("#authSettingsMenu");

    const open = () => {
        settingsMenu.classList.add("open");
        settingsMenu.setAttribute("aria-hidden", "false");
        settingsBtn.setAttribute("aria-expanded", "true");
    };

    const close = () => {
        settingsMenu.classList.remove("open");
        settingsMenu.setAttribute("aria-hidden", "true");
        settingsBtn.setAttribute("aria-expanded", "false");
    };

    settingsBtn.onclick = (e) => {
        e.stopPropagation();
        settingsMenu.classList.contains("open") ? close() : open();
    };

    // ✅ listenerlar her render'da çoğalmasın
    ctrl = new AbortController();
    const { signal } = ctrl;
    document.addEventListener("click", close, { signal });
    settingsMenu.addEventListener("click", (e) => e.stopPropagation(), { signal });

    // Theme
    const THEME_KEY = "sm_theme";
    const themeToggle = slot.querySelector("#themeToggle");

    const applyTheme = (theme) => {
        const t = theme === "dark" ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", t);
        document.documentElement.classList.toggle("dark", t === "dark");
    };

    const getTheme = () => (localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light");

    const syncTheme = () => {
        const t = getTheme();
        applyTheme(t);
        themeToggle.textContent = t === "dark" ? "ON" : "OFF";
    };

    themeToggle.onclick = () => {
        const next = getTheme() === "dark" ? "light" : "dark";
        localStorage.setItem(THEME_KEY, next);
        syncTheme();
    };

    syncTheme();

    // Language
    const LANG_KEY = "sm_lang";
    const langSelect = slot.querySelector("#langSelect");
    langSelect.value = localStorage.getItem(LANG_KEY) || "tr";
    langSelect.onchange = () => localStorage.setItem(LANG_KEY, langSelect.value);

    injectStylesOnce();
}

function injectStylesOnce() {
    if (document.getElementById("authUiStyles")) return;
    const st = document.createElement("style");
    st.id = "authUiStyles";
    st.textContent = `
    .authWrap{display:flex;gap:10px;align-items:center;justify-content:flex-end;position:relative}

    /* ✅ settings icon sadece auth’a özel */
    .authIconCircle{
      width:40px;height:40px;border-radius:999px;
      display:flex;align-items:center;justify-content:center;
      border:1px solid var(--border);
      background:var(--card);
      box-shadow: var(--softShadow);
      cursor:pointer;
      transition: transform .12s ease, background .12s ease;
    }
    .authIconCircle:hover{ transform: translateY(-1px); }
    .authIconCircle:active{ transform: translateY(0px) scale(.98); }
    .authIconCircle .emoji{font-size:18px;line-height:1}

    /* ✅ menu */
    .authSettingsMenu{
      position:absolute;right:0;top:48px;min-width:220px;
      background: var(--panel);
      border:1px solid var(--border);
      border-radius:14px;
      padding:10px;
      box-shadow: var(--shadow);
      display:none;
      z-index:9999;
      backdrop-filter: blur(10px);
    }
    .authSettingsMenu.open{display:block}

    .settingsRow{
      display:flex;align-items:center;justify-content:space-between;
      gap:12px;padding:8px 4px;
      font-weight:800;color:var(--text)
    }
    .toggleBtn{
      padding:6px 10px;border-radius:999px;
      border:1px solid var(--border);
      background: var(--card);
      font-weight:900;cursor:pointer;color:var(--text);
    }
    .selectBtn{
      padding:6px 10px;border-radius:10px;
      border:1px solid var(--border);
      background: var(--card);
      font-weight:900;color:var(--text);
    }
  `;
    document.head.appendChild(st);
}

function escapeHtml(s) {
    return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
