// assets1/econ-calendar.js
console.log("✅ econ-calendar.js loaded");

(() => {
    const root = document.getElementById("econCalendar");
    if (!root) return;

    // ✅ cache var (server zaten 5 dk cacheli) — no-store kullanmıyoruz
    const ENDPOINT = "/.netlify/functions/econ_calendar?days=7&limit=40";

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

    const impactDot = (i) =>
        i === "high" ? "🔴" : i === "medium" ? "🟠" : i === "low" ? "🟢" : "⚪";

    function header(statusRight) {
        return `
      <div style="padding:12px 14px;display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid rgba(0,0,0,.06)">
        <div style="font-weight:900;font-size:14px">Economic Calendar</div>
        <div style="font-weight:800;font-size:11px;opacity:.7">${esc(statusRight)}</div>
      </div>
    `;
    }

    function renderLoading() {
        root.innerHTML = header("Loading…") + `
      <div style="padding:12px;font-weight:900;opacity:.7">Loading economic calendar…</div>
    `;
    }

    function renderError(msg) {
        root.innerHTML = header("Error") + `
      <div style="padding:12px;color:#ef4444;font-weight:900">❌ ${esc(msg)}</div>
      <div style="padding:0 12px 12px;font-weight:800;opacity:.7">
        Tip: Netlify ENV → TE_CREDENTIALS (KEY:SECRET) / TradingEconomics geçici down olabilir.
      </div>
    `;
    }

    function renderEvents(ev) {
        root.innerHTML =
            header("Upcoming") +
            `
      <div style="padding:12px">
        <div style="display:flex;flex-direction:column;gap:8px;max-height:340px;overflow:auto;padding-right:4px">
          ${
                ev.length
                    ? ev
                        .map(
                            (e) => `
            <div style="display:grid;grid-template-columns:120px 1fr;gap:10px;padding:10px;border-radius:12px;border:1px solid rgba(0,0,0,.06);background:#fff">
              <div style="font-weight:900;font-size:11px;opacity:.85">${esc(fmtTime(e.time))}</div>

              <div>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
                  <div style="font-weight:900;font-size:11px">
                    ${esc((e.currency || e.country || "").toUpperCase())}
                  </div>
                  <div style="font-weight:900;font-size:11px">
                    ${impactDot(e.impact)} ${esc(String(e.impact || "").toUpperCase())}
                  </div>
                </div>

                <div style="font-weight:900;font-size:13px;line-height:1.2">
                  ${esc(e.title)}
                </div>

                <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;font-weight:800;font-size:11px;opacity:.7">
                  ${e.previous != null ? `<span>Prev: ${esc(e.previous)}</span>` : ""}
                  ${e.forecast != null ? `<span>Fcst: ${esc(e.forecast)}</span>` : ""}
                  ${e.actual != null ? `<span>Act: ${esc(e.actual)}</span>` : ""}
                </div>
              </div>
            </div>
          `
                        )
                        .join("")
                    : `<div style="padding:12px;text-align:center;font-weight:900;opacity:.7">No upcoming events.</div>`
            }
        </div>
      </div>
    `;
    }

    async function load() {
        renderLoading();
        try {
            const r = await fetch(ENDPOINT); // ✅ cache devrede
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(j?.error || `API error ${r.status}`);

            const ev = Array.isArray(j?.events) ? j.events : [];
            renderEvents(ev);
        } catch (err) {
            console.error("ECON CAL ERROR:", err);
            renderError(err?.message || "unknown");
        }
    }

    load();
    // ✅ 10 dakikaya çektim (5 dakikada bir gereksiz)
    setInterval(load, 10 * 60 * 1000);
})();
