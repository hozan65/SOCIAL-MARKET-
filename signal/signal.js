// /signal/signal.js
(() => {
    const $ = (q) => document.querySelector(q);

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

    const esc = (s="") => String(s).replace(/[&<>"']/g, (c) => ({
        "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));

    function initProfile(){
        const name = (localStorage.getItem("sm_name") || "Hozan").trim();
        const surname = (localStorage.getItem("sm_surname") || "Bilaloglu").trim();
        const email = (localStorage.getItem("sm_email") || "—").trim();
        const plan = (localStorage.getItem("sm_plan") || "free").toLowerCase();

        el.pfName.textContent = `${name} ${surname}`.trim();
        el.pfEmail.textContent = email;
        el.pfPlan.textContent = plan;
        el.pfAvatar.textContent = `${(name[0]||"S")}${(surname[0]||"M")}`.toUpperCase();
    }

    function addRow(role, text){
        const row = document.createElement("div");
        row.className = `msg ${role}`;
        row.innerHTML = `<div class="msgInner">${esc(text)}</div>`;
        el.messages.appendChild(row);
        el.messages.scrollTop = el.messages.scrollHeight;
    }

    function handleSend(){
        const raw = (el.input.value || "").trim();
        if(!raw) return;
        el.input.value = "";
        addRow("user", raw);
        addRow("ai", "OK. (AI response will come from your Netlify function)");
    }

    // ✅ GO TO PAGES
    el.btnUpgrade.addEventListener("click", () => {
        location.href = "/signal/upgrade.html";
    });

    el.btnProfile.addEventListener("click", () => {
        location.href = "/signal/profile.html";
    });

    el.send.addEventListener("click", handleSend);
    el.input.addEventListener("keydown", (e) => {
        if(e.key === "Enter" && !e.shiftKey){
            e.preventDefault();
            handleSend();
        }
    });

    el.btnImage.addEventListener("click", () => alert("Image upload later"));
    el.newChat?.addEventListener("click", () => {
        el.messages.innerHTML = "";
        localStorage.setItem("ai_sid", crypto.randomUUID());
    });

    initProfile();
})();
