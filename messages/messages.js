// /messages/messages.js
console.log("messages.js LOADED ✅", location.href);

const $ = (id) => document.getElementById(id);
const inboxList = $("inboxList");
const inboxHint = $("inboxHint");
const peerName  = $("peerName");
const peerAva   = $("peerAva");
const msgList   = $("msgList");
const msgHint   = $("msgHint");
const msgForm   = $("msgForm");
const msgInput  = $("msgInput");
const backBtn   = $("chatBackBtn");

const FN = "/.netlify/functions";
const qs = (k) => new URLSearchParams(location.search).get(k);

function setHint(el, t){ if (el) el.textContent = t || ""; }
function esc(s){ return String(s ?? "").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }

async function getJWT(){
    if (window.SM_JWT_READY) await window.SM_JWT_READY;
    const jwt = window.SM_JWT || localStorage.getItem("sm_jwt");
    if (!jwt) throw new Error("Missing JWT (login required)");
    return jwt;
}

async function apiGET(path){
    const jwt = await getJWT();
    const r = await fetch(`${FN}${path}`, {
        headers:{ Authorization:`Bearer ${jwt}`, "X-Appwrite-JWT": jwt },
    });
    const j = await r.json().catch(()=> ({}));
    if (!r.ok) throw new Error(j?.error || `GET ${path} failed (${r.status})`);
    return j;
}

async function apiPOST(path, body){
    const jwt = await getJWT();
    const r = await fetch(`${FN}${path}`, {
        method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:`Bearer ${jwt}`, "X-Appwrite-JWT": jwt },
        body: JSON.stringify(body||{})
    });
    const j = await r.json().catch(()=> ({}));
    if (!r.ok) throw new Error(j?.error || `POST ${path} failed (${r.status})`);
    return j;
}

let ME = null;
let ACTIVE_CONV = null;
let ACTIVE_PEER = null;

// realtime state
let joinedConvId = null;
let onDmNewBound = null;

function setPeerUI(name, avatar){
    peerName.textContent = name || "User";
    peerAva.innerHTML = avatar
        ? `<img src="${esc(avatar)}" style="width:36px;height:36px;border-radius:999px;object-fit:cover">`
        : `<div style="width:36px;height:36px;border-radius:999px;background:rgba(0,0,0,.08)"></div>`;
}

function appendMessage(m){
    const isMe = m.sender_id === ME;
    const b = document.createElement("div");
    b.style.cssText = `
    max-width:70%; margin:8px 0; padding:10px 12px;
    border-radius:14px; border:1px solid rgba(0,0,0,.08);
    background: rgba(255,255,255,.85);
    ${isMe ? "margin-left:auto" : "margin-right:auto"}
  `;
    b.innerHTML = `
    <div style="font-weight:800">${esc(m.body || "")}</div>
    <div style="opacity:.6;font-size:11px;margin-top:4px">${esc(m.created_at || "")}</div>
  `;
    msgList.appendChild(b);
    msgList.scrollTop = msgList.scrollHeight;
}

function renderMessages(arr){
    msgList.innerHTML = "";
    for (const m of arr) appendMessage(m);
    msgList.scrollTop = msgList.scrollHeight;
}

// ✅ socket join + listener (kritik)
async function ensureRealtimeJoined(conversation_id){
    const socket = window.SM_SOCKET;
    if (!socket) {
        console.warn("⚠️ SM_SOCKET yok -> realtime kapalı");
        return;
    }
    if (!socket.connected) {
        // bağlanmayı bekle
        await new Promise((res) => {
            const t = setTimeout(res, 1500);
            socket.once("connect", () => { clearTimeout(t); res(); });
        });
    }

    if (joinedConvId === conversation_id) return;

    // önce eski listener'ı temizle
    if (onDmNewBound) socket.off("dm:new", onDmNewBound);

    const jwt = await getJWT();

    // server'a auth+join iste
    socket.emit("dm:join", { conversation_id, jwt });

    // yeni mesaj event'i
    onDmNewBound = (payload) => {
        // payload: { conversation_id, message:{...} }
        if (!payload?.conversation_id || payload.conversation_id !== conversation_id) return;
        const m = payload.message;
        if (!m) return;

        // duplicate engel (id varsa)
        if (m.id && msgList.querySelector?.(`[data-mid="${m.id}"]`)) return;

        // append
        const wrap = document.createElement("div");
        wrap.dataset.mid = m.id || "";
        // wrap içine bubble bas
        const isMe = m.sender_id === ME;
        wrap.style.cssText = `
      max-width:70%; margin:8px 0; padding:10px 12px;
      border-radius:14px; border:1px solid rgba(0,0,0,.08);
      background: rgba(255,255,255,.85);
      ${isMe ? "margin-left:auto" : "margin-right:auto"}
    `;
        wrap.innerHTML = `
      <div style="font-weight:800">${esc(m.body || "")}</div>
      <div style="opacity:.6;font-size:11px;margin-top:4px">${esc(m.created_at || "")}</div>
    `;
        msgList.appendChild(wrap);
        msgList.scrollTop = msgList.scrollHeight;
    };

    socket.on("dm:new", onDmNewBound);

    joinedConvId = conversation_id;
    console.log("✅ joined realtime conv:", conversation_id);
}

