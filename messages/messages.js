// /messages/messages.js (FULL CLEAN - id/to/to_id support + dm_* api + realtime)
// Requires: window.account.createJWT() available via /assets1/appwrite-init.js
(() => {
    console.log("messages.js LOADED ✅", location.href);

    // Lock page scroll (only chat list scrolls)
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    // DOM
    const inboxList = document.getElementById("inboxList");
    const inboxHint = document.getElementById("inboxHint");
    const chatBackBtn = document.getElementById("chatBackBtn");

    const peerNameEl = document.getElementById("peerName");
    const peerSubEl = document.getElementById("peerSub");
    const peerAvaEl = document.getElementById("peerAva");

    const msgList = document.getElementById("msgList");       // .msgBody
    const msgForm = document.getElementById("msgForm");       // form
    const msgInput = document.getElementById("msgInput");     // input
    const leftSearch = document.getElementById("leftSearch"); // search

    // Guard
    if (!inboxList || !inboxHint || !peerNameEl || !peerSubEl || !msgList || !msgForm || !msgInput) {
        console.error("❌ Missing DOM", {
            inboxList: !!inboxList,
            inboxHint: !!inboxHint,
            peerNameEl: !!peerNameEl,
            peerSubEl: !!peerSubEl,
            msgList: !!msgList,
            msgForm: !!msgForm,
            msgInput: !!msgInput,
        });
        return;
    }

    // URL helpers
    const params = () => new URL(location.href).searchParams;

    // ✅ IMPORTANT: supports ?to_id= ?to= ?id=
    const getURLPeerId = () =>
        (params().get("to_id") || params().get("to") || params().get("id") || "").trim();

    const getURLConvoId = () =>
        (params().get("conversation_id") || "").trim();

    function setURL({ conversation_id, peer_id }) {
        const u = new URL(location.href);

        if (peer_id) {
            // keep both for backward compatibility
            u.searchParams.set("to", peer_id);
            u.searchParams.set("id", peer_id);
            u.searchParams.delete("to_id");
        }
        if (conversation_id) u.searchParams.set("conversation_id", conversation_id);

        history.replaceState(null, "", u.toString());
    }

    // Utils
    const esc = (s) =>
        String(s ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");

    const isMobile = () =>
        window.matchMedia && window.matchMedia("(max-width: 860px)").matches;

    const setMobileModeChat = (open) =>
        document.body.classList.toggle("dmChatOpen", !!open);

    const clearMsgs = () => (msgList.innerHTML = "");

    function renderMsgRow({ from_id, text, created_at, _localKey }) {
        const mine = String(from_id || "") === String(state.me || "");
        const cls = mine ? "mMine" : "mTheirs";
        const time = created_at ? new Date(created_at).toLocaleTimeString() : "";

        const localAttr = _localKey
            ? ` data-local="1" data-local-key="${esc(_localKey)}"`
            : "";

        return `
      <div class="mRow ${cls}"${localAttr}>
        <div class="mBubble">
          <div class="mText">${esc(text)}</div>
          <div class="mTime">${esc(time)}</div>
        </div>
      </div>
    `;
    }

    function appendMsg(m) {
        msgList.insertAdjacentHTML("beforeend", renderMsgRow(m));
        msgList.scrollTop = msgList.scrollHeight;
    }

    function makeLocalKey({ conversation_id, from_id, to_id, text }) {
        return [
            String(conversation_id || ""),
            String(from_id || ""),
            String(to_id || ""),
            String(text || "").trim(),
        ].join("|");
    }

    // API (Netlify functions)
    async function ensureJWT() {
        let jwt = localStorage.getItem("sm_jwt");
        if (jwt) return jwt;

        if (!window.account?.createJWT) {
            throw new Error("Appwrite account client not found (window.account missing).");
        }

        const r = await window.account.createJWT();
        jwt = r?.jwt;
        if (!jwt) throw new Error("JWT create failed");

        localStorage.setItem("sm_jwt", jwt);
        return jwt;
    }

    async function api(path, { method = "GET", body } = {}) {
        const jwt = await ensureJWT();
        const r = await fetch(`/.netlify/functions/${path}`, {
            method,
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + jwt,
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
            throw new Error(data?.error || `${path} failed (${r.status})`);
        }
        return data;
    }

    // State
    const state = {
        me: localStorage.getItem("sm_uid") || window.APPWRITE_USER_ID || "",
        peer_id: getURLPeerId(),
        conversation_id: getURLConvoId(),
        peer_name: "",
        peer_avatar: "",
        inboxRaw: [],
    };

    // Header
    function setPeerHeader({ id, name, avatar_url } = {}) {
        peerNameEl.textContent = name || (id ? id : "Select a chat");
        peerSubEl.textContent = "Direct messages";

        if (!peerAvaEl) return;

        if (avatar_url) {
            peerAvaEl.style.backgroundImage = `url("${avatar_url}")`;
            peerAvaEl.classList.add("hasImg");
        } else {
            peerAvaEl.style.backgroundImage = "";
            peerAvaEl.classList.remove("hasImg");
        }
    }

    // Inbox item (expects dm_inbox -> list[] with fields below)
    function renderInboxItem(it) {
        const peer_id = (it.peer_id || "").trim();
        const convo_id = (it.conversation_id || "").trim();
        const title = it.peer_name || peer_id || "Unknown";
        const last = it.last_message || "";
        const ts = it.last_at || it.updated_at || it.created_at || "";
        const when = ts ? new Date(ts).toLocaleString() : "";

        return `
      <button class="inboxItem" data-peer="${esc(peer_id)}" data-convo="${esc(convo_id)}" type="button">
        <div class="inboxTitle">${esc(title)}</div>
        <div class="inboxMeta">${esc(when)}</div>
        <div class="inboxPreview">${esc(last)}</div>
      </button>
    `;
    }

    function applySearch() {
        const q = (leftSearch?.value || "").trim().toLowerCase();
        const items = inboxList.querySelectorAll(".inboxItem");

        items.forEach((btn) => {
            if (!q) {
                btn.style.display = "";
                return;
            }
            const title = (btn.querySelector(".inboxTitle")?.textContent || "").toLowerCase();
            const peer = (btn.getAttribute("data-peer") || "").toLowerCase();
            btn.style.display = title.includes(q) || peer.includes(q) ? "" : "none";
        });
    }

    async function loadInbox() {
        inboxHint.textContent = " ";
        try {
            const d = await api("dm_inbox");
            const list = d.list || [];
            state.inboxRaw = list;

            inboxList.innerHTML = list.map(renderInboxItem).join("");
            inboxHint.textContent = list.length ? "" : "No chats yet.";
            applySearch();
        } catch (e) {
            inboxHint.textContent = "Inbox load failed.";
            console.error("dm_inbox error:", e);
        }
    }

    leftSearch?.addEventListener("input", applySearch);

    inboxList.addEventListener("click", (e) => {
        const btn = e.target.closest(".inboxItem");
        if (!btn) return;

        const peer_id = (btn.getAttribute("data-peer") || "").trim();
        const conversation_id = (btn.getAttribute("data-convo") || "").trim();

        openChat({ peer_id, conversation_id });
    });

    // Chat
    async function loadChat(conversation_id) {
        clearMsgs();

        const d = await api(`dm_get?conversation_id=${encodeURIComponent(conversation_id)}`);

        // peer info
        if (d.peer) {
            state.peer_id = d.peer.id || state.peer_id;
            state.peer_name = d.peer.name || state.peer_name || "";
            state.peer_avatar = d.peer.avatar_url || state.peer_avatar || "";
            setPeerHeader({ id: state.peer_id, name: state.peer_name, avatar_url: state.peer_avatar });
        }

        const rows = d.list || [];
        rows.forEach((m) => {
            appendMsg({
                from_id: m.sender_id,
                text: m.body,
                created_at: m.created_at,
            });
        });

        msgList.scrollTop = msgList.scrollHeight;
    }

    async function openChat({ peer_id, conversation_id }) {
        state.peer_id = (peer_id || "").trim();
        state.conversation_id = (conversation_id || "").trim();

        // try to hydrate name/avatar from inbox cache
        const found = state.inboxRaw.find((x) => String(x.conversation_id) === String(state.conversation_id));
        if (found) {
            state.peer_name = found.peer_name || "";
            state.peer_avatar = found.peer_avatar || "";
        }

        setPeerHeader({
            id: state.peer_id,
            name: state.peer_name,
            avatar_url: state.peer_avatar,
        });

        if (state.peer_id || state.conversation_id) {
            setURL({ peer_id: state.peer_id, conversation_id: state.conversation_id });
        }

        if (isMobile()) setMobileModeChat(true);

        if (state.conversation_id) {
            await loadChat(state.conversation_id);
        } else {
            clearMsgs();
        }
    }

    // Back (mobile)
    chatBackBtn?.addEventListener("click", () => {
        if (!isMobile()) return;

        // 1) listeye dön
        setMobileModeChat(false);

        // 2) state temizle
        state.peer_id = "";
        state.conversation_id = "";
        state.peer_name = "";
        state.peer_avatar = "";

        // 3) UI temizle
        setPeerHeader({});
        clearMsgs();

        // 4) URL temizle (en kritik)
        try{
            const u = new URL(location.href);
            u.searchParams.delete("to");
            u.searchParams.delete("id");
            u.searchParams.delete("to_id");
            u.searchParams.delete("conversation_id");
            history.replaceState(null, "", u.toString());
        }catch(e){}
    });

    window.addEventListener("resize", () => {
        if (!isMobile()) setMobileModeChat(false);
    });

    // Realtime (Socket.IO)
    const socket = window.rt?.socket;
    if (socket) {
        socket.on("dm_new", (p) => {
            const cid = (p.conversation_id || "").trim();
            if (!cid) return;

            // If this is current chat, append
            if (cid === state.conversation_id) {
                const isMine = String(p.from_id) === String(state.me);

                // remove optimistic duplicate (if mine)
                if (isMine) {
                    const lk = makeLocalKey({
                        conversation_id: cid,
                        from_id: p.from_id,
                        to_id: p.to_id,
                        text: p.text,
                    });
                    try {
                        const el = msgList.querySelector(`.mRow[data-local="1"][data-local-key="${CSS.escape(lk)}"]`);
                        if (el) el.remove();
                    } catch {}
                }

                appendMsg({
                    from_id: p.from_id,
                    text: p.text,
                    created_at: p.created_at || new Date().toISOString(),
                });
            }

            // refresh inbox list (preview/last_at)
            loadInbox();
        });
    } else {
        console.warn("⚠ realtime socket not ready (window.rt.socket missing)");
    }

    // Send
    msgForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const text = (msgInput.value || "").trim();
        if (!text) return;

        msgInput.value = "";

        const payload = { text };

        if (state.conversation_id) payload.conversation_id = state.conversation_id;
        else if (state.peer_id) payload.peer_id = state.peer_id;
        else {
            alert("Kime mesaj atacaksın? (URL'de id/to yok)");
            return;
        }

        // optimistic
        const optimistic = {
            conversation_id: state.conversation_id || "pending",
            from_id: state.me,
            to_id: state.peer_id,
            text,
            created_at: new Date().toISOString(),
        };
        optimistic._localKey = makeLocalKey(optimistic);
        appendMsg(optimistic);

        try {
            const d = await api("dm_send", { method: "POST", body: payload });

            // if chat newly created
            if (!state.conversation_id && d.conversation_id) {
                state.conversation_id = d.conversation_id;
                setURL({ peer_id: state.peer_id, conversation_id: state.conversation_id });
            }
        } catch (err) {
            console.error("dm_send error:", err);
            alert(String(err?.message || err));
        }
    });

    // Init
    (async () => {
        try {
            await ensureJWT();

            // try cache uid if exists
            if (!localStorage.getItem("sm_uid") && window.APPWRITE_USER_ID) {
                localStorage.setItem("sm_uid", window.APPWRITE_USER_ID);
                state.me = window.APPWRITE_USER_ID;
            }

            await loadInbox();

            // auto open if URL has peer or convo
            if (state.peer_id || state.conversation_id) {
                await openChat({ peer_id: state.peer_id, conversation_id: state.conversation_id });
            } else {
                setPeerHeader({});
                clearMsgs();
            }
        } catch (e) {
            console.error("messages init failed:", e);
            alert(String(e?.message || e));
        }
    })();
})();
