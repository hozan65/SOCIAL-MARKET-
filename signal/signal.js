// /signal/signal.js (FULL) - works with your HTML
(() => {
    console.log("✅ signal.js loaded");

    const FN_GET = "/.netlify/functions/ai_get_messages";
    const FN_SEND = "/.netlify/functions/ai_send_message";

    const $messages = document.getElementById("messages");
    const $input = document.getElementById("chatInput");
    const $send = document.getElementById("btnSend");

    const $pfName = document.getElementById("pfName");
    const $pfEmail = document.getElementById("pfEmail");
    const $pfPlan = document.getElementById("pfPlan");
    const $btnProfile = document.getElementById("btnProfile");
    const $btnUpgrade = document.getElementById("btnUpgrade");

    if (!$messages || !$input || !$send) {
        console.warn("❌ Missing required elements: #messages #chatInput #btnSend");
        return;
    }

    const uid = (localStorage.getItem("sm_uid") || "").trim();
    if (!uid) {
        $messages.innerHTML = `<div class="sysMsg">Giriş bulunamadı (sm_uid yok). Lütfen giriş yap.</div>`;
        $input.disabled = true;
        $send.disabled = true;
        return;
    }

    // optional profile bits (if you store them)
    const fullName = localStorage.getItem("sm_name") || "—";
    const email = localStorage.getItem("sm_email") || "—";
    const plan = localStorage.getItem("sm_plan") || localStorage.getItem("plan") || "free";
    if ($pfName) $pfName.textContent = fullName;
    if ($pfEmail) $pfEmail.textContent = email;
    if ($pfPlan) $pfPlan.textContent = plan;

    if ($btnProfile) $btnProfile.onclick = () => (location.href = "/u/index.html");
    if ($btnUpgrade) $btnUpgrade.onclick = () => (location.href = "/u/index.html#upgrade");

    const SESSION_KEY = `signal_session_${uid}`;
    let sessionId = localStorage.getItem(SESSION_KEY);
    if (!sessionId) {
        sessionId = `sig_${uid}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        localStorage.setItem(SESSION_KEY, sessionId);
    }

    const esc = (s) =>
        String(s ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");

    function addMsg(role, text) {
        const row = document.createElement("div");
        row.className = `msgRow ${role}`;

        row.innerHTML = `
      <div class="msgBubble">${esc(text)}</div>
    `;
        $messages.appendChild(row);
        $messages.scrollTop = $messages.scrollHeight;
        return row;
    }

    function setBusy(isBusy) {
        $input.disabled = isBusy;
        $send.disabled = isBusy;
    }

    async function loadMessages() {
        $messages.innerHTML = `<div class="sysMsg">Loading…</div>`;
        try {
            const url = `${FN_GET}?session_id=${encodeURIComponent(sessionId)}`;
            const r = await fetch(url, {
                method: "GET",
                headers: { "x-user-id": uid },
                cache: "no-store",
            });

            const t = await r.text();
            let data = {};
            try { data = JSON.parse(t); } catch {}

            if (!r.ok) {
                console.error("❌ loadMessages", r.status, data || t);
                $messages.innerHTML = `<div class="sysMsg">Mesajlar yüklenemedi (${r.status}).</div>`;
                return;
            }

            const msgs = data.messages || [];
            $messages.innerHTML = "";
            if (msgs.length === 0) {
                $messages.innerHTML = `<div class="sysMsg">Henüz mesaj yok. Bir şey yaz 👇</div>`;
                return;
            }

            for (const m of msgs) {
                addMsg(m.role === "assistant" ? "assistant" : "user", m.content || "");
            }
        } catch (e) {
            console.error(e);
            $messages.innerHTML = `<div class="sysMsg">Hata: ${esc(e.message)}</div>`;
        }
    }

    async function sendMessage() {
        const text = $input.value.trim();
        if (!text) return;

        $input.value = "";
        addMsg("user", text);

        const typingRow = addMsg("assistant", "…");
        setBusy(true);

        try {
            const r = await fetch(FN_SEND, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-user-id": uid,
                },
                body: JSON.stringify({ session_id: sessionId, text }),
            });

            const t = await r.text();
            let data = {};
            try { data = JSON.parse(t); } catch {}

            if (!r.ok) {
                console.error("❌ sendMessage", r.status, data || t);
                typingRow.querySelector(".msgBubble").textContent = `Hata: ${data?.error || "send failed"}`;
                return;
            }

            typingRow.querySelector(".msgBubble").textContent = data.reply || "(no reply)";
        } finally {
            setBusy(false);
            $input.focus();
        }
    }

    // events
    $send.addEventListener("click", sendMessage);
    $input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // initial
    loadMessages();

    // payment success hint (optional)
    const pay = new URLSearchParams(location.search).get("pay");
    if (pay === "success") {
        console.log("✅ payment success on signal");
        history.replaceState({}, "", location.pathname);
    }
})();
