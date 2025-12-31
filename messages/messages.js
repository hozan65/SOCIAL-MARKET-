// /messages/messages.js
console.log("messages.js LOADED ✅", location.href);

const $ = (id) => document.getElementById(id);

// UI refs
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

// ---------- helpers ----------
function setHint(el, txt){ if (el) el.textContent = txt || ""; }
function esc(s){
    return String(s ?? "").replace(/[&<>"']/g, m =>
        ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])
    );
}
function qs(name){ return new URLSearchParams(location.search).get(name); }

// ---------- AUTH (Appwrite JWT) ----------
async function getMe(){
    // JWT hazır olana kadar bekle
    if (window.SM_JWT_READY) await window.SM_JWT_READY;

    const jwt = window.SM_JWT || localStorage.getItem("sm_jwt");
    if (!jwt) throw new Error("Missing JWT");

    const r = await fetch(`${FN}/_auth_user`, {
        headers: {
            "Authorization": `Bearer ${jwt}`,
            "X-Appwrite-JWT": jwt
        }
    });
    const j = await r.json().catch(()=> ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || `auth failed (${r.status})`);

    return j.uid;
}

// ---------- state ----------
let ME = null;
let ACTIVE_CONV = null;
let ACTIVE_TO = null;

// ---------- UI ----------
function setActivePeerUI(name, avatarUrl){
    peerName.textContent = name || "User";
    peerAva.innerHTML = avatarUrl
        ? `<img src="${esc(avatarUrl)}" style="width:36px;height:36px;border-radius:999px;object-fit:cover;">`
        : `<div style="width:36px;height:36px;border-radius:999px;background:rgba(0,0,0,.08)"></div>`;
}

// ---------- LEFT LIST ----------
async function loadInbox(){
    setHint(inboxHint, "Loading…");
    inboxList.innerHTML = "";

    const r = await fetch(`${FN}/dm_list`, {
        headers: {
            "Authorization": `Bearer ${window.SM_JWT || localStorage.getItem("sm_jwt")}`,
            "X-Appwrite-JWT": window.SM_JWT || localStorage.getItem("sm_jwt")
        }
    });
    const j = await r.json().catch(()=> ({}));
    console.log("dm_list:", r.status, j);

    if (!r.ok || !j?.ok){
        setHint(inboxHint, j?.error || "Failed to load conversations");
        return;
    }

    const list = j.list || [];
    if (!list.length){
        setHint(inboxHint, "No conversations");
        return;
    }

    setHint(inboxHint, "");
    for (const it of list){
        const row = document.createElement("button");
        row.type = "button";
        row.style.cssText = "width:100%;border:0;background:transparent;padding:10px;border-radius:12px;text-align:left;cursor:pointer;";
        row.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center">
        <div style="width:34px;height:34px;border-radius:999px;background:#eee;overflow:hidden">
          ${it.other_avatar_url ? `<img src="${esc(it.other_avatar_url)}" style="width:100%;height:100%;object-fit:cover">` : ""}
        </div>
        <div style="min-width:0">
          <div style="font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(it.other_name)}</div>
          <div style="opacity:.7;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(it.last_body)}</div>
        </div>
      </div>
    `;
        row.onclick = () => {
            const u = new URL(location.href);
            u.searchParams.set("conversation_id", it.conversation_id);
            history.pushState({}, "", u.toString());
            bootFromURL();
        };
        inboxList.appendChild(row);
    }
}

// ---------- CHAT ----------
async function loadActiveChat(){
    if (!ACTIVE_CONV){
        peerName.textContent = "Select a chat";
        msgList.innerHTML = "";
        setHint(msgHint, "Select a chat");
        return;
    }

    setHint(msgHint, "Loading…");
    msgList.innerHTML = "";

    const r = await fetch(`${FN}/dm_get?conversation_id=${encodeURIComponent(ACTIVE_CONV)}`, {
        headers: {
            "Authorization": `Bearer ${window.SM_JWT || localStorage.getItem("sm_jwt")}`,
            "X-Appwrite-JWT": window.SM_JWT || localStorage.getItem("sm_jwt")
        }
    });
    const j = await r.json().catch(()=> ({}));
    console.log("dm_get:", r.status, j);

    if (!r.ok || !j?.ok){
        setHint(msgHint, j?.error || "Failed to load messages");
        return;
    }

    renderMessages(j.list || []);
    setHint(msgHint, "");
}

function renderMessages(arr){
    msgList.innerHTML = "";
    for (const m of arr){
        const isMe = m.sender_id === ME;
        const b = document.createElement("div");
        b.style.cssText = `
      max-width:70%;margin:8px 0;padding:10px 12px;border-radius:14px;
      background:#fff;border:1px solid rgba(0,0,0,.08);
      ${isMe ? "margin-left:auto" : "margin-right:auto"}
    `;
        b.innerHTML = `<div style="font-weight:800">${esc(m.body)}</div>
                   <div style="font-size:11px;opacity:.6">${esc(m.created_at)}</div>`;
        msgList.appendChild(b);
    }
    msgList.scrollTop = msgList.scrollHeight;
}

// ---------- SEND ----------
async function sendMessage(text){
    const r = await fetch(`${FN}/dm_send`, {
        method: "POST",
        headers: {
            "Content-Type":"application/json",
            "Authorization": `Bearer ${window.SM_JWT || localStorage.getItem("sm_jwt")}`,
            "X-Appwrite-JWT": window.SM_JWT || localStorage.getItem("sm_jwt")
        },
        body: JSON.stringify({
            conversation_id: ACTIVE_CONV,
            body: text
        })
    });
    const j = await r.json().catch(()=> ({}));
    console.log("dm_send:", r.status, j);

    if (!r.ok || !j?.ok) throw new Error(j?.error || "send failed");
    await loadActiveChat();
}

// ---------- URL ----------
function bootFromURL(){
    ACTIVE_CONV = qs("conversation_id");
    loadActiveChat();
}

// ---------- INIT ----------
(async function init(){
    try{
        ME = await getMe();
        console.log("ME:", ME);

        await loadInbox();
        bootFromURL();

        backBtn?.addEventListener("click", () => {
            const u = new URL(location.href);
            u.searchParams.delete("conversation_id");
            history.pushState({}, "", u.toString());
            bootFromURL();
        });

        msgForm?.addEventListener("submit", async (e) => {
            e.preventDefault();
            const t = msgInput.value.trim();
            if (!t) return;
            msgInput.value = "";
            await sendMessage(t);
        });

        window.addEventListener("popstate", bootFromURL);
    } catch (e){
        console.error(e);
        setHint(inboxHint, "Login required");
        setHint(msgHint, e.message);
    }
})();
