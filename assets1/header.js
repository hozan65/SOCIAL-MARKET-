// /assets1/header.js
console.log("✅ header.js loaded (loader + behavior)");

document.addEventListener("DOMContentLoaded", async () => {
    const mount = document.getElementById("headerMount");
    if (!mount) return;

    try {
        // 1) HEADER HTML load
        const candidates = [
            "/components/header.html",
            "./components/header.html",
            "../components/header.html",
        ];

        let html = null;
        let lastErr = null;

        for (const url of candidates) {
            try {
                const res = await fetch(url, { cache: "no-store" });
                if (!res.ok) throw new Error(`${url} -> ${res.status}`);
                html = await res.text();
                break;
            } catch (e) {
                lastErr = e;
            }
        }

        if (!html) throw lastErr || new Error("header.html load failed");
        mount.innerHTML = html;

        // 2) active menu
        const path = location.pathname.replace(/\/+$/, "");
        let page = path.split("/")[1] || "";
        if (page.endsWith(".html")) page = page.replace(".html", "");
        if (!page) page = "feed";

        mount.querySelectorAll("[data-page]").forEach((a) => {
            if ((a.dataset.page || "").trim() === page) a.classList.add("active");
        });

        // =========================
        // ✅ ADD "Messages" LINK (Desktop dropdown + Mobile menu)
        // =========================
        const addMessagesLink = () => {
            // Link target
            const href = "/messages/"; // istersen "/inbox/" yaparsın

            // 1) Desktop dropdown menu (olası selector'lar)
            const desktopMenus = [
                mount.querySelector("#profileMenu"),
                mount.querySelector(".profileMenu"),
                mount.querySelector(".userMenu"),
                mount.querySelector(".menuDropdown"),
                mount.querySelector("[data-menu='profile']"),
            ].filter(Boolean);

            desktopMenus.forEach((menu) => {
                // zaten ekliyse dokunma
                if (menu.querySelector(`a[href="${href}"]`)) return;

                const a = document.createElement("a");
                a.href = href;
                a.textContent = "Messages";
                // dropdown item class'ı varsa onu koru
                a.className = "menuItem";

                // Sign Out'tan önce ekle
                const items = Array.from(menu.querySelectorAll("a,button"));
                const signOut = items.find((x) =>
                    (x.textContent || "").toLowerCase().includes("sign out")
                );

                if (signOut && signOut.parentElement === menu) {
                    menu.insertBefore(a, signOut);
                } else {
                    menu.appendChild(a);
                }
            });

            // 2) Mobile menu (#mobileMenu) içine de ekle
            const mobileMenu = document.getElementById("mobileMenu");
            if (mobileMenu) {
                if (!mobileMenu.querySelector(`a[href="${href}"]`)) {
                    const a2 = document.createElement("a");
                    a2.href = href;
                    a2.textContent = "Messages";
                    a2.className = "mItem"; // mobil menü class'ın farklıysa "mItem" yerine onu yaz

                    // mobilde de Sign Out varsa ondan önce ekle
                    const links = Array.from(mobileMenu.querySelectorAll("a,button"));
                    const signOut2 = links.find((x) =>
                        (x.textContent || "").toLowerCase().includes("sign out")
                    );

                    if (signOut2 && signOut2.parentElement === mobileMenu) {
                        mobileMenu.insertBefore(a2, signOut2);
                    } else {
                        mobileMenu.appendChild(a2);
                    }
                }
            }
        };

        // Header mount olur olmaz ekle
        addMessagesLink();

        // =========================
        // 3) hamburger / mobile menu
        // =========================
        const btn = document.getElementById("hamburgerBtn");
        const menu = document.getElementById("mobileMenu");
        const backdrop = document.getElementById("menuBackdrop");

        if (btn && menu && backdrop) {
            const open = () => {
                menu.classList.add("open");
                backdrop.classList.add("open");
                btn.setAttribute("aria-expanded", "true");
                menu.setAttribute("aria-hidden", "false");

                // ✅ scroll kilidi (istersen)
                document.documentElement.style.overflow = "hidden";
            };

            const close = () => {
                menu.classList.remove("open");
                backdrop.classList.remove("open");
                btn.setAttribute("aria-expanded", "false");
                menu.setAttribute("aria-hidden", "true");

                document.documentElement.style.overflow = "";
            };

            const isOpen = () => menu.classList.contains("open");

            btn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                isOpen() ? close() : open();
            });

            // ✅ backdrop tıklayınca kesin kapat
            backdrop.addEventListener("click", () => close());

            // ✅ menü linkine tıklayınca kapat
            menu.querySelectorAll("a").forEach((a) => {
                a.addEventListener("click", () => close());
            });

            // ✅ ESC ile kapat
            document.addEventListener("keydown", (e) => {
                if (e.key === "Escape" && isOpen()) close();
            });

            // ✅ dışarı tıklayınca kapat
            document.addEventListener("click", (e) => {
                if (!isOpen()) return;
                const t = e.target;
                if (menu.contains(t) || btn.contains(t)) return;
                close();
            });
        }

        console.log(" Header fully initialized (clean)");
    } catch (err) {
        console.error(" HEADER ERROR:", err);
    }
});


