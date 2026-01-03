// /signal/signal.js (FULL)
(() => {
    console.log("✅ signal.js loaded");

    const FN_LIST   = "/.netlify/functions/ai_list_sessions";
    const FN_CREATE = "/.netlify/functions/ai_create_session";
    const FN_GET    = "/.netlify/functions/ai_get_messages";
    const FN_SEND   = "/.netlify/functions/ai_send_message";

    // DOM
    const $sidebar   = document.getElementById("sidebar");
    const $backdrop  = document.getElementById("sbBackdrop");
    const $hamb      = document.getElementById("hamburger");
    const $openChats = document.getElementById("btnOpenChats");

    const $chatList  = document.getElementById("chatList");
    const $btnNew    = document.getElementById("btnNewChat");
    const $search    = document.getElementById("chatSearch");

    const $messages  = document.getElementById("messages");
    const $input     = document.getElementById("chatInput");
    const $send      = document.getElementById("btnSend");

    const $pfName  = document.getElementById("pfName");
    const $pfEmail = document.getElementById("pfEmail");
    const $pfPlan  = document.getElementById("pfPlan");
    const $btnProfile = document.getElementById("btnProfile");
    const $btnUpgrade = document.getElementById("btnUpgrade");

    const $activeChatTitle = document.getElementById("activeChatTitle");

    const uid = (localStorage.getItem("sm_uid") || "").trim();
    if (!uid) {
        $messages.innerHTML = `<div class="sysMsg">Giriş yok (sm_uid). Login ol.</div>`;
        $input.disabled = true;
        $send.disabled = true;
        return;
    }

    // Drawer open/close
    const openSidebar = () => {
        $sidebar.classList.add("open");
        $backdrop.classList.add("open");
        $backdrop.setAttribute("aria-hidden", "false");
        document.documentElement.style.overflow = "hidden";
    };
    const closeSidebar = () => {
        $sidebar.classList.remove("open");
        $backdrop.classList.remove("open");
        $backdrop.setAttribute("aria-hidden", "true");
        document.documentElement.style.overflow = "";
    };

    $hamb?.addEventListener("click", openSidebar);
    $openChats?.addEventListener("click", openSidebar);
    $backdrop?.addEventListener("click", closeSidebar);
    document.addEventListener("keydown", (e)=>{ if(e.key==="Escape") closeSidebar(); });

    // Buttons routes (senin gerçek path’lerin)
    $btnProfile?.addEventListener("click", () => {
        location.href = "/u/index.html";
    });
    $btnUpgrade?.addEventListener("click", () => {
        location.href = "/upgrade/"; // ✅ sadece upgrade
    });

    // Profile UI (basit: localStorage’dan; istersen server’dan bağlarız)
    const name  = localStorage.getItem("sm_name") || "—";
    const email = localStorage.getItem("sm_email") || "—";
    const plan  = localStorage.getItem("sm_plan") || "free";
    $pfName.textContent = name;
    $pfEmail.textContent = email;
    $pfPlan.textContent = plan;

    // Session state
    const ACTIVE_KEY = `signal_active_sid_${uid}`;
    let activeSid = localStorage.getItem(ACTIVE_KEY) || "";

    let sessionsCache = [];

    const esc = (s) =>
        String(s ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");

    function setBusy(b){
        $input.disabled = b;
        $send.disabled = b;
    }

    // ChatGPT-style render
    function renderMessage(role, text){
        const block = document.createElement("div");
        block.className = "msgBlock";
        block.innerHTML = `
      <div class="msgRole">${role === "assistant" ? "AI" : "You"}</div>
      <div class="msgBubble">${esc(text)}</div>
    `;
        $messages.appendChild(block);

        const div = document.createElement("div");
        div.className = "divider";
        $messages.appendChild(div);

        $messages.scrollTop = $messages.scrollHeight;
        return block;
    }

    function setSystem(text){
        $messages.innerHTML = `<div class="sysMsg">${esc(text)}</div>`;
    }

    function renderSessions(items){
        $chatList.innerHTML = "";
        if(!items.length){
            $chatList.innerHTML = `<div class="sysMsg">No chats yet</div>`;
            return;
        }

        for(const s of items){
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "chatItem" + (s.sid === activeSid ? " active" : "");
            btn.dataset.sid = s.sid;

            const title = s.title || "New chat";
            const when  = s.created_at ? new Date(s.created_at).toLocaleString() : "";

            btn.innerHTML = `
        <div class="chatTitle">${esc(title)}</div>
        <div class="chatMeta">${esc(when)}</div>
      `;

            btn.addEventListener("click", async () => {
                activeSid = s.sid;
                localStorage.setItem(ACTIVE_KEY, activeSid);
                $activeChatTitle.textContent = title;

                document.querySelectorAll(".chatItem").forEach(x => x.classList.remove("active"));
                btn.classList.add("active");

                closeSidebar();
                await loadMessages();
            });

            $chatList.appendChild(btn);
        }
    }

    async function loadSessions(){
        const r = await fetch(FN_LIST, { headers: { "x-user-id": uid }, cache:"no-store" });
        const t = await r.text();
        let data = {};
        try{ data = JSON.parse(t); }catch{}

        if(!r.ok){
            console.error("❌ ai_list_sessions", r.status, t);
            $chatList.innerHTML = `<div class="sysMsg">Sessions load failed</div>`;
            return [];
        }

        sessionsCache = data.sessions || [];

        if(!activeSid && sessionsCache[0]?.sid){
            activeSid = sessionsCache[0].sid;
            localStorage.setItem(ACTIVE_KEY, activeSid);
        }

        const $emptyHero = document.getElementById("emptyHero");
        function hideEmptyHero(){
            if ($emptyHero) $emptyHero.remove();
        }


        // set title
        const active = sessionsCache.find(x => x.sid === activeSid);
        $activeChatTitle.textContent = active?.title || "New chat";

        renderSessions(sessionsCache);
        return sessionsCache;
    }

    async function createSession(){
        const r = await fetch(FN_CREATE, {
            method:"POST",
            headers:{
                "Content-Type":"application/json",
                "x-user-id": uid
            },
            body: JSON.stringify({ title: "New chat" })
        });

        const t = await r.text();
        let data = {};
        try{ data = JSON.parse(t); }catch{}

        if(!r.ok){
            console.error("❌ ai_create_session", r.status, t);
            return null;
        }

        activeSid = data.session?.sid;
        localStorage.setItem(ACTIVE_KEY, activeSid);

        await loadSessions();
        await loadMessages();
        return data.session;
    }

    async function loadMessages(){
        if(!activeSid){
            setSystem("Chat seç veya New chat");
            return;
        }

        setSystem("Loading…");

        const url = `${FN_GET}?session_id=${encodeURIComponent(activeSid)}`;
        const r = await fetch(url, { headers: { "x-user-id": uid }, cache:"no-store" });
        const t = await r.text();

        let data = {};
        try{ data = JSON.parse(t); }catch{}

        if(!r.ok){
            console.error("❌ ai_get_messages", r.status, t);
            setSystem(`Messages load failed (${r.status})`);
            return;
        }

        const msgs = data.messages || [];
        $messages.innerHTML = "";

        if(!msgs.length){
            setSystem("Henüz mesaj yok. Bir şey yaz 👇");
            return;
        }

        for(const m of msgs){
            renderMessage(m.role === "assistant" ? "assistant" : "user", m.content || "");
        }

        // divider zaten renderMessage içinde var, en sonda da scroll
        $messages.scrollTop = $messages.scrollHeight;
    }

    // auto textarea grow
    function autoGrow(){
        $input.style.height = "auto";
        $input.style.height = Math.min($input.scrollHeight, 160) + "px";
    }
    $input.addEventListener("input", autoGrow);

    async function sendMessage(){
        const text = ($input.value || "").trim();
        if(!text) return;

        if(!activeSid){
            await createSession();
            if(!activeSid) return;
        }

        $input.value = "";
        autoGrow();

        renderMessage("user", text);

        // typing block
        const typing = renderMessage("assistant", "…");
        setBusy(true);

        const r = await fetch(FN_SEND, {
            method:"POST",
            headers:{
                "Content-Type":"application/json",
                "x-user-id": uid
            },
            body: JSON.stringify({ session_id: activeSid, text })
        });

        const t = await r.text();
        let data = {};
        try{ data = JSON.parse(t); }catch{}

        if(!r.ok){
            console.error("❌ ai_send_message", r.status, t);
            typing.querySelector(".msgBubble").textContent = `Hata: ${data?.error || "send failed"}`;
            setBusy(false);
            return;
        }

        typing.querySelector(".msgBubble").textContent = data.reply || "(no reply)";
        setBusy(false);

        // refresh sessions to show updated order/title if you do that server-side
        await loadSessions();
    }

    $btnNew.addEventListener("click", async ()=> {
        await createSession();
        closeSidebar();
    });

    $send.addEventListener("click", sendMessage);

    $input.addEventListener("keydown", (e) => {
        if(e.key === "Enter" && !e.shiftKey){
            e.preventDefault();
            sendMessage();
        }
    });

    // search filter UI only
    $search.addEventListener("input", () => {
        const q = ($search.value || "").toLowerCase().trim();
        const filtered = !q ? sessionsCache : sessionsCache.filter(s =>
            String(s.title || "").toLowerCase().includes(q)
        );
        renderSessions(filtered);
    });

    // init
    (async () => {
        await loadSessions();
        await loadMessages();
    })();
})();
