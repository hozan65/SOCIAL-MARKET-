import { account } from "/assets/appwrite.js";

console.log("✅ messages.js loaded (inbox + chat)");

const qs = () => new URLSearchParams(location.search);
const esc = (s) => String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");

const fmtTime = (iso) => {
    try { return new Date(iso).toLocaleString("tr-TR",{ dateStyle:"short", timeStyle:"short" }); }
    catch { return ""; }
};

const $app = document.querySelector(".msgApp");
const $inboxList = document.getElementById("inboxList");
const $inboxHint = document.getElementById("inboxHint");
const $search = document.getElementById("leftSearch");

const $msgList = document.getElementById("msgList");
const $msgForm = document.getElementById("msgForm");
const $msgInput = document.getElementById("msgInput");
const $msgHint = document.getElementById("msgHint");

const $peerName = document.getElementById("peerName");
const $peerSub = document.getElementById("peerSub");
const $peerAva = document.getElementById("peerAva");

const $chatBackBtn = document.getElementById("chatBackBtn");
const $backFeedBtn = document.getElementById("backFeedBtn");

let meId = null;
let activeTo = null;
let activeConversationId = null;

async function getJwtHeaders(){
    const jwtObj = await account.createJWT();
    const jwt = jwtObj?.jwt;
    if (!jwt) throw new Error("JWT could not be created");
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${jwt}`,
        "X-Appwrite-JWT": jwt,
        "x-jwt": jwt
    };
}

async function apiGet(url){
    const headers = await getJwtHeaders();
    const r = await fetch(url, { headers, cache:"no-store" });
    const j = await r.json().catch(()=> ({}));
    if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    return j;
}

async function apiPost(url, body){
    const headers = await getJwtHeaders();
    const r = await fetch(url, {
        method:"POST",
        headers,
        body: JSON.stringify(body || {}),
        cache:"no-store"
    });
    const j = await r.json().catch(()=> ({}));
    if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    return j;
}

/* ---------- Inbox ---------- */
let inboxCache = [];

function renderInbox(list){
    if (!list?.length){
        $inboxList.innerHTML = `<div style="opacity:.7;padding:12px;font-weight:900;">No chats yet.</div>`;
        return;
    }

    $inboxList.innerHTML = list.map((c) => {
        const active = (c.other_id === activeTo) ? "active" : "";
        const ava = c.other_avatar_url
            ? `<img src="${esc(c.other_avatar_url)}" alt="">`
            : "";
        const last = esc(c.last_body || "");
        const time = c.last_at ? fmtTime(c.last_at) : "";
        const badge = c.unread ? `<div class="badge">${c.unread}</div>` : "";

        return `
      <div class="chatItem ${active}" data-to="${esc(c.other_id)}" data-cid="${esc(c.conversation_id)}">
        <div class="chatAva">${ava}</div>
        <div class="chatMain">
          <div class="chatRow1">
            <div class="chatName">${esc(c.other_name || "User")}</div>
            <div class="chatTime">${esc(time)}</div>
          </div>
          <div class="chatLast">${last || " "}</div>
        </div>
        ${badge}
      </div>
    `;
    }).join("");

    $inboxList.querySelectorAll(".chatItem").forEach((row) => {
        row.addEventListener("click", () => {
            const to = row.getAttribute("data-to");
            const cid = row.getAttribute("data-cid");
            openChat(to, cid, true);
        });
    });
}

async function loadInbox(){
    $inboxHint.textContent = "Loading...";
    try{
        const j = await apiGet("/.netlify/functions/dm_inbox?limit=60");
        inboxCache = j?.list || [];
        $inboxHint.textContent = "";

        applySearch();
    }catch(e){
        console.error(e);
        $inboxHint.textContent = "❌ " + (e?.message || e);
    }
}

function applySearch(){
    const q = ($search?.value || "").trim().toLowerCase();
    const filtered = !q ? inboxCache : inboxCache.filter(x =>
        String(x.other_name || "").toLowerCase().includes(q)
    );
    renderInbox(filtered);
}

/* ---------- Chat ---------- */
function renderEmptyChat(){
    $peerName.textContent = "Select a chat";
    $peerSub.textContent = "Choose someone from the left";
    $peerAva.innerHTML = "";
    $msgList.innerHTML = `<div style="opacity:.7;padding:14px;font-weight:900;">No chat selected.</div>`;
    $msgHint.textContent = "";
    activeTo = null;
    activeConversationId = null;
}

function renderMessages(list){
    const html = (list || []).map(m => {
        const mine = m.sender_id === meId;
        const t = m.created_at ? fmtTime(m.created_at) : "";

        const tickHtml = mine ? `
      <span class="tick ${m.read_at ? "read" : ""}">
        <span>✓</span><span>✓</span>
      </span>
    ` : "";

        return `
      <div class="bubble ${mine ? "me" : ""}">
        <div>${esc(m.body)}</div>
        <div class="metaRow">
          <div class="t">${esc(t)}</div>
          ${tickHtml}
        </div>
      </div>
    `;
    }).join("");

    $msgList.innerHTML = html || `<div style="opacity:.7;padding:12px;font-weight:900;">No messages yet.</div>`;
    $msgList.scrollTop = $msgList.scrollHeight;
}

async function getConversation(to){
    const j = await apiGet(`/.netlify/functions/dm_get_or_create?to=${encodeURIComponent(to)}`);
    const cid = j?.conversation_id;
    if (!cid) throw new Error("Missing conversation_id");
    return cid;
}

async function loadMessages(){
    if (!activeConversationId) return;
    const j = await apiGet(`/.netlify/functions/dm_list?conversation_id=${encodeURIComponent(activeConversationId)}&limit=120`);
    renderMessages(j?.list || []);
    await apiPost("/.netlify/functions/dm_mark_read", { conversation_id: activeConversationId }).catch(()=>{});
}

async function openChat(to, knownCid, pushUrl){
    activeTo = to;

    // mobile: show chat pane
    $app?.classList.add("showChat");

    // header info from inbox cache if possible
    const row = inboxCache.find(x => x.other_id === to);
    $peerName.textContent = row?.other_name || "Chat";
    $peerSub.textContent = "Direct messages";
    $peerAva.innerHTML = row?.other_avatar_url ? `<img src="${esc(row.other_avatar_url)}" alt="">` : "";

    try{
        $msgHint.textContent = "Loading...";
        activeConversationId = knownCid || await getConversation(to);
        $msgHint.textContent = "";
        if (pushUrl) {
            const u = new URL(location.href);
            u.searchParams.set("to", to);
            history.pushState({}, "", u.toString());
        }
        renderInbox(inboxCache); // active highlight
        await loadMessages();
    }catch(e){
        console.error(e);
        $msgHint.textContent = "❌ " + (e?.message || e);
    }
}

async function sendMessage(text){
    if (!activeConversationId) throw new Error("No chat selected");
    await apiPost("/.netlify/functions/dm_send", { conversation_id: activeConversationId, body: text });
    await loadMessages();
}

/* ---------- Boot ---------- */
(async function boot(){
    try{
        const me = await account.get();
        meId = me?.$id;
        if (!meId) { location.href = "/auth/login.html"; return; }

        // inbox always loads (so /messages/ never errors)
        await loadInbox();

        // if ?to exists, open it
        const to = (qs().get("to") || "").trim();
        if (to) {
            const row = inboxCache.find(x => x.other_id === to);
            await openChat(to, row?.conversation_id || null, false);
        } else {
            renderEmptyChat();
        }

        // search
        $search?.addEventListener("input", applySearch);

    }catch(e){
        console.error(e);
        $msgHint.textContent = "❌ " + (e?.message || e);
    }
})();

/* events */
$msgForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = ($msgInput.value || "").trim();
    if (!text) return;
    $msgInput.value = "";
    try{
        await sendMessage(text);
        $msgHint.textContent = "";
    }catch(err){
        console.error(err);
        $msgHint.textContent = "❌ " + (err?.message || err);
    }
});

// polling
setInterval(() => {
    if (activeConversationId) loadMessages().catch(()=>{});
    loadInbox().catch(()=>{});
}, 3500);

// mobile back to list
$chatBackBtn?.addEventListener("click", () => {
    $app?.classList.remove("showChat");
});

// back to feed
$backFeedBtn?.addEventListener("click", () => {
    if (history.length > 1) history.back();
    else location.href = "/feed/feed.html";
});

window.addEventListener("popstate", () => {
    const to = (qs().get("to") || "").trim();
    if (!to) renderEmptyChat();
});
