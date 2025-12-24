// assets1/econ-calendar.js
console.log("✅ econ-calendar.js loaded");

(() => {
    // feed.html'de tbody id'si
    const body = document.getElementById("econBody");
    const msg = document.getElementById("econMsg");

    if (!body) {
        console.warn("econBody not found");
        return;
    }

    const esc = (s) =>
        String(s ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");

    const impactBadge = (impact) => {
        const v = String(impact || "").toLowerCase();
        if (v.includes("high")) return `<span class="impact high">HIGH</span>`;
        if (v.includes("medium")) return `<span class="impact medium">MED</span>`;
        if (v.includes("low")) return `<span class="impact low">LOW</span>`;
        return `<span class="impact">—</span>`;
    };

    async function loadCalendar() {
        try {
            if (msg) msg.textContent = "Loading calendar...";
            const r = await fetch("/.netlify/functions/econ_calendar?limit=60", { cache: "no-store" });
            const j = await r.json();

            if (!j.ok) throw new Error(j.error || "Calendar error");

            body.innerHTML = j.data
                .map(
                    (e) => `
          <tr>
            <td>${esc(e.date || "-")}</td>
            <td>${esc(e.currency || "-")}</td>
            <td class="eventCell">${esc(e.event || "-")}</td>
            <td>${impactBadge(e.impact)}</td>
            <td>${esc(e.actual ?? "-")}</td>
            <td>${esc(e.forecast ?? "-")}</td>
            <td>${esc(e.previous ?? "-")}</td>
          </tr>
        `
                )
                .join("");

            if (msg) msg.textContent = "";
        } catch (err) {
            console.error("❌ Econ calendar error:", err);
            if (msg) msg.textContent = "Calendar unavailable (API/Key/Network).";
            body.innerHTML = `<tr><td colspan="7">Calendar unavailable</td></tr>`;
        }
    }

    loadCalendar();
    // İstersen otomatik yenileme:
    // setInterval(loadCalendar, 5 * 60 * 1000);
})();
