// /signal/signal.js
// ✅ ChatGPT-like UX: typing bubble ("answering…"), better rendering, English UI strings
// ✅ Sends: message (+ text for compatibility)
// ✅ Handles: allowed:false (free limit)
// ✅ Reads: data.text

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

    const getUserId = () => localStorage.getItem("sm_uid") || "demo_user";

    const getSid = () => {
        let sid = localStorage.getItem("ai_sid");
        if (!sid) {
            sid = crypto.randomUUID();
            localStorage.setItem("ai_sid", sid);
        }
        return sid;
    };

    function normalizeAIText(raw = "") {
        let t = String(raw || "");

        // Remove common LaTeX wrappers if they sneak in
        t = t.replace(/\\\(|\\\)|\\\[|\\\]/g, "");
        t = t.replace(/\\text\{([^}]+)\}/g, "$1");
        t = t.replace(/\\times/g, "×");

        // Trim extra whitespace
        return t.trim();
    }

    function addBubble(role, text) {
        const d = document.createElement("div");
        d.className = `msg ${role === "user" ? "user" : "ai"}`;

        const out = role === "ai" ? normalizeAIText(text) : String(text || "").trim();
        d.textContent = out;

        el.messages.appendChild(d);
        el.messages.scrollTop = el.messages.scrollHeight;
        return d;
    }

    // Typing bubble
    let typingEl = null;
    function showTyping() {
        if (typingEl) return;
        typingEl = document.createElement("div");
        typingEl.className = "msg ai typing";
        typingEl.textContent = "answering…";
        el.messages.appendChild(typingEl);
        el.messages.scrollTop = el.messages.scrollHeight;
    }
    function hideTyping() {
        if (!typingEl) return;
        typingEl.remove();
        typingEl = null;
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
        } catch {
            addBubble("ai", "Network error: could not connect.");
            return null;
        }

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            const err = data?.error || `http_${res.status}`;
            addBubble("ai", `Server error: ${err}`);
            return null;
        }

        if (el.planText && data.plan) el.planText.textContent = data.plan;

        if (data.allowed === false) {
            const reason = data.reason || "not_allowed";
            if (reason === "msg_limit_reached") {
                addBubble("ai", "Free limit reached: you used all 10 messages for today. Upgrade to continue.");
            } else {
                addBubble("ai", `Request blocked: ${reason}`);
            }
            return null;
        }

        const answer = (data.text || "").trim();
        return answer ? answer : null;
    }

    async function handleSend() {
        const text = (el.input?.value || "").trim();
        if (!text) return;

        el.input.value = "";
        addBubble("user", text);

        showTyping();
        const answer = await sendToAI({ text });
        hideTyping();

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

            showTyping();
            const answer = await sendToAI({ text: "Analyze this image.", imageDataUrl: dataUrl });
            hideTyping();

            if (answer) addBubble("ai", answer);
        };
    }

    function newChat() {
        const sid = crypto.randomUUID();
        localStorage.setItem("ai_sid", sid);
        if (el.messages) el.messages.innerHTML = "";
    }

    el.send?.addEventListener("click", handleSend);
    el.input?.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });
    el.plus?.addEventListener("click", handleImagePick);
    el.newChat?.addEventListener("click", newChat);

    if (el.planText) el.planText.textContent = "free";
})();
