// messages/messages.js
(() => {
    // ✅ Supabase realtime için ANON key gerekir (client tarafı)
    // Bunları window içine koy:
    // window.SUPABASE_URL = "https://xxxx.supabase.co"
    // window.SUPABASE_ANON_KEY = "ey...."
    const SUPABASE_URL = window.SUPABASE_URL;
    const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

    const listEl = document.getElementById("msgList");
    const inputEl = document.getElementById("msgInput");
    const sendEl = document.getElementById("msgSend");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.error("Missing window.SUPABASE_URL / window.SUPABASE_ANON_KEY");
        return;
    }
    if (!listEl || !inputEl || !sendEl) {
        console.error("Missing #msgList / #msgInput / #msgSend in HTML");
        return;
    }

    // URL param
    const params = new URLSearchParams(location.search);
    const conversation_id = (params.get("conversation_id") || "").trim();
    if (!conversation_id) {
        console.error("Missing ?conversation_id=...");
        return;
    }

    // Supabase client
    const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // duplicate engelle
    const seenIds = new Set();

    // my uid (Appwrite)
    let myUid = "";

    function getJwt() {
        // senin projede JWT nerede tutuluyorsa burayı ona göre değiştir
        return localStorage.getItem("appwrite_jwt") || "";
    }

    function authHeaders(extra = {}) {
        const jwt = getJwt();
        const h = { ...extra };
        if (jwt) h["X-Appwrite-JWT"] = jwt; // senin netlify functions bunu okuyor
        return h;
    }

    async function loadMe() {
        // Daha önce yazdığımız _auth_user.js varsa bunu kullanıyoruz
        const res = await fetch("/.netlify/functions/_auth_user", {
            method: "GET",
            headers: authHeaders()
        });
        const data = await res.json();
        if (!data?.ok) throw new Error(data?.error || "auth failed");
        // uyumlu alanlar: user.$id / uid / user_id
        myUid = data?.uid || data?.user_id || data?.user?.$id || "";
    }

    function renderMessage(m, { optimistic = false } = {}) {
        const row = document.createElement("div");
        row.className = "msgRow" + (optimistic ? " optimistic" : "");
        row.dataset.id = m.id || "";

        const mine = (m.sender_id && myUid) ? (String(m.sender_id) === String(myUid)) : false;

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

    async function loadHistory() {
        const res = await fetch(
            `/.netlify/functions/get_messages?conversation_id=${encodeURIComponent(conversation_id)}&limit=200`,
            { headers: authHeaders() }
        );
        const data = await res.json();
        if (!data?.ok) throw new Error(data?.error || "get_messages failed");

        (data.messages || []).forEach(m => {
            const id = String(m.id || "");
            if (!id || seenIds.has(id)) return;
            seenIds.add(id);
            renderMessage(m);
        });
    }

    function subscribeRealtime() {
        // ✅ asıl “anlık” burada
        sb.channel("msg-" + conversation_id)
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
            .subscribe((status) => {
                console.log("Realtime status:", status);
            });
    }

    async function sendMessage(text) {
        // optimistic UI (tıklar tıklamaz ekranda görünsün)
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

        // gerçek mesaj realtime ile zaten gelecek, ama duplicate olmaması için seen'e ekleyelim:
        if (data?.message?.id) seenIds.add(String(data.message.id));
    }

    // UI events
    sendEl.addEventListener("click", async () => {
        const text = String(inputEl.value || "").trim();
        if (!text) return;
        inputEl.value = "";
        await sendMessage(text);
    });

    inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendEl.click();
        }
    });

    // init
    (async () => {
        await loadMe();
        await loadHistory();
        subscribeRealtime();
    })().catch((err) => {
        console.error(err);
        alert("Messages init error: " + err.message);
    });
})();
