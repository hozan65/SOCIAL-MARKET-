// /assets1/cookie-consent.js
console.log("✅ cookie-consent.js loaded");

(function () {
    const consent = document.getElementById("smConsent");
    const prefs = document.getElementById("smPrefs");

    const btnAccept = document.getElementById("smConsentAccept");
    const btnReject = document.getElementById("smConsentReject");
    const btnManage = document.getElementById("smConsentManage");

    const prefAnalytics = document.getElementById("smPrefAnalytics");
    const prefMarketing = document.getElementById("smPrefMarketing");

    const prefsClose = document.getElementById("smPrefsClose");
    const prefsSave = document.getElementById("smPrefsSave");
    const prefsReject = document.getElementById("smPrefsReject");

    if (!consent || !btnAccept || !btnReject || !btnManage) {
        console.warn("❌ Cookie DOM missing. Check IDs or HTML placement.");
        return;
    }

    const KEY = "sm_cookie_consent_v1";

    function showBanner() {
        consent.hidden = false;
        // küçük animasyon için class
        requestAnimationFrame(() => consent.classList.add("show"));
    }

    function hideBanner() {
        consent.classList.remove("show");
        consent.hidden = true;
    }

    function openPrefs() {
        if (!prefs) return;
        prefs.hidden = false;
    }

    function closePrefs() {
        if (!prefs) return;
        prefs.hidden = true;
    }

    function save(value) {
        localStorage.setItem(KEY, JSON.stringify(value));
    }

    function load() {
        try {
            return JSON.parse(localStorage.getItem(KEY) || "null");
        } catch {
            return null;
        }
    }

    function acceptAll() {
        save({ necessary: true, analytics: true, marketing: true, ts: Date.now() });
        hideBanner();
        closePrefs();
    }

    function rejectAll() {
        save({ necessary: true, analytics: false, marketing: false, ts: Date.now() });
        hideBanner();
        closePrefs();
    }

    function savePrefs() {
        save({
            necessary: true,
            analytics: !!prefAnalytics?.checked,
            marketing: !!prefMarketing?.checked,
            ts: Date.now(),
        });
        hideBanner();
        closePrefs();
    }

    // events
    btnAccept.addEventListener("click", acceptAll);
    btnReject.addEventListener("click", rejectAll);
    btnManage.addEventListener("click", openPrefs);

    prefsClose?.addEventListener("click", closePrefs);
    prefsSave?.addEventListener("click", savePrefs);
    prefsReject?.addEventListener("click", rejectAll);

    // first load
    const existing = load();
    if (!existing) {
        showBanner();
    } else {
        // zaten seçim yapılmış => gösterme
        hideBanner();
    }
})();
