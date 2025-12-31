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
const leftSearch = $("leftSearch");

// ---- helpers
function setHint(el, txt) { if (el) el.textContent = txt || ""; }
function esc(s){ return String(s||"").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }
function qs(name){ return new URLSearchParams(location.search).get(name); }

// ---- API base (Netlify functions)
const FN = "/.netlify/functions";

// ---- auth (kendi sistemin için _auth_user kullanıyoruz)
async function getMe(){
    const r = await fetch(`${FN}/_auth_user`, { credentials:"include" });
    const j = await r.json().catch(()=> ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `auth failed (${r.status})`);
    // uyumluluk: uid / user_id / user.$id
    return j.uid || j.user_id || j?.user?.$id;
}

// ---- active state
let ME = null;
let ACTIVE_TO = null;          // peer user id
let ACTIVE_CONV = null;        // optional conversation id

function setActivePeerUI(name, avatarUrl){
    peerName.textContent = name || "Unknown";
    peerAva.innerHTML = avatarUrl
        ? `<img src="${esc(avatarUrl)}" alt="" style="width:36px;height:36px;border-radius:999px;object-fit:cover;">`
        : `<div style="width:36px;height:36px;border-radius:999px;background:rgba(0,0,0,.08)"></div>`;
}

// ---- load left list
async function loadInbox(){
    setHint(inboxHint, "Loading…");
    inboxList.innerHTML = "";

    const r = await fetch(`${FN}/dm_list`, { credentials:"include" });
    const j = await r.json().catch(()=> ({}));

    console.log("dm_list status:", r.status, j);

    if (!r.ok || !j?.ok){
        setHint(inboxHint, j?.error || `dm_list failed (${r.status})`);
        return;
    }

    const items = j.items || [];
    if (!items.length){
        setHint(inboxHint, "No conversations yet.");
        return;
    }

    setHint(inboxHint, "");
    for (const it of items){
        // it: { peer_id, peer_name, peer_avatar, last_text, last_ts, conversation_id }
        const peerId = it.peer_id;
        const name = it.peer_name || "Unknown";
        const last = it.last_text || "";
        const conv = it.conversation_id || "";

        const row = document.createElement("button");
        row.type = "button";
        row.className = "inboxRow"; // css’in yoksa bile sorun değil
        row.style.cssText = "width:100%;text-align:left;border:0;background:transparent;padding:10px 8px;border-radius:12px;cursor:pointer;";
        row.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center;">
        <div style="width:34px;height:34px;border-radius:999px;background:rgba(0,0,0,.08);overflow:hidden;">
          ${it.peer_avatar ? `<img src="${esc(it.peer_avatar)}" style="width:100%;height:100%;object-fit:cover;">` : ""}
        </div>
        <div style="min-width:0;flex:1">
          <div style="font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(name)}</div>
          <div style="opacity:.7;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(last)}</div>
        </div>
      </div>
    `;
        row.addEventListener("click", () => {
            // URL güncelle
            const u = new URL(location.href);
            u.searchParams.set("to", peerId);
            if (conv) u.searchParams.set("conversation_id", conv);
            history.pushState({}, "", u.toString());
            bootActiveFromURL(); // yeniden yükle
        });

        inboxList.appendChild(row);
    }
}

// ---- load peer + messages
async function loadActiveChat(){
    if (!ACTIVE_TO && !ACTIVE_CONV){
        peerName.textContent = "Select a chat";
        setHint(msgHint, "Select a chat");
        msgList.innerHTML = "";
        return;
    }

    setHint(msgHint, "Loading…");
    msgList.innerHTML = "";

    // 1) peer info + (opsiyonel) conversation resolve
    const q = new URLSearchParams();
    if (ACTIVE_TO) q.set("to", ACTIVE_TO);
    if (ACTIVE_CONV) q.set("conversation_id", ACTIVE_CONV);

    const r = await fetch(`${FN}/dm_get?` + q.toString(), { credentials:"include" });
    const j = await r.json().catch(()=> ({}));

    console.log("dm_get status:", r.status, j);

    if (!r.ok || !j?.ok){
        setHint(msgHint, j?.error || `dm_get failed (${r.status})`);
        peerName.textContent = "Select a chat";
        return;
    }

    // dm_get response beklenen:
    // { ok:true, peer:{id,name,avatar}, conversation_id:"...", messages:[...] }
    ACTIVE_TO = j.peer?.id || ACTIVE_TO;
    ACTIVE_CONV = j.conversation_id || ACTIVE_CONV;

    setActivePeerUI(j.peer?.name || "Unknown", j.peer?.avatar || "");

    renderMessages(j.messages || []);
    setHint(msgHint, "");
}

function renderMessages(arr){
    msgList.innerHTML = "";
    if (!arr.length) return;

    for (const m of arr){
        const isMe = (m.sender_id === ME);
        const bubble = document.createElement("div");
        bubble.style.cssText = `
      max-width: 70%;
      margin: 8px 0;
      padding: 10px 12px;
      border-radius: 14px;
      border: 1px solid rgba(0,0,0,.08);
      background: rgba(255,255,255,.75);
      ${isMe ? "margin-left:auto;" : "margin-right:auto;"}
    `;
        bubble.innerHTML = `<div style="font-weight:700">${esc(m.text || "")}</div>
      <div style="opacity:.65;font-size:11px;margin-top:4px">${esc(m.created_at || "")}</div>`;
        msgList.appendChild(bubble);
    }

    // scroll bottom
    msgList.scrollTop = msgList.scrollHeight;
}

// ---- send
async function sendMessage(text){
    if (!ACTIVE_TO && !ACTIVE_CONV) throw new Error("No active chat");

    const payload = { to: ACTIVE_TO, conversation_id: ACTIVE_CONV, text };

    const r = await fetch(`${FN}/dm_send`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify(payload),
    });
    const j = await r.json().catch(()=> ({}));
    console.log("dm_send status:", r.status, j);

    if (!r.ok || !j?.ok) throw new Error(j?.error || `dm_send failed (${r.status})`);

    // refresh
    await loadActiveChat();
}

// ---- boot
function bootActiveFromURL(){
    ACTIVE_TO = qs("to") || null;
    ACTIVE_CONV = qs("conversation_id") || null;

    console.log("ACTIVE_TO:", ACTIVE_TO, "ACTIVE_CONV:", ACTIVE_CONV);

    loadActiveChat();
}

(async function init(){
    try{
        ME = await getMe();
        console.log("ME:", ME);

        await loadInbox();
        bootActiveFromURL();

        // back button (mobil)
        backBtn?.addEventListener("click", () => {
            // mobilde sağ panelden sola dönmek için: aktif chati temizle
            const u = new URL(location.href);
            u.searchParams.delete("to");
            u.searchParams.delete("conversation_id");
            history.pushState({}, "", u.toString());
            bootActiveFromURL();
        });

        // send
        msgForm?.addEventListener("submit", async (e) => {
            e.preventDefault();
            const t = (msgInput.value || "").trim();
            if (!t) return;
            msgInput.value = "";
            try { await sendMessage(t); }
            catch(err){ setHint(msgHint, String(err?.message || err)); }
        });

        window.addEventListener("popstate", bootActiveFromURL);

    } catch (e){
        console.error(e);
        setHint(inboxHint, "Login required or auth failed.");
        setHint(msgHint, String(e?.message || e));
    }
})();