/* =========================================================
   ✅ AI SUPPORT WIDGET (PRO) - site-wide inject
   Replace your old injectSupportWidget() block with this
========================================================= */
(function injectSupportWidgetPRO() {
    if (window.__ASW_INJECTED__) return;
    window.__ASW_INJECTED__ = true;

    const API_URL = "/.netlify/functions/ai_support";

    // ✅ buraya kendi ikonunu koy (png/svg/webp)
    const SUPPORT_ICON_URL = "/assets1/img/support.png"; // <-- senin path
    // Eğer icon yoksa fallback: küçük bir SVG kullanır
    const FALLBACK_ICON_SVG =
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

    // Telegram (paper plane) SVG (emoji değil)
    const TELEGRAM_SVG =
        "data:image/svg+xml;utf8," +
        encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none">
        <path d="M21.8 3.2c.4.2.3.7.3 1.1l-3.3 16.1c-.2.9-1 .9-1.6.6l-4.6-3.4-2.2 2.2c-.2.2-.4.4-.8.4l.3-5.1 9.3-8.4c.4-.4-.1-.6-.6-.3l-11.4 7.2-4.9-1.5c-1.1-.3-1.1-1 .2-1.5L20.5 3c.5-.2.9-.1 1.3.2Z" fill="rgba(0,0,0,.75)"/>
      </svg>
    `);

    const css = `
  /* ====== Floating Button ====== */
  #aswFab{
    position: fixed;
    right: 12px;
    bottom: 12px;
    width: 54px;
    height: 54px;
    border-radius: 999px;
    z-index: 999999;
    cursor: pointer;
    user-select: none;
    border: 1px solid rgba(0,0,0,.12);
    background: rgba(255,255,255,.92);
    box-shadow: 0 10px 28px rgba(0,0,0,.18);
    backdrop-filter: blur(10px);
    display: grid;
    place-items: center;
    overflow: hidden;
  }
  #aswFab img{
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 999px;
    display:block;
  }

  /* ====== Flying messages above icon ====== */
  #aswFlyWrap{
    position: fixed;
    right: 12px;
    bottom: 72px;
    z-index: 999999;
    pointer-events: none;
    display:flex;
    flex-direction: column;
    gap: 10px;
    align-items: flex-end;
  }
  .aswFlyMsg{
    font-size: 12px;
    font-weight: 800;
    letter-spacing: .2px;
    padding: 8px 10px;
    border-radius: 999px;
    background: rgba(255,255,255,.92);
    border: 1px solid rgba(0,0,0,.10);
    box-shadow: 0 10px 24px rgba(0,0,0,.16);
    backdrop-filter: blur(10px);
    opacity: 0;
    transform: translateY(10px);
    animation: aswFly 7s linear infinite;
  }
  .aswFlyMsg:nth-child(2){
    animation-delay: 3.5s; /* ikinci mesaj yarım periyot gecikmeli */
  }
  @keyframes aswFly{
    0%   { opacity: 0; transform: translateY(10px); }
    10%  { opacity: 1; transform: translateY(0px); }
    70%  { opacity: 1; transform: translateY(-22px); }
    100% { opacity: 0; transform: translateY(-48px); }
  }

  /* ====== Chat Box ====== */
  #aswBox{
    position: fixed;
    right: 12px;
    bottom: 76px;
    width: min(380px, calc(100vw - 24px));
    height: 560px;
    z-index: 999999;

    border-radius: 18px;
    background: rgba(255,255,255,.94);
    border: 1px solid rgba(0,0,0,.12);
    box-shadow: 0 18px 40px rgba(0,0,0,.22);
    backdrop-filter: blur(12px);

    display:flex;
    flex-direction: column;
    overflow:hidden;
  }
  .aswHidden{ display:none; }

  .aswTop{
    display:flex;
    align-items:center;
    justify-content: space-between;
    padding: 12px 12px;
    border-bottom: 1px solid rgba(0,0,0,.08);
  }
  .aswTopLeft{
    display:flex;
    align-items:center;
    gap:10px;
    min-width:0;
  }
  .aswMiniLogo{
    width: 30px;
    height: 30px;
    border-radius: 999px;
    border: 1px solid rgba(0,0,0,.10);
    background: rgba(255,255,255,.9);
    display:grid;
    place-items:center;
    overflow:hidden;
    flex: 0 0 auto;
  }
  .aswMiniLogo img{ width:100%; height:100%; object-fit:cover; border-radius:999px; display:block; }

  .aswTitleWrap{ min-width:0; }
  .aswTitle{
    font-weight: 1000;
    font-size: 14px;
    line-height: 1.1;
    white-space: nowrap;
    overflow:hidden;
    text-overflow: ellipsis;
  }
  .aswSub{
    font-size: 12px;
    opacity:.65;
    white-space: nowrap;
    overflow:hidden;
    text-overflow: ellipsis;
  }

  .aswClose{
    border: 0;
    background: transparent;
    cursor:pointer;
    font-size: 18px;
    opacity: .7;
    padding: 6px 8px;
    border-radius: 10px;
  }
  .aswClose:hover{ opacity: 1; background: rgba(0,0,0,.06); }

  #aswMsgs{
    flex: 1;
    padding: 12px;
    overflow: auto;
    scroll-behavior: smooth;
  }

  .aswMsg{
    max-width: 85%;
    padding: 10px 12px;
    border-radius: 14px;
    margin: 0 0 10px;
    line-height: 1.25;
    font-size: 14px;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
  .aswMsg.user{
    margin-left: auto;
    background: rgba(0,0,0,.06);
    border: 1px solid rgba(0,0,0,.08);
  }
  .aswMsg.ai{
    margin-right: auto;
    background: rgba(255,255,255,.92);
    border: 1px solid rgba(0,0,0,.10);
  }

  .aswBottom{
    padding: 10px 12px 12px;
    border-top: 1px solid rgba(0,0,0,.08);
    background: rgba(255,255,255,.92);
  }
  .aswInputRow{
    display:flex;
    gap:8px;
    align-items:center;
  }
  #aswInput{
    flex:1;
    padding: 11px 12px;
    border-radius: 12px;
    border: 1px solid rgba(0,0,0,.15);
    outline:none;
    background: rgba(255,255,255,.95);
  }
  #aswSend{
    width: 44px;
    height: 44px;
    border-radius: 12px;
    border: 1px solid rgba(0,0,0,.15);
    background: rgba(255,255,255,.95);
    cursor:pointer;
    display:grid;
    place-items:center;
  }
  #aswSend img{ width:20px; height:20px; display:block; opacity:.9; }
  #aswSend:hover{ background: rgba(0,0,0,.04); }

  .aswFooter{
    margin-top: 8px;
    font-size: 12px;
    opacity: .6;
    display:flex;
    justify-content: space-between;
    gap: 8px;
  }
  .aswFooter b{ opacity:.9; }

  @media (max-width: 480px){
    #aswBox{ height: 70vh; }
    #aswFlyWrap{ bottom: 70px; }
  }
  `;

    // inject style once
    if (!document.getElementById("aswStyle")) {
        const st = document.createElement("style");
        st.id = "aswStyle";
        st.textContent = css;
        document.head.appendChild(st);
    }

    // inject DOM once
    if (!document.getElementById("aswFab")) {
        const iconUrl = SUPPORT_ICON_URL;

        document.body.insertAdjacentHTML("beforeend", `
      <div id="aswFlyWrap" aria-hidden="true">
        <div class="aswFlyMsg">Hello sir</div>
        <div class="aswFlyMsg">How can I help you?</div>
      </div>

      <div id="aswFab" role="button" aria-label="Open support chat" aria-expanded="false">
        <img id="aswFabImg" alt="Support" />
      </div>

      <div id="aswBox" class="aswHidden" aria-hidden="true">
        <div class="aswTop">
          <div class="aswTopLeft">
            <div class="aswMiniLogo"><img id="aswMiniLogoImg" alt="Logo" /></div>
            <div class="aswTitleWrap">
              <div class="aswTitle">Support</div>
              <div class="aswSub">Social Market</div>
            </div>
          </div>
          <button id="aswClose" class="aswClose" type="button" aria-label="Close">✕</button>
        </div>

        <div id="aswMsgs"></div>

        <div class="aswBottom">
          <div class="aswInputRow">
            <input id="aswInput" placeholder="Write a message..." autocomplete="off" />
            <button id="aswSend" type="button" aria-label="Send">
              <img alt="Send" src="${TELEGRAM_SVG}" />
            </button>
          </div>
          <div class="aswFooter">
            <span>@SocialMarket-AI support</span>
            <span><b>Online</b></span>
          </div>
        </div>
      </div>
    `);

        // set icon with fallback
        const fabImg = document.getElementById("aswFabImg");
        const miniLogoImg = document.getElementById("aswMiniLogoImg");

        const setIcon = (imgEl) => {
            imgEl.src = iconUrl;
            imgEl.onerror = () => { imgEl.src = FALLBACK_ICON_SVG; };
        };
        setIcon(fabImg);
        setIcon(miniLogoImg);

        const fab = document.getElementById("aswFab");
        const box = document.getElementById("aswBox");
        const close = document.getElementById("aswClose");
        const msgs = document.getElementById("aswMsgs");
        const input = document.getElementById("aswInput");
        const send = document.getElementById("aswSend");
        const fly = document.getElementById("aswFlyWrap");

        const openBox = () => {
            box.classList.remove("aswHidden");
            box.setAttribute("aria-hidden", "false");
            fab.setAttribute("aria-expanded", "true");
            // chat açıkken uçan mesajları gizle (pro görünüm)
            if (fly) fly.style.display = "none";
            setTimeout(() => input && input.focus(), 60);
        };

        const closeBox = () => {
            box.classList.add("aswHidden");
            box.setAttribute("aria-hidden", "true");
            fab.setAttribute("aria-expanded", "false");
            if (fly) fly.style.display = "";
        };

        fab.addEventListener("click", () => {
            box.classList.contains("aswHidden") ? openBox() : closeBox();
        });
        close.addEventListener("click", closeBox);

        const addMsg = (role, text) => {
            const div = document.createElement("div");
            div.className = "aswMsg " + role;
            div.textContent = text;
            msgs.appendChild(div);
            msgs.scrollTop = msgs.scrollHeight;
        };

        // ✅ no "Merhaba..." auto message (we keep chat clean)
        // but first open can show a professional greeting ONCE if you want:
        let greeted = false;
        const ensureGreetingOnce = () => {
            if (greeted) return;
            greeted = true;
            addMsg("ai", "How can I help you today?");
        };

        const sendMsg = async () => {
            const text = (input.value || "").trim();
            if (!text) return;

            addMsg("user", text);
            input.value = "";

            const typing = document.createElement("div");
            typing.className = "aswMsg ai";
            typing.textContent = "…";
            msgs.appendChild(typing);
            msgs.scrollTop = msgs.scrollHeight;

            try {
                const r = await fetch(API_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ message: text }),
                });

                const data = await r.json().catch(() => ({}));
                typing.remove();

                if (!r.ok) return addMsg("ai", data.error || "Server error.");
                addMsg("ai", data.reply || "…");
            } catch (e) {
                typing.remove();
                addMsg("ai", "Network error.");
            }
        };

        send.addEventListener("click", sendMsg);
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") sendMsg();
        });

        // Show greeting when opened first time
        fab.addEventListener("click", () => {
            if (!box.classList.contains("aswHidden")) ensureGreetingOnce();
        });
    }
})();
