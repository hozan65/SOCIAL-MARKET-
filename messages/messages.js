// /messages/messages.js
(() => {
    console.log("messages.js LOADED ✅", location.href);

    const qs = (s, el = document) => el.querySelector(s);
    const esc = (s) =>
        String(s ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");

    const inboxList = qs("#inboxList");
    const inboxHint = qs("#inboxHint");
    const msgList = qs("#msgList");
    const msgHint = qs("#msgHint");
    const leftSearch = qs("#leftSearch");

    const peerName = qs("#peerName");
    const peerSub = qs("#peerSub");

    const msgForm = qs("#msgForm");
    const msgInput = qs("#msgInput");

    const chatBackBtn = qs("#chatBackBtn");

    const state = {
        me: "",
        activeConvoId: "",
        activePeerId: "",
        inbox: [],
    };

    function params() {
        return new URL(location.href).searchParams;
    }
    function setURL(conversation_id, peer_id) {
        const u = new URL(location.href);
        if (conversation_id) u.searchParams.set("conversation_id", conversation_id);
        else u.searchParams.delete("conversation_id");
        if (peer_id) u.searchParams.set("to_id", peer_id);
        else u.searchParams.delete("to_id");
        history.replaceState(null, "", u.toString());
    }
    function getURLConvoId() {
        return params().get("conversation_id") || "";
    }
    function getURLPeerId() {
        return params().get("to_id") || "";
    }

    // ---------- JWT ----------
    async function ensureJWT() {
        const account = window.account || window.appwrite?.account;
        if (!account?.createJWT) throw new Error("Appwrite account client not found (createJWT missing).");
        const j = await account.createJWT();
        const jwt = j?.jwt;
        if (!jwt) throw new Error("JWT not returned from Appwrite");
        localStorage.setItem("sm_jwt", jwt);
        return jwt;
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
        state.me = uid;
        window.APPWRITE_USER_ID = uid;
        localStorage.setItem("sm_uid", uid);
        return uid;
    }

    // ---------- UI helpers ----------
    function renderInboxItem(item, active) {
        const t = item.last_at ? new Date(item.last_at).toLocaleString() : "";
        const peer = item.peer_id || "User";
        const last = item.last_message || "";
        return `
      <button class="inboxRow ${active ? "isActive" : ""}"
        type="button"
        data-cid="${esc(item.conversation_id)}"
        data-peer="${esc(peer)}">
        <div class="inboxTop">
          <div class="inboxName">${esc(peer)}</div>
          <div class="inboxTime">${esc(t)}</div>
        </div>
        <div class="inboxLast">${esc(last)}</div>
      </button>
    `;
    }

    function renderMessageBubble(m) {
        const mine = (m.from_id || m.sender_id) === state.me;
        const cls = mine ? "mRow mMine" : "mRow mTheirs";
        const text = m.text ?? m.body ?? "";
        const ts = m.created_at || m.inserted_at || m.updated_at || "";
        const t = ts ? new Date(ts).toLocaleTimeString() : "";
        const id = m.id ? `data-mid="${esc(m.id)}"` : "";
        return `
      <div class="${cls}" ${id}>
        <div class="mBubble">
          <div class="mText">${esc(text)}</div>
          <div class="mMeta">${esc(t)}</div>
        </div>
      </div>
    `;
    }

    function scrollBottom() {
        if (!msgList) return;
        msgList.scrollTop = msgList.scrollHeight;
    }

    function setChatHeader(peer_id) {
        peerName.textContent = peer_id ? peer_id : "Select a chat";
        peerSub.textContent = peer_id ? "Direct messages" : "Direct messages";
    }

    function showHint(where, text) {
        if (!where) return;
        where.textContent = text || "";
    }

    // ---------- Load inbox ----------
    async function loadInbox() {
        showHint(inboxHint, "Loading...");
        inboxList.innerHTML = "";

        const d = await apiFetch("dm_inbox", { method: "GET" });
        const list = d.list || [];

        state.inbox = list;

        if (!list.length) {
            showHint(inboxHint, "No chats yet.");
            return;
        }

        showHint(inboxHint, "");

        const activeCid = state.activeConvoId || getURLConvoId();

        inboxList.innerHTML = list
            .map((x) => renderInboxItem(x, x.conversation_id === activeCid))
            .join("");

        inboxList.querySelectorAll(".inboxRow").forEach((btn) => {
            btn.addEventListener("click", () => {
                const cid = btn.getAttribute("data-cid");
                const peer = btn.getAttribute("data-peer");
                openConversation(cid, peer);
            });
        });
    }

    function filterInbox(query) {
        const q = String(query || "").trim().toLowerCase();
        const base = state.inbox || [];
        const filtered = !q
            ? base
            : base.filter((x) => String(x.peer_id || "").toLowerCase().includes(q) ||
                String(x.last_message || "").toLowerCase().includes(q));

        const activeCid = state.activeConvoId;

        inboxList.innerHTML = filtered
            .map((x) => renderInboxItem(x, x.conversation_id === activeCid))
            .join("");

        inboxList.querySelectorAll(".inboxRow").forEach((btn) => {
            btn.addEventListener("click", () => {
                const cid = btn.getAttribute("data-cid");
                const peer = btn.getAttribute("data-peer");
                openConversation(cid, peer);
            });
        });
    }

    // ---------- Load chat ----------
    async function loadChat() {
        const cid = state.activeConvoId;
        const peer = state.activePeerId;

        if (!cid) {
            setChatHeader("");
            msgList.innerHTML = "";
            showHint(msgHint, "Choose a conversation from the left.");
            return;
        }

        setChatHeader(peer || "");
        showHint(msgHint, "Loading...");
        msgList.innerHTML = "";

        const d = await apiFetch(`dm_get?conversation_id=${encodeURIComponent(cid)}`, { method: "GET" });
        const rows = d.rows || [];

        // peer_id function'dan geliyorsa güncelle
        state.activePeerId = peer || d.peer_id || "";
        setChatHeader(state.activePeerId);

        msgList.innerHTML = rows.map(renderMessageBubble).join("");
        showHint(msgHint, rows.length ? "" : "Say hi 👋");
        scrollBottom();
    }

    function openConversation(conversation_id, peer_id) {
        state.activeConvoId = conversation_id || "";
        state.activePeerId = peer_id || "";

        setURL(state.activeConvoId, state.activePeerId);

        // highlight active
        inboxList.querySelectorAll(".inboxRow").forEach((b) => {
            const cid = b.getAttribute("data-cid");
            b.classList.toggle("isActive", cid === state.activeConvoId);
        });

        loadChat().catch((e) => {
            console.error(e);
            alert(String(e?.message || e));
        });
    }

    // ---------- Send ----------
    async function sendMessage() {
        const text = String(msgInput.value || "").trim();
        if (!text) return;

        const cid = state.activeConvoId || getURLConvoId();
        const peer = state.activePeerId || getURLPeerId();

        if (!peer && !cid) {
            alert("Select a chat first.");
            return;
        }

        msgInput.value = "";

        // optimistic UI bubble
        const temp = {
            id: "tmp_" + Date.now(),
            from_id: state.me,
            text,
            created_at: new Date().toISOString(),
        };
        msgList.insertAdjacentHTML("beforeend", renderMessageBubble(temp));
        scrollBottom();

        // IMPORTANT: Your dm_send expects:
        // { conversation_id?, peer_id?, text }
        const payload = {
            conversation_id: cid || null,
            peer_id: peer || null,
            text,
        };

        const res = await apiFetch("dm_send", {
            method: "POST",
            body: JSON.stringify(payload),
        });

        if (!res?.ok || !res?.row) throw new Error(res?.error || "Send failed");

        const saved = res.row;

        // conversation newly created?
        if (!cid && res.conversation_id) {
            state.activeConvoId = res.conversation_id;
            state.activePeerId = res.peer_id || peer || "";
            setURL(state.activeConvoId, state.activePeerId);
            await loadInbox(); // show new convo on left
        }

        // replace temp bubble (simple: append real one + remove temp by id)
        const tmpEl = msgList.querySelector(`[data-mid="${temp.id}"]`);
        if (tmpEl) tmpEl.remove();
        msgList.insertAdjacentHTML("beforeend", renderMessageBubble(saved));
        scrollBottom();

        // socket emit optional
        const socket = window.rt?.socket;
        if (socket) socket.emit("dm:send", saved);
    }

    // ---------- Socket realtime (optional) ----------
    function bindRealtime() {
        const socket = window.rt?.socket;
        if (!socket) return;

        socket.emit("join", { user_id: state.me });

        if (window.__dm_bound) return;
        window.__dm_bound = true;

        socket.on("dm:new", (m) => {
            try {
                // If message belongs to current convo, append
                const currentCid = state.activeConvoId || getURLConvoId();
                if (!currentCid) return;

                const cid = m?.conversation_id || m?.raw?.conversation_id;
                if (cid && cid !== currentCid) {
                    // başka konuşma: inbox refresh (preview güncellensin)
                    loadInbox().catch(() => {});
                    return;
                }

                msgList.insertAdjacentHTML("beforeend", renderMessageBubble(m));
                scrollBottom();
                loadInbox().catch(() => {});
            } catch (e) {
                console.error("dm:new handler error", e);
            }
        });
    }

    // ---------- init ----------
    async function init() {
        try {
            await authUser();

            // pick convo from URL if present
            state.activeConvoId = getURLConvoId();
            state.activePeerId = getURLPeerId();

            bindRealtime();

            await loadInbox();

            if (state.activeConvoId) await loadChat();
            else {
                setChatHeader("");
                showHint(msgHint, "Choose a conversation from the left.");
            }

            // search
            leftSearch?.addEventListener("input", (e) => filterInbox(e.target.value));

            // send
            msgForm?.addEventListener("submit", async (e) => {
                e.preventDefault();
                try {
                    await sendMessage();
                } catch (err) {
                    console.error(err);
                    alert(String(err?.message || err));
                }
            });

            // back button (mobile)
            chatBackBtn?.addEventListener("click", () => {
                state.activeConvoId = "";
                state.activePeerId = "";
                setURL("", "");
                setChatHeader("");
                msgList.innerHTML = "";
                showHint(msgHint, "Choose a conversation from the left.");
                inboxList.querySelectorAll(".inboxRow").forEach((b) => b.classList.remove("isActive"));
            });

            console.log("✅ messages init ok", { uid: state.me, convoId: state.activeConvoId, peer: state.activePeerId });
        } catch (e) {
            console.error("init @ messages.js failed:", e);
            alert(String(e?.message || e));
        }
    }

    init();
})();
