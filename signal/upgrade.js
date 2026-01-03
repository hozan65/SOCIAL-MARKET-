// /signal/upgrade.js
(() => {
    // ✅ Paddle function endpoint (dosya adı = endpoint adı)
    const FN_CHECKOUT = "/.netlify/functions/paddle_create_checkout";
    const $ = (q) => document.querySelector(q);

    const userId = () => localStorage.getItem("sm_uid") || "demo_user";

    async function startCheckout(plan) {
        try {
            // küçük loading (opsiyonel)
            const btn = document.querySelector(`[data-plan="${plan}"]`);
            const oldText = btn?.textContent;
            if (btn) {
                btn.disabled = true;
                btn.textContent = "Opening...";
            }

            const res = await fetch(FN_CHECKOUT, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-user-id": userId(),
                },
                body: JSON.stringify({ plan }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                alert(data?.error || `HTTP ${res.status}`);
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = oldText || "Buy now";
                }
                return;
            }

            if (!data?.url) {
                alert("Missing checkout url");
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = oldText || "Buy now";
                }
                return;
            }

            // ✅ Paddle checkout redirect
            location.href = data.url;
        } catch (e) {
            alert("Network error");
            console.error(e);
        }
    }

    // Plan buttons: data-plan="normal" / "pro"
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
