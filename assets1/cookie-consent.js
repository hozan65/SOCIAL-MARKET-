// /assets1/cookie-consent.js
(() => {
    const KEY = "sm_consent_v2"; // versioned key

    const banner = document.getElementById("smCookieBanner");
    const prefs = document.getElementById("smCookiePrefs");

    const btnAccept = document.getElementById("smCookieAccept");
    const btnReject = document.getElementById("smCookieReject");
    const btnManage = document.getElementById("smCookieManage");

    const swAnalytics = document.getElementById("smPrefAnalytics");
    const swMarketing = document.getElementById("smPrefMarketing");

    const btnSave = document.getElementById("smPrefsSave");
    const btnPrefsReject = document.getElementById("smPrefsReject");
    const btnBack = document.getElementById("smPrefsBack");

    if (!banner) return;

    function read() {
        try {
            const raw = localStorage.getItem(KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }

    function write(consent) {
        localStorage.setItem(KEY, JSON.stringify({
            necessary: true,
            analytics: !!consent.analytics,
            marketing: !!consent.marketing,
            ts: Date.now()
        }));
    }

    function showBanner() {
        banner.hidden = false;
        // allow CSS to apply before anim
        requestAnimationFrame(() => banner.classList.add("is-show"));
    }

    function hideBanner() {
        banner.classList.remove("is-show");
        setTimeout(() => { banner.hidden = true; }, 220);
    }

    function showPrefs() {
        prefs.hidden = false;
        requestAnimationFrame(() => prefs.classList.add("is-show"));
    }

    function hidePrefs() {
        prefs.classList.remove("is-show");
        setTimeout(() => { prefs.hidden = true; }, 220);
    }

    // ✅ Here is where you would conditionally load scripts (GA/Pixel) later.
    function apply(consent) {
        // Example:
        // if (consent.analytics) loadGoogleAnalytics();
        // if (consent.marketing) loadMetaPixel();
    }

    // INIT
    const existing = read();
    if (!existing) {
        showBanner();
    } else {
        apply(existing);
    }

    // Accept All
    btnAccept?.addEventListener("click", () => {
        const c = { analytics: true, marketing: true };
        write(c);
        apply({ necessary: true, ...c });
        hideBanner();
        hidePrefs();
    });

    // Reject All (banner)
    btnReject?.addEventListener("click", () => {
        const c = { analytics: false, marketing: false };
        write(c);
        apply({ necessary: true, ...c });
        hideBanner();
        hidePrefs();
    });

    // Manage -> open prefs with current values
    btnManage?.addEventListener("click", () => {
        const cur = read();
        if (swAnalytics) swAnalytics.checked = !!cur?.analytics;
        if (swMarketing) swMarketing.checked = !!cur?.marketing;
        showPrefs();
    });

    // Save prefs
    btnSave?.addEventListener("click", () => {
        const c = {
            analytics: !!swAnalytics?.checked,
            marketing: !!swMarketing?.checked
        };
        write(c);
        apply({ necessary: true, ...c });
        hidePrefs();
        hideBanner(); // karar verdi -> banner kapanır
    });

    // Reject in prefs
    btnPrefsReject?.addEventListener("click", () => {
        const c = { analytics: false, marketing: false };
        write(c);
        apply({ necessary: true, ...c });
        hidePrefs();
        hideBanner();
    });

    // Back (prefs -> banner)
    btnBack?.addEventListener("click", () => {
        hidePrefs();
        // banner açık kalsın (kullanıcı karar vermedi)
        if (!read()) showBanner();
    });

    // click outside to close prefs? SoundCloud genelde kapatmıyor.
    // Biz kapatmıyoruz. Sadece Back/Save/Reject ile kapanır.
})();
