// /signal/signal.js (FULL - ChatGPT style + mobile drawer + upgrade URL fallback)
(() => {
    console.log("✅ signal.js loaded");

    const FN_LIST   = "/.netlify/functions/ai_list_sessions";
    const FN_CREATE = "/.netlify/functions/ai_create_session";
    const FN_GET    = "/.netlify/functions/ai_get_messages";
    const FN_SEND   = "/.netlify/functions/ai_send_message";

    const $messages = document.getElementById("messages");
    const $input    = document.getElementById("chatInput");
    const $send     = document.getElementById("btnSend");

    const $chatList = document.querySelector(".chatList");
    const $btnNew   = document.querySelector(".btnNew");

    const $btnProfile = document.getElementById("btnProfile");
    const $btnUpgrade = document.getElementById("btnUpgrade");

    const $pfName  = document.getElementById("pfName");
    const $pfEmail = document.getElementById("pfEmail");
    const $pfPlan  = document.getElementById("pfPlan");

    const uid = (localStorage.getItem("sm_uid") || "").trim();
    if (!uid) {
        if ($messages) $messages.innerHTML = `<div class="sysMsg">Giriş yok (sm_uid). Login ol.</div>`;
        if ($input) $input.disabled = true;
        if ($send) $send.disabled = true;
        return;
    }

    // active sid
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
        try { return new Date(d).toLocaleString(); } catch { return ""; }
    };

    function setBusy(b){
        if ($input) $input.disabled = b;
        if ($send)  $send.disabled = b;
    }

    function setSys(text){
        if (!$messages) return;
        $messages.innerHTML = `<div class="sysMsg">${esc(text)}</div>`;
    }

    function clearMessages(){
        if ($messages) $messages.innerHTML = "";
    }

    function addBlock(role, text){
        if (!$messages) return null;

        const block = document.createElement("div");
        block.className = `msgBlock ${role}`;
        block.innerHTML = `
      <div class="msgInner">
        <div class="msgRole">${role === "user" ? "YOU" : "AI"}</div>
        <div class="msgText">${esc(text)}</div>
      </div>
    `;
        $messages.appendChild(block);
        $messages.scrollTop = $messages.scrollHeight;
        return block;
    }

    // right top bar (mobile chats button + title)
    function ensureRightTop(){
        const right = document.querySelector(".right");
        if (!right) return;

        if (right.querySelector(".rightTop")) return;

        const top = document.createElement("div");
        top.className = "rightTop";
        top.innerHTML = `
      <button class="rightTopBtn" id="btnChats">Chats</button>
      <div class="rightTopTitle" id="chatTitle">Signal</div>
      <div style="width:72px;"></div>
    `;
        right.insertBefore(top, right.firstChild);

        const overlay = document.createElement("div");
        overlay.className = "sbOverlay";
        document.body.appendChild(overlay);

        const $btnChats = document.getElementById("btnChats");
        $btnChats?.addEventListener("click", () => {
            document.body.classList.add("mobileChatsOpen");
        });

        overlay.addEventListener("click", () => {
            document.body.classList.remove("mobileChatsOpen");
        });
    }

    function setRightTitle(title){
        const el = document.getElementById("chatTitle");
        if (el) el.textContent = title || "Signal";
    }

    function renderSessions(items){
        if (!$chatList) return;
        $chatList.innerHTML = "";

        if (!items.length){
            $chatList.innerHTML = `<div class="sysMsg" style="padding:10px;">No chats yet</div>`;
            return;
        }

        for (const s of items){
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

                $chatList.querySelectorAll(".chatItem").forEach(x => x.classList.remove("active"));
                el.classList.add("active");

                setRightTitle(s.title || "Chat");
                document.body.classList.remove("mobileChatsOpen");
                await loadMessages();
            });

            $chatList.appendChild(el);
        }
    }

    async function loadSessions(){
        try{
            const r = await fetch(FN_LIST, {
                headers: { "x-user-id": uid },
                cache: "no-store",
            });
            const t = await r.text();
            let data = {};
            try { data = JSON.parse(t); } catch {}

            if (!r.ok){
                console.error("❌ list sessions", r.status, data || t);
                if ($chatList) $chatList.innerHTML = `<div class="sysMsg" style="padding:10px;">Sessions load failed</div>`;
                return [];
            }

            const sessions = data.sessions || [];

            if (!activeSid && sessions[0]?.sid){
                activeSid = sessions[0].sid;
                localStorage.setItem(ACTIVE_KEY, activeSid);
            }

            renderSessions(sessions);

            // set title for active
            const active = sessions.find(x => x.sid === activeSid) || sessions[0];
            if (active) setRightTitle(active.title || "Chat");

            return sessions;
        } catch (e){
            console.error("❌ loadSessions error:", e);
            if ($chatList) $chatList.innerHTML = `<div class="sysMsg" style="padding:10px;">Sessions load error</div>`;
            return [];
        }
    }

    async function createSession(){
        try{
            const r = await fetch(FN_CREATE, {
                method: "POST",
                headers: { "Content-Type":"application/json", "x-user-id": uid },
                body: JSON.stringify({ title: "New chat" }),
            });
            const t = await r.text();
            let data = {};
            try { data = JSON.parse(t); } catch {}

            if (!r.ok){
                console.error("❌ create session", r.status, data || t);
                return null;
            }

            activeSid = data.session.sid;
            localStorage.setItem(ACTIVE_KEY, activeSid);

            await loadSessions();
            await loadMessages();

            setRightTitle(data.session.title || "New chat");
            document.body.classList.remove("mobileChatsOpen");

            return data.session;
        } catch (e){
            console.error("❌ createSession error:", e);
            return null;
        }
    }

    async function loadMessages(){
        if (!$messages) return;
        if (!activeSid){
            setSys("Chat seç veya New chat");
            return;
        }

        setSys("Loading…");

        try{
            const url = `${FN_GET}?session_id=${encodeURIComponent(activeSid)}`;
            const r = await fetch(url, {
                headers: { "x-user-id": uid },
                cache: "no-store",
            });

            const t = await r.text();
            let data = {};
            try { data = JSON.parse(t); } catch {}

            if (!r.ok){
                console.error("❌ load messages", r.status, data || t);
                setSys(`Messages load failed (${r.status})`);
                return;
            }

            const msgs = data.messages || [];
            clearMessages();

            if (!msgs.length){
                setSys("Henüz mesaj yok. Bir şey yaz 👇");
                return;
            }

            for (const m of msgs){
                addBlock(m.role === "assistant" ? "assistant" : "user", m.content || "");
            }
        } catch (e){
            console.error("❌ loadMessages error:", e);
            setSys("Messages load error");
        }
    }

    async function sendMessage(){
        const text = ($input?.value || "").trim();
        if (!text) return;

        if (!activeSid){
            const s = await createSession();
            if (!s?.sid){
                addBlock("assistant", "Hata: chat oluşturulamadı.");
                return;
            }
        }

        $input.value = "";
        addBlock("user", text);

        const typing = addBlock("assistant", "…");
        setBusy(true);

        try{
            const r = await fetch(FN_SEND, {
                method: "POST",
                headers: { "Content-Type":"application/json", "x-user-id": uid },
                body: JSON.stringify({ session_id: activeSid, text }),
            });

            const raw = await r.text();
            let data = {};
            try { data = JSON.parse(raw); } catch {}

            if (!r.ok){
                console.error("❌ send", r.status, data || raw);
                const bubble = typing?.querySelector(".msgText");
                if (bubble) bubble.textContent = `Hata: ${data?.error || "send failed"}`;
                setBusy(false);
                return;
            }

            const bubble = typing?.querySelector(".msgText");
            if (bubble) bubble.textContent = data.reply || "(no reply)";
            setBusy(false);
        } catch (e){
            console.error("❌ sendMessage error:", e);
            const bubble = typing?.querySelector(".msgText");
            if (bubble) bubble.textContent = "Hata: network";
            setBusy(false);
        }
    }

    // ✅ Upgrade URL fix: tries multiple candidates, first 200 wins
    async function gotoFirstAvailable(urls){
        for (const u of urls){
            try{
                const res = await fetch(u, { method: "HEAD", cache:"no-store" });
                if (res.ok){
                    location.href = u;
                    return true;
                }
            } catch {}
        }
        // fallback: first anyway
        location.href = urls[0];
        return false;
    }

    // Bind footer buttons
    // Profile: sen başka planın var dedin -> şimdilik KAPATMADIM, sadece hiçbir şey yapmasın istersen yorumla
    $btnProfile?.addEventListener("click", () => {
        // şimdilik profile sayfasına götürüyorum; planın değişince burayı değiştiririz
        location.href = "/u/index.html";
    });

    $btnUpgrade?.addEventListener("click", async () => {
        // En sık kullanılan upgrade yolları
        await gotoFirstAvailable([
            "/upgrade/index.html",
            "/upgrade/upgrade.html",
            "/upgrade/",
            "/u/index.html#upgrade"
        ]);
    });

    // Fill footer labels
    try{
        const name = localStorage.getItem("sm_name") || "—";
        const email = localStorage.getItem("sm_email") || "—";
        const plan = (localStorage.getItem("sm_plan") || localStorage.getItem("plan") || "free").toLowerCase();
        if ($pfName)  $pfName.textContent = name;
        if ($pfEmail) $pfEmail.textContent = email;
        if ($pfPlan)  $pfPlan.textContent = plan;
    } catch {}

    // Bind UI
    $btnNew?.addEventListener("click", () => createSession());
    $send?.addEventListener("click", sendMessage);
    $input?.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey){
            e.preventDefault();
            sendMessage();
        }
    });

    // init
    ensureRightTop();
    (async () => {
        await loadSessions();
        await loadMessages();
    })();
})();
