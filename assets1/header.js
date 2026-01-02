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


// ===============================
// ✅ AI SUPPORT WIDGET - site wide inject
// ===============================
(function injectSupportWidget(){
    if (window.__ASW_INJECTED__) return;
    window.__ASW_INJECTED__ = true;

    // CSS + HTML + JS'yi tek seferde sayfaya basar
    const css = `
  #aswBtn{position:fixed;right:5px;bottom:5px;width:56px;height:56px;border-radius:999px;display:grid;place-items:center;font-size:22px;cursor:pointer;user-select:none;z-index:999999;background:rgba(255,255,255,.92);border:1px solid rgba(0,0,0,.12);box-shadow:0 10px 28px rgba(0,0,0,.18);backdrop-filter:blur(10px)}
  #aswBox{position:fixed;right:5px;bottom:70px;width:min(360px,calc(100vw - 10px));height:520px;border-radius:16px;background:rgba(255,255,255,.94);border:1px solid rgba(0,0,0,.12);box-shadow:0 18px 40px rgba(0,0,0,.22);backdrop-filter:blur(12px);z-index:999999;display:flex;flex-direction:column;overflow:hidden}
  .aswHidden{display:none}
  .aswTop{display:flex;align-items:center;justify-content:space-between;padding:12px 12px 8px;border-bottom:1px solid rgba(0,0,0,.08)}
  .aswTitle{font-weight:900;letter-spacing:.2px}
  .aswClose{border:0;background:transparent;cursor:pointer;font-size:16px;opacity:.7}
  .aswClose:hover{opacity:1}
  #aswMsgs{flex:1;padding:12px;overflow:auto}
  .aswMsg{max-width:85%;padding:10px 12px;border-radius:14px;margin:0 0 10px;line-height:1.25;font-size:14px;white-space:pre-wrap;word-wrap:break-word}
  .aswMsg.user{margin-left:auto;background:rgba(0,0,0,.07);border:1px solid rgba(0,0,0,.08)}
  .aswMsg.ai{margin-right:auto;background:rgba(255,255,255,.9);border:1px solid rgba(0,0,0,.10)}
  .aswInputRow{display:flex;gap:8px;padding:10px 12px;border-top:1px solid rgba(0,0,0,.08)}
  #aswInput{flex:1;padding:10px 12px;border-radius:12px;border:1px solid rgba(0,0,0,.15);outline:none}
  #aswSend{padding:10px 14px;border-radius:12px;border:1px solid rgba(0,0,0,.15);background:rgba(255,255,255,.9);font-weight:900;cursor:pointer}
  #aswHint{padding:0 12px 12px;font-size:12px;opacity:.65}
  @media (max-width:480px){#aswBox{height:70vh;width:calc(100vw - 10px)}}
  `;

    if (!document.getElementById("aswStyle")) {
        const st = document.createElement("style");
        st.id = "aswStyle";
        st.textContent = css;
        document.head.appendChild(st);
    }

    if (!document.getElementById("aswBtn")) {
        document.body.insertAdjacentHTML("beforeend", `
      <div id="aswBtn" role="button" aria-label="Open support chat" aria-expanded="false">💬</div>
      <div id="aswBox" class="aswHidden" aria-hidden="true">
        <div class="aswTop">
          <div class="aswTitle">Support</div>
          <button id="aswClose" class="aswClose" type="button" aria-label="Close">✕</button>
        </div>
        <div id="aswMsgs"></div>
        <div class="aswInputRow">
          <input id="aswInput" placeholder="Sorununu yaz..." autocomplete="off" />
          <button id="aswSend" type="button">Send</button>
        </div>
        <div id="aswHint">AI destek • aynı dilde cevap</div>
      </div>
    `);

        const API_URL = "/.netlify/functions/ai_support";
        const btn = document.getElementById("aswBtn");
        const box = document.getElementById("aswBox");
        const close = document.getElementById("aswClose");
        const msgs = document.getElementById("aswMsgs");
        const input = document.getElementById("aswInput");
        const send = document.getElementById("aswSend");

        const openBox = () => { box.classList.remove("aswHidden"); box.setAttribute("aria-hidden","false"); btn.setAttribute("aria-expanded","true"); setTimeout(()=>input.focus(), 50); };
        const closeBox = () => { box.classList.add("aswHidden"); box.setAttribute("aria-hidden","true"); btn.setAttribute("aria-expanded","false"); };

        btn.addEventListener("click", () => box.classList.contains("aswHidden") ? openBox() : closeBox());
        close.addEventListener("click", closeBox);

        const addMsg = (role, text) => {
            const d = document.createElement("div");
            d.className = "aswMsg " + role;
            d.textContent = text;
            msgs.appendChild(d);
            msgs.scrollTop = msgs.scrollHeight;
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
                    headers: { "Content-Type":"application/json" },
                    body: JSON.stringify({ message: text })
                });

                const data = await r.json().catch(() => ({}));
                typing.remove();

                if (!r.ok) return addMsg("ai", data.error || "Server error.");
                addMsg("ai", data.reply || "No reply.");
            } catch (e) {
                typing.remove();
                addMsg("ai", "Network error.");
            }
        };

        send.addEventListener("click", sendMsg);
        input.addEventListener("keydown", (e)=>{ if (e.key === "Enter") sendMsg(); });

        addMsg("ai", "Merhaba! Support için yazabilirsin. (Türkçe / English)");
    }
})();
