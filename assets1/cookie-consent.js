// /assets1/cookie-consent.js
(() => {
    const KEY = "sm_consent_v1";

    const $consent = document.getElementById("smConsent");
    const $prefs = document.getElementById("smPrefs");

    const $accept = document.getElementById("smConsentAccept");
    const $reject = document.getElementById("smConsentReject");
    const $manage = document.getElementById("smConsentManage");

    const $prefsClose = document.getElementById("smPrefsClose");
    const $prefsSave = document.getElementById("smPrefsSave");
    const $prefsReject = document.getElementById("smPrefsReject");

    const $analytics = document.getElementById("smPrefAnalytics");
    const $marketing = document.getElementById("smPrefMarketing");

    if (!$consent) return;

    function read() {
        try {
            const raw = localStorage.getItem(KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }

    function write(obj) {
        localStorage.setItem(KEY, JSON.stringify({
            ...obj,
            ts: Date.now()
        }));
    }

    function hideConsent() {
        $consent.hidden = true;
    }

    function showConsent() {
        $consent.hidden = false;
    }

    function openPrefs() {
        // load current values
        const cur = read();
        $analytics.checked = !!cur?.analytics;
        $marketing.checked = !!cur?.marketing;

        $prefs.hidden = false;
    }

    function closePrefs() {
        $prefs.hidden = true;
    }

    // ✅ Script gating (buraya GA / Pixel eklersin)
    function apply(consent) {
        // örnek: sadece analytics true ise analytics script yükle
        // if (consent?.analytics) loadGoogleAnalytics();
        // if (consent?.marketing) loadPixel();
        // reject => hiçbirini yükleme
    }

    // Init
    const existing = read();
    if (!existing) {
        showConsent();
    } else {
        hideConsent();
        apply(existing);
    }

    // Accept All
    $accept?.addEventListener("click", () => {
        const c = { necessary: true, analytics: true, marketing: true };
        write(c);
        hideConsent();
        apply(c);
    });

    // Reject All
    $reject?.addEventListener("click", () => {
        const c = { necessary: true, analytics: false, marketing: false };
        write(c);
        hideConsent();
        apply(c);
    });

    // Manage Preferences
    $manage?.addEventListener("click", () => openPrefs());

    // Prefs close
    $prefsClose?.addEventListener("click", closePrefs);
    $prefs?.addEventListener("click", (e) => {
        if (e.target === $prefs) closePrefs();
    });

    // Prefs save
    $prefsSave?.addEventListener("click", () => {
        const c = {
            necessary: true,
            analytics: !!$analytics.checked,
            marketing: !!$marketing.checked
        };
        write(c);
        hideConsent();
        closePrefs();
        apply(c);
    });

    // Prefs reject
    $prefsReject?.addEventListener("click", () => {
        const c = { necessary: true, analytics: false, marketing: false };
        write(c);
        hideConsent();
        closePrefs();
        apply(c);
    });
})();
