// /signal/signal.js
const FN_LIST   = "/.netlify/functions/ai_list_sessions";
const FN_CREATE = "/.netlify/functions/ai_create_session";
const FN_GET    = "/.netlify/functions/ai_get_messages";
const FN_SEND   = "/.netlify/functions/ai_send_message";

const PROFILE_URL = "/signal/profile.html";
const UPGRADE_URL = "/signal/upgrade.html";

const uid = (localStorage.getItem("sm_uid") || "").trim();

const $messages = document.getElementById("messages");
const $input = document.getElementById("chatInput");
const $send = document.getElementById("btnSend");

const $chatList = document.getElementById("chatList");
const $btnNew = document.getElementById("btnNewChat");
const $search = document.getElementById("chatSearch");

const $chatTitle = document.getElementById("chatTitle");

const $drawer = document.getElementById("chatDrawer");
const $backdrop = document.getElementById("drawerBackdrop");
const $btnOpenChats = document.getElementById("btnOpenChats");

const $pfName = document.getElementById("pfName");
const $pfEmail = document.getElementById("pfEmail");
const $pfPlan = document.getElementById("pfPlan");
const $btnProfile = document.getElementById("btnProfile");
const $btnUpgrade = document.getElementById("btnUpgrade");

if (!uid) {
    if ($messages) $messages.innerHTML = `<div class="intro"><div><h2>Login required</h2><p>sm_uid bulunamadı</p></div></div>`;
    if ($input) $input.disabled = true;
    if ($send) $send.disabled = true;
    throw new Error("Missing sm_uid");
}

const ACTIVE_KEY = `signal_active_sid_${uid}`;
let activeSid = localStorage.getItem(ACTIVE_KEY) || "";

let allSessions = [];

const esc = (s) =>
    String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

function setIntro() {
    $messages.innerHTML = `
    <div class="intro">
      <div>
        <h2>HEY 👋 I’m your Finance Assistant</h2>
        <p>Ask me anything about crypto, stocks, or markets.</p>
      </div>
    </div>
  `;
}

function setBusy(b) {
    $input.disabled = b;
    $send.disabled = b;
}

function openDrawer() {
    $drawer.classList.add("open");
    $backdrop.classList.add("open");
    $backdrop.setAttribute("aria-hidden", "false");
}
function closeDrawer() {
    $drawer.classList.remove("open");
    $backdrop.classList.remove("open");
    $backdrop.setAttribute("aria-hidden", "true");
}

$btnOpenChats?.addEventListener("click", () => openDrawer());
$backdrop?.addEventListener("click", () => closeDrawer());

function addMsg(role, text) {
    const row = document.createElement("div");
    row.className = `msgRow ${role}`;
    row.innerHTML = `
    <div class="bubbleWrap">
      <div class="bubble">${esc(text)}</div>
    </div>
  `;
    $messages.appendChild(row);
    $messages.scrollTop = $messages.scrollHeight;
    return row;
}

function renderSessions(list) {
    $chatList.innerHTML = "";
    if (!list.length) {
        $chatList.innerHTML = `<div style="padding:10px;opacity:.7;font-weight:900;">No chats yet</div>`;
        return;
    }

    for (const s of list) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chatItem";
        btn.dataset.sid = s.sid;
        btn.dataset.title = s.title || "New chat";

        const created = s.created_at ? new Date(s.created_at).toLocaleString() : "";
        btn.innerHTML = `
      <div class="chatTitleMini">${esc(s.title || "New chat")}</div>
      <div class="chatMeta">${esc(created)}</div>
    `;

        if (s.sid === activeSid) btn.classList.add("active");

        btn.addEventListener("click", async () => {
            activeSid = s.sid;
            localStorage.setItem(ACTIVE_KEY, activeSid);
            $chatList.querySelectorAll(".chatItem").forEach(x => x.classList.remove("active"));
            btn.classList.add("active");

            $chatTitle.textContent = s.title || "New chat";
            await loadMessages();
            closeDrawer(); // mobile
        });

        $chatList.appendChild(btn);
    }
}

