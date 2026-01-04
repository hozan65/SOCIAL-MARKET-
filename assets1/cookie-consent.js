console.log("✅ cookie-consent.js loaded (SkySports-like)");

(() => {
    const KEY = "sm_cookie_consent_v2";

    const overlay = document.getElementById("smCookieOverlay");
    const bar = document.getElementById("smCookieBar");

    const btnAccept = document.getElementById("smCookieAccept");
    const btnReject = document.getElementById("smCookieReject");
    const btnNecessary = document.getElementById("smCookieNecessary");

    if (!overlay || !bar || !btnAccept || !btnReject || !btnNecessary) {
        console.warn(" Cookie bar DOM missing. Check IDs + placement inside <body>.");
        return;
    }

    const load = () => {
        try { return JSON.parse(localStorage.getItem(KEY) || "null"); }
        catch { return null; }
    };

    const save = (obj) => {
        localStorage.setItem(KEY, JSON.stringify({ ...obj, ts: Date.now() }));
    };

    const show = () => {
        overlay.hidden = false;
        bar.hidden = false;

        requestAnimationFrame(() => {
            overlay.style.opacity = "1";
            bar.classList.add("show");
        });
    };

    const hide = () => {
        bar.classList.remove("show");
        overlay.hidden = true;
        bar.hidden = true;
    };


    function showCookieBar(){
        document.body.classList.add("smCookiePending");
        document.body.classList.remove("smCookieDone");
        // mevcut show kodların (bar.hidden=false, bar.classList.add("show") vs) aynen kalsın
    }

    function doneCookieBar(){
        document.body.classList.remove("smCookiePending");
        document.body.classList.add("smCookieDone");
        // mevcut hide kodların aynen kalsın
    }

    // Already decided?
    if (!load()) show();

    btnAccept.addEventListener("click", () => {
        save({ necessary: true, analytics: true, marketing: true });
        hide();
    });

    btnReject.addEventListener("click", () => {
        save({ necessary: true, analytics: false, marketing: false });
        hide();
    });

    btnNecessary.addEventListener("click", () => {
        save({ necessary: true, analytics: false, marketing: false });
        hide();
    });
})();

