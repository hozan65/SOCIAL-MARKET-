// /messages/messages.js
import { account } from "/assets/appwrite.js";

const qs = new URLSearchParams(location.search);
const to = (qs.get("to") || "").trim();

const listEl = document.getElementById("msgList");
const form = document.getElementById("msgForm");
const input = document.getElementById("msgInput");
const hint = document.getElementById("msgHint");

let conversationId = null;
let meId = null;

const esc = (s) => String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");

// ✅ JWT headers (same style as your u.js)
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

function render(list){
    const html = (list || []).map(m => {
        const mine = m.sender_id === meId;
        const t = m.created_at
            ? new Date(m.created_at).toLocaleString("tr-TR",{ dateStyle:"short", timeStyle:"short" })
            : "";
        return `
      <div class="bubble ${mine ? "me" : ""}">
        <div>${esc(m.body)}</div>
        <div class="t">${esc(t)}</div>
      </div>
    `;
    }).join("");

    listEl.innerHTML = html || `<div style="opacity:.7;padding:10px">No messages yet.</div>`;
    listEl.scrollTop = listEl.scrollHeight;
}

async function loadMe(){
    const me = await account.get();
    meId = me?.$id || null;
    if (!meId) throw new Error("Not logged in");
}

async function getConversation(){
    const j = await apiGet(`/.netlify/functions/dm_get_or_create?to=${encodeURIComponent(to)}`);
    conversationId = j?.conversation_id;
    if (!conversationId) throw new Error("Missing conversation_id");
}

async function loadMessages(){
    const j = await apiGet(`/.netlify/functions/dm_list?conversation_id=${encodeURIComponent(conversationId)}&limit=80`);
    render(j?.list || []);
}

async function sendMessage(text){
    await apiPost("/.netlify/functions/dm_send", { conversation_id: conversationId, body: text });
    await loadMessages();
}

async function boot(){
    try{
        if (!to) throw new Error("Missing ?to=USER_ID");
        hint.textContent = "Loading...";
        await loadMe();

        // ✅ quick sanity: JWT üretilebiliyor mu?
        await getJwtHeaders();

        await getConversation();
        await loadMessages();
        hint.textContent = "";
    }catch(e){
        console.error(e);
        hint.textContent = "❌ " + (e?.message || e);
    }
}

form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = (input.value || "").trim();
    if (!text) return;
    input.value = "";
    try{
        await sendMessage(text);
        hint.textContent = "";
    }catch(err){
        console.error(err);
        hint.textContent = "❌ " + (err?.message || err);
    }
});

// ✅ polling (2.5s)
setInterval(() => {
    if (conversationId) loadMessages().catch(()=>{});
}, 2500);

boot();
