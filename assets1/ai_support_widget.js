// /assets1/ai_support_widget.js
(() => {
    if (window.__SM_SUPPORT_WIDGET__) return;
    window.__SM_SUPPORT_WIDGET__ = true;

    const API_URL = "/.netlify/functions/ai_support";
    const SUPPORT_ICON_URL = "/assets1/img/support.png"; // kendi iconun
    const Z = 2147483647;

    const TELEGRAM_SVG =
        "data:image/svg+xml;utf8," +
        encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <path d="M21.8 3.2L2.7 10.8c-1.2.5-1.2 1.2-.2 1.5l4.9 1.5 11.4-7.2c.5-.3 1-.1.6.3l-9.3 8.4-.3 5.1c.4 0 .6-.2.8-.4l2.2-2.2 4.6 3.4c.6.3 1.4.3 1.6-.6l3.3-16.1c.1-.4.1-.9-.3-1.1z"
              fill="rgba(0,0,0,.82)"/>
      </svg>
    `);

    const FALLBACK_ICON =
        "data:image/svg+xml;utf8," +
        encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e9eefc"/>
        </linearGradient></defs>
        <circle cx="32" cy="32" r="30" fill="url(#g)" stroke="rgba(0,0,0,.12)" stroke-width="2"/>
        <path d="M20 40c0-8 6-14 14-14s14 6 14 14" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="3" stroke-linecap="round"/>
        <circle cx="26" cy="28" r="2" fill="rgba(0,0,0,.55)"/>
        <circle cx="38" cy="28" r="2" fill="rgba(0,0,0,.55)"/>
      </svg>
    `);

    const css = `
  #smFlyWrap{position:fixed;right:12px;bottom:78px;z-index:${Z};pointer-events:none;display:flex;flex-direction:column;gap:8px;align-items:flex-end}
  .smFly{font-size:12px;font-weight:900;letter-spacing:.2px;padding:8px 10px;border-radius:999px;background:rgba(255,255,255,.92);
    border:1px solid rgba(0,0,0,.10);box-shadow:0 10px 24px rgba(0,0,0,.16);backdrop-filter:blur(10px);
    opacity:0;transform:translateY(10px);animation:smFly 7s linear infinite}
  .smFly:nth-child(2){animation-delay:3.5s}
  @keyframes smFly{
    0%{opacity:0;transform:translateY(10px)}
    10%{opacity:1;transform:translateY(0)}
    70%{opacity:1;transform:translateY(-22px)}
    100%{opacity:0;transform:translateY(-48px)}
  }

  #smFab{position:fixed;right:12px;bottom:12px;width:54px;height:54px;border-radius:999px;z-index:${Z};
    cursor:pointer;user-select:none;border:1px solid rgba(0,0,0,.12);background:rgba(255,255,255,.92);
    box-shadow:0 10px 28px rgba(0,0,0,.18);backdrop-filter:blur(10px);display:grid;place-items:center;overflow:hidden}
  #smFab img{width:100%;height:100%;object-fit:cover;border-radius:999px;display:block}

  #smBox{position:fixed;right:12px;bottom:78px;width:min(380px,calc(100vw - 24px));height:560px;z-index:${Z};
    border-radius:18px;background:rgba(255,255,255,.94);border:1px solid rgba(0,0,0,.12);
    box-shadow:0 18px 40px rgba(0,0,0,.22);backdrop-filter:blur(12px);
    display:flex;flex-direction:column;overflow:hidden}
  .smHidden{display:none !important}

  .smTop{display:flex;align-items:center;justify-content:space-between;padding:12px;border-bottom:1px solid rgba(0,0,0,.08)}
  .smTopLeft{display:flex;align-items:center;gap:10px;min-width:0}
  .smMini{width:30px;height:30px;border-radius:999px;border:1px solid rgba(0,0,0,.10);overflow:hidden;display:grid;place-items:center;cursor:pointer}
  .smMini img{width:100%;height:100%;object-fit:cover;border-radius:999px}
  .smTitle{font-weight:1000;font-size:14px;line-height:1.1}
  .smSub{font-size:12px;opacity:.65}
  .smClose{border:0;background:transparent;cursor:pointer;font-size:18px;opacity:.75;padding:6px 8px;border-radius:10px}
  .smClose:hover{opacity:1;background:rgba(0,0,0,.06)}

  #smMsgs{flex:1;padding:12px;overflow:auto}
  .smMsg{max-width:85%;padding:10px 12px;border-radius:14px;margin:0 0 10px;line-height:1.25;font-size:14px;white-space:pre-wrap;word-wrap:break-word}
  .smMsg.user{margin-left:auto;background:rgba(0,0,0,.06);border:1px solid rgba(0,0,0,.08)}
  .smMsg.ai{margin-right:auto;background:rgba(255,255,255,.92);border:1px solid rgba(0,0,0,.10)}
  .smMsg.typing{opacity:.75}

  .smBottom{padding:10px 12px 12px;border-top:1px solid rgba(0,0,0,.08);background:rgba(255,255,255,.92)}
  .smRow{display:flex;gap:8px;align-items:center}
  #smInput{flex:1;padding:11px 12px;border-radius:12px;border:1px solid rgba(0,0,0,.15);outline:none;background:rgba(255,255,255,.95)}
  #smSend{width:44px;height:44px;border-radius:12px;border:1px solid rgba(0,0,0,.15);background:rgba(255,255,255,.95);cursor:pointer;display:grid;place-items:center}
  #smSend img{width:20px;height:20px;display:block}
  #smSend:hover{background:rgba(0,0,0,.04)}
  .smFooter{margin-top:8px;font-size:12px;opacity:.6;display:flex;justify-content:space-between;gap:8px}

  @media (max-width:480px){#smBox{height:70vh}}
  `;

    function injectStyleOnce() {
        if (document.getElementById("smSupportStyle")) return;
        const st = document.createElement("style");
        st.id = "smSupportStyle";
        st.textContent = css;
        document.head.appendChild(st);
    }

    function el(id) { return document.getElementById(id); }

    function injectDomOnce() {
        if (el("smFab")) return;

        document.body.insertAdjacentHTML("beforeend", `
      <div id="smFlyWrap" aria-hidden="true">
        <div class="smFly">Hello sir</div>
        <div class="smFly">How can I help you?</div>
      </div>

      <div id="smFab" role="button" aria-label="Support" aria-expanded="false">
        <img id="smFabImg" alt="Support"/>
      </div>

      <div id="smBox" class="smHidden" aria-hidden="true">
        <div class="smTop">
          <div class="smTopLeft">
            <div class="smMini" id="smMiniBtn"><img id="smMiniImg" alt="Logo"/></div>
            <div>
              <div class="smTitle">Support</div>
              <div class="smSub">Social Market</div>
            </div>
          </div>
          <button class="smClose" id="smClose" type="button" aria-label="Close">✕</button>
        </div>

        <div id="smMsgs"></div>

        <div class="smBottom">
          <div class="smRow">
            <input id="smInput" placeholder="Write a message..." autocomplete="off"/>
            <button id="smSend" type="button" aria-label="Send"><img alt="Send" src="${TELEGRAM_SVG}"/></button>
          </div>
          <div class="smFooter">
            <span>@SocialMarket-AI support</span>
            <span><b>Online</b></span>
          </div>
        </div>
      </div>
    `);

        // icons
        const fabImg = el("smFabImg");
        const miniImg = el("smMiniImg");

        const setIcon = (imgEl) => {
            imgEl.src = SUPPORT_ICON_URL;
            imgEl.onerror = () => { imgEl.src = FALLBACK_ICON; };
        };
        setIcon(fabImg);
        setIcon(miniImg);
    }

    function initEvents() {
        const fab = el("smFab");
        const box = el("smBox");
        const closeBtn = el("smClose");
        const miniBtn = el("smMiniBtn");
        const fly = el("smFlyWrap");

        const msgs = el("smMsgs");
        const input = el("smInput");
        const send = el("smSend");

        const addMsg = (role, text) => {
            const d = document.createElement("div");
            d.className = "smMsg " + role;
            d.textContent = text;
            msgs.appendChild(d);
            msgs.scrollTop = msgs.scrollHeight;
        };

        let greeted = false;
        const greetOnce = () => {
            if (greeted) return;
            greeted = true;
            addMsg("ai", "How can I help you?");
        };

        const openBox = () => {
            box.classList.remove("smHidden");
            box.setAttribute("aria-hidden", "false");
            fab.setAttribute("aria-expanded", "true");
            if (fly) fly.style.display = "none";
            setTimeout(() => input && input.focus(), 60);
            greetOnce();
        };

        const closeBox = () => {
            box.classList.add("smHidden");
            box.setAttribute("aria-hidden", "true");
            fab.setAttribute("aria-expanded", "false");
            if (fly) fly.style.display = "";
        };

        // ✅ Force closed on load (fix for your bug)
        closeBox();

        // ✅ Capture events to avoid overlay/click issues
        fab.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            box.classList.contains("smHidden") ? openBox() : closeBox();
        }, true);

        closeBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeBox();
        }, true);

        miniBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeBox();
        }, true);

        const sendMsg = async () => {
            const text = (input.value || "").trim();
            if (!text) return;

            addMsg("user", text);
            input.value = "";

            const typing = document.createElement("div");
            typing.className = "smMsg ai typing";
            typing.textContent = "…";
            msgs.appendChild(typing);
            msgs.scrollTop = msgs.scrollHeight;

            try {
                const r = await fetch(API_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ message: text })
                });

                const data = await r.json().catch(() => ({}));
                typing.remove();

                if (!r.ok) return addMsg("ai", data.error || "Server error.");
                addMsg("ai", data.reply || "…");
            } catch (err) {
                typing.remove();
                addMsg("ai", "Network error.");
            }
        };

        send.addEventListener("click", sendMsg);
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") sendMsg();
        });
    }

    function boot() {
        injectStyleOnce();
        injectDomOnce();
        initEvents();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
