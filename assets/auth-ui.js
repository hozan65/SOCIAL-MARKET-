// /assets/auth-ui.js
import { account } from "/assets/appwrite.js";

console.log("✅ auth-ui.js loaded");

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

let ctrl = null;

async function init(slot) {
    slot.classList.add("authSlot");

    // eski kalıntıları temizle
    document
        .querySelectorAll("#settingsBtn,#settingsMenu,.settingsMenu,.smIconCircle")
        .forEach((el) => {
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

    slot.innerHTML = `<button class="authBtn" id="getStartedBtn">Get Started</button>`;
    slot.querySelector("#getStartedBtn").onclick = () => {
        location.href = "/auth/login.html";
    };

    injectStylesOnce();
}

function renderLoggedIn(slot, user) {
    localStorage.setItem("sm_uid", user.$id);

    if (ctrl) {
        ctrl.abort();
        ctrl = null;
    }

    const name = escapeHtml(user?.name || "Profile");

    slot.innerHTML = `
    <div class="tvAuth">
      <button class="tvProfileBtn" id="tvProfileBtn" type="button" aria-haspopup="true" aria-expanded="false">
        <span class="tvAvatar">👤</span>
        <span class="tvName">${name}</span>
      </button>

      <div class="tvMenu" id="tvMenu" aria-hidden="true">
        <div class="tvMenuHead">
          <div class="tvMenuUser">${name}</div>
        </div>

        <a class="tvItem" href="/u/?me=1" id="tvMyProfile">My Profile</a>
        <a class="tvItem" href="/profile/index.html" id="tvSettings">Profile Settings</a>
        <a class="tvItem" href="/about/index.html" id="tvAbout">About Us</a>

        <div class="tvDivider"></div>

        <button class="tvItemBtn danger" id="tvSignOut" type="button">Sign Out</button>
      </div>
    </div>
  `;

    const btn = slot.querySelector("#tvProfileBtn");
    const menu = slot.querySelector("#tvMenu");

    const open = () => {
        menu.classList.add("open");
        menu.setAttribute("aria-hidden", "false");
        btn.setAttribute("aria-expanded", "true");
    };

    const close = () => {
        menu.classList.remove("open");
        menu.setAttribute("aria-hidden", "true");
        btn.setAttribute("aria-expanded", "false");
    };

    btn.onclick = (e) => {
        e.stopPropagation();
        menu.classList.contains("open") ? close() : open();
    };

    // menü içi tıklamada kapanmasın
    menu.addEventListener("click", (e) => e.stopPropagation());

    // dışarı tıklayınca kapa + ESC
    ctrl = new AbortController();
    const { signal } = ctrl;
    document.addEventListener("click", close, { signal });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") close();
    }, { signal });

    // SIGN OUT
    slot.querySelector("#tvSignOut").onclick = async () => {
        try {
            await account.deleteSession("current");
        } catch (e) {
            console.warn("signout warn:", e);
        }
        localStorage.removeItem("sm_uid");
        close();
        location.href = "/auth/login.html";
    };

    injectStylesOnce();
}

function injectStylesOnce() {
    if (document.getElementById("tvAuthStyles")) return;

    const st = document.createElement("style");
    st.id = "tvAuthStyles";
    st.textContent = `
    .tvAuth{ position:relative; display:flex; align-items:center; justify-content:flex-end; }

    .tvProfileBtn{
      display:flex; align-items:center; gap:10px;
      padding:8px 12px;
      border-radius:12px;
      border:1px solid rgba(0,0,0,.12);
      background: rgba(255,255,255,.90);
      font-weight:900;
      cursor:pointer;
      box-shadow: var(--softShadow);
    }
    .tvProfileBtn:hover{ transform: translateY(-1px); }
    .tvProfileBtn:active{ transform: translateY(0px); }

    .tvAvatar{ width:28px; height:28px; display:grid; place-items:center; border-radius:999px; background: rgba(0,0,0,.06); }
    .tvName{ max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

    .tvMenu{
      position:absolute;
      right:0;
      top:46px;
      width:260px;
      border-radius:14px;
      border:1px solid rgba(0,0,0,.10);
      background: #fff;
      box-shadow: var(--shadow);
      overflow:hidden;
      display:none;
      z-index:9999;
    }
    .tvMenu.open{ display:block; }

    .tvMenuHead{
      padding:10px 12px;
      background: rgba(0,0,0,.03);
      border-bottom:1px solid rgba(0,0,0,.06);
    }
    .tvMenuUser{ font-weight:1000; }

    .tvItem{
      display:block;
      padding:10px 12px;
      text-decoration:none;
      color:#111;
      font-weight:900;
      background:#fff;
    }
    .tvItem:hover{ background: rgba(0,0,0,.04); }

    .tvItemBtn{
      width:100%;
      text-align:left;
      padding:10px 12px;
      border:none;
      background:#fff;
      cursor:pointer;
      font-weight:1000;
    }
    .tvItemBtn:hover{ background: rgba(0,0,0,.04); }
    .tvItemBtn.danger{ color:#c01818; }

    .tvDivider{
      height:1px;
      background: rgba(0,0,0,.08);
      margin:6px 0;
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
