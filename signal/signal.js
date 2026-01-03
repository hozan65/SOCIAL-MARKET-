// /signal/signal.js (FULL - sidebar friendly + bubbles + profile/upgrade bindings)
(() => {
    console.log("✅ signal.js loaded");

    const FN_LIST = "/.netlify/functions/ai_list_sessions";
    const FN_CREATE = "/.netlify/functions/ai_create_session";
    const FN_GET = "/.netlify/functions/ai_get_messages";
    const FN_SEND = "/.netlify/functions/ai_send_message";

    // DOM
    const $messages = document.getElementById("messages");
    const $input = document.getElementById("chatInput");
    const $send = document.getElementById("btnSend");

    const $chatList = document.querySelector(".chatList");
    const $btnNew = document.querySelector(".btnNew");

    // footer buttons
    const $btnProfile = document.getElementById("btnProfile");
    const $btnUpgrade = document.getElementById("btnUpgrade");

    // profile labels
    const $pfName = document.getElementById("pfName");
    const $pfEmail = document.getElementById("pfEmail");
    const $pfPlan = document.getElementById("pfPlan");

    // uid
    const uid = (localStorage.getItem("sm_uid") || "").trim();
    if (!uid) {
        if ($messages) $messages.innerHTML = `<div class="sysMsg">Giriş yok (sm_uid). Login ol.</div>`;
        if ($input) $input.disabled = true;
        if ($send) $send.disabled = true;
        return;
    }
    console.log("✅ uid:", uid);

    // Active session (sid uuid)
    const ACTIVE_KEY = `signal_active_sid_${uid}`;
    let activeSid = localStorage.getItem(ACTIVE_KEY) || "";

    const esc = (s) =>
        String(s ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");

    const safeDate = (d) => {
        try {
            return new Date(d).toLocaleString();
        } catch {
            return "";
        }
    };

    function setBusy(b) {
        if ($input) $input.disabled = b;
        if ($send) $send.disabled = b;
    }

    function clearMessages() {
        if ($messages) $messages.innerHTML = "";
    }

    function setSys(text) {
        if (!$messages) return;
        $messages.innerHTML = `<div class="sysMsg">${esc(text)}</div>`;
    }

    function addMsg(role, text) {
        if (!$messages) return null;
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
        <div class="chatMeta">${esc(safeDate(s.created_at))}</div>
      `;

            if (s.sid === activeSid) el.classList.add("active");

            el.addEventListener("click", async () => {
                activeSid = s.sid;
                localStorage.setItem(ACTIVE_KEY, activeSid);

                // highlight
                $chatList.querySelectorAll(".chatItem").forEach((x) => x.classList.remove("active"));
                el.classList.add("active");

                await loadMessages();
            });

            $chatList.appendChild(el);
        }
    }

    async function loadSessions() {
        try {
            const r = await fetch(FN_LIST, {
                headers: { "x-user-id": uid },
                cache: "no-store",
            });

            const t = await r.text();
            let data = {};
            try {
                data = JSON.parse(t);
            } catch {}

            if (!r.ok) {
                console.error("❌ list sessions", r.status, data || t);
                if ($chatList) $chatList.innerHTML = `<div class="sysMsg" style="padding:10px;">Sessions load failed</div>`;
                return [];
            }

            const sessions = data.sessions || [];

            // choose an active session
            if (!activeSid && sessions[0]?.sid) {
                activeSid = sessions[0].sid;
                localStorage.setItem(ACTIVE_KEY, activeSid);
            }

            renderSessions(sessions);
            return sessions;
        } catch (e) {
            console.error("❌ loadSessions error:", e);
            if ($chatList) $chatList.innerHTML = `<div class="sysMsg" style="padding:10px;">Sessions load error</div>`;
            return [];
        }
    }

    async function createSession() {
        try {
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
            try {
                data = JSON.parse(t);
            } catch {}

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
        } catch (e) {
            console.error("❌ createSession error:", e);
            return null;
        }
    }

    async function loadMessages() {
        if (!$messages) return;

        if (!activeSid) {
            setSys("Chat seç veya New chat");
            return;
        }

        setSys("Loading…");

        try {
            const url = `${FN_GET}?session_id=${encodeURIComponent(activeSid)}`;
            const r = await fetch(url, {
                headers: { "x-user-id": uid },
                cache: "no-store",
            });

            const t = await r.text();
            let data = {};
            try {
                data = JSON.parse(t);
            } catch {}

            if (!r.ok) {
                console.error("❌ load messages", r.status, data || t);
                setSys(`Messages load failed (${r.status})`);
                return;
            }

            const msgs = data.messages || [];
            clearMessages();

            if (!msgs.length) {
                setSys("Henüz mesaj yok. Bir şey yaz 👇");
                return;
            }

            for (const m of msgs) {
                addMsg(m.role === "assistant" ? "assistant" : "user", m.content || "");
            }
        } catch (e) {
            console.error("❌ loadMessages error:", e);
            setSys("Messages load error");
        }
    }

    async function sendMessage() {
        const text = ($input?.value || "").trim();
        if (!text) return;

        // ensure session
        if (!activeSid) {
            const s = await createSession();
            if (!s?.sid) {
                addMsg("assistant", "Hata: chat oluşturulamadı.");
                return;
            }
        }

        $input.value = "";
        addMsg("user", text);

        const typing = addMsg("assistant", "…");
        setBusy(true);

        try {
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
            try {
                data = JSON.parse(t);
            } catch {}

            if (!r.ok) {
                console.error("❌ send", r.status, data || t);
                if (typing?.querySelector(".msgBubble")) {
                    typing.querySelector(".msgBubble").textContent = `Hata: ${data?.error || "send failed"}`;
                }
                setBusy(false);
                return;
            }

            if (typing?.querySelector(".msgBubble")) {
                typing.querySelector(".msgBubble").textContent = data.reply || "(no reply)";
            }

            setBusy(false);
            // optional: refresh sessions list if titles change later
            // await loadSessions();
        } catch (e) {
            console.error("❌ sendMessage error:", e);
            if (typing?.querySelector(".msgBubble")) typing.querySelector(".msgBubble").textContent = "Hata: network";
            setBusy(false);
        }
    }

    // ✅ Bind footer buttons (profile/upgrade)
    $btnProfile?.addEventListener("click", () => {
        location.href = "/u/index.html";
    });

    $btnUpgrade?.addEventListener("click", () => {
        // Senin upgrade sayfan ne ise ona çevir:
        // location.href = "/upgrade/upgrade.html";
        location.href = "/upgrade/";
    });

    // (Opsiyonel) Footer textleri localStorage'dan doldur (kendi sistemine göre düzenleyebilirsin)
    try {
        const name = localStorage.getItem("sm_name") || "—";
        const email = localStorage.getItem("sm_email") || "—";
        const plan = (localStorage.getItem("sm_plan") || "").toLowerCase() || "free";
        if ($pfName) $pfName.textContent = name;
        if ($pfEmail) $pfEmail.textContent = email;
        if ($pfPlan) $pfPlan.textContent = plan;
    } catch {}

    // bind UI
    $btnNew?.addEventListener("click", () => createSession());
    $send?.addEventListener("click", sendMessage);

    $input?.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // init
    (async () => {
        await loadSessions();
        await loadMessages();
    })();
})();