async function loadInbox(){
    setHint(inboxHint, "Loading…");
    inboxList.innerHTML = "";

    const j = await apiGET("/dm_inbox");
    const list = j.list || [];

    if (!list.length){
        setHint(inboxHint, "No conversations yet.");
        return;
    }
    setHint(inboxHint, "");

    for (const it of list){
        const row = document.createElement("button");
        row.type = "button";
        row.style.cssText = "width:100%;border:0;background:transparent;padding:10px;text-align:left;cursor:pointer;border-radius:12px";
        row.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center">
        <div style="width:34px;height:34px;border-radius:999px;background:#eee;overflow:hidden">
          ${it.other_avatar_url ? `<img src="${esc(it.other_avatar_url)}" style="width:100%;height:100%;object-fit:cover">` : ""}
        </div>
        <div style="min-width:0">
          <div style="font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(it.other_name)}</div>
          <div style="font-size:12px;opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(it.last_body || "")}</div>
        </div>
      </div>
    `;
        row.onclick = () => {
            const u = new URL(location.href);
            u.searchParams.delete("to");
            u.searchParams.set("conversation_id", it.conversation_id);
            history.pushState({}, "", u.toString());
            bootFromURL().catch(e => setHint(msgHint, e?.message || String(e)));
        };
        inboxList.appendChild(row);
    }
}

async function bootFromURL(){
    const to = qs("to");
    ACTIVE_CONV = qs("conversation_id");

    // profile -> /messages/?to=...
    if (to && !ACTIVE_CONV){
        setHint(msgHint, "Opening chat…");
        const ensured = await apiGET(`/dm_ensure?to=${encodeURIComponent(to)}`);

        const u = new URL(location.href);
        u.searchParams.delete("to");
        u.searchParams.set("conversation_id", ensured.conversation_id);
        history.replaceState({}, "", u.toString());

        ACTIVE_CONV = ensured.conversation_id;
    }

    if (!ACTIVE_CONV){
        peerName.textContent = "Select a chat";
        msgList.innerHTML = "";
        setHint(msgHint, "Select a chat");
        return;
    }

    setHint(msgHint, "Loading…");
    const j = await apiGET(`/dm_get?conversation_id=${encodeURIComponent(ACTIVE_CONV)}`);

    ACTIVE_PEER = j.peer || null;
    setPeerUI(j.peer?.name || "User", j.peer?.avatar_url || "");
    renderMessages(j.list || []);
    setHint(msgHint, "");

    // mark read
    apiPOST("/dm_mark_read", { conversation_id: ACTIVE_CONV }).catch(()=>{});

    // ✅ realtime join here
    await ensureRealtimeJoined(ACTIVE_CONV);
}

async function sendMessage(text){
    if (!ACTIVE_CONV) throw new Error("No active conversation");

    // ✅ optimistic UI (anında göster)
    appendMessage({ sender_id: ME, body: text, created_at: new Date().toISOString() });

    // send
    await apiPOST("/dm_send", { conversation_id: ACTIVE_CONV, body: text });

    // inbox yenilensin (last message güncellensin)
    loadInbox().catch(()=>{});
}

(async function init(){
    try{
        const me = await apiGET("/_auth_user");
        ME = me.uid;
        console.log("ME ✅", ME);

        await loadInbox();
        await bootFromURL();

        backBtn?.addEventListener("click", () => {
            const u = new URL(location.href);
            u.searchParams.delete("to");
            u.searchParams.delete("conversation_id");
            history.pushState({}, "", u.toString());
            bootFromURL().catch(()=>{});
        });

        msgForm?.addEventListener("submit", async (e) => {
            e.preventDefault();
            const t = (msgInput.value || "").trim();
            if (!t) return;
            msgInput.value = "";
            try{ await sendMessage(t); }
            catch(err){ setHint(msgHint, err?.message || String(err)); }
        });

        window.addEventListener("popstate", () => {
            bootFromURL().catch((e)=> setHint(msgHint, e?.message || String(e)));
        });

    } catch(e){
        console.error(e);
        setHint(inboxHint, "Login required");
        setHint(msgHint, e?.message || String(e));
    }
})();
