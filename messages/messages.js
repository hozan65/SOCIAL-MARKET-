// /messages/messages.js
(() => {
    console.log("messages.js LOADED ✅", location.href);

    // ---------- Helpers ----------
    const qs = (s, el = document) => el.querySelector(s);
    const qsa = (s, el = document) => Array.from(el.querySelectorAll(s));

    function getConversationId() {
        const u = new URL(location.href);
        return u.searchParams.get("conversation_id") || "";
    }

    function escapeHtml(str) {
        return String(str || "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    // ---------- Appwrite JWT Refresh ----------
    async function ensureJWT() {
        // Senin projede account objesi nerede ise buraya düşür.
        const account =
            window.account ||
            window.appwrite?.account ||
            window.appwriteAccount ||
            null;

        if (!account?.createJWT) {
            // createJWT yoksa burası patlar. En azından net hata verelim.
            throw new Error("Appwrite account client not found (createJWT missing).");
        }

        const jwtObj = await account.createJWT(); // { jwt: "..." }
        const jwt = jwtObj?.jwt;

        if (!jwt) throw new Error("JWT not returned from Appwrite.");

        localStorage.setItem("sm_jwt", jwt);
        return jwt;
    }

    function getJWT() {
        return localStorage.getItem("sm_jwt") || "";
    }

    // ---------- Netlify Functions API ----------
    async function apiFetch(path, opts = {}) {
        const url = `/.netlify/functions/${path.replace(/^\/+/, "")}`;

        let jwt = getJWT();

        const doReq = async () => {
            const headers = new Headers(opts.headers || {});
            if (jwt) headers.set("Authorization", `Bearer ${jwt}`);
            headers.set("Accept", "application/json");

            return fetch(url, {
                ...opts,
                headers
            });
        };

        let r = await doReq();

        // 401 => JWT refresh + 1 retry
        if (r.status === 401) {
            try {
                jwt = await ensureJWT();
                r = await doReq();
            } catch (e) {
                // refresh de olmadıysa
                throw new Error("Invalid JWT");
            }
        }

        if (!r.ok) {
            const txt = await r.text().catch(() => "");
            throw new Error(`HTTP ${r.status} ${txt}`.trim());
        }

        return r.json();
    }

    async function authUser() {
        // Bu function sende var: /.netlify/functions/_auth_user
        const data = await apiFetch("_auth_user", { method: "GET" });

        // Senin _auth_user şu alanları döndürüyordu: user, uid, user_id
        const uid = data?.uid || data?.user_id || data?.user?.$id || data?.user?.id || "";
        const name = data?.user?.name || data?.user?.email || "";

        if (!uid) throw new Error("Missing user id from _auth_user");

        // global set (realtime.js join otomatik çalışsın diye)
        window.APPWRITE_USER_ID = uid;
        window.user_id = uid;
        localStorage.setItem("sm_uid", uid);

        return { uid, name, raw: data };
    }

    // ---------- UI Wiring ----------
    const convoId = getConversationId();

    // Senin HTML yapın değişik olabilir, ama minimum:
    // - messages container: #dmList veya .dmList
    // - input: #dmInput
    // - send button: #dmSend
    const listEl =
        qs("#dmList") ||
        qs(".dmList") ||
        qs("#messagesList") ||
        qs(".messagesList");

    const inputEl =
        qs("#dmInput") ||
        qs("input[name='message']") ||
        qs("textarea[name='message']") ||
        qs("#messageInput");

    const sendBtn =
        qs("#dmSend") ||
        qs("button[data-send]") ||
        qs("#sendBtn");

    function renderMessageRow(m, selfId) {
        const mine = m.from_id === selfId;
        const cls = mine ? "dmRow dmMine" : "dmRow dmTheirs";

        const t = m.created_at ? new Date(m.created_at).toLocaleString() : "";
        return `
      <div class="${cls}" data-mid="${escapeHtml(m.id)}">
        <div class="dmBubble">
          <div class="dmText">${escapeHtml(m.text)}</div>
          <div class="dmMeta">${escapeHtml(t)}</div>
        </div>
      </div>
    `;
    }

    function addMessageToUI(m, selfId) {
        if (!listEl) return;
        listEl.insertAdjacentHTML("beforeend", renderMessageRow(m, selfId));
        // scroll bottom
        listEl.scrollTop = listEl.scrollHeight;
    }

    // Dedupe: aynı client_id veya id ile iki kez basmasın
    const seen = new Set();
    function seenKey(m) {
        return m.client_id ? `c:${m.client_id}` : `id:${m.id}`;
    }

    // ---------- Socket Realtime ----------
    function bindRealtime(selfId) {
        const socket = window.rt?.socket;

        if (!socket) {
            console.warn("⚠️ realtime socket not ready (window.rt.socket missing)");
            return;
        }

        // listener her zaman bir kere bağlansın
        if (window.__dm_listener_bound) return;
        window.__dm_listener_bound = true;

        socket.on("dm:new", (msg) => {
            try {
                if (!msg) return;

                // sadece bu conversation’a ait mi? (sende msg.conversation_id varsa kontrol et)
                // yoksa yine basıyoruz, çünkü sende event formatı farklı olabilir.
                if (msg.conversation_id && convoId && msg.conversation_id !== convoId) return;

                const key = seenKey(msg);
                if (seen.has(key)) return;
                seen.add(key);

                addMessageToUI(msg, selfId);
            } catch (e) {
                console.error("dm:new handler error", e);
            }
        });

        // connect olduysa join at
        socket.emit("join", { user_id: selfId });
    }

    // ---------- Send DM ----------
    function sendDm(selfId, toId, text) {
        const socket = window.rt?.socket;
        if (!socket) throw new Error("Socket not connected");

        const client_id = (crypto?.randomUUID?.() || String(Date.now()));
        const payload = {
            from_id: selfId,
            to_id: toId,
            text,
            client_id,
            conversation_id: convoId || undefined
        };

        // UI optimistic
        const optimistic = {
            ...payload,
            id: `tmp-${client_id}`,
            created_at: new Date().toISOString()
        };

        const k = seenKey(optimistic);
        if (!seen.has(k)) {
            seen.add(k);
            addMessageToUI(optimistic, selfId);
        }

        socket.emit("dm:send", payload, (ack) => {
            if (!ack?.ok) {
                console.error("❌ dm:send failed", ack);
                // istersen UI’da hata yazdır
            } else {
                // ack.row varsa gerçek id/created_at gelir, ister replace yaparsın
                // şimdilik seen set ile duplicate engelliyoruz
            }
        });
    }

    // ---------- INIT ----------
    async function init() {
        try {
            // 1) JWT’yi garanti altına al
            await ensureJWT();

            // 2) user doğrula
            const me = await authUser();

            // 3) realtime bind
            bindRealtime(me.uid);

            // 4) send UI
            if (sendBtn && inputEl) {
                const toId =
                    new URL(location.href).searchParams.get("to_id") ||
                    new URL(location.href).searchParams.get("user_id") ||
                    ""; // sende alıcı id paramı farklı olabilir

                sendBtn.addEventListener("click", () => {
                    const text = String(inputEl.value || "").trim();
                    if (!text) return;
                    if (!toId) {
                        console.error("❌ missing to_id in url (add ?to_id=...)");
                        return;
                    }
                    inputEl.value = "";
                    sendDm(me.uid, toId, text);
                });

                // Enter ile gönder
                inputEl.addEventListener("keydown", (e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendBtn.click();
                    }
                });
            }

            console.log("✅ messages init ok", { uid: me.uid, convoId });
        } catch (e) {
            console.error(e);
            console.error("init @ messages.js failed:", String(e?.message || e));
        }
    }

    init();
})();
