// /assets/cookie-consent.js
console.log("✅ cookie-consent.js loaded");

(() => {
    const KEY = "sm_cookie_consent_v2";

    const overlay = document.getElementById("smCookieOverlay");
    const bar = document.getElementById("smCookieBar");
    const btnAccept = document.getElementById("smCookieAccept");
    const btnReject = document.getElementById("smCookieReject");
    const btnNecessary = document.getElementById("smCookieNecessary");

    if (!overlay || !bar || !btnAccept || !btnReject || !btnNecessary) {
        console.warn("⚠ Cookie bar DOM missing (IDs). Skipping.");
        return;
    }

    const load = () => {
        try { return JSON.parse(localStorage.getItem(KEY) || "null"); }
        catch { return null; }
    };

    const save = (obj) => {
        localStorage.setItem(KEY, JSON.stringify({ ...obj, ts: Date.now() }));
    };

    function showCookieBar() {
        document.body.classList.add("smCookiePending");
        document.body.classList.remove("smCookieDone");
    }

    function doneCookieBar() {
        document.body.classList.remove("smCookiePending");
        document.body.classList.add("smCookieDone");
    }

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    const show = () => {
        showCookieBar();
        overlay.hidden = false;
        bar.hidden = false;

        if (reduced) {
            overlay.style.opacity = "1";
            bar.classList.add("show");
            return;
        }

        requestAnimationFrame(() => {
            overlay.style.opacity = "1";
            bar.classList.add("show");
        });
    };

    const hide = () => {
        // fade-out
        bar.classList.remove("show");
        overlay.style.opacity = "0";

        if (reduced) {
            overlay.hidden = true;
            bar.hidden = true;
            doneCookieBar();
            return;
        }

        // after transition
        setTimeout(() => {
            overlay.hidden = true;
            bar.hidden = true;
            doneCookieBar();
        }, 220); // CSS transition sürenle aynı yap (200-250ms)
    };

    // Already decided?
    const existing = load();
    if (!existing) show();
    else doneCookieBar();

    btnAccept.addEventListener("click", () => {
        save({ necessary: true, analytics: true, marketing: true });
        hide();
    });

    const rejectAllButNecessary = () => {
        save({ necessary: true, analytics: false, marketing: false });
        hide();
    };

    btnReject.addEventListener("click", rejectAllButNecessary);
    btnNecessary.addEventListener("click", rejectAllButNecessary);
})();
