// /messages/messages.js
(() => {
    console.log("messages.js LOADED ✅");

    const msgList = document.getElementById("msgList");
    const msgForm = document.getElementById("msgForm");
    const msgInput = document.getElementById("msgInput");

    const sp = new URL(location.href).searchParams;

    const state = {
        me: localStorage.getItem("sm_uid") || "",
        conversation_id: sp.get("conversation_id") || "",
        // ✅ sen bazen ?to= kullanıyorsun, bazen ?to_id=
        peer_id: sp.get("to_id") || sp.get("to") || "",
    };

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
        const time = m.created_at ? new Date(m.created_at).toLocaleTimeString() : "";
        return `
      <div class="mRow ${cls}">
        <div class="mBubble">
          <div class="mText">${esc(m.text)}</div>
          <div class="mTime">${esc(time)}</div>
        </div>
      </div>
    `;
    }

    function appendMessage(m) {
        msgList.insertAdjacentHTML("beforeend", renderMessage(m));
        msgList.scrollTop = msgList.scrollHeight;
    }

    // ✅ SOCKET: server emit adı dm_new
    const socket = window.rt?.socket;
    if (socket) {
        socket.on("dm_new", (m) => {
            console.log("📩 dm_new received:", m);

            // conversation_id yoksa ilk mesajla birlikte state’e oturtacağız
            const cid = m.conversation_id || "";
            if (!state.conversation_id && cid) {
                state.conversation_id = cid;

                // URL'ye yaz (refresh olmadan)
                const u = new URL(location.href);
                u.searchParams.set("conversation_id", cid);
                if (state.peer_id) u.searchParams.set("to", state.peer_id);
                history.replaceState(null, "", u.toString());
            }

            // sadece aktif conversation ise bas
            if (!state.conversation_id || m.conversation_id === state.conversation_id) {
                appendMessage(m);
            }
        });
    } else {
        console.warn("⚠️ socket not ready in messages.js");
    }

    msgForm?.addEventListener("submit", async (e) => {
        e.preventDefault();

        const text = msgInput.value.trim();
        if (!text) return;

        msgInput.value = "";

        // optimistic
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

        // ✅ payload: conversation_id varsa onu, yoksa peer_id gönder
        const payload = { text };

        if (state.conversation_id) payload.conversation_id = state.conversation_id;
        else if (state.peer_id) payload.peer_id = state.peer_id;
        else {
            alert("Missing conversation_id and peer_id. Open chat with ?to=<USER_ID> or ?conversation_id=<ID>");
            return;
        }

        try {
            const r = await fetch("/.netlify/functions/dm_send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + jwt,
                },
                body: JSON.stringify(payload),
            });

            const d = await r.json();
            if (!r.ok) throw new Error(d.error || "send failed");

            // ✅ yeni conversation oluştuysa state ve URL güncelle
            if (!state.conversation_id && d.conversation_id) {
                state.conversation_id = d.conversation_id;

                const u = new URL(location.href);
                u.searchParams.set("conversation_id", d.conversation_id);
                if (state.peer_id) u.searchParams.set("to", state.peer_id);
                history.replaceState(null, "", u.toString());
            }

            // server zaten dm_new ile push edecek (aynı mesajı ikinci kez basmıyoruz)
        } catch (err) {
            console.error("❌ dm_send error:", err);
            alert(String(err?.message || "Mesaj gönderilemedi"));
        }
    });
})();
