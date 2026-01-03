// /signal/upgrade.js
(() => {
    const FN_CHECKOUT = "/.netlify/functions/paddle_create_checkout";
    const FN_GET_PLAN = "/.netlify/functions/get_my_plan"; // ✅ bunu backend'de ekleyeceğiz

    const $all = (q) => Array.from(document.querySelectorAll(q));
    const $ = (q) => document.querySelector(q);

    // ⚠️ demo_user kaldır. sm_uid yoksa user yok demektir.
    const userId = () => localStorage.getItem("sm_uid");

    // UI helpers
    function setButtonState(btn, { current = false, label = "" } = {}) {
        if (!btn) return;
        if (!btn.dataset.label) btn.dataset.label = btn.textContent.trim();
        const baseLabel = label || btn.dataset.label;

        if (current) {
            btn.disabled = true;
            btn.classList.add("isDisabled");
            btn.textContent = "Current plan";
            btn.closest(".uCard")?.classList.add("isCurrent");
        } else {
            btn.disabled = false;
            btn.classList.remove("isDisabled");
            btn.textContent = baseLabel;
            btn.closest(".uCard")?.classList.remove("isCurrent");
        }
    }

    function normalizePlan(p) {
        const plan = String(p || "").toLowerCase();
        // backend'den normal/pro/free gelebilir → UI go/plus/pro
        if (plan === "normal") return "plus";
        if (plan === "plus") return "plus";
        if (plan === "pro") return "pro";
        return "go";
    }

    // ✅ Page load: current plan fetch + apply
    async function loadAndApplyCurrentPlan() {
        const uid = userId();
        if (!uid) {
            // user yoksa sadece Go current gibi göstermek istersen:
            // setCurrent("go");
            // ama daha doğru: login olmadan upgrade yok.
            console.warn("No sm_uid found. User not logged in.");
            return;
        }

        // reset all buttons
        const btns = {
            go: $(`[data-plan="go"]`),
            plus: $(`[data-plan="plus"]`),
            pro: $(`[data-plan="pro"]`)
        };

        Object.entries(btns).forEach(([key, btn]) => {
            setButtonState(btn, { current: false, label: btn?.dataset?.label || btn?.textContent || "" });
        });

        try {
            const res = await fetch(FN_GET_PLAN, {
                headers: { "x-user-id": uid }
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                console.warn("get_my_plan failed:", data?.error || res.status);
                return;
            }

            const current = normalizePlan(data?.plan);

            // apply current
            setButtonState(btns[current], { current: true });
        } catch (e) {
            console.error("loadAndApplyCurrentPlan error:", e);
        }
    }

    // ✅ Checkout
    async function startCheckout(uiPlan) {
        const uid = userId();
        if (!uid) {
            alert("Please log in first.");
            location.href = "/auth/login.html";
            return;
        }

        // UI plan → backend plan mapping
        // UI: plus → backend: normal
        // UI: pro → backend: pro
        // UI: go → no checkout (free)
        const plan = uiPlan === "plus" ? "normal" : uiPlan;

        if (plan !== "normal" && plan !== "pro") return;

        const btn = document.querySelector(`[data-plan="${uiPlan}"]`);
        const oldText = btn?.textContent;

        try {
            if (btn) {
                btn.disabled = true;
                btn.textContent = "Opening...";
            }

            const res = await fetch(FN_CHECKOUT, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-user-id": uid
                },
                body: JSON.stringify({ plan })
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                alert(data?.error || `HTTP ${res.status}`);
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = oldText || btn.dataset.label || "Buy";
                }
                return;
            }

            if (!data?.url) {
                alert("Missing checkout url");
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = oldText || btn.dataset.label || "Buy";
                }
                return;
            }

            location.href = data.url;
        } catch (e) {
            alert("Network error");
            console.error(e);
            if (btn) {
                btn.disabled = false;
                btn.textContent = oldText || btn.dataset.label || "Buy";
            }
        }
    }

    // Buttons
    $all("[data-plan]").forEach((btn) => {
        if (!btn.dataset.label) btn.dataset.label = btn.textContent.trim();

        btn.addEventListener("click", () => {
            const uiPlan = String(btn.getAttribute("data-plan") || "").toLowerCase();
            if (uiPlan === "go") return; // free
            startCheckout(uiPlan);
        });
    });

    // Back button (ID varsa)
    $("#btnBack")?.addEventListener("click", () => {
        location.href = "/signal/signal.html";
    });

    // init
    document.addEventListener("DOMContentLoaded", loadAndApplyCurrentPlan);
})();
