// /signal/signal.js (AI CONNECTED - FULL)
(() => {
    const $ = (q) => document.querySelector(q);

    const FN_AI = "/.netlify/functions/ai_chat"; // gerekirse ai_support yap

    const el = {
        btnUpgrade: $("#btnUpgrade"),
        btnProfile: $("#btnProfile"),

        pfAvatar: $("#pfAvatar"),
        pfName: $("#pfName"),
        pfEmail: $("#pfEmail"),
        pfPlan: $("#pfPlan"),

        messages: $("#messages"),
        input: $("#chatInput"),
        send: $("#btnSend"),
        btnImage: $("#btnImage"),
        newChat: document.querySelector(".btnNew"),
    };

    // ---------- helpers ----------
    const esc = (s = "") =>
        String(s).replace(/[&<>"']/g, (c) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
        }[c]));

    function getSid() {
        let sid = localStorage.getItem("ai_sid");
        if (!sid) {
            sid = crypto.randomUUID();
            localStorage.setItem("ai_sid", sid);
        }
        return sid;
    }

    function getUserId() {
        // senin sistemde sm_uid varsa onu kullan
        return localStorage.getItem("sm_uid") || "demo_user";
    }

    function initProfile() {
        const name = (localStorage.getItem("sm_name") || "Hozan").trim();
        const surname = (localStorage.getItem("sm_surname") || "Bilaloglu").trim();
        const email = (localStorage.getItem("sm_email") || "—").trim();
        const plan = (localStorage.getItem("sm_plan") || "free").toLowerCase();

        el.pfName.textContent = `${name} ${surname}`.trim();
        el.pfEmail.textContent = email;
        el.pfPlan.textContent = plan;
        el.pfAvatar.textContent = `${(name[0] || "S")}${(surname[0] || "M")}`.toUpperCase();
    }

    function addRow(role, text) {
        const row = document.createElement("div");
        row.className = `msg ${role}`;
        row.innerHTML = `<div class="msgInner">${esc(text)}</div>`;
        el.messages.appendChild(row);
        el.messages.scrollTop = el.messages.scrollHeight;
        return row;
    }

    // typing row
    let typingRow = null;
    function showTyping() {
        if (typingRow) return;
        typingRow = addRow("ai", "Answering...");
    }
    function hideTyping() {
        typingRow?.remove();
        typingRow = null;
    }

    async function fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = reject;
            r.readAsDataURL(file);
        });
    }

    // ---------- AI call ----------
    async function callAI({ text, imageDataUrl }) {
        const payload = {
            sid: getSid(),
            message: text || "",
            text: text || "",
            imageDataUrl: imageDataUrl || null,
        };

        let res;
        try {
            res = await fetch(FN_AI, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-user-id": getUserId(), // backend bunu okuyorsa kullan
                },
                body: JSON.stringify(payload),
            });
        } catch {
            return { ok: false, error: "network_error" };
        }

        const data = await res.json().catch(() => ({}));
        if (!res.ok) return { ok: false, error: data?.error || `http_${res.status}`, data };

        if (data?.allowed === false) {
            return { ok: false, error: data?.reason || "not_allowed", data };
        }

        return { ok: true, data };
    }

    // ---------- send text ----------
    async function handleSend() {
        const raw = (el.input.value || "").trim();
        if (!raw) return;

        el.input.value = "";
        addRow("user", raw);

        showTyping();
        const r = await callAI({ text: raw });
        hideTyping();

        if (!r.ok) {
            if (r.error === "msg_limit_reached") {
                addRow("ai", "Free limit reached. Please upgrade to continue.");
            } else {
                addRow("ai", `Error: ${r.error}`);
            }
            return;
        }

        // plan update (optional)
        if (r.data?.plan) {
            const plan = String(r.data.plan).toLowerCase();
            localStorage.setItem("sm_plan", plan);
            el.pfPlan.textContent = plan;
        }

        const answer = String(r.data?.text || "").trim();
        addRow("ai", answer || "No response.");
    }

    // ---------- send image ----------
    async function handleImagePick() {
        const inp = document.createElement("input");
        inp.type = "file";
        inp.accept = "image/*";
        inp.click();

        inp.onchange = async () => {
            const file = inp.files?.[0];
            if (!file) return;

            addRow("user", "[image]");

            showTyping();
            const dataUrl = await fileToDataUrl(file).catch(() => null);
            if (!dataUrl) {
                hideTyping();
                addRow("ai", "Could not read the image.");
                return;
            }

            const r = await callAI({ text: "Analyze this image.", imageDataUrl: dataUrl });
            hideTyping();

            if (!r.ok) {
                if (r.error === "img_limit_reached") {
                    addRow("ai", "Daily image limit reached. Please upgrade.");
                } else {
                    addRow("ai", `Error: ${r.error}`);
                }
                return;
            }

            if (r.data?.plan) {
                const plan = String(r.data.plan).toLowerCase();
                localStorage.setItem("sm_plan", plan);
                el.pfPlan.textContent = plan;
            }

            addRow("ai", String(r.data?.text || "No response.").trim());
        };
    }

    // ---------- new chat ----------
    function newChat() {
        el.messages.innerHTML = "";
        localStorage.setItem("ai_sid", crypto.randomUUID());
    }

    // ---------- navigation ----------
    el.btnUpgrade?.addEventListener("click", () => {
        location.href = "/signal/upgrade.html";
    });

    el.btnProfile?.addEventListener("click", () => {
        location.href = "/signal/profile.html";
    });

    // ---------- events ----------
    el.send?.addEventListener("click", handleSend);
    el.input?.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    el.btnImage?.addEventListener("click", handleImagePick);
    el.newChat?.addEventListener("click", newChat);

    // init
    initProfile();
})();
