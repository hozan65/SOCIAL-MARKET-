// /messages/messages.js
(() => {
    console.log("messages.js LOADED ✅", location.href);

    // -----------------------------
    // DOM
    // -----------------------------
    const inboxList = document.getElementById("inboxList");
    const inboxHint = document.getElementById("inboxHint");

    const peerNameEl = document.getElementById("peerName");
    const peerSubEl = document.getElementById("peerSub");

    const msgList = document.getElementById("msgList");
    const msgHint = document.getElementById("msgHint");

    const msgForm = document.getElementById("msgForm");
    const msgInput = document.getElementById("msgInput");

    // -----------------------------
    // URL helpers
    // -----------------------------
    const params = () => new URL(location.href).searchParams;
    function getURLPeerId() {
        const p = params();
        return p.get("to_id") || p.get("to") || "";
    }
    function getURLConvoId() {
        const p = params();
        return p.get("conversation_id") || "";
    }
    function setURL({ conversation_id, peer_id }) {
        const u = new URL(location.href);
        if (peer_id) u.searchParams.set("to", peer_id);
        if (conversation_id) u.searchParams.set("conversation_id", conversation_id);
        history.replaceState(null, "", u.toString());
    }

    // -----------------------------
    // Utils
    // -----------------------------
    function esc(s) {
        return String(s || "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function setPeerHeader(peerId) {
        peerNameEl.textContent = peerId ? peerId : "Select a chat";
        peerSubEl.textContent = peerId ? "Direct messages" : "Direct messages";
    }

    function renderMsg(m) {
        const me = state.me;
        const mine = String(m.from_id || m.sender_id || "") === String(me);
        const cls = mine ? "mMine" : "mTheirs";
        const time = m.created_at ? new Date(m.created_at).toLocaleTimeString() : "";
        const text = m.text ?? m.body ?? "";
        return `
      <div class="mRow ${cls}">
        <div class="mBubble">
          <div class="mText">${esc(text)}</div>
          <div class="mTime">${esc(time)}</div>
        </div>
      </div>
    `;
    }

    function clearMsgs() {
        msgList.innerHTML = "";
    }
    function appendMsg(m) {
        msgList.insertAdjacentHTML("beforeend", renderMsg(m));
        msgList.scrollTop = msgList.scrollHeight;
    }

    function renderInboxItem(it) {
        const peer_id = it.peer_id || it.other_id || it.to_id || "";
        const convo_id = it.conversation_id || it.id || "";
        const last = it.last_text || it.preview || "";
        const ts = it.last_at || it.updated_at || it.created_at || "";
        const when = ts ? new Date(ts).toLocaleString() : "";
        return `
      <button class="inboxItem" data-peer="${esc(peer_id)}" data-convo="${esc(convo_id)}" type="button">
        <div class="inboxTitle">${esc(peer_id || "Unknown")}</div>
        <div class="inboxMeta">${esc(when)}</div>
        <div class="inboxPreview">${esc(last)}</div>
      </button>
    `;
    }

    async function ensureJWT() {
        // sm_jwt yoksa Appwrite’dan al
        let jwt = localStorage.getItem("sm_jwt");
        if (!jwt) {
            if (!window.account?.createJWT) throw new Error("Appwrite account client not found (createJWT missing).");
            const r = await window.account.createJWT();
            jwt = r?.jwt;
            if (!jwt) throw new Error("JWT create failed");
            localStorage.setItem("sm_jwt", jwt);
        }
        return jwt;
    }

    async function api(path, { method = "GET", body } = {}) {
        const jwt = await ensureJWT();
        const r = await fetch(`/.netlify/functions/${path}`, {
            method,
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + jwt,
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.error || `${path} failed`);
        return data;
    }

    // -----------------------------
    // State
    // -----------------------------
    const state = {
        me: localStorage.getItem("sm_uid") || window.APPWRITE_USER_ID || "",
        peer_id: getURLPeerId(),
        conversation_id: getURLConvoId(),
    };

    // -----------------------------
    // Load inbox
    // -----------------------------
    async function loadInbox() {
        inboxHint.textContent = "Loading...";
        try {
            const d = await api("dm_inbox");
            const list = d.list || [];
            inboxList.innerHTML = list.map(renderInboxItem).join("");
            inboxHint.textContent = list.length ? "" : "No chats yet.";
        } catch (e) {
            inboxHint.textContent = "Inbox load failed.";
            console.error(e);
        }
    }

    // click inbox -> open chat
    inboxList?.addEventListener("click", (e) => {
        const btn = e.target.closest(".inboxItem");
        if (!btn) return;
        const peer_id = btn.getAttribute("data-peer") || "";
        const conversation_id = btn.getAttribute("data-convo") || "";
        openChat({ peer_id, conversation_id });
    });

    // -----------------------------
    // Load chat
    // -----------------------------
    async function loadChat(conversation_id) {
        msgHint.textContent = "Loading...";
        clearMsgs();
        try {
            const d = await api(`dm_get?conversation_id=${encodeURIComponent(conversation_id)}`);
            const rows = d.list || d.rows || [];
            rows.forEach((m) => {
                appendMsg({
                    from_id: m.sender_id || m.from_id,
                    text: m.body ?? m.text,
                    created_at: m.created_at,
                });
            });
            msgHint.textContent = rows.length ? "" : "Start messaging...";
        } catch (e) {
            msgHint.textContent = "Chat load failed.";
            console.error(e);
            alert(String(e?.message || e));
        }
    }

    async function openChat({ peer_id, conversation_id }) {
        state.peer_id = peer_id || "";
        state.conversation_id = conversation_id || "";

        setPeerHeader(state.peer_id);
        if (state.peer_id || state.conversation_id) setURL({ peer_id: state.peer_id, conversation_id: state.conversation_id });

        // conversation_id varsa direkt yükle
        if (state.conversation_id) {
            await loadChat(state.conversation_id);
            return;
        }

        // conversation_id yoksa ama peer varsa: ilk mesajla dm_send oluşturacak.
        clearMsgs();
        msgHint.textContent = "Start messaging...";
    }

    // -----------------------------
    // Realtime (Socket dm_new)
    // -----------------------------
    const socket = window.rt?.socket;
    if (socket) {
        socket.on("dm_new", (p) => {
            // p: { conversation_id, from_id, to_id, text, created_at ... }
            console.log("📩 dm_new received:", p);

            const cid = p.conversation_id || "";
            const peerFrom = p.from_id || "";
            const peerTo = p.to_id || "";

            // Eğer ilk defa conversation oluştuysa URL ve state’i sabitle
            if (!state.conversation_id && cid) {
                state.conversation_id = cid;
                if (!state.peer_id) {
                    // peer id’yi mesajdan tahmin et
                    state.peer_id = (peerFrom === state.me) ? peerTo : peerFrom;
                }
                setURL({ peer_id: state.peer_id, conversation_id: state.conversation_id });
                setPeerHeader(state.peer_id);
            }

            // sadece açık conversation ise ekrana bas
            if (cid && cid === state.conversation_id) {
                appendMsg({
                    from_id: p.from_id,
                    text: p.text,
                    created_at: p.created_at || new Date().toISOString(),
                });
            }

            // inbox’u güncellemek için hızlı refresh
            loadInbox();
        });
    } else {
        console.warn("⚠️ socket not ready in messages.js");
    }

    // -----------------------------
    // Send message
    // -----------------------------
    msgForm?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const text = msgInput.value.trim();
        if (!text) return;
        msgInput.value = "";

        // optimistic UI
        appendMsg({ from_id: state.me, text, created_at: new Date().toISOString() });

        // payload: conversation_id varsa onu, yoksa peer_id ile oluştur
        const payload = { text };
        if (state.conversation_id) payload.conversation_id = state.conversation_id;
        else if (state.peer_id) payload.peer_id = state.peer_id;
        else {
            alert("Kime mesaj atacaksın? URL’de ?to=<USER_ID> yok.");
            return;
        }

        try {
            const d = await api("dm_send", { method: "POST", body: payload });

            // dm_send conversation_id döndürürse state'e yaz
            if (!state.conversation_id && d.conversation_id) {
                state.conversation_id = d.conversation_id;
                setURL({ peer_id: state.peer_id, conversation_id: state.conversation_id });
            }

            // Not: mesajın gerçek anlık düşmesi socket dm_new ile olur
        } catch (err) {
            console.error("❌ dm_send error:", err);
            alert(String(err?.message || err));
        }
    });

    // -----------------------------
    // Init
    // -----------------------------
    (async () => {
        try {
            await ensureJWT(); // JWT hazır olsun
            // uid’yi sakla (auth_user için)
            if (!localStorage.getItem("sm_uid") && window.APPWRITE_USER_ID) {
                localStorage.setItem("sm_uid", window.APPWRITE_USER_ID);
                state.me = window.APPWRITE_USER_ID;
            }

            await loadInbox();
            await openChat({ peer_id: state.peer_id, conversation_id: state.conversation_id });

            console.log("✅ messages init ok", { me: state.me, peer_id: state.peer_id, conversation_id: state.conversation_id });
        } catch (e) {
            console.error("init failed:", e);
            alert(String(e?.message || e));
        }
    })();
})();
