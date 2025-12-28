console.log("✅ cookie-consent.js loaded");

(() => {
    const banner = document.getElementById("smConsent");
    const prefs = document.getElementById("smPrefs");

    const acceptBtn = document.getElementById("smConsentAccept");
    const rejectBtn = document.getElementById("smConsentReject");
    const manageBtn = document.getElementById("smConsentManage");

    const prefAnalytics = document.getElementById("smPrefAnalytics");
    const prefMarketing = document.getElementById("smPrefMarketing");

    const prefsSave = document.getElementById("smPrefsSave");
    const prefsReject = document.getElementById("smPrefsReject");

    const KEY = "sm_cookie_consent_v1";

    if (!banner || !acceptBtn || !rejectBtn || !manageBtn) {
        console.warn("❌ cookie DOM missing (check IDs / placement in body)");
        return;
    }

    const load = () => {
        try { return JSON.parse(localStorage.getItem(KEY) || "null"); }
        catch { return null; }
    };

    const save = (obj) => localStorage.setItem(KEY, JSON.stringify(obj));

    const showBanner = () => {
        banner.hidden = false;
        requestAnimationFrame(() => banner.classList.add("show"));
    };

    const hideBanner = () => {
        banner.classList.remove("show");
        banner.hidden = true;
    };

    const openPrefs = () => { if (prefs) prefs.hidden = false; };
    const closePrefs = () => { if (prefs) prefs.hidden = true; };

    const acceptAll = () => {
        save({ necessary:true, analytics:true, marketing:true, ts:Date.now() });
        hideBanner();
        closePrefs();
    };

    const rejectAll = () => {
        save({ necessary:true, analytics:false, marketing:false, ts:Date.now() });
        hideBanner();
        closePrefs();
    };

    const savePrefs = () => {
        save({
            necessary:true,
            analytics: !!prefAnalytics?.checked,
            marketing: !!prefMarketing?.checked,
            ts: Date.now()
        });
        hideBanner();
        closePrefs();
    };

    acceptBtn.addEventListener("click", acceptAll);
    rejectBtn.addEventListener("click", rejectAll);
    manageBtn.addEventListener("click", openPrefs);
    prefsSave?.addEventListener("click", savePrefs);
    prefsReject?.addEventListener("click", rejectAll);

    // modal dışına tıklayınca kapansın (x yok dedin)
    prefs?.addEventListener("click", (e) => {
        if (e.target === prefs) closePrefs();
    });

    // first run
    const existing = load();
    if (!existing) showBanner();
})();
