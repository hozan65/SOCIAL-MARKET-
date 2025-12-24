// assets1/econ-calendar.js
console.log("✅ econ-calendar.js loaded");

(() => {
    const root = document.getElementById("econCalendar");
    if (!root) return;

    const ENDPOINT = "/.netlify/functions/econ_calendar?days=7";

    const esc = (s) =>
        String(s ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");

    const fmtTime = (iso) => {
        try {
            const d = new Date(iso);
            return d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
        } catch {
            return "";
        }
    };

    function impactDot(v) {
        const s = String(v || "").toLowerCase();
        if (s.includes("high")) return "🔴";
        if (s.includes("medium")) return "🟠";
        if (s.includes("low")) return "🟢";
        return "⚪";
    }

    function renderLoading() {
        root.innerHTML = `<div class="news-loading">Calendar loading...</div>`;
    }

    function render(items) {
        if (!items.length) {
            root.innerHTML = `<div class="news-loading">No events.</div>`;
            return;
        }

        root.innerHTML = `
      <div class="calHead">
        <div class="calTitle">📅 Economic Calendar</div>
      </div>

      <div class="calList">
        ${items
            .map(
                (x) => `
          <div class="calRow">
            <div class="calLeft">
              <div class="calTime">${esc(fmtTime(x.date))}</div>
              <div class="calMeta">${esc(x.country)} • ${esc(x.currency)} • ${impactDot(x.importance)} ${esc(x.importance)}</div>
              <div class="calEvent">${esc(x.event)}</div>
            </div>
            <div class="calRight">
              <div class="calVal"><span>Actual</span><b>${esc(x.actual)}</b></div>
              <div class="calVal"><span>Forecast</span><b>${esc(x.forecast)}</b></div>
              <div class="calVal"><span>Prev</span><b>${esc(x.previous)}</b></div>
            </div>
          </div>
        `
            )
            .join("")}
      </div>
    `;

        injectCSS();
    }

    function injectCSS() {
        if (document.getElementById("calCSS")) return;
        const style = document.createElement("style");
        style.id = "calCSS";
        style.textContent = `
      .calHead{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
      .calTitle{font-weight:900}
      .calList{display:flex;flex-direction:column;gap:10px}
      .calRow{display:flex;gap:12px;justify-content:space-between;border:1px solid rgba(15,23,42,.10);background:#fff;border-radius:16px;padding:12px}
      .calLeft{min-width:0;flex:1}
      .calTime{font-size:12px;font-weight:900;color:rgba(15,23,42,.55)}
      .calMeta{font-size:12px;font-weight:800;color:rgba(15,23,42,.55);margin-top:2px}
      .calEvent{font-size:13px;font-weight:900;color:rgba(15,23,42,.90);margin-top:6px}
      .calRight{display:grid;gap:6px;min-width:210px}
      .calVal{display:flex;justify-content:space-between;gap:10px;font-size:12px;font-weight:800;color:rgba(15,23,42,.75)}
      .calVal b{color:rgba(15,23,42,.95)}
      @media(max-width:720px){
        .calRow{flex-direction:column}
        .calRight{min-width:0}
      }
    `;
        document.head.appendChild(style);
    }

    async function load() {
        renderLoading();
        try {
            const r = await fetch(ENDPOINT);
            const j = await r.json().catch(() => null);
            if (!r.ok) throw new Error(j?.error || `API error (${r.status})`);
            render(j?.items || []);
        } catch (e) {
            console.error("ECON CAL ERROR:", e);
            root.innerHTML = `<div class="news-loading">❌ Calendar error: ${esc(e.message)}</div>`;
        }
    }

    load();
})();
