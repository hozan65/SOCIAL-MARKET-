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

/* helpers */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, m =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])
);

async function headers(){
    const j = await account.createJWT();
    return {
        "Content-Type":"application/json",
        "Authorization":`Bearer ${j.jwt}`,
        "X-Appwrite-JWT": j.jwt
    };
}

async function apiGet(url){
    const r = await fetch(url,{ headers: await headers() });
    const j = await r.json();
    if(!r.ok) throw j;
    return j;
}

async function apiPost(url,body){
    const r = await fetch(url,{
        method:"POST",
        headers: await headers(),
        body: JSON.stringify(body)
    });
    const j = await r.json();
    if(!r.ok) throw j;
    return j;
}

/* inbox */
function renderInbox(list){
    $inboxList.innerHTML = list.map(c=>`
    <div class="chatItem ${c.other_id===activeTo?'active':''}"
      data-to="${c.other_id}"
      data-cid="${c.conversation_id}">
      <div class="chatAva">${c.other_avatar_url?`<img src="${esc(c.other_avatar_url)}">`:''}</div>
      <div class="chatMain">
        <div class="chatName">${esc(c.other_name)}</div>
        <div class="chatLast">${esc(c.last_body||'')}</div>
      </div>
      ${c.unread?`<div class="badge">${c.unread}</div>`:''}
    </div>
  `).join("");

    $inboxList.querySelectorAll(".chatItem").forEach(el=>{
        el.onclick = ()=> openChat(el.dataset.to, el.dataset.cid, true);
    });
}

async function loadInbox(){
    const j = await apiGet("/.netlify/functions/dm_inbox?limit=60");
    inboxCache = j.list || [];
    renderInbox(inboxCache);
}

/* chat */
async function loadMessages(){
    if(!activeConversationId) return;
    const j = await apiGet(`/.netlify/functions/dm_list?conversation_id=${activeConversationId}&limit=120`);
    const list = j.list || [];

    const last = list[list.length-1];
    const fp = list.length+"|"+(last?.created_at||"");
    if(fp===lastFp) return;
    lastFp = fp;

    $msgList.innerHTML = list.map(m=>`
    <div class="bubble ${m.sender_id===meId?'me':''}">
      ${esc(m.body)}
      <div class="metaRow">
        ${m.sender_id===meId?`<span class="tick ${m.read_at?'read':''}">✓✓</span>`:''}
      </div>
    </div>
  `).join("");

    $msgList.scrollTop = $msgList.scrollHeight;

    await apiPost("/.netlify/functions/dm_mark_read",{conversation_id:activeConversationId});
}

async function openChat(to,cid,push){
    activeTo = to;
    activeConversationId = cid;
    lastFp = "";
    $app.classList.add("showChat");

    const row = inboxCache.find(x=>x.other_id===to);
    $peerName.textContent = row?.other_name || "Chat";
    $peerAva.innerHTML = row?.other_avatar_url?`<img src="${row.other_avatar_url}">`:'';

    if(push){
        const u = new URL(location.href);
        u.searchParams.set("to",to);
        history.pushState({},'',u);
    }

    await loadMessages();
}

/* events */
$msgForm.onsubmit = async e=>{
    e.preventDefault();
    if(!$msgInput.value.trim()) return;
    await apiPost("/.netlify/functions/dm_send",{
        conversation_id: activeConversationId,
        body: $msgInput.value
    });
    $msgInput.value="";
    await loadMessages();
    await loadInbox();
};

$chatBackBtn.onclick = ()=>{
    $app.classList.remove("showChat");
    activeConversationId=null;
};

/* boot */
(async()=>{
    const me = await account.get();
    meId = me.$id;
    await loadInbox();

    const to = qs("to");
    if(to){
        const row = inboxCache.find(x=>x.other_id===to);
        if(row) openChat(to,row.conversation_id,false);
    }

    setInterval(async()=>{
        await loadInbox();
        if(activeConversationId) await loadMessages();
    },5000);
})();
