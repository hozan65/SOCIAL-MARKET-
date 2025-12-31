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

function setHint(el, txt){ if (el) el.textContent = txt || ""; }
function esc(s){
    return String(s ?? "").replace(/[&<>"']/g, m =>
        ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])
    );
}
function qs(name){ return new URLSearchParams(location.search).get(name); }

async function getJWT(){
    if (window.SM_JWT_READY) await window.SM_JWT_READY;
    const jwt = window.SM_JWT || localStorage.getItem("sm_jwt");
    if (!jwt) throw new Error("Missing JWT (login required)");
    return jwt;
}

async function apiGET(path){
    const jwt = await getJWT();
    const r = await fetch(`${FN}${path}`, {
        headers: { Authorization: `Bearer ${jwt}`, "X-Appwrite-JWT": jwt }
    });
    const j = await r.json().catch(()=> ({}));
    if (!r.ok || j?.error) throw new Error(j?.error || `GET ${path} failed (${r.status})`);
    return j;
}

async function apiPOST(path, body){
    const jwt = await getJWT();
    const r = await fetch(`${FN}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
            "X-Appwrite-JWT": jwt
        },
        body: JSON.stringify(body || {})
    });
    const j = await r.json().catch(()=> ({}));
    if (!r.ok || j?.error) throw new Error(j?.error || `POST ${path} failed (${r.status})`);
    return j;
}

// ---------------- state ----------------
let ME = null;
let ACTIVE_CONV = null; // conversation_id
let ACTIVE_TO = null;   // peer id (when opening from profile)

// ---------------- UI ----------------
function setPeerUI(name, avatar){
    peerName.textContent = name || "User";
    peerAva.innerHTML = avatar
        ? `<img src="${esc(avatar)}" style="width:36px;height:36px;border-radius:999px;object-fit:cover">`
        : `<div style="width:36px;height:36px;border-radius:999px;background:rgba(0,0,0,.08)"></div>`;
}

function renderMessages(arr){
    msgList.innerHTML = "";
    for (const m of arr){
        const isMe = m.sender_id === ME;
        const b = document.createElement("div");
        b.style.cssText = `
      max-width:70%;
      margin:8px 0;
      padding:10px 12px;
      border-radius:14px;
      background:#fff;
      border:1px solid rgba(0,0,0,.08);
      ${isMe ? "margin-left:auto" : "margin-right:auto"}
    `;
        b.innerHTML = `<div style="font-weight:800">${esc(m.body)}</div>`;
        msgList.appendChild(b);
    }
    msgList.scrollTop = msgList.scrollHeight;
}

// ---------------- inbox ----------------
async function loadInbox(){
    setHint(inboxHint, "Loading…");
    inboxList.innerHTML = "";

    const j = await apiGET("/dm_inbox");
    console.log("dm_inbox ✅", j);

    const list = j.list || [];
    if (!list.length){
        setHint(inboxHint, "No conversations");
        return;
    }
    setHint(inboxHint, "");

    for (const it of list){
        const row = document.createElement("button");
        row.type = "button";
        row.style.cssText =
            "width:100%;border:0;background:transparent;padding:10px;text-align:left;cursor:pointer;border-radius:12px";

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
            bootFromURL();
        };

        inboxList.appendChild(row);
    }
}

// ---------------- ensure / open chat ----------------
async function ensureConversationWith(to){
    // dm_ensure: creates or returns conversation_id + peer profile
    const j = await apiGET(`/dm_ensure?to=${encodeURIComponent(to)}`);
    return j; // { ok:true, conversation_id, peer:{id,name,avatar_url} }
}

async function loadChatByConversationId(conversation_id){
    const j = await apiGET(`/dm_get?conversation_id=${encodeURIComponent(conversation_id)}`);
    // { ok:true, peer:{...}, list:[...] }
    if (j.peer) setPeerUI(j.peer.name, j.peer.avatar_url);
    renderMessages(j.list || []);
    await apiPOST("/dm_mark_read", { conversation_id });
}

async function bootFromURL(){
    setHint(msgHint, "");
    ACTIVE_TO = qs("to");
    ACTIVE_CONV = qs("conversation_id");

    // 1) profile -> /messages/?to=...
    if (ACTIVE_TO && !ACTIVE_CONV){
        setHint(msgHint, "Opening chat…");
        const ensured = await ensureConversationWith(ACTIVE_TO);

        // URL'yi conversation_id ile sabitle
        const u = new URL(location.href);
        u.searchParams.delete("to");
        u.searchParams.set("conversation_id", ensured.conversation_id);
        history.replaceState({}, "", u.toString());

        ACTIVE_CONV = ensured.conversation_id;
        setPeerUI(ensured.peer?.name || "User", ensured.peer?.avatar_url || "");
    }

    // 2) inbox click -> /messages/?conversation_id=...
    if (!ACTIVE_CONV){
        peerName.textContent = "Select a chat";
        msgList.innerHTML = "";
        setHint(msgHint, "Select a chat");
        return;
    }

    await loadChatByConversationId(ACTIVE_CONV);
}

// ---------------- send ----------------
async function sendMessage(text){
    if (!ACTIVE_CONV) throw new Error("No active conversation");

    await apiPOST("/dm_send", { conversation_id: ACTIVE_CONV, body: text });
    await loadChatByConversationId(ACTIVE_CONV);
}

// ---------------- init ----------------
(async function init(){
    try{
        // who am i
        const meResp = await apiGET("/_auth_user");
        ME = meResp.uid;
        console.log("ME ✅", ME);

        await loadInbox();
        await bootFromURL();

        backBtn?.addEventListener("click", () => {
            const u = new URL(location.href);
            u.searchParams.delete("conversation_id");
            u.searchParams.delete("to");
            history.pushState({}, "", u.toString());
            bootFromURL();
        });

        msgForm?.addEventListener("submit", async (e) => {
            e.preventDefault();
            const t = (msgInput.value || "").trim();
            if (!t) return;
            msgInput.value = "";
            try{
                await sendMessage(t);
            } catch(err){
                setHint(msgHint, err?.message || String(err));
            }
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
