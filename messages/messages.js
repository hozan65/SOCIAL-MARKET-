// /messages/messages.js
(() => {
    console.log("messages.js LOADED ✅");

    const msgList = document.getElementById("msgList");
    const msgForm = document.getElementById("msgForm");
    const msgInput = document.getElementById("msgInput");

    const state = {
        me: localStorage.getItem("sm_uid"),
        conversation_id: new URL(location.href).searchParams.get("conversation_id") || "",
    };

    function esc(s) {
        return String(s || "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;");
    }

    function renderMessage(m) {
        const mine = m.from_id === state.me;
        const cls = mine ? "mMine" : "mTheirs";
        const time = m.created_at ? new Date(m.created_at).toLocaleTimeString() : "";
        return `
      <div class="mRow ${cls}">
        <div class="mBubble">
          <div class="mText">${esc(m.text)}</div>
          <div class="mTime">${time}</div>
        </div>
      </div>
    `;
    }

    function appendMessage(m) {
        msgList.insertAdjacentHTML("beforeend", renderMessage(m));
        msgList.scrollTop = msgList.scrollHeight;
    }

    // 🔥 SOCKET – SERVER `dm_new` EMIT EDİYOR
    const socket = window.rt?.socket;
    if (socket) {
        socket.on("dm_new", (m) => {
            console.log("📩 dm_new received:", m);

            // sadece açık conversation ise bas
            if (m.conversation_id === state.conversation_id) {
                appendMessage(m);
            }
        });
    } else {
        console.warn("⚠️ socket not ready in messages.js");
    }

    // FORM SUBMIT (mesaj gönder)
    msgForm?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const text = msgInput.value.trim();
        if (!text) return;

        msgInput.value = "";

        const payload = {
            conversation_id: state.conversation_id,
            text,
        };

        // optimistic UI
        appendMessage({
            from_id: state.me,
            text,
            created_at: new Date().toISOString(),
        });

        try {
            const r = await fetch("/.netlify/functions/dm_send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const d = await r.json();
            if (!r.ok) throw new Error(d.error || "send failed");

            // server zaten socket ile dm_new gönderecek
        } catch (err) {
            console.error(err);
            alert("Mesaj gönderilemedi");
        }
    });
})();
