import { supabase, getJWT, getAppwriteUID } from "/services/supabase.js";

(() => {
    const listEl = document.getElementById("msgList");
    const inputEl = document.getElementById("msgInput");
    const formEl = document.getElementById("msgForm");
    const hintEl = document.getElementById("msgHint");

    if (!listEl || !inputEl || !formEl) {
        console.error("Missing #msgList / #msgInput / #msgForm in HTML");
        return;
    }

    const myUid = getAppwriteUID() || ""; // sm_uid
    const seenIds = new Set();

    function setHint(t) {
        if (!hintEl) return;
        hintEl.textContent = t || "";
    }

    function authHeaders(extra = {}) {
        const jwt = getJWT() || "";
        return {
            ...extra,
            ...(jwt ? { "X-Appwrite-JWT": jwt, "x-jwt": jwt, "Authorization": `Bearer ${jwt}` } : {})
        };
    }


    function renderMessage(m, { optimistic = false } = {}) {
        const row = document.createElement("div");
        row.className = "msgRow" + (optimistic ? " optimistic" : "");
        row.dataset.id = m.id || "";

        const mine = myUid && String(m.sender_id) === String(myUid);

        row.innerHTML = `
      <div class="msgBubble ${mine ? "mine" : "theirs"}">
        <div class="msgText"></div>
        <div class="msgMeta">${new Date(m.created_at || Date.now()).toLocaleString()}</div>
      </div>
    `;
        row.querySelector(".msgText").textContent = m.body || "";

        listEl.appendChild(row);
        listEl.scrollTop = listEl.scrollHeight;
    }

    async function ensureConversationId() {
        const params = new URLSearchParams(location.search);

        // 1) önce direkt conversation_id varsa onu kullan
        let conversation_id = (params.get("conversation_id") || "").trim();
        if (conversation_id) return conversation_id;

        // 2) yoksa ?to=OTHER_ID varsa ensure_conversation çağır
        const to = (params.get("to") || "").trim();
        if (!to) return "";

        setHint("Opening chat...");

        const res = await fetch(
            `/.netlify/functions/ensure_conversation?to=${encodeURIComponent(to)}`,
            { headers: authHeaders() }
        );
        const data = await res.json();
        if (!data?.ok || !data?.conversation_id) {
            throw new Error(data?.error || "ensure_conversation failed");
        }

        conversation_id = String(data.conversation_id);

        // URL'yi temiz şekilde güncelle (reload yok)
        params.set("conversation_id", conversation_id);
        params.delete("to");
        history.replaceState(null, "", `${location.pathname}?${params.toString()}`);

        return conversation_id;
    }

    async function loadHistory(conversation_id) {
        setHint("");
        const res = await fetch(
            `/.netlify/functions/get_messages?conversation_id=${encodeURIComponent(conversation_id)}&limit=200`,
            { headers: authHeaders() }
        );
        const data = await res.json();
        if (!data?.ok) throw new Error(data?.error || "get_messages failed");

        (data.messages || data.list || []).forEach((m) => {
            const id = String(m.id || "");
            if (!id || seenIds.has(id)) return;
            seenIds.add(id);
            renderMessage(m);
        });
    }

    function subscribeRealtime(conversation_id) {
        supabase
            .channel("msg-" + conversation_id)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "messages",
                    filter: `conversation_id=eq.${conversation_id}`,
                },
                (payload) => {
                    const m = payload?.new;
                    if (!m?.id) return;

                    const id = String(m.id);
                    if (seenIds.has(id)) return;

                    seenIds.add(id);
                    renderMessage(m);
                    console.log("✅ ANLIK MESAJ GELDİ", m);
                }
            )
            .subscribe((status) => console.log("Realtime:", status));
    }

    async function sendMessage(conversation_id, text) {
        // optimistic UI
        renderMessage(
            {
                id: "temp-" + Date.now(),
                conversation_id,
                sender_id: myUid,
                body: text,
                created_at: new Date().toISOString(),
            },
            { optimistic: true }
        );

        const res = await fetch("/.netlify/functions/send_message", {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ conversation_id, body: text }),
        });

        const data = await res.json();
        if (!data?.ok) {
            alert("Send failed: " + (data?.error || "unknown"));
            return;
        }

        if (data?.message?.id) seenIds.add(String(data.message.id));
    }

    (async () => {
        const conversation_id = await ensureConversationId();
        if (!conversation_id) {
            setHint("Select a chat");
            return;
        }

        await loadHistory(conversation_id);
        subscribeRealtime(conversation_id);

        formEl.addEventListener("submit", async (e) => {
            e.preventDefault();
            const text = String(inputEl.value || "").trim();
            if (!text) return;
            inputEl.value = "";
            await sendMessage(conversation_id, text);
        });

        setHint("");
    })().catch((err) => {
        console.error(err);
        setHint("Error: " + err.message);
        alert("Messages init error: " + err.message);
    });
})();
