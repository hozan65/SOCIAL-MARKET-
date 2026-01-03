// /signal/upgrade.js
(() => {
    document.getElementById("backBtn")?.addEventListener("click", () => {
        location.href = "/signal/signal.html";
    });

    document.querySelectorAll("[data-plan]").forEach(btn => {
        btn.addEventListener("click", () => {
            const plan = btn.dataset.plan;
            if(!plan || plan === "free") return;

            alert(`Checkout will open for: ${plan} (Stripe next)`);
            // later:
            // fetch("/.netlify/functions/create_checkout", ...)
        });
    });
})();
