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

    injectStylesOnce();
}

function renderLoggedIn(slot, user) {
    localStorage.setItem("sm_uid", user.$id);

    if (ctrl) {
        ctrl.abort();
        ctrl = null;
    }

    const name = escapeHtml(user?.name || "Profile");

    // ✅ Messages page (DM)
    const MESSAGES_HREF = "/messages/";

    slot.innerHTML = `
    <div class="tvAuth">
      <button class="tvProfileBtn" id="tvProfileBtn" type="button">
        <span class="tvAvatar"></span>
        <span class="tvName">${name}</span>
      </button>

      <div class="tvMenu" id="tvMenu" aria-hidden="true">
        <div class="tvMenuHead">${name}</div>

        <!-- ✅ links -->
        <a class="tvItem" href="/u/index.html?me=1">My Profile</a>

        <!-- ✅ NEW: Messages -->
        <a class="tvItem" href="${MESSAGES_HREF}">Messages</a>

        <a class="tvItem" href="/profile/index.html">Profile Settings</a>
        <a class="tvItem" href="/about/index.html">About Us</a>

        <div class="tvDivider"></div>
        <button class="tvItemBtn danger" id="tvSignOut">Sign Out</button>
      </div>
    </div>
  `;

    const btn = slot.querySelector("#tvProfileBtn");
    const menu = slot.querySelector("#tvMenu");

    const open = () => {
        menu.classList.add("open");
        menu.setAttribute("aria-hidden", "false");
    };
    const close = () => {
        menu.classList.remove("open");
        menu.setAttribute("aria-hidden", "true");
    };

    btn.onclick = (e) => {
        e.stopPropagation();
        menu.classList.contains("open") ? close() : open();
    };

    ctrl = new AbortController();
    const { signal } = ctrl;

    document.addEventListener("click", close, { signal });
    menu.addEventListener("click", (e) => e.stopPropagation(), { signal });

    slot.querySelector("#tvSignOut").onclick = async () => {
        try {
            await account.deleteSession("current");
        } catch {}
        localStorage.removeItem("sm_uid");
        location.href = "/auth/login.html";
    };

    injectStylesOnce();
}

function injectStylesOnce() {
    if (document.getElementById("tvAuthStyles")) return;

    const st = document.createElement("style");
    st.id = "tvAuthStyles";
    st.textContent = `
    .tvAuth{position:relative;display:flex;justify-content:flex-end}
    .tvProfileBtn{
      display:flex;align-items:center;gap:8px;
      padding:8px 12px;border-radius:12px;
      border:1px solid rgba(0,0,0,.12);
      background:#fff;font-weight:900;cursor:pointer;
    }
    .tvMenu{
      position:absolute;right:0;top:46px;width:240px;
      border-radius:14px;border:1px solid rgba(0,0,0,.1);
      background:#fff;box-shadow:0 8px 30px rgba(0,0,0,.15);
      display:none;z-index:9999;
    }
    .tvMenu.open{display:block}
    .tvMenuHead{
      padding:10px 12px;
      font-weight:1000;
      border-bottom:1px solid rgba(0,0,0,.08)
    }
    .tvItem{
      display:block;
      padding:10px 12px;
      text-decoration:none;
      color:#111;
      font-weight:900
    }
    .tvItem:hover{background:rgba(0,0,0,.05)}
    .tvDivider{height:1px;background:rgba(0,0,0,.08);margin:6px 0}
    .tvItemBtn{
      width:100%;
      text-align:left;
      padding:10px 12px;
      border:none;
      background:#fff;
      font-weight:1000;
      cursor:pointer
    }
    .tvItemBtn.danger{color:#c01818}
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
