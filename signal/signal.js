// /signal/signal.js  (FULL - CHATGPT-LIKE + UPGRADE MODAL)
// - scroll fixed (messages scroll, page doesn't grow)
// - typing indicator: "Answering..."
// - basic markdown renderer (no external libs)
// - sends { sid, message, text, imageDataUrl }
// - reads { allowed, reason, plan, text }
// - ✅ upgrade modal open/close + plan pick

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
        search: $(".search"),

        // ✅ Upgrade UI
        upgradeBtn: $(".btnUpgrade"),
        upgradeModal: $("#upgradeModal"),
        upgradeClose: $("#upgradeClose"),
    };

    // ---------- IDs ----------
    const getUserId = () => localStorage.getItem("sm_uid") || "demo_user";

    const getSid = () => {
        let sid = localStorage.getItem("ai_sid");
        if (!sid) {
            sid = crypto.randomUUID();
            localStorage.setItem("ai_sid", sid);
        }
        return sid;
    };

    // ---------- HTML escape ----------
    function esc(s = "") {
        return String(s).replace(/[&<>"']/g, (c) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
        }[c]));
    }

    // ---------- tiny markdown -> html ----------
    function mdToHtml(md = "") {
        const s = String(md || "");

        const fences = [];
        let tmp = s.replace(/```([\s\S]*?)```/g, (_, code) => {
            const id = fences.length;
            fences.push(code);
            return `@@FENCE_${id}@@`;
        });

        tmp = esc(tmp);

        tmp = tmp.replace(/^###\s+(.*)$/gm, "<h3>$1</h3>");
        tmp = tmp.replace(/^##\s+(.*)$/gm, "<h2>$1</h2>");
        tmp = tmp.replace(/^#\s+(.*)$/gm, "<h1>$1</h1>");

        tmp = tmp.replace(/^\>\s?(.*)$/gm, "<blockquote>$1</blockquote>");

        tmp = tmp.replace(/^\-\s+(.*)$/gm, "<li>$1</li>");
        tmp = tmp.replace(/(?:<li>[\s\S]*?<\/li>\s*)+/g, (m) => {
            if (!m.includes("<li>")) return m;
            return `<ul>${m}</ul>`;
        });

        tmp = tmp.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
        tmp = tmp.replace(/\*(.+?)\*/g, "<em>$1</em>");
        tmp = tmp.replace(/`(.+?)`/g, "<code>$1</code>");

        tmp = tmp.replace(
            /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g,
            `<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>`
        );

        const lines = tmp.split(/\n/);
        let out = [];
        let buf = [];

        const flushP = () => {
            const text = buf.join(" ").trim();
            if (text) out.push(`<p>${text}</p>`);
            buf = [];
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trimEnd();

            if (!line.trim()) {
                flushP();
                continue;
            }

            if (
                line.startsWith("<h1>") ||
                line.startsWith("<h2>") ||
                line.startsWith("<h3>") ||
                line.startsWith("<ul>") ||
                line.startsWith("<blockquote>")
            ) {
                flushP();
                out.push(line);
                continue;
            }

            if (line.startsWith("<ul>") && line.endsWith("</ul>")) {
                flushP();
                out.push(line);
                continue;
            }

            if (line.startsWith("<li>") && line.endsWith("</li>")) {
                flushP();
                out.push(`<ul>${line}</ul>`);
                continue;
            }

            buf.push(line);
        }
        flushP();

        tmp = out.join("\n");

        tmp = tmp.replace(/@@FENCE_(\d+)@@/g, (_, idStr) => {
            const code = fences[Number(idStr)] ?? "";
            return `<pre><code>${esc(code)}</code></pre>`;
        });

        return tmp;
    }

    // ---------- UI: add message row ----------
    function addRow(role, html) {
        const row = document.createElement("div");
        row.className = `msg ${role}`;

        const inner = document.createElement("div");
        inner.className = "msgInner";
        inner.innerHTML = html;

        row.appendChild(inner);
        el.messages.appendChild(row);

        el.messages.scrollTop = el.messages.scrollHeight;
    }

    // ---------- typing indicator ----------
    const TYPING_ID = "typingRow";

    function showTyping() {
        if (!el.messages) return;
        if (document.getElementById(TYPING_ID)) return;

        const row = document.createElement("div");
        row.id = TYPING_ID;
        row.className = "msg typing";
        row.innerHTML =
            `<div class="msgInner">Answering` +
            `<span class="dot"></span><span class="dot"></span><span class="dot"></span>` +
            `</div>`;

        el.messages.appendChild(row);
        el.messages.scrollTop = el.messages.scrollHeight;
    }

    function hideTyping() {
        document.getElementById(TYPING_ID)?.remove();
    }

    // ---------- Upgrade modal helpers ----------
    function openUpgrade() {
        if (!el.upgradeModal) return;
        el.upgradeModal.classList.add("open");
        el.upgradeModal.setAttribute("aria-hidden", "false");
    }

    function closeUpgrade() {
        if (!el.upgradeModal) return;
        el.upgradeModal.classList.remove("open");
        el.upgradeModal.setAttribute("aria-hidden", "true");
    }

    // ---------- file to data url ----------
    async function fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = reject;
            r.readAsDataURL(file);
        });
    }

    // ---------- send ----------
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
            return { ok: false, error: "Network error" };
        }

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            return { ok: false, error: data?.error || `http_${res.status}` };
        }

        // allowed:false (still 200)
        if (data.allowed === false) {
            return { ok: false, error: data.reason || "not_allowed", data };
        }

        return { ok: true, data };
    }

    // ---------- handlers ----------
    async function handleSend() {
        const raw = (el.input?.value || "").trim();
        if (!raw) return;

        el.input.value = "";
        addRow("user", mdToHtml(raw));

        showTyping();
        const r = await sendToAI({ text: raw });
        hideTyping();

        if (!r.ok) {
            const err = r.error;

            // ✅ daily limit -> show upgrade modal too
            if (err === "msg_limit_reached" || err === "daily_message_limit") {
                addRow("ai", mdToHtml("Daily limit reached. Upgrade to continue."));
                openUpgrade();
                return;
            }
            if (err === "daily_image_limit") {
                addRow("ai", mdToHtml("Daily image limit reached. Upgrade to continue."));
                openUpgrade();
                return;
            }
            if (err === "rate_limited") {
                addRow("ai", mdToHtml("Rate limited. Please try again in a few seconds."));
                return;
            }

            addRow("ai", mdToHtml(`Error: ${err}`));
            return;
        }

        const data = r.data;

        if (el.planText && data.plan) {
            el.planText.textContent = String(data.plan).toLowerCase();
        }

        const answer = String(data.text || "").trim();
        addRow("ai", mdToHtml(answer || "No response."));
    }

    async function handleImagePick() {
        const inp = document.createElement("input");
        inp.type = "file";
        inp.accept = "image/*";
        inp.click();

        inp.onchange = async () => {
            const file = inp.files?.[0];
            if (!file) return;

            addRow("user", mdToHtml("[image]"));

            showTyping();

            const dataUrl = await fileToDataUrl(file).catch(() => null);
            if (!dataUrl) {
                hideTyping();
                addRow("ai", mdToHtml("Could not read the image."));
                return;
            }

            const r = await sendToAI({ text: "Analyze this image.", imageDataUrl: dataUrl });

            hideTyping();

            if (!r.ok) {
                if (r.error === "msg_limit_reached" || r.error === "daily_message_limit" || r.error === "daily_image_limit") {
                    addRow("ai", mdToHtml("Limit reached. Upgrade to continue."));
                    openUpgrade();
                    return;
                }
                addRow("ai", mdToHtml(`Error: ${r.error}`));
                return;
            }

            const answer = String(r.data?.text || "").trim();
            addRow("ai", mdToHtml(answer || "No response."));
        };
    }

    function newChat() {
        localStorage.setItem("ai_sid", crypto.randomUUID());
        if (el.messages) el.messages.innerHTML = "";
    }

    // ---------- init UI text (EN) ----------
    function setEnglishUI() {
        if (el.search) el.search.placeholder = "Search chats";
        if (el.input) el.input.placeholder = "Ask anything about finance…";

        if (el.newChat) {
            const plus = el.newChat.querySelector(".plus");
            el.newChat.innerHTML = "";
            if (plus) el.newChat.appendChild(plus);
            el.newChat.appendChild(document.createTextNode(" New chat"));
        }
        if (el.planText) el.planText.textContent = "free";
    }

    // ---------- wire events ----------
    el.send?.addEventListener("click", handleSend);

    el.input?.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    el.plus?.addEventListener("click", handleImagePick);
    el.newChat?.addEventListener("click", newChat);

    // ✅ Upgrade open/close events
    el.upgradeBtn?.addEventListener("click", openUpgrade);
    el.upgradeClose?.addEventListener("click", closeUpgrade);

    // click outside card closes
    el.upgradeModal?.addEventListener("click", (e) => {
        if (e.target === el.upgradeModal) closeUpgrade();
    });

    // ESC closes
    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeUpgrade();
    });

    // Plan button click (for now: just show message; checkout later)
    document.addEventListener("click", (e) => {
        const btn = e.target?.closest?.(".planBtn");
        if (!btn) return;

        const plan = btn.getAttribute("data-plan");
        if (!plan) return;

        // Payment wiring later
        addRow("ai", mdToHtml(`Selected **${plan.toUpperCase()}**. Checkout will be enabled next step.`));
        closeUpgrade();
    });

    // init
    setEnglishUI();
})();
