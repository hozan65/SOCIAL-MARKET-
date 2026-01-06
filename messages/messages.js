// /messages/messages.js (FINAL - sm-api DM, NO Netlify)
(() => {
    console.log("messages.js LOADED ✅", location.href);

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    const API_BASE = "https://api.chriontoken.com";

    const inboxList = document.getElementById("inboxList");
    const inboxHint = document.getElementById("inboxHint");
    const chatBackBtn = document.getElementById("chatBackBtn");

    const peerNameEl = document.getElementById("peerName");
    const peerSubEl = document.getElementById("peerSub");
    const peerAvaEl = document.getElementById("peerAva");

    const msgList = document.getElementById("msgList");
    const msgForm = document.getElementById("msgForm");
    const msgInput = document.getElementById("msgInput");
    const leftSearch = document.getElementById("leftSearch");

    if (!inboxList || !inboxHint || !peerNameEl || !peerSubEl || !msgList || !msgForm || !msgInput) {
        console.error("❌ Missing DOM");
        return;
    }

    const params = () => new URL(location.href).searchParams;
    const getURLPeerId = () => (params().get("to_id") || params().get("to") || params().get("id") || "").trim();
    const getURLConvoId = () => (params().get("conversation_id") || "").trim();

    function setURL({ conversation_id, peer_id }) {
        const u = new URL(location.href);
        if (peer_id) {
            u.searchParams.set("to", peer_id);
            u.searchParams.set("id", peer_id);
            u.searchParams.delete("to_id");
        }
        if (conversation_id) u.searchParams.set("conversation_id", conversation_id);
        history.replaceState(null, "", u.toString());
    }

    const esc = (s) =>
        String(s ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");

    const isMobile = () => window.matchMedia && window.matchMedia("(max-width: 860px)").matches;
    const setMobileModeChat = (open) => document.body.classList.toggle("dmChatOpen", !!open);
    const clearMsgs = () => (msgList.innerHTML = "");

    function renderMsgRow({ from_id, text, created_at, _localKey }) {
        const mine = String(from_id || "") === String(state.me || "");
        const cls = mine ? "mMine" : "mTheirs";
        const time = created_at ? new Date(created_at).toLocaleTimeString() : "";
        const localAttr = _localKey ? ` data-local="1" data-local-key="${esc(_localKey)}"` : "";

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

    function makeLocalKey({ from_id, to_id, peer_id, text, created_at }) {
        const t = created_at ? new Date(created_at).getTime() : Date.now();
        const bucket = Math.floor(t / 3000);
        return [from_id, to_id, peer_id, String(text || "").trim(), String(bucket)].join("|");
    }

    function getJWT() {
        const jwt = (window.SM_JWT || localStorage.getItem("sm_jwt") || "").trim();
        if (!jwt) throw new Error("Login required (sm_jwt missing)");
        return jwt;
    }

    async function api(path, { method = "GET", body } = {}) {
        const jwt = getJWT();
        const r = await fetch(`${API_BASE}${path}`, {
            method,
            headers: {
                ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
                Authorization: `Bearer ${jwt}`,
            },
            body: body ? JSON.stringify(body) : undefined,
            cache: "no-store",
        });

        const out = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(out?.error || `${path} failed (${r.status})`);
        return out;
    }

    const state = {
        me: (localStorage.getItem("sm_uid") || window.APPWRITE_USER_ID || "").trim(),
        peer_id: getURLPeerId(),
        conversation_id: getURLConvoId(),
        peer_name: "",
        peer_avatar: "",
        inboxRaw: [],
    };

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
        inboxList.querySelectorAll(".inboxItem").forEach((btn) => {
            if (!q) return (btn.style.display = "");
            const title = (btn.querySelector(".inboxTitle")?.textContent || "").toLowerCase();
            const peer = (btn.getAttribute("data-peer") || "").toLowerCase();
            btn.style.display = title.includes(q) || peer.includes(q) ? "" : "none";
        });
    }

    let _inboxTimer = null;
    function scheduleInboxRefresh() {
        clearTimeout(_inboxTimer);
        _inboxTimer = setTimeout(() => loadInbox(), 250);
    }

    async function loadInbox() {
        inboxHint.textContent = " ";
        try {
            const d = await api("/api/dm/inbox");
            const list = d.items || d.list || [];
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
        openChat({
            peer_id: (btn.getAttribute("data-peer") || "").trim(),
            conversation_id: (btn.getAttribute("data-convo") || "").trim(),
        });
    });

    async function loadChat(conversation_id) {
        clearMsgs();

        const d = await api(`/api/dm/get?conversation_id=${encodeURIComponent(conversation_id)}`);

        if (d.peer) {
            state.peer_id = d.peer.id || state.peer_id;
            state.peer_name = d.peer.name || state.peer_name || "";
            state.peer_avatar = d.peer.avatar_url || state.peer_avatar || "";
            setPeerHeader({ id: state.peer_id, name: state.peer_name, avatar_url: state.peer_avatar });
        }

        const rows = d.items || d.list || [];
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

        const found = state.inboxRaw.find((x) => String(x.conversation_id) === String(state.conversation_id));
        if (found) {
            state.peer_name = found.peer_name || "";
            state.peer_avatar = found.peer_avatar || "";
        }

        setPeerHeader({ id: state.peer_id, name: state.peer_name, avatar_url: state.peer_avatar });

        if (state.peer_id || state.conversation_id) setURL({ peer_id: state.peer_id, conversation_id: state.conversation_id });
        if (isMobile()) setMobileModeChat(true);

        if (state.conversation_id) await loadChat(state.conversation_id);
        else clearMsgs();
    }

    chatBackBtn?.addEventListener("click", () => {
        if (!isMobile()) return;
        setMobileModeChat(false);

        state.peer_id = "";
        state.conversation_id = "";
        state.peer_name = "";
        state.peer_avatar = "";

        setPeerHeader({});
        clearMsgs();

        try {
            const u = new URL(location.href);
            u.searchParams.delete("to");
            u.searchParams.delete("id");
            u.searchParams.delete("to_id");
            u.searchParams.delete("conversation_id");
            history.replaceState(null, "", u.toString());
        } catch {}
    });

    window.addEventListener("resize", () => {
        if (!isMobile()) setMobileModeChat(false);
    });

    // realtime socket
    const socket = window.rt?.socket;
    if (socket) {
        socket.off?.("dm_new");
        socket.on("dm_new", (p) => {
            const cid = (p.conversation_id || "").trim();
            if (!cid) return;

            if (cid === state.conversation_id) {
                const isMine = String(p.from_id) === String(state.me);

                if (isMine) {
                    const lk = makeLocalKey({
                        from_id: p.from_id,
                        to_id: p.to_id,
                        peer_id: state.peer_id,
                        text: p.text,
                        created_at: p.created_at || new Date().toISOString(),
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

            scheduleInboxRefresh();
        });
    } else {
        console.warn("⚠ realtime socket not ready (window.rt.socket missing)");
    }

    msgForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const text = (msgInput.value || "").trim();
        if (!text) return;

        if (!state.conversation_id && !state.peer_id) {
            alert("Kime mesaj atacaksın? (URL'de id/to yok)");
            return;
        }

        msgInput.value = "";

        const payload = { text };
        if (state.conversation_id) payload.conversation_id = state.conversation_id;
        else payload.peer_id = state.peer_id;

        const optimistic = {
            from_id: state.me,
            to_id: state.peer_id,
            peer_id: state.peer_id,
            text,
            created_at: new Date().toISOString(),
        };
        optimistic._localKey = makeLocalKey(optimistic);
        appendMsg(optimistic);

        try {
            const d = await api("/api/dm/send", { method: "POST", body: payload });

            if (!state.conversation_id && d.conversation_id) {
                state.conversation_id = d.conversation_id;
                setURL({ peer_id: state.peer_id, conversation_id: state.conversation_id });
                scheduleInboxRefresh();
            }
        } catch (err) {
            console.error("dm_send error:", err);
            alert(String(err?.message || err));
        }
    });

    (async () => {
        try {
            // ensure uid exists
            const uidLS = (localStorage.getItem("sm_uid") || "").trim();
            if (!uidLS && window.APPWRITE_USER_ID) {
                localStorage.setItem("sm_uid", window.APPWRITE_USER_ID);
                state.me = String(window.APPWRITE_USER_ID);
            } else if (uidLS) {
                state.me = uidLS;
            }

            await loadInbox();

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
