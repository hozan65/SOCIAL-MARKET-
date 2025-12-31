// /messages/messages.js
(() => {
    console.log("messages.js LOADED ✅", location.href);

    const qs = (s, el = document) => el.querySelector(s);
    const esc = (s) => String(s ?? "")
        .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

    const inboxList = qs("#inboxList");
    const inboxHint = qs("#inboxHint");
    const msgList = qs("#msgList");
    const msgHint = qs("#msgHint");

    const peerName = qs("#peerName");
    const peerSub = qs("#peerSub");

    const msgForm = qs("#msgForm");
    const msgInput = qs("#msgInput");

    function params() { return new URL(location.href).searchParams; }
    function convoId() { return params().get("conversation_id") || ""; }
    function toId() { return params().get("to_id") || ""; }

    // --- JWT / Auth ---
    async function ensureJWT() {
        const account = window.account || window.appwrite?.account;
        if (!account?.createJWT) throw new Error("Appwrite account client not found (createJWT missing).");
        const j = await account.createJWT();
        if (!j?.jwt) throw new Error("JWT not returned");
        localStorage.setItem("sm_jwt", j.jwt);
        return j.jwt;
    }
    const getJWT = () => localStorage.getItem("sm_jwt") || "";

    async function apiFetch(path, opts = {}) {
        let jwt = getJWT();

        const doReq = async () => {
            const headers = new Headers(opts.headers || {});
            headers.set("Accept", "application/json");
            if (opts.method && opts.method !== "GET" && !headers.has("Content-Type")) {
                headers.set("Content-Type", "application/json");
            }
            if (jwt) headers.set("Authorization", "Bearer " + jwt);

            return fetch(`/.netlify/functions/${path}`, { ...opts, headers });
        };

        let r = await doReq();
        if (r.status === 401) {
            jwt = await ensureJWT();
            r = await doReq();
        }

        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
        return data;
    }

    async function authUser() {
        await ensureJWT();
        const d = await apiFetch("_auth_user", { method: "GET" });
        const uid = d?.uid || d?.user_id || d?.user?.$id || "";
        if (!uid) throw new Error("Missing uid from _auth_user");
        window.APPWRITE_USER_ID = uid;
        localStorage.setItem("sm_uid", uid);
        return uid;
    }

    // --- UI render ---
    function renderInboxItem(x, active) {
        // x field names sende farklı olabilir; en toleranslı şekilde okuyorum
        const cid = x.conversation_id || x.id || x.convo_id || "";
        const peer = x.peer_id || x.peer || x.other_id || x.user_id || "";
        const last = x.last_message || x.last || x.preview || "";
        const tRaw = x.last_at || x.updated_at || x.created_at || "";
        const t = tRaw ? new Date(tRaw).toLocaleString() : "";

        return `
      <button class="inboxRow ${active ? "isActive" : ""}" type="button"
        data-cid="${esc(cid)}" data-peer="${esc(peer)}">
        <div class="inboxTop">
          <div class="inboxName">${esc(peer || "User")}</div>
          <div class="inboxTime">${esc(t)}</div>
        </div>
        <div class="inboxLast">${esc(last)}</div>
      </button>
    `;
    }

    function renderMsg(m, me) {
        const mine = m.from_id === me;
        const cls = mine ? "mRow mMine" : "mRow mTheirs";
        const t = m.created_at ? new Date(m.created_at).toLocaleTimeString() : "";
        return `
      <div class="${cls}">
        <div class="mBubble">
          <div class="mText">${esc(m.text)}</div>
          <div class="mMeta">${esc(t)}</div>
        </div>
      </div>
    `;
    }

    function scrollBottom() {
        if (!msgList) return;
        msgList.scrollTop = msgList.scrollHeight;
    }

    // --- Load inbox ---
    async function loadInbox() {
        inboxHint.textContent = "Loading...";
        inboxList.innerHTML = "";

        const d = await apiFetch("dm_inbox", { method: "GET" });

        // ✅ senin çıktı: { ok:true, list:[...] }
        const list = d.list || d.rows || [];
        if (!list.length) {
            inboxHint.textContent = "No chats yet.";
            return;
        }

        inboxHint.textContent = "";
        const activeCid = convoId();

        inboxList.innerHTML = list.map(x => {
            const cid = x.conversation_id || x.id || x.convo_id || "";
            return renderInboxItem(x, cid === activeCid);
        }).join("");

        inboxList.querySelectorAll(".inboxRow").forEach(btn => {
            btn.addEventListener("click", () => {
                const cid = btn.getAttribute("data-cid");
                const peer = btn.getAttribute("data-peer");
                const u = new URL(location.href);
                u.searchParams.set("conversation_id", cid);
                u.searchParams.set("to_id", peer);
                location.href = u.toString();
            });
        });
    }

    // --- Load chat messages ---
    async function loadChat(me) {
        const cid = convoId();
        if (!cid) {
            peerName.textContent = "Select a chat";
            peerSub.textContent = "Direct messages";
            msgList.innerHTML = "";
            msgHint.textContent = "Choose a conversation from the left.";
            return;
        }

        msgHint.textContent = "Loading...";
        msgList.innerHTML = "";

        const d = await apiFetch(`dm_get?conversation_id=${encodeURIComponent(cid)}`, { method: "GET" });
        const rows = d.rows || d.list || d.messages || [];

        const peer = toId() || d.peer_id || "User";
        peerName.textContent = peer;
        peerSub.textContent = "Direct messages";

        msgList.innerHTML = rows.map(m => renderMsg(m, me)).join("");
        msgHint.textContent = rows.length ? "" : "Say hi 👋";
        scrollBottom();
    }

    // --- Send message (DB first) ---
    async function sendMessage(me) {
        const text = String(msgInput.value || "").trim();
        if (!text) return;

        const cid = convoId();
        const peer = toId();
        if (!peer) return alert("Missing to_id (peer).");

        // conversation_id yoksa bile dm_send artık kendi ensure ediyor
        msgInput.value = "";

        const client_id = crypto?.randomUUID?.() || String(Date.now());
        const res = await apiFetch("dm_send", {
            method: "POST",
            body: JSON.stringify({
                conversation_id: cid || null,
                to_id: peer,
                text,
                client_id
            })
        });

        if (!res?.ok || !res?.row) throw new Error(res?.error || "Send failed");

        // eğer convoId boşken konuşma oluştuysa URL’i güncelle
        if (!cid && res.conversation_id) {
            const u = new URL(location.href);
            u.searchParams.set("conversation_id", res.conversation_id);
            u.searchParams.set("to_id", peer);
            history.replaceState(null, "", u.toString());
            await loadInbox(); // yeni chat inbox’a gelsin
        }

        // UI
        msgList.insertAdjacentHTML("beforeend", renderMsg(res.row, me));
        scrollBottom();

        // realtime emit (server bunu dm:new yapacak şekilde ayarlıysa)
        const socket = window.rt?.socket;
        if (socket) socket.emit("dm:send", res.row);
    }

    // --- init ---
    async function init() {
        try {
            const me = await authUser();

            // socket join
            const socket = window.rt?.socket;
            if (socket) socket.emit("join", { user_id: me });

            await loadInbox();
            await loadChat(me);

            msgForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                try { await sendMessage(me); }
                catch (err) { console.error(err); alert(String(err?.message || err)); }
            });

            console.log("✅ messages init ok", { uid: me, convoId: convoId() });
        } catch (e) {
            console.error("init @ messages.js failed:", e);
        }
    }

    init();
})();
