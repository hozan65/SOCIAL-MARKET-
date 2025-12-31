// /messages/messages.js
import { account } from "/assets/appwrite.js";

const qs = (k) => new URLSearchParams(location.search).get(k);

const $app = document.querySelector(".msgApp");
const $inboxList = document.getElementById("inboxList");
const $search = document.getElementById("leftSearch");

const $msgList = document.getElementById("msgList");
const $msgForm = document.getElementById("msgForm");
const $msgInput = document.getElementById("msgInput");

const $peerName = document.getElementById("peerName");
const $peerAva = document.getElementById("peerAva");
const $chatBackBtn = document.getElementById("chatBackBtn");

let meId = null;
let activeConversationId = null;
let activeTo = null;
let inboxCache = [];
let lastFp = "";

/* =========================
   REALTIME (Socket.IO)
   - uses: window.rt.socket (assets1/realtime.js)
========================= */
function getSocket() {
    return window.rt?.socket || null;
}
function rtOn(ev, fn) {
    const s = getSocket();
    if (!s) return;
    // double-bind olmasın
    s.off?.(ev);
    s.on(ev, fn);
}
function rtEmit(ev, payload) {
    const s = getSocket();
    if (!s) return;
    s.emit(ev, payload);
}

/* helpers */
const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (m) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m])
    );

async function headers() {
    const j = await account.createJWT();
    return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${j.jwt}`,
        "X-Appwrite-JWT": j.jwt,
    };
}

async function apiGet(url) {
    const r = await fetch(url, { headers: await headers() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw j;
    return j;
}

async function apiPost(url, body) {
    const r = await fetch(url, {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw j;
    return j;
}

/* inbox */
function renderInbox(list) {
    $inboxList.innerHTML = list
        .map(
            (c) => `
    <div class="chatItem ${c.other_id === activeTo ? "active" : ""}"
      data-to="${c.other_id}"
      data-cid="${c.conversation_id}">
      <div class="chatAva">${c.other_avatar_url ? `<img src="${esc(c.other_avatar_url)}">` : ""}</div>
      <div class="chatMain">
        <div class="chatName">${esc(c.other_name)}</div>
        <div class="chatLast">${esc(c.last_body || "")}</div>
      </div>
      ${c.unread ? `<div class="badge">${c.unread}</div>` : ""}
    </div>
  `
        )
        .join("");

    $inboxList.querySelectorAll(".chatItem").forEach((el) => {
        el.onclick = () => openChat(el.dataset.to, el.dataset.cid, true);
    });
}

async function loadInbox() {
    const j = await apiGet("/.netlify/functions/dm_inbox?limit=60");
    inboxCache = j.list || [];
    renderInbox(inboxCache);
}

/* chat */
async function loadMessages() {
    if (!activeConversationId) return;

    const j = await apiGet(
        `/.netlify/functions/dm_list?conversation_id=${encodeURIComponent(activeConversationId)}&limit=120`
    );
    const list = j.list || [];

    const last = list[list.length - 1];
    const fp = list.length + "|" + (last?.created_at || "");
    if (fp === lastFp) return;
    lastFp = fp;

    $msgList.innerHTML = list
        .map(
            (m) => `
    <div class="bubble ${m.sender_id === meId ? "me" : ""}">
      ${esc(m.body)}
      <div class="metaRow">
        ${
                m.sender_id === meId
                    ? `<span class="tick ${m.read_at ? "read" : ""}">✓✓</span>`
                    : ""
            }
      </div>
    </div>
  `
        )
        .join("");

    $msgList.scrollTop = $msgList.scrollHeight;

    // mark read (DB)
    await apiPost("/.netlify/functions/dm_mark_read", {
        conversation_id: activeConversationId,
    });
}

async function openChat(to, cid, push) {
    activeTo = to;
    activeConversationId = cid;
    lastFp = "";
    $app.classList.add("showChat");

    const row = inboxCache.find((x) => x.other_id === to);
    $peerName.textContent = row?.other_name || "Chat";
    $peerAva.innerHTML = row?.other_avatar_url ? `<img src="${row.other_avatar_url}">` : "";

    if (push) {
        const u = new URL(location.href);
        u.searchParams.set("to", to);
        history.pushState({}, "", u);
    }

    await loadMessages();
}

/* events */
$msgForm.onsubmit = async (e) => {
    e.preventDefault();
    const body = $msgInput.value.trim();
    if (!body) return;
    if (!activeConversationId) return;

    // 1) DB'ye yaz (source of truth)
    await apiPost("/.netlify/functions/dm_send", {
        conversation_id: activeConversationId,
        body,
    });

    // 2) UI local refresh
    $msgInput.value = "";
    lastFp = "";
    await loadMessages();
    await loadInbox();

    // 3) ✅ REALTIME: karşı tarafa anında haber ver
    // (DB başarılı olduktan sonra emit ediyoruz)
    rtEmit("dm:send", {
        conversation_id: String(activeConversationId),
        to_id: String(activeTo || ""),
        from_id: String(meId || ""),
        body,
        ts: Date.now(),
    });
};

$chatBackBtn.onclick = () => {
    $app.classList.remove("showChat");
    activeConversationId = null;
    activeTo = null;
};

/* ✅ REALTIME: dm:new gelince anında yenile */
function bindRealtimeDM() {
    // Yeni mesaj event'i
    rtOn("dm:new", async (p) => {
        try {
            const cid = String(p?.conversation_id || "").trim();
            if (!cid) return;

            // inbox yenile (badge/last message)
            await loadInbox();

            // açık chat aynıysa mesajları yenile
            if (activeConversationId && String(activeConversationId) === cid) {
                lastFp = "";
                await loadMessages();
            }
        } catch {}
    });
}

/* boot */
(async () => {
    const me = await account.get();
    meId = me.$id;

    // ✅ user room’a gir (server.js’de auth_user var)
    try {
        rtEmit("auth_user", meId);
    } catch {}

    // realtime DM dinle
    bindRealtimeDM();

    await loadInbox();

    const to = qs("to");
    if (to) {
        const row = inboxCache.find((x) => x.other_id === to);
        if (row) openChat(to, row.conversation_id, false);
    }

    // ✅ fallback polling (realtime koparsa diye) — daha seyrek
    setInterval(async () => {
        await loadInbox();
        if (activeConversationId) await loadMessages();
    }, 45000);
})();
