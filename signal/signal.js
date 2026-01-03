// /signal/signal.js (FULL - plan badge FIX + keep your UI)
// - badge (pfPlan) now comes from get_my_plan (Supabase) so it updates after purchase
// - still caches in localStorage (sm_plan) for fast first paint

(() => {
    console.log("✅ signal.js loaded");

    const FN_LIST   = "/.netlify/functions/ai_list_sessions";
    const FN_CREATE = "/.netlify/functions/ai_create_session";
    const FN_GET    = "/.netlify/functions/ai_get_messages";
    const FN_SEND   = "/.netlify/functions/ai_send_message";

    const PROFILE_URL = "/signal/profile.html";
    const UPGRADE_URL = "/signal/upgrade.html";

    const uid = (localStorage.getItem("sm_uid") || "").trim();

    // DOM (NEW HTML IDs)
    const $messages   = document.getElementById("messages");
    const $input      = document.getElementById("chatInput");
    const $send       = document.getElementById("btnSend");

    const $chatList   = document.getElementById("chatList");
    const $btnNew     = document.getElementById("btnNewChat");
    const $search     = document.getElementById("chatSearch");

    const $title      = document.getElementById("sigTitle");

    const $left       = document.getElementById("sigLeft");
    const $backdrop   = document.getElementById("sigBackdrop");
    const $btnOpen    = document.getElementById("btnChatDrawer");

    const $pfPlan     = document.getElementById("pfPlan");
    const $btnProfile = document.getElementById("btnProfile");
    const $btnUpgrade = document.getElementById("btnUpgrade");

    if (!uid) {
        if ($messages) {
            $messages.innerHTML = `
        <div class="hero">
          <div class="heroInner">
            <div class="heroTitle">Login required</div>
            <div class="heroSub">sm_uid bulunamadı</div>
          </div>
        </div>
      `;
        }
        if ($input) $input.disabled = true;
        if ($send) $send.disabled = true;
        throw new Error("Missing sm_uid");
    }

    // active session sid
    const ACTIVE_KEY = `signal_active_sid_${uid}`;
    let activeSid = localStorage.getItem(ACTIVE_KEY) || "";

    // sessions cache
    let allSessions = [];

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

    function isMobile() {
        return window.matchMedia("(max-width: 1000px)").matches;
    }

    // Drawer open/close (mobile)
    function openDrawer() {
        if (!$left || !$backdrop) return;
        $left.classList.add("open");
        $backdrop.classList.add("open");
        $backdrop.setAttribute("aria-hidden", "false");
        document.documentElement.style.overflow = "hidden";
    }
    function closeDrawer() {
        if (!$left || !$backdrop) return;
        $left.classList.remove("open");
        $backdrop.classList.remove("open");
        $backdrop.setAttribute("aria-hidden", "true");
        document.documentElement.style.overflow = "";
    }

    $btnOpen?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!$left) return;
        $left.classList.contains("open") ? closeDrawer() : openDrawer();
    });

    $backdrop?.addEventListener("click", closeDrawer);

    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeDrawer();
    });

    function setTitle(t) {
        if ($title) $title.textContent = t || "New chat";
    }

    function setIntro() {
        if (!$messages) return;
        $messages.innerHTML = `
      <div class="hero">
        <div class="heroInner">
          <div class="heroTitle">HEY 👋 I’m your Finance Assistant</div>
          <div class="heroSub">Ask me anything about crypto, stocks, or markets.</div>
        </div>
      </div>
    `;
    }

    // ChatGPT-like row (no bubble)
    function addMsg(role, text) {
        if (!$messages) return null;

        // intro varsa kaldır
        const hero = $messages.querySelector(".hero");
        if (hero) $messages.innerHTML = "";

        const row = document.createElement("div");
        row.className = "msg";
        row.innerHTML = `
      <div class="msgInner">
        <div class="role">${esc(role === "assistant" ? "AI" : "You")}</div>
        <div class="text">${esc(text)}</div>
      </div>
    `;
        $messages.appendChild(row);
        $messages.scrollTop = $messages.scrollHeight;
        return row;
    }

    // fetch helper
    async function apiJSON(url, opts) {
        const r = await fetch(url, {
            cache: "no-store",
            ...opts,
            headers: {
                ...(opts?.headers || {}),
                "x-user-id": uid,
            },
        });

        const t = await r.text();
        let data = {};
        try { data = JSON.parse(t); } catch { data = { raw: t }; }
        return { ok: r.ok, status: r.status, data };
    }

    function renderSessions(list) {
        if (!$chatList) return;

        $chatList.innerHTML = "";

        if (!list.length) {
            $chatList.innerHTML = `<div style="padding:12px;color:#667085;font-weight:700;">No chats yet</div>`;
            return;
        }

        for (const s of list) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "chatItem";
            btn.dataset.sid = s.sid;

            const created = s.created_at ? new Date(s.created_at).toLocaleString() : "";

            btn.innerHTML = `
        <div class="chatTitle">${esc(s.title || "New chat")}</div>
        <div class="chatMeta">${esc(created)}</div>
      `;

            if (s.sid === activeSid) btn.classList.add("active");

            btn.addEventListener("click", async () => {
                activeSid = s.sid;
                localStorage.setItem(ACTIVE_KEY, activeSid);

                $chatList.querySelectorAll(".chatItem").forEach(x => x.classList.remove("active"));
                btn.classList.add("active");

                setTitle(s.title || "New chat");

                await loadMessages();
                if (isMobile()) closeDrawer();
            });

            $chatList.appendChild(btn);
        }
    }

    function applySearchFilter() {
        const q = ($search?.value || "").trim().toLowerCase();
        if (!q) {
            renderSessions(allSessions);
            return;
        }
        const filtered = allSessions.filter(s => String(s.title || "").toLowerCase().includes(q));
        renderSessions(filtered);
    }

    $search?.addEventListener("input", applySearchFilter);

    // ✅ FIXED: plan badge now syncs with Supabase via get_my_plan
    async function loadProfileBadge() {
        // Links
        $btnProfile?.addEventListener("click", () => (location.href = PROFILE_URL));
        $btnUpgrade?.addEventListener("click", () => (location.href = UPGRADE_URL));

        // Map backend plan -> label shown near Upgrade
        // backend: free | normal | pro
        // UI label: go | plus | pro
        const labelFromPlan = (p) => {
            const plan = String(p || "").toLowerCase();
            if (plan === "pro") return "pro";
            if (plan === "normal") return "plus";
            return "go";
        };

        // fast paint from cache
        const cached = localStorage.getItem("sm_plan") || "free";
        if ($pfPlan) $pfPlan.textContent = labelFromPlan(cached);

        // real fetch
        try {
            const r = await fetch("/.netlify/functions/get_my_plan", {
                method: "GET",
                headers: { "x-user-id": uid },
                cache: "no-store",
            });

            const data = await r.json().catch(() => ({}));
            if (!r.ok) {
                console.warn("get_my_plan failed", r.status, data);
                return;
            }

            const plan = data?.plan || "free";
            localStorage.setItem("sm_plan", plan);

            if ($pfPlan) $pfPlan.textContent = labelFromPlan(plan);
        } catch (e) {
            console.warn("get_my_plan network error", e);
        }
    }

    async function loadSessions() {
        const res = await apiJSON(FN_LIST, { method: "GET" });
        if (!res.ok) {
            console.error("list sessions failed", res.status, res.data);
            allSessions = [];
            renderSessions([]);
            setTitle("New chat");
            return [];
        }

        allSessions = res.data.sessions || [];

        // ensure active
        if (!activeSid && allSessions[0]?.sid) {
            activeSid = allSessions[0].sid;
            localStorage.setItem(ACTIVE_KEY, activeSid);
        }

        // title
        const active = allSessions.find(s => s.sid === activeSid);
        setTitle(active?.title || "New chat");

        renderSessions(allSessions);
        return allSessions;
    }

    async function createSession() {
        const res = await apiJSON(FN_CREATE, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: "New chat" }),
        });

        if (!res.ok) {
            console.error("create session failed", res.status, res.data);
            return null;
        }

        activeSid = res.data.session.sid;
        localStorage.setItem(ACTIVE_KEY, activeSid);

        setTitle(res.data.session.title || "New chat");

        // refresh list and show intro (messages empty)
        await loadSessions();
        setIntro();

        if (isMobile()) closeDrawer();
        return res.data.session;
    }

    async function loadMessages() {
        if (!activeSid) {
            setIntro();
            return;
        }

        // ✅ no loading text
        const res = await apiJSON(`${FN_GET}?session_id=${encodeURIComponent(activeSid)}`, { method: "GET" });

        if (!res.ok) {
            console.error("get messages failed", res.status, res.data);
            setIntro();
            return;
        }

        const msgs = res.data.messages || [];
        if (!$messages) return;

        $messages.innerHTML = "";

        if (!msgs.length) {
            setIntro();
            return;
        }

        for (const m of msgs) {
            addMsg(m.role === "assistant" ? "assistant" : "user", m.content || "");
        }

        $messages.scrollTop = $messages.scrollHeight;
    }

    async function sendMessage() {
        const text = ($input?.value || "").trim();
        if (!text) return;

        if (!activeSid) {
            const created = await createSession();
            if (!created) return;
        }

        if ($input) $input.value = "";

        // optimistic append
        addMsg("user", text);

        // typing placeholder
        const typingRow = addMsg("assistant", "…");

        setBusy(true);

        const res = await apiJSON(FN_SEND, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: activeSid, text }),
        });

        if (!res.ok) {
            console.error("send failed", res.status, res.data);
            if (typingRow) {
                const textEl = typingRow.querySelector(".text");
                if (textEl) textEl.textContent = `Error: ${res.data?.error || "send failed"}`;
            }
            setBusy(false);
            return;
        }

        // replace "…"
        if (typingRow) {
            const textEl = typingRow.querySelector(".text");
            if (textEl) textEl.textContent = res.data.reply || "(no reply)";
        }

        setBusy(false);

        // refresh sessions if title updated server-side
        await loadSessions();
    }

    $btnNew?.addEventListener("click", createSession);
    $send?.addEventListener("click", sendMessage);

    $input?.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    (async function init() {
        await loadProfileBadge(); // ✅ plan badge updated here
        await loadSessions();
        await loadMessages();

        if (!activeSid) setIntro();
    })();
})();
