// /signal/profile.js
(() => {
    const $ = (q) => document.querySelector(q);
    const tabs = $("#tabs");
    const content = $("#content");

    const esc = (s="") => String(s).replace(/[&<>"']/g, (c) => ({
        "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));

    function getUser(){
        const name = (localStorage.getItem("sm_name") || "Hozan").trim();
        const surname = (localStorage.getItem("sm_surname") || "Bilaloglu").trim();
        const email = (localStorage.getItem("sm_email") || "—").trim();
        const plan = (localStorage.getItem("sm_plan") || "free").toLowerCase();
        return { fullName: `${name} ${surname}`.trim(), email, plan };
    }

    function setTab(tab){
        tabs.querySelectorAll(".tab").forEach(b=>{
            b.classList.toggle("isActive", b.dataset.tab === tab);
        });

        const u = getUser();

        if(tab === "account"){
            content.innerHTML = `
        <h3>Account</h3>
        <div class="row"><div class="k">Name</div><div class="v">${esc(u.fullName)}</div></div>
        <div class="row"><div class="k">Email</div><div class="v">${esc(u.email)}</div></div>
        <div class="row"><div class="k">Plan</div><div class="v">${esc(u.plan)}</div></div>
      `;
            return;
        }

        if(tab === "terms"){
            content.innerHTML = `
        <h3>Terms</h3>
        <p>Put your Terms text here (short version). Later you can link full legal page.</p>
      `;
            return;
        }

        if(tab === "how"){
            content.innerHTML = `
        <h3>How it works</h3>
        <p>Free: 10 messages/day, 1 image/day.</p>
        <p>Normal: 100 messages/day + better answers (finance only).</p>
        <p>Pro: unlimited messages + best answers + priority support.</p>
      `;
            return;
        }

        if(tab === "payments"){
            content.innerHTML = `
        <h3>Payment history</h3>
        <p>After Stripe webhook + Supabase, payment list will show here.</p>
        <div class="row"><div class="k">Last payment</div><div class="v">—</div></div>
        <div class="row"><div class="k">Status</div><div class="v">—</div></div>
      `;
            return;
        }

        if(tab === "help"){
            content.innerHTML = `
        <h3>Help</h3>
        <p>Support email: <strong>support@yourdomain.com</strong></p>
        <p>Common topics: login, limits, billing.</p>
      `;
            return;
        }

        if(tab === "cancel"){
            content.innerHTML = `
        <h3>Cancel subscription</h3>
        <p>This will open Stripe Customer Portal later (after payment system).</p>
        <button class="dangerBtn" id="portalBtn" type="button">Open cancel portal</button>
      `;
            document.getElementById("portalBtn")?.addEventListener("click", () => {
                alert("Stripe customer portal will be wired after Stripe setup.");
            });
            return;
        }
    }

    document.getElementById("backBtn")?.addEventListener("click", () => {
        location.href = "/signal/signal.html";
    });

    tabs.addEventListener("click", (e) => {
        const btn = e.target.closest(".tab");
        if(!btn) return;
        setTab(btn.dataset.tab);
    });

    setTab("account");
})();
