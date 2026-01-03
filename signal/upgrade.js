// /signal/upgrade.js
(() => {
    const FN_CHECKOUT = "/.netlify/functions/create_checkout";
    const $ = (q) => document.querySelector(q);

    const userId = () => localStorage.getItem("sm_uid") || "demo_user";

    async function startCheckout(plan) {
        const res = await fetch(FN_CHECKOUT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-user-id": userId(),
            },
            body: JSON.stringify({ plan }),
        }).catch(() => null);

        if (!res) {
            alert("Network error");
            return;
        }

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            alert(data?.error || `HTTP ${res.status}`);
            return;
        }

        if (!data?.url) {
            alert("Missing checkout url");
            return;
        }

        location.href = data.url; // Stripe Checkout redirect :contentReference[oaicite:6]{index=6}
    }

    // Plan buttons: add data-plan="normal" / "pro"
    document.querySelectorAll("[data-plan]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const plan = String(btn.getAttribute("data-plan") || "").toLowerCase();
            if (plan === "normal" || plan === "pro") startCheckout(plan);
        });
    });

    // Back
    const back = $("#btnBack");
    back?.addEventListener("click", () => (location.href = "/signal/signal.html"));
})();
