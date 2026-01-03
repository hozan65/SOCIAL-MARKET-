// /signal/signal.js (FULL integrated with your UI)
(() => {
    console.log("✅ signal.js loaded");

    const FN_LIST = "/.netlify/functions/ai_list_sessions";
    const FN_CREATE = "/.netlify/functions/ai_create_session";
    const FN_GET = "/.netlify/functions/ai_get_messages";
    const FN_SEND = "/.netlify/functions/ai_send_message";

    // DOM (your existing UI)
    const $messages = document.getElementById("messages");
    const $input = document.getElementById("chatInput");
    const $send = document.getElementById("btnSend");

    const $chatList = document.querySelector(".chatList");
    const $btnNew = document.querySelector(".btnNew");

    const uid = (localStorage.getItem("sm_uid") || "").trim();
    if (!uid) {
        if ($messages) $messages.innerHTML = `<div class="sysMsg">Giriş yok (sm_uid). Login ol.</div>`;
        if ($input) $input.disabled = true;
        if ($send) $send.disabled = true;
        return;
    }

    // active session (sid uuid) stored here
    const ACTIVE_KEY = `signal_active_sid_${uid}`;
    let activeSid = localStorage.getItem(ACTIVE_KEY) || "";

    const esc = (s) =>
        String(s ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");

    function setBusy(b) {
        if ($input) $input.disabled = b;
        if ($send) $send.disabled = b;
    }

    function addMsg(role, text) {
        const row = document.createElement("div");
        row.className = `msgRow ${role}`;
        row.innerHTML = `<div class="msgBubble">${esc(text)}</div>`;
        $messages.appendChild(row);
        $messages.scrollTop = $messages.scrollHeight;
        return row;
    }

    function renderSessions(items) {
        if (!$chatList) return;
        $chatList.innerHTML = "";

        if (!items.length) {
            $chatList.innerHTML = `<div class="sysMsg" style="padding:10px;">No chats yet</div>`;
            return;
        }

        for (const s of items) {
            const el = document.createElement("button");
            el.type = "button";
            el.className = "chatItem";
            el.dataset.sid = s.sid;
            el.innerHTML = `
        <div class="chatTitle">${esc(s.title || "Chat")}</div>
        <div class="chatMeta">${esc(new Date(s.created_at).toLocaleString())}</div>
      `;
            if (s.sid === activeSid) el.classList.add("active");
            el.addEventListener("click", async () => {
                activeSid = s.sid;
                localStorage.setItem(ACTIVE_KEY, activeSid);
                // highlight
                $chatList.querySelectorAll(".chatItem").forEach(x => x.classList.remove("active"));
                el.classList.add("active");
                await loadMessages();
            });
            $chatList.appendChild(el);
        }
    }

    async function loadSessions() {
        const r = await fetch(FN_LIST, {
            headers: { "x-user-id": uid },
            cache: "no-store",
        });
        const t = await r.text();
        let data = {};
        try { data = JSON.parse(t); } catch {}

        if (!r.ok) {
            console.error("❌ list sessions", r.status, data || t);
            if ($chatList) $chatList.innerHTML = `<div class="sysMsg" style="padding:10px;">Sessions load failed</div>`;
            return [];
        }

        const sessions = data.sessions || [];

        // pick an active session if none
        if (!activeSid && sessions[0]?.sid) {
            activeSid = sessions[0].sid;
            localStorage.setItem(ACTIVE_KEY, activeSid);
        }

        renderSessions(sessions);
        return sessions;
    }

    async function createSession() {
        const r = await fetch(FN_CREATE, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-user-id": uid,
            },
            body: JSON.stringify({ title: "New chat" }),
        });

        const t = await r.text();
        let data = {};
        try { data = JSON.parse(t); } catch {}

        if (!r.ok) {
            console.error("❌ create session", r.status, data || t);
            return null;
        }

        activeSid = data.session.sid;
        localStorage.setItem(ACTIVE_KEY, activeSid);

        // reload list + messages
        await loadSessions();
        await loadMessages();
        return data.session;
    }

    async function loadMessages() {
        if (!$messages) return;
        if (!activeSid) {
            $messages.innerHTML = `<div class="sysMsg">Chat seç veya New chat</div>`;
            return;
        }

        $messages.innerHTML = `<div class="sysMsg">Loading…</div>`;

        const url = `${FN_GET}?session_id=${encodeURIComponent(activeSid)}`; // param adı session_id kalıyor, DB'de sid'e eşit
        const r = await fetch(url, {
            headers: { "x-user-id": uid },
            cache: "no-store",
        });

        const t = await r.text();
        let data = {};
        try { data = JSON.parse(t); } catch {}

        if (!r.ok) {
            console.error("❌ load messages", r.status, data || t);
            $messages.innerHTML = `<div class="sysMsg">Messages load failed (${r.status})</div>`;
            return;
        }

        const msgs = data.messages || [];
        $messages.innerHTML = "";
        if (!msgs.length) {
            $messages.innerHTML = `<div class="sysMsg">Henüz mesaj yok. Bir şey yaz 👇</div>`;
            return;
        }

        for (const m of msgs) {
            addMsg(m.role === "assistant" ? "assistant" : "user", m.content || "");
        }
    }

    async function sendMessage() {
        const text = ($input?.value || "").trim();
        if (!text) return;
        if (!activeSid) {
            // otomatik new chat aç
            await createSession();
        }

        $input.value = "";
        addMsg("user", text);

        const typing = addMsg("assistant", "…");
        setBusy(true);

        const r = await fetch(FN_SEND, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-user-id": uid,
            },
            body: JSON.stringify({ session_id: activeSid, text }),
        });

        const t = await r.text();
        let data = {};
        try { data = JSON.parse(t); } catch {}

        if (!r.ok) {
            console.error("❌ send", r.status, data || t);
            typing.querySelector(".msgBubble").textContent = `Hata: ${data?.error || "send failed"}`;
            setBusy(false);
            return;
        }

        typing.querySelector(".msgBubble").textContent = data.reply || "(no reply)";
        setBusy(false);

        // list refresh (istersen title update vs ekleriz)
    }

    // bind UI
    if ($btnNew) $btnNew.addEventListener("click", () => createSession());
    if ($send) $send.addEventListener("click", sendMessage);
    if ($input) {
        $input.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    // init
    (async () => {
        await loadSessions();
        await loadMessages();
    })();
})();
