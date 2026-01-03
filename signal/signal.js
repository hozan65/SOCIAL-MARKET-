// /signal/signal.js (FULL)
(() => {
    console.log("✅ signal.js loaded");

    const FN_LIST   = "/.netlify/functions/ai_list_sessions";
    const FN_CREATE = "/.netlify/functions/ai_create_session";
    const FN_GET    = "/.netlify/functions/ai_get_messages";
    const FN_SEND   = "/.netlify/functions/ai_send_message";

    // DOM
    const $messages   = document.getElementById("messages");
    const $input      = document.getElementById("chatInput");
    const $send       = document.getElementById("btnSend");
    const $chatList   = document.getElementById("chatList");
    const $btnNew     = document.getElementById("btnNewChat");
    const $mobileNew  = document.getElementById("mobileNewChat");
    const $search     = document.getElementById("chatSearch");
    const $topTitle   = document.getElementById("chatTopTitle");

    const $btnProfile = document.getElementById("btnProfile");
    const $btnUpgrade = document.getElementById("btnUpgrade");

    const $openDrawer = document.getElementById("openDrawer");

    const uid = (localStorage.getItem("sm_uid") || "").trim();

    // ✅ routes
    const ROUTE_PROFILE = "/u/index.html";
    const ROUTE_UPGRADE = "/upgrade/"; // senin upgrade sayfan hangisiyse burayı sabitle

    // Buttons (fix)
    $btnProfile?.addEventListener("click", () => location.href = ROUTE_PROFILE);
    $btnUpgrade?.addEventListener("click", () => location.href = ROUTE_UPGRADE);

    // Mobile drawer open => sidebar.js’in hamburger’ını tetikle
    $openDrawer?.addEventListener("click", () => {
        document.getElementById("smSbMobileHamb")?.click();
    });

    function esc(s){
        return String(s ?? "")
            .replaceAll("&","&amp;")
            .replaceAll("<","&lt;")
            .replaceAll(">","&gt;")
            .replaceAll('"',"&quot;")
            .replaceAll("'","&#039;");
    }

    function setBusy(b){
        if ($input) $input.disabled = b;
        if ($send)  $send.disabled  = b;
    }

    function renderEmpty(){
        if (!$messages) return;
        $messages.innerHTML = `
      <div class="emptyState">
        <div>
          <div class="big">HEY 👋 I’m your Finance Assistant</div>
          <div class="small">Ask me anything about crypto, stocks, or markets.</div>
        </div>
      </div>
    `;
    }

    function addMsg(role, text){
        const row = document.createElement("div");
        row.className = `msgRow ${role}`;

        row.innerHTML = `
      <div class="msgInner">
        <div class="bubble">${esc(text)}</div>
      </div>
    `;

        $messages.appendChild(row);
        $messages.scrollTop = $messages.scrollHeight;
        return row;
    }

    if (!uid){
        renderEmpty();
        if ($input) $input.disabled = true;
        if ($send)  $send.disabled  = true;
        return;
    }

    // active session stored
    const ACTIVE_KEY = `signal_active_sid_${uid}`;
    let activeSid = localStorage.getItem(ACTIVE_KEY) || "";

    // cache sessions list
    let sessionsCache = [];

    function highlightActive(){
        if (!$chatList) return;
        $chatList.querySelectorAll(".chatItem").forEach(x => {
            x.classList.toggle("active", x.dataset.sid === activeSid);
        });
    }

    function renderSessions(items){
        if (!$chatList) return;
        $chatList.innerHTML = "";

        if (!items.length){
            $chatList.innerHTML = `<div style="padding:10px;color:#6b7280;font-weight:800;">No chats yet</div>`;
            return;
        }

        for (const s of items){
            const el = document.createElement("button");
            el.type = "button";
            el.className = "chatItem";
            el.dataset.sid = s.sid;

            el.innerHTML = `
        <div class="chatTitle">${esc(s.title || "New chat")}</div>
        <div class="chatMeta">${esc(new Date(s.created_at).toLocaleString())}</div>
      `;

            el.addEventListener("click", async () => {
                activeSid = s.sid;
                localStorage.setItem(ACTIVE_KEY, activeSid);
                highlightActive();
                $topTitle && ($topTitle.textContent = s.title || "Chats");
                await loadMessages();
            });

            $chatList.appendChild(el);
        }

        highlightActive();
    }

    async function loadSessions(){
        const r = await fetch(FN_LIST, {
            headers: { "x-user-id": uid },
            cache: "no-store",
        });

        const t = await r.text();
        let data = {};
        try { data = JSON.parse(t); } catch {}

        if (!r.ok){
            console.error("❌ list sessions", r.status, data || t);
            sessionsCache = [];
            renderSessions([]);
            return [];
        }

        sessionsCache = data.sessions || [];

        if (!activeSid && sessionsCache[0]?.sid){
            activeSid = sessionsCache[0].sid;
            localStorage.setItem(ACTIVE_KEY, activeSid);
        }

        // set header title
        const cur = sessionsCache.find(x => x.sid === activeSid);
        $topTitle && ($topTitle.textContent = cur?.title || "Chats");

        renderSessions(sessionsCache);
        return sessionsCache;
    }

    async function createSession(){
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

        if (!r.ok){
            console.error("❌ create session", r.status, data || t);
            return null;
        }

        activeSid = data.session.sid;
        localStorage.setItem(ACTIVE_KEY, activeSid);

        await loadSessions();
        await loadMessages();
        return data.session;
    }

    async function loadMessages(){
        if (!$messages) return;

        if (!activeSid){
            renderEmpty();
            return;
        }

        // loading
        $messages.innerHTML = `<div style="padding:14px;color:#6b7280;font-weight:800;">Loading…</div>`;

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
            $messages.innerHTML = `<div style="padding:14px;color:#6b7280;font-weight:800;">Messages load failed (${r.status})</div>`;
            return;
        }

        const msgs = data.messages || [];
        $messages.innerHTML = "";

        if (!msgs.length){
            renderEmpty();
            return;
        }

        for (const m of msgs){
            addMsg(m.role === "assistant" ? "assistant" : "user", m.content || "");
        }
    }

    async function sendMessage(){
        const text = ($input?.value || "").trim();
        if (!text) return;

        if (!activeSid){
            await createSession();
            if (!activeSid) return;
        }

        $input.value = "";
        addMsg("user", text);

        // typing placeholder
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

        if (!r.ok){
            console.error("❌ send", r.status, data || t);
            typing.querySelector(".bubble").textContent = `Hata: ${data?.error || "send failed"}`;
            setBusy(false);
            return;
        }

        typing.querySelector(".bubble").textContent = data.reply || "(no reply)";
        setBusy(false);
    }

    // search filter (left list)
    $search?.addEventListener("input", () => {
        const q = ($search.value || "").trim().toLowerCase();
        const filtered = sessionsCache.filter(s =>
            (s.title || "").toLowerCase().includes(q)
        );
        renderSessions(filtered);
    });

    // bind
    $btnNew?.addEventListener("click", createSession);
    $mobileNew?.addEventListener("click", createSession);

    $send?.addEventListener("click", sendMessage);
    $input?.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey){
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