function applySearchFilter() {
    const q = ($search.value || "").trim().toLowerCase();
    if (!q) {
        renderSessions(allSessions);
        return;
    }
    const filtered = allSessions.filter(s => (s.title || "").toLowerCase().includes(q));
    renderSessions(filtered);
}

$search?.addEventListener("input", applySearchFilter);

async function apiJSON(url, opts) {
    const r = await fetch(url, {
        cache: "no-store",
        ...opts,
        headers: {
            ...(opts?.headers || {}),
            "x-user-id": uid,
        },
    });
    const t = await r.text();
    let data = {};
    try { data = JSON.parse(t); } catch { data = { raw: t }; }
    return { ok: r.ok, status: r.status, data };
}

async function loadProfileBadge() {
    // Basit: ai_users tablosu zaten var. İstersen netlify fn ile çekersin.
    // Şimdilik localStorage üzerinden dolduruyoruz (yoksa — kalır).
    $pfName.textContent = localStorage.getItem("sm_name") || "—";
    $pfEmail.textContent = localStorage.getItem("sm_email") || "—";
    $pfPlan.textContent = (localStorage.getItem("sm_plan") || "free").toLowerCase();

    $btnProfile?.addEventListener("click", () => (location.href = PROFILE_URL));
    $btnUpgrade?.addEventListener("click", () => (location.href = UPGRADE_URL));
}

async function loadSessions() {
    const res = await apiJSON(FN_LIST, { method: "GET" });
    if (!res.ok) {
        console.error("list sessions failed", res.status, res.data);
        allSessions = [];
        renderSessions([]);
        return [];
    }

    allSessions = res.data.sessions || [];

    if (!activeSid && allSessions[0]?.sid) {
        activeSid = allSessions[0].sid;
        localStorage.setItem(ACTIVE_KEY, activeSid);
    }

    // title bar
    const active = allSessions.find(s => s.sid === activeSid);
    $chatTitle.textContent = active?.title || "New chat";

    renderSessions(allSessions);
    return allSessions;
}

async function createSession() {
    const res = await apiJSON(FN_CREATE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New chat" }),
    });

    if (!res.ok) {
        console.error("create session failed", res.status, res.data);
        return null;
    }

    activeSid = res.data.session.sid;
    localStorage.setItem(ACTIVE_KEY, activeSid);

    await loadSessions();
    await loadMessages();
    return res.data.session;
}

async function loadMessages() {
    if (!activeSid) {
        setIntro();
        return;
    }

    // ✅ Loading yazısı göstermiyoruz; sadece içeriği güncelliyoruz
    const res = await apiJSON(`${FN_GET}?session_id=${encodeURIComponent(activeSid)}`, { method: "GET" });

    if (!res.ok) {
        console.error("get messages failed", res.status, res.data);
        setIntro();
        return;
    }

    const msgs = res.data.messages || [];
    $messages.innerHTML = "";

    if (!msgs.length) {
        setIntro();
        return;
    }

    for (const m of msgs) {
        addMsg(m.role === "assistant" ? "assistant" : "user", m.content || "");
    }

    $messages.scrollTop = $messages.scrollHeight;
}

async function sendMessage() {
    const text = ($input.value || "").trim();
    if (!text) return;

    if (!activeSid) {
        await createSession();
    }

    // intro varsa kaldır
    if ($messages.querySelector(".intro")) $messages.innerHTML = "";

    $input.value = "";
    addMsg("user", text);

    const typing = addMsg("assistant", "…");
    setBusy(true);

    const res = await apiJSON(FN_SEND, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: activeSid, text }),
    });

    if (!res.ok) {
        console.error("send failed", res.status, res.data);
        typing.querySelector(".bubble").textContent = `Hata: ${res.data?.error || "send failed"}`;
        setBusy(false);
        return;
    }

    typing.querySelector(".bubble").textContent = res.data.reply || "(no reply)";
    setBusy(false);

    // ✅ Başlık güncellemesi server’da olduysa, listeyi tazele
    await loadSessions();
}

$btnNew?.addEventListener("click", createSession);
$send?.addEventListener("click", sendMessage);

$input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

(async function init() {
    await loadProfileBadge();
    await loadSessions();
    await loadMessages();
    setIntro(); // aktifSid yoksa; varsa loadMessages zaten doldurur
})();
