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

    const myUid = getAppwriteUID() || "";
    const seenIds = new Set();

    function setHint(t) {
        if (!hintEl) return;
        hintEl.textContent = t || "";
    }

    function authHeaders(extra = {}) {
        const jwt = getJWT() || "";
        return {
            ...extra,
            ...(jwt ? { "X-Appwrite-JWT": jwt, "x-jwt": jwt, Authorization: `Bearer ${jwt}` } : {}),
        };
    }

    async function safeJson(res) {
        const ct = (res.headers.get("content-type") || "").toLowerCase();
        if (!ct.includes("application/json")) {
            const txt = await res.text().catch(() => "");
            throw new Error(`Non-JSON response (${res.status}). ${txt.slice(0, 120)}`);
        }
        return res.json();
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

        // 1) conversation_id varsa onu kullan
        let conversation_id = (params.get("conversation_id") || "").trim();
        if (conversation_id) return conversation_id;

        // 2) yoksa ?to=OTHER_ID ile conversation oluştur
        const to = (params.get("to") || "").trim();
        if (!to) return "";

        setHint("Opening chat...");

        const res = await fetch(`/.netlify/functions/ensure_conversation?to=${encodeURIComponent(to)}`, {
            headers: authHeaders(),
        });

        if (!res.ok) {
            const txt = await res.text().catch(() => "");
            throw new Error(`ensure_conversation ${res.status}: ${txt.slice(0, 120)}`);
        }

        const data = await safeJson(res);
        if (!data?.ok || !data?.conversation_id) {
            throw new Error(data?.error || "ensure_conversation failed");
        }

        conversation_id = String(data.conversation_id);

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

        if (!res.ok) {
            const txt = await res.text().catch(() => "");
            throw new Error(`get_messages ${res.status}: ${txt.slice(0, 120)}`);
        }

        const data = await safeJson(res);
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
                }
            )
            .subscribe();
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

        if (!res.ok) {
            const txt = await res.text().catch(() => "");
            throw new Error(`send_message ${res.status}: ${txt.slice(0, 120)}`);
        }

        const data = await safeJson(res);
        if (!data?.ok) throw new Error(data?.error || "Send failed");

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

            try {
                await sendMessage(conversation_id, text);
            } catch (err) {
                console.error(err);
                setHint("Error: " + err.message);
                alert(err.message);
            }
        });

        setHint("");
    })().catch((err) => {
        console.error(err);
        setHint("Error: " + err.message);
        alert("Messages init error: " + err.message);
    });
})();
