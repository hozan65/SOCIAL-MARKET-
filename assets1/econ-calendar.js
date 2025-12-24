console.log("✅ econ-calendar.js loaded");

(() => {
    const body = document.getElementById("econBody");
    const msg = document.getElementById("econMsg");
    if (!body) return;

    const esc = (s) =>
        String(s ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");

    const impactBadge = (impact) => {
        const v = String(impact || "").toLowerCase();
        if (v.includes("high")) return `<span class="impactBadge impactHigh">HIGH</span>`;
        if (v.includes("medium") || v.includes("med")) return `<span class="impactBadge impactMed">MED</span>`;
        if (v.includes("low")) return `<span class="impactBadge impactLow">LOW</span>`;
        return `<span class="impactBadge">—</span>`;
    };

    const renderRows = (rows) => {
        body.innerHTML = rows.map((e) => `
      <tr>
        <td>${esc(e.date || "-")}</td>
        <td>${esc(e.currency || "-")}</td>
        <td class="eventCell">${esc(e.event || "-")}</td>
        <td>${impactBadge(e.impact)}</td>
        <td>${esc(e.actual ?? "-")}</td>
        <td>${esc(e.forecast ?? "-")}</td>
        <td>${esc(e.previous ?? "-")}</td>
      </tr>
    `).join("");
    };

    // DEMO / PREVIEW DATA (API çalışmazsa site boş kalmasın)
    const demo = [
        { date: "Today 16:30", currency: "USD", event: "CPI (YoY)", impact: "high", actual: "-", forecast: "-", previous: "-" },
        { date: "Today 18:00", currency: "USD", event: "FOMC Statement", impact: "high", actual: "-", forecast: "-", previous: "-" },
        { date: "Tomorrow 10:00", currency: "EUR", event: "GDP (QoQ)", impact: "medium", actual: "-", forecast: "-", previous: "-" },
        { date: "Tomorrow 12:00", currency: "GBP", event: "Retail Sales (MoM)", impact: "low", actual: "-", forecast: "-", previous: "-" },
    ];

    async function loadCalendar() {
        try {
            if (msg) msg.textContent = "Loading calendar...";
            const r = await fetch("/.netlify/functions/econ_calendar?limit=60", { cache: "no-store" });
            const j = await r.json();
            if (!j.ok) throw new Error(j.error || "Calendar error");

            renderRows(j.data || []);
            if (msg) msg.textContent = "";
        } catch (err) {
            console.warn("⚠️ Calendar fallback:", err);
            // API yoksa demo göster
            renderRows(demo);
            if (msg) msg.textContent = "Preview mode (data source not connected).";
        }
    }

    loadCalendar();
})();
