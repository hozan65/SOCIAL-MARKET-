// /messages/messages.js
console.log("messages.js LOADED ✅", location.href);

const $ = (id) => document.getElementById(id);
const inboxList = $("inboxList");
const inboxHint = $("inboxHint");
const peerName = $("peerName");
const peerAva = $("peerAva");
const msgList = $("msgList");
const msgHint = $("msgHint");
const msgForm = $("msgForm");
const msgInput = $("msgInput");
const backBtn = $("chatBackBtn");

const FN = "/.netlify/functions";
const qs = (k) => new URLSearchParams(location.search).get(k);

function setHint(el, t) {
    if (el) el.textContent = t || "";
}
function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }[m]));
}

async function getJWT() {
    if (window.SM_JWT_READY) await window.SM_JWT_READY;
    const jwt = window.SM_JWT || localStorage.getItem("sm_jwt");
    if (!jwt) throw new Error("Missing JWT (login required)");
    return jwt;
}

async function apiGET(path) {
    const jwt = await getJWT();
    const r = await fetch(`${FN}${path}`, {
        headers: {
            Authorization: `Bearer ${jwt}`,
            "X-Appwrite-JWT": jwt,
        },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || `GET ${path} failed (${r.status})`);
    return j;
}

async function apiPOST(path, body) {
    const jwt = await getJWT();
    const r = await fetch(`${FN}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
            "X-Appwrite-JWT": jwt,
        },
        body: JSON.stringify(body || {}),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || `POST ${path} failed (${r.status})`);
    return j;
}

let ME = null;
let ACTIVE_CONV = null;

function setPeerUI(name, avatar) {
    peerName.textContent = name || "User";
    peerAva.innerHTML = avatar
        ? `<img src="${esc(avatar)}" style="width:36px;height:36px;border-radius:999px;object-fit:cover">`
        : `<div style="width:36px;height:36px;border-radius:999px;background:rgba(0,0,0,.08)"></div>`;
}

function renderMessages(arr) {
    msgList.innerHTML = "";
    for (const m of arr || []) {
        const isMe = m.sender_id === ME;

        const b = document.createElement("div");
        b.style.cssText = `
      max-width:70%;
      margin:8px 0;
      padding:10px 12px;
      border-radius:14px;
      border:1px solid rgba(0,0,0,.08);
      background: rgba(255,255,255,.85);
      ${isMe ? "margin-left:auto" : "margin-right:auto"};
    `;

        b.innerHTML = `
      <div style="font-weight:800">${esc(m.body || "")}</div>
      <div style="opacity:.6;font-size:11px;margin-top:4px">${esc(m.created_at || "")}</div>
    `;
        msgList.appendChild(b);
    }
    msgList.scrollTop = msgList.scrollHeight;
}

async function loadInbox() {
    setHint(inboxHint, "Loading…");
    inboxList.innerHTML = "";

    const j = await apiGET("/dm_inbox");
    const list = j.list || [];

    if (!list.length) {
        setHint(inboxHint, "No conversations yet.");
        return;
    }

    setHint(inboxHint, "");
    for (const it of list) {
        const row = document.createElement("button");
        row.type = "button";
        row.style.cssText =
            "width:100%;border:0;background:transparent;padding:10px;text-align:left;cursor:pointer;border-radius:12px";

        row.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center">
        <div style="width:34px;height:34px;border-radius:999px;background:#eee;overflow:hidden">
          ${it.other_avatar_url ? `<img src="${esc(it.other_avatar_url)}" style="width:100%;height:100%;object-fit:cover">` : ""}
        </div>
        <div style="min-width:0;flex:1">
          <div style="font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(it.other_name)}</div>
          <div style="font-size:12px;opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(it.last_body || "")}</div>
        </div>
        ${it.unread ? `<div style="min-width:22px;height:22px;border-radius:999px;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900">${it.unread}</div>` : ""}
      </div>
    `;

        row.onclick = () => {
            const u = new URL(location.href);
            u.searchParams.delete("to");
            u.searchParams.set("conversation_id", it.conversation_id);
            history.pushState({}, "", u.toString());
            bootFromURL().catch((e) => setHint(msgHint, e?.message || String(e)));
        };

        inboxList.appendChild(row);
    }
}

async function bootFromURL() {
    const to = qs("to");
    ACTIVE_CONV = qs("conversation_id");

    // profile -> /messages/?to=...
    if (to && !ACTIVE_CONV) {
        setHint(msgHint, "Opening chat…");
        const ensured = await apiGET(`/dm_ensure?to=${encodeURIComponent(to)}`);

        const u = new URL(location.href);
        u.searchParams.delete("to");
        u.searchParams.set("conversation_id", ensured.conversation_id);
        history.replaceState({}, "", u.toString());

        ACTIVE_CONV = ensured.conversation_id;
        setPeerUI(ensured.peer?.name || "User", ensured.peer?.avatar_url || "");
    }

    if (!ACTIVE_CONV) {
        peerName.textContent = "Select a chat";
        msgList.innerHTML = "";
        setHint(msgHint, "Select a chat");
        return;
    }

    setHint(msgHint, "Loading…");
    const j = await apiGET(`/dm_get?conversation_id=${encodeURIComponent(ACTIVE_CONV)}`);

    setPeerUI(j.peer?.name || "User", j.peer?.avatar_url || "");
    renderMessages(j.list || []);
    setHint(msgHint, "");

    // mark read (fire and forget)
    apiPOST("/dm_mark_read", { conversation_id: ACTIVE_CONV }).catch(() => {});
}

async function sendMessage(text) {
    if (!ACTIVE_CONV) throw new Error("No active conversation");
    await apiPOST("/dm_send", { conversation_id: ACTIVE_CONV, body: text });
    await bootFromURL();
}

function wireRealtime() {
    const s = window.SM_SOCKET;
    if (!s) {
        console.warn("⚠️ SM_SOCKET not ready (realtime disabled for now)");
        return;
    }

    // Debug helper (optional):
    // s.onAny((e, ...a) => console.log("SOCKET EVENT:", e, a));

    // ✅ When server pushes new DM
    s.off?.("dm:new");
    s.on("dm:new", async (payload) => {
        console.log("✅ dm:new received", payload);

        if (payload?.conversation_id && payload.conversation_id === ACTIVE_CONV) {
            await bootFromURL();
        } else {
            await loadInbox();
        }
    });
}

(async function init() {
    try {
        const me = await apiGET("/_auth_user");
        ME = me.uid;
        console.log("ME ✅", ME);

        await loadInbox();
        await bootFromURL();

        // realtime hook (after page has state)
        wireRealtime();

        backBtn?.addEventListener("click", () => {
            const u = new URL(location.href);
            u.searchParams.delete("to");
            u.searchParams.delete("conversation_id");
            history.pushState({}, "", u.toString());
            bootFromURL().catch((e) => setHint(msgHint, e?.message || String(e)));
        });

        msgForm?.addEventListener("submit", async (e) => {
            e.preventDefault();
            const t = (msgInput.value || "").trim();
            if (!t) return;
            msgInput.value = "";
            try {
                await sendMessage(t);
            } catch (err) {
                setHint(msgHint, err?.message || String(err));
            }
        });

        window.addEventListener("popstate", () => {
            bootFromURL().catch((e) => setHint(msgHint, e?.message || String(e)));
        });
    } catch (e) {
        console.error(e);
        setHint(inboxHint, "Login required");
        setHint(msgHint, e?.message || String(e));
    }
})();
