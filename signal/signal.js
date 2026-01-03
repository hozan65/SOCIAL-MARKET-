// /signal/signal.js  (FULL - FIXED)
// ✅ Sends: message (and still works if backend accepts text too)
// ✅ Handles: allowed:false (free limit)
// ✅ Reads: data.text (backend returns text)
// ✅ Keeps: image upload flow

(() => {
    const $ = (q) => document.querySelector(q);

    const el = {
        chatList: $(".chatList"),
        messages: $(".messages"),
        input: $(".input"),
        send: $(".btnSend"),
        newChat: $(".btnNew"),
        plus: $(".btnCircle"),
        planText: $(".pPlan"),
    };

    // ✅ user id: localStorage (later you can use Appwrite)
    const getUserId = () => localStorage.getItem("sm_uid") || "demo_user";

    // Session id
    const getSid = () => {
        let sid = localStorage.getItem("ai_sid");
        if (!sid) {
            sid = crypto.randomUUID();
            localStorage.setItem("ai_sid", sid);
        }
        return sid;
    };

    function esc(s = "") {
        return String(s).replace(/[&<>"']/g, (c) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
        }[c]));
    }

    function addBubble(role, text) {
        const d = document.createElement("div");
        d.className = `msg ${role === "user" ? "user" : "ai"}`;
        d.innerHTML = esc(text || "");
        el.messages.appendChild(d);
        el.messages.scrollTop = el.messages.scrollHeight;
    }

    async function fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = reject;
            r.readAsDataURL(file);
        });
    }

    async function sendToAI({ text, imageDataUrl }) {
        const payload = {
            sid: getSid(),
            // ✅ backend expects message, also keep text for backward compatibility
            message: text || "",
            text: text || "",
            imageDataUrl: imageDataUrl || null,
        };

        let res;
        try {
            res = await fetch("/.netlify/functions/ai_chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-user-id": getUserId(),
                },
                body: JSON.stringify(payload),
            });
        } catch (e) {
            addBubble("ai", "Network error: bağlantı kurulamadı.");
            return null;
        }

        const data = await res.json().catch(() => ({}));

        // HTTP error
        if (!res.ok) {
            const err = data?.error || `http_${res.status}`;
            const retry = data?.retry_after_ms;

            if (err === "daily_message_limit") {
                addBubble("ai", "Free limit doldu: bugün 10 mesaj hakkın bitti. Upgrade yapabilirsin.");
                return null;
            }
            if (err === "daily_image_limit") {
                addBubble("ai", "Free limit doldu: bugün 1 görsel hakkın bitti. Upgrade yapabilirsin.");
                return null;
            }
            if (err === "rate_limited") {
                addBubble("ai", `Yavaşla kanka 😄 Rate-limit. ${Math.ceil((retry || 1000) / 1000)} sn sonra dene.`);
                return null;
            }

            addBubble("ai", `Hata: ${err}`);
            return null;
        }

        // ✅ Plan text update
        if (el.planText && data.plan) el.planText.textContent = data.plan;

        // ✅ Free limit case is 200 but allowed:false
        if (data.allowed === false) {
            const reason = data.reason || "not_allowed";
            if (reason === "msg_limit_reached") {
                addBubble("ai", "Free limit doldu: bugün 10 mesaj hakkın bitti. Upgrade yapabilirsin.");
            } else {
                addBubble("ai", `İstek reddedildi: ${reason}`);
            }
            return null;
        }

        // ✅ backend returns text (not answer)
        const answer = data.text || "";
        return answer.trim() ? answer : null;
    }

    async function handleSend() {
        const text = (el.input?.value || "").trim();
        if (!text) return;

        el.input.value = "";
        addBubble("user", text);

        const answer = await sendToAI({ text });
        if (answer) addBubble("ai", answer);
    }

    async function handleImagePick() {
        const inp = document.createElement("input");
        inp.type = "file";
        inp.accept = "image/*";
        inp.click();

        inp.onchange = async () => {
            const file = inp.files?.[0];
            if (!file) return;

            addBubble("user", "[image]");
            const dataUrl = await fileToDataUrl(file);

            // image-only request: still includes message text (backend requires message)
            const answer = await sendToAI({ text: "Analyze this image.", imageDataUrl: dataUrl });
            if (answer) addBubble("ai", answer);
        };
    }

    function newChat() {
        const sid = crypto.randomUUID();
        localStorage.setItem("ai_sid", sid);
        if (el.messages) el.messages.innerHTML = "";
    }

    // events
    el.send?.addEventListener("click", handleSend);
    el.input?.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });
    el.plus?.addEventListener("click", handleImagePick);
    el.newChat?.addEventListener("click", newChat);

    // init
    if (el.planText) el.planText.textContent = "free";
})();
