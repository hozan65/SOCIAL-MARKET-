// /messages/messages.js
(() => {
    console.log("messages.js LOADED ✅");

    // -----------------------------
    // DOM
    // -----------------------------
    const msgList = document.getElementById("msgList");
    const msgForm = document.getElementById("msgForm");
    const msgInput = document.getElementById("msgInput");

    // -----------------------------
    // STATE
    // -----------------------------
    const params = new URL(location.href).searchParams;
    const state = {
        me: localStorage.getItem("sm_uid"),
        conversation_id: params.get("conversation_id") || "",
    };

    // -----------------------------
    // HELPERS
    // -----------------------------
    function esc(s) {
        return String(s || "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function renderMessage(m) {
        const mine = m.from_id === state.me;
        const cls = mine ? "mMine" : "mTheirs";
        const time = m.created_at
            ? new Date(m.created_at).toLocaleTimeString()
            : "";

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

    // -----------------------------
    // SOCKET – REALTIME (SERVER dm_new)
    // -----------------------------
    const socket = window.rt?.socket;
    if (socket) {
        socket.on("dm_new", (m) => {
            console.log("📩 dm_new received:", m);

            // sadece açık conversation ise ekrana bas
            if (m.conversation_id === state.conversation_id) {
                appendMessage(m);
            }
        });
    } else {
        console.warn("⚠️ socket not ready in messages.js");
    }

    // -----------------------------
    // SEND MESSAGE (JWT İLE)
    // -----------------------------
    msgForm?.addEventListener("submit", async (e) => {
        e.preventDefault();

        const text = msgInput.value.trim();
        if (!text) return;

        msgInput.value = "";

        // optimistic UI (anında göster)
        appendMessage({
            from_id: state.me,
            text,
            created_at: new Date().toISOString(),
        });

        const jwt = localStorage.getItem("sm_jwt");
        if (!jwt) {
            alert("JWT missing. Please refresh page.");
            return;
        }

        try {
            const r = await fetch("/.netlify/functions/dm_send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + jwt, // 🔥 HATANIN ASIL ÇÖZÜMÜ
                },
                body: JSON.stringify({
                    conversation_id: state.conversation_id,
                    text,
                }),
            });

            const d = await r.json();
            if (!r.ok) throw new Error(d.error || "send failed");

            // NOT:
            // Mesaj tekrar basılmıyor çünkü
            // server zaten socket ile dm_new gönderecek
        } catch (err) {
            console.error("❌ dm_send error:", err);
            alert("Mesaj gönderilemedi");
        }
    });
})();
