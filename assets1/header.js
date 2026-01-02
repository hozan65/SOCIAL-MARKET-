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
   AI SUPPORT WIDGET – FINAL PRO VERSION
   Single source: /assets1/header.js
========================================================= */
(function () {
    if (window.__ASW_INJECTED__) return;
    window.__ASW_INJECTED__ = true;

    const API_URL = "/.netlify/functions/ai_support";
    const SUPPORT_ICON_URL = "/assets1/img/support.png"; // ikon yoksa fallback var

    const FALLBACK_ICON =
        "data:image/svg+xml;utf8," +
        encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="30" fill="#fff" stroke="#ddd" stroke-width="2"/>
        <circle cx="24" cy="28" r="2" fill="#333"/>
        <circle cx="40" cy="28" r="2" fill="#333"/>
        <path d="M20 40c3-4 21-4 24 0" stroke="#333" stroke-width="3" fill="none"/>
      </svg>
    `);

    const TELEGRAM_ICON =
        "data:image/svg+xml;utf8," +
        encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        <path d="M21.8 3.2L2.7 10.8c-1.2.5-1.2 1.2-.2 1.5l4.9 1.5 11.4-7.2c.5-.3 1-.1.6.3l-9.3 8.4-.3 5.1c.4 0 .6-.2.8-.4l2.2-2.2 4.6 3.4c.6.3 1.4.3 1.6-.6l3.3-16.1c.1-.4.1-.9-.3-1.1z"
              fill="rgba(0,0,0,.8)"/>
      </svg>
    `);

    /* ================= CSS ================= */
    const css = `
#aswFab,#aswBox,#aswFlyWrap{z-index:2147483647}

#aswFab{
  position:fixed;right:12px;bottom:12px;
  width:54px;height:54px;border-radius:999px;
  background:#fff;border:1px solid rgba(0,0,0,.12);
  box-shadow:0 10px 28px rgba(0,0,0,.18);
  display:grid;place-items:center;cursor:pointer
}
#aswFab img{width:100%;height:100%;border-radius:999px;object-fit:cover}

#aswFlyWrap{
  position:fixed;right:12px;bottom:78px;
  display:flex;flex-direction:column;gap:8px;
  pointer-events:none
}
.aswFly{
  font-size:12px;font-weight:800;
  padding:7px 10px;border-radius:999px;
  background:#fff;border:1px solid rgba(0,0,0,.1);
  animation:fly 7s linear infinite;
  opacity:0
}
.aswFly:nth-child(2){animation-delay:3.5s}
@keyframes fly{
  0%{opacity:0;transform:translateY(10px)}
  10%{opacity:1}
  70%{opacity:1;transform:translateY(-20px)}
  100%{opacity:0;transform:translateY(-40px)}
}

#aswBox{
  position:fixed;right:12px;bottom:78px;
  width:380px;max-width:calc(100vw - 24px);
  height:560px;background:#fff;border-radius:18px;
  border:1px solid rgba(0,0,0,.12);
  box-shadow:0 18px 40px rgba(0,0,0,.22);
  display:flex;flex-direction:column
}
.aswHidden{display:none}

.aswTop{
  display:flex;align-items:center;justify-content:space-between;
  padding:12px;border-bottom:1px solid rgba(0,0,0,.08)
}
.aswLogo{display:flex;gap:10px;align-items:center}
.aswLogo img{width:30px;height:30px;border-radius:999px}
.aswTitle{font-weight:900}
.aswClose{border:0;background:none;font-size:18px;cursor:pointer}

#aswMsgs{flex:1;padding:12px;overflow:auto}
.aswMsg{max-width:85%;padding:10px 12px;border-radius:14px;margin-bottom:10px}
.aswMsg.user{margin-left:auto;background:#f1f1f1}
.aswMsg.ai{background:#fff;border:1px solid #eee}

.aswBottom{padding:10px;border-top:1px solid #eee}
.aswRow{display:flex;gap:8px}
#aswInput{flex:1;padding:10px;border-radius:12px;border:1px solid #ddd}
#aswSend{
  width:44px;height:44px;border-radius:12px;
  border:1px solid #ddd;background:#fff;
  display:grid;place-items:center;cursor:pointer
}
#aswSend img{width:20px;height:20px}
.aswFooter{font-size:12px;opacity:.6;margin-top:6px}
`;

    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    /* ================= HTML ================= */
    document.body.insertAdjacentHTML(
        "beforeend",
        `
<div id="aswFlyWrap">
  <div class="aswFly">Hello sir</div>
  <div class="aswFly">How can I help you?</div>
</div>

<div id="aswFab"><img id="aswFabImg"/></div>

<div id="aswBox" class="aswHidden">
  <div class="aswTop">
    <div class="aswLogo">
      <img id="aswMiniLogo"/>
      <div>
        <div class="aswTitle">Support</div>
        <div style="font-size:12px;opacity:.6">Social Market</div>
      </div>
    </div>
    <button class="aswClose" id="aswClose">✕</button>
  </div>

  <div id="aswMsgs"></div>

  <div class="aswBottom">
    <div class="aswRow">
      <input id="aswInput" placeholder="Write a message..."/>
      <button id="aswSend"><img src="${TELEGRAM_ICON}"/></button>
    </div>
    <div class="aswFooter">@SocialMarket-AI support</div>
  </div>
</div>
`
    );

    const fab = document.getElementById("aswFab");
    const box = document.getElementById("aswBox");
    const close = document.getElementById("aswClose");
    const msgs = document.getElementById("aswMsgs");
    const input = document.getElementById("aswInput");
    const send = document.getElementById("aswSend");
    const fly = document.getElementById("aswFlyWrap");

    const fabImg = document.getElementById("aswFabImg");
    const miniLogo = document.getElementById("aswMiniLogo");

    const setIcon = (img) => {
        img.src = SUPPORT_ICON_URL;
        img.onerror = () => (img.src = FALLBACK_ICON);
    };
    setIcon(fabImg);
    setIcon(miniLogo);

    const openBox = () => {
        box.classList.remove("aswHidden");
        fly.style.display = "none";
        input.focus();
        if (!msgs.hasChildNodes())
            addMsg("ai", "How can I help you?");
    };

    const closeBox = () => {
        box.classList.add("aswHidden");
        fly.style.display = "";
    };

    // FORCE CLOSED ON LOAD
    closeBox();

    fab.onclick = (e) => {
        e.stopPropagation();
        box.classList.contains("aswHidden") ? openBox() : closeBox();
    };
    close.onclick = closeBox;
    miniLogo.onclick = closeBox;

    function addMsg(role, text) {
        const d = document.createElement("div");
        d.className = "aswMsg " + role;
        d.textContent = text;
        msgs.appendChild(d);
        msgs.scrollTop = msgs.scrollHeight;
    }

    async function sendMsg() {
        const t = input.value.trim();
        if (!t) return;
        addMsg("user", t);
        input.value = "";

        try {
            const r = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: t }),
            });
            const j = await r.json();
            addMsg("ai", j.reply || "...");
        } catch {
            addMsg("ai", "Network error");
        }
    }

    send.onclick = sendMsg;
    input.onkeydown = (e) => e.key === "Enter" && sendMsg();
})();
