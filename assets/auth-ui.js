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
    // Ensure viewer id is cleared
    localStorage.removeItem("sm_uid");

    slot.innerHTML = `
    <button class="authBtn" id="getStartedBtn">
      Get Started
    </button>
  `;

    slot.querySelector("#getStartedBtn").onclick = () => {
        location.href = "/auth/login.html";
    };
}

function renderLoggedIn(slot, user) {
    // Store viewer id for non-module pages (feed.js, u.js)
    localStorage.setItem("sm_uid", user.$id);

    const name = escapeHtml(user?.name || "Profile");
    slot.innerHTML = `
    <div style="display:flex;gap:10px;align-items:center;justify-content:flex-end">
      <button class="authBtn" id="profileBtn">👤 ${name}</button>
      <button class="authLogout" id="logoutBtn">Logout</button>
    </div>
  `;

    slot.querySelector("#profileBtn").onclick = () => {
        location.href = "/profile/profile.html";
    };

    slot.querySelector("#logoutBtn").onclick = async () => {
        try { await account.deleteSession("current"); } catch {}
        localStorage.removeItem("sm_uid");
        renderLoggedOut(slot);
    };
}

function escapeHtml(s) {
    return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
