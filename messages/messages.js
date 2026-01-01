// /messages/messages.js (FINAL - chat-only scroll + no loading text + inbox fields fixed)
(() => {
    console.log("messages.js LOADED ✅", location.href);

    // ✅ sayfa scroll kilitle (CSS var ama garanti olsun)
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    // DOM
    const inboxList = document.getElementById("inboxList");
    const inboxHint = document.getElementById("inboxHint");
    const chatBackBtn = document.getElementById("chatBackBtn");

    const peerNameEl = document.getElementById("peerName");
    const peerSubEl = document.getElementById("peerSub");
    const peerAvaEl = document.getElementById("peerAva");

    const msgList = document.getElementById("msgList"); // msgBody
    const msgForm = document.getElementById("msgForm");
    const msgInput = document.getElementById("msgInput");
    const leftSearch = document.getElementById("leftSearch");

    // URL helpers
    const params = () => new URL(location.href).searchParams;
    const getURLPeerId = () => (params().get("to_id") || params().get("to") || "");
    const getURLConvoId = () => (params().get("conversation_id") || "");
    function setURL({ conversation_id, peer_id }) {
        const u = new URL(location.href);
        if (peer_id) u.searchParams.set("to", peer_id);
        if (conversation_id) u.searchParams.set("conversation_id", conversation_id);
        history.replaceState(null, "", u.toString());
    }

    // Utils
    function esc(s) {
        return String(s || "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }
    function isMobile() {
        return window.matchMedia && window.matchMedia("(max-width: 860px)").matches;
    }
    function setMobileModeChat(open) {
        document.body.classList.toggle("dmChatOpen", !!open);
    }
    function clearMsgs() {
        msgList.innerHTML = "";
    }
    function renderMsg(m) {
        const mine = String(m.from_id || "") === String(state.me);
        const cls = mine ? "mMine" : "mTheirs";
        const time = m.created_at ? new Date(m.created_at).toLocaleTimeString() : "";
        const text = m.text ?? "";

        const localKey = m._localKey
            ? ` data-local="1" data-local-key="${esc(m._localKey)}"`
            : "";

        return `
      <div class="mRow ${cls}"${localKey}>
        <div class="mBubble">
          <div class="mText">${esc(text)}</div>
          <div class="mTime">${esc(time)}</div>
        </div>
      </div>
    `;
    }
    function appendMsg(m) {
        msgList.insertAdjacentHTML("beforeend", renderMsg(m));
        msgList.scrollTop = msgList.scrollHeight;
    }
    function makeLocalKey({ from_id, to_id, conversation_id, text }) {
        return [
            String(conversation_id || ""),
            String(from_id || ""),
            String(to_id || ""),
            String(text || "").trim(),
        ].join("|");
    }

    // API
    async function ensureJWT() {
        let jwt = localStorage.getItem("sm_jwt");
        if (!jwt) {
            if (!window.account?.createJWT) throw new Error("Appwrite account client not found.");
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
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + jwt },
            body: body ? JSON.stringify(body) : undefined,
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.error || `${path} failed`);
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

        if (peerAvaEl) {
            if (avatar_url) {
                peerAvaEl.style.backgroundImage = `url("${avatar_url}")`;
                peerAvaEl.classList.add("hasImg");
            } else {
                peerAvaEl.style.backgroundImage = "";
                peerAvaEl.classList.remove("hasImg");
            }
        }
    }

    // Inbox item (✅ dm_inbox field fix)
    function renderInboxItem(it) {
        const peer_id = it.peer_id || "";
        const convo_id = it.conversation_id || "";
        const title = it.peer_name || peer_id || "Unknown";
        const last = it.last_message || ""; // ✅ sende last_message var
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
        const items = inboxList?.querySelectorAll(".inboxItem") || [];
        items.forEach((btn) => {
            if (!q) return (btn.style.display = "");
            const title = (btn.querySelector(".inboxTitle")?.textContent || "").toLowerCase();
            const peer = (btn.getAttribute("data-peer") || "").toLowerCase();
            btn.style.display = (title.includes(q) || peer.includes(q)) ? "" : "none";
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
            console.error(e);
        }
    }

    leftSearch?.addEventListener("input", applySearch);

    inboxList?.addEventListener("click", (e) => {
        const btn = e.target.closest(".inboxItem");
        if (!btn) return;
        const peer_id = btn.getAttribute("data-peer") || "";
        const conversation_id = btn.getAttribute("data-convo") || "";
        openChat({ peer_id, conversation_id });
    });

    // Chat load
    async function loadChat(conversation_id) {
        clearMsgs();
        const d = await api(`dm_get?conversation_id=${encodeURIComponent(conversation_id)}`);

        if (d.peer) {
            state.peer_id = d.peer.id || state.peer_id;
            state.peer_name = d.peer.name || "";
            state.peer_avatar = d.peer.avatar_url || "";
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

        // ✅ chat açılınca otomatik en alta
        msgList.scrollTop = msgList.scrollHeight;
    }

    async function openChat({ peer_id, conversation_id }) {
        state.peer_id = peer_id || "";
        state.conversation_id = conversation_id || "";

        // inbox'tan isim/avatar çek
        const found = state.inboxRaw.find((x) => x.conversation_id === state.conversation_id);
        if (found) {
            state.peer_name = found.peer_name || "";
            state.peer_avatar = found.peer_avatar || "";
        }

        setPeerHeader({ id: state.peer_id, name: state.peer_name, avatar_url: state.peer_avatar });

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

    // Back (mobil)
    chatBackBtn?.addEventListener("click", () => {
        if (isMobile()) setMobileModeChat(false);
    });

    window.addEventListener("resize", () => {
        if (!isMobile()) setMobileModeChat(false);
    });

    // Realtime
    const socket = window.rt?.socket;
    if (socket) {
        socket.on("dm_new", (p) => {
            const cid = p.conversation_id || "";
            if (!cid) return;

            if (cid === state.conversation_id) {
                const isMine = String(p.from_id) === String(state.me);

                // optimistic duplicate remove
                if (isMine) {
                    const lk = makeLocalKey({
                        conversation_id: cid,
                        from_id: p.from_id,
                        to_id: p.to_id,
                        text: p.text,
                    });
                    try {
                        const el = msgList.querySelector(
                            `.mRow[data-local="1"][data-local-key="${CSS.escape(lk)}"]`
                        );
                        if (el) el.remove();
                    } catch (e) {}
                }

                appendMsg({
                    from_id: p.from_id,
                    text: p.text,
                    created_at: p.created_at || new Date().toISOString(),
                });
            }

            loadInbox();
        });
    } else {
        console.warn("⚠ socket not ready in messages.js");
    }

    // Send
    msgForm?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const text = msgInput.value.trim();
        if (!text) return;
        msgInput.value = "";

        const payload = { text };
        if (state.conversation_id) payload.conversation_id = state.conversation_id;
        else if (state.peer_id) payload.peer_id = state.peer_id;
        else return alert("Kime mesaj atacaksın?");

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
            if (!state.conversation_id && d.conversation_id) {
                state.conversation_id = d.conversation_id;
                setURL({ peer_id: state.peer_id, conversation_id: state.conversation_id });
            }
        } catch (err) {
            console.error(" dm_send error:", err);
            alert(String(err?.message || err));
        }
    });

    // Init
    (async () => {
        try {
            await ensureJWT();

            // uid cache
            if (!localStorage.getItem("sm_uid") && window.APPWRITE_USER_ID) {
                localStorage.setItem("sm_uid", window.APPWRITE_USER_ID);
                state.me = window.APPWRITE_USER_ID;
            }

            await loadInbox();
            await openChat({ peer_id: state.peer_id, conversation_id: state.conversation_id });
        } catch (e) {
            console.error("init failed:", e);
            alert(String(e?.message || e));
        }
    })();
})();
