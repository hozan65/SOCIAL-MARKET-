// PRO Tools (Offline, fast) — English UI
// Pip Calculator (contract/pip/fx), Risk/Reward, Position Size, Sessions, Risk Guard,
// Trade Journal, Daily Loss Tracker, Economic Calendar (manual).

/* ---------- Utilities ---------- */
const LS = {
    journal: "sm_journal_pro_v1",
    daily: "sm_daily_pro_v1",
    econ: "sm_econ_pro_v1",
};

const $ = (id) => document.getElementById(id);
const num = (v) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : NaN;
};
const fmt = (x, d=2) => (Number.isFinite(x) ? x.toFixed(d) : "—");
const readLS = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
const writeLS = (k, v) => localStorage.setItem(k, JSON.stringify(v));

function nowIstanbul(){
    // Force UTC+3 (Istanbul). Fast and deterministic.
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    return new Date(utc + 3*3600000);
}

/* ---------- Modal ---------- */
function openTool(tool){
    $("tmodal-kicker").textContent = tool.tier;
    $("tmodal-title").textContent = tool.name;
    $("tmodal-desc").textContent = tool.desc;

    const body = $("tmodal-body");
    body.innerHTML = "";
    tool.render(body);

    const modal = $("tool-modal");
    modal.classList.add("open");
    modal.setAttribute("aria-hidden","false");
    document.body.style.overflow = "hidden";
}
function closeTool(){
    const modal = $("tool-modal");
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden","true");
    document.body.style.overflow = "";
}
function bindModalClose(){
    const modal = $("tool-modal");
    modal.addEventListener("click", (e)=>{
        if (e.target?.dataset?.close === "1") closeTool();
    });
    document.addEventListener("keydown", (e)=>{
        if (e.key === "Escape") closeTool();
    });
}

/* ---------- UI helpers ---------- */
const box = (inner) => `<div class="tbox">${inner}</div>`;
const row = (inner) => `<div class="trow">${inner}</div>`;
const actions = (inner) => `<div class="tactions">${inner}</div>`;
const result = (id, text="Result: —") => `<div class="tresult" id="${id}">${text}</div>`;

function field({label, id, type="number", placeholder="", value="", step="", min="", max=""}){
    return `
    <div class="tfield">
      <label for="${id}">${label}</label>
      <input id="${id}" type="${type}" placeholder="${placeholder}" value="${value}"
        ${step!==""?`step="${step}"`:""} ${min!==""?`min="${min}"`:""} ${max!==""?`max="${max}"`:""} />
    </div>
  `;
}
function selectField({label, id, options, value=""}){
    const opts = options.map(o => `<option value="${o.value}" ${o.value===value?"selected":""}>${o.label}</option>`).join("");
    return `
    <div class="tfield">
      <label for="${id}">${label}</label>
      <select id="${id}">${opts}</select>
    </div>
  `;
}
function textarea({label, id, placeholder="", value=""}){
    return `
    <div class="tfield">
      <label for="${id}">${label}</label>
      <textarea id="${id}" placeholder="${placeholder}">${value}</textarea>
    </div>
  `;
}

/* ---------- Market defaults ---------- */
function defaultPipSize(symbol){
    const s = (symbol || "").toUpperCase().replace(/\s+/g,"");
    if (s.endsWith("JPY")) return 0.01;
    if (s.includes("XAU")) return 0.01;
    return 0.0001;
}
function defaultsByType(type){
    // These are industry-common defaults; users can override.
    if (type === "forex") return { contract: 100000, pipSize: 0.0001 };
    if (type === "gold")  return { contract: 100, pipSize: 0.01 };   // often 100 oz per lot
    if (type === "index") return { contract: 1, pipSize: 1 };        // points
    if (type === "crypto")return { contract: 1, pipSize: 1 };        // $ move per unit
    return { contract: 1, pipSize: 0.0001 };
}

/* =========================================================
   1) PIP CALCULATOR (PRO)
   pipValueQuote = contractSize * pipSize * lots
   pipValueAccount = pipValueQuote * fx(quote->account)
   ========================================================= */
const TOOL_PIP = {
    id:"pip",
    tier:"V1 • Calculator",
    icon:"📐",
    name:"Pip Calculator (Pro Model)",
    desc:"Contract × Pip Size × Lots × FX(Quote→Account). No API required.",
    render(root){
        root.innerHTML = box(`
      ${row(`
        ${selectField({
            label:"Instrument Type",
            id:"pip_type",
            value:"forex",
            options:[
                {value:"forex", label:"Forex"},
                {value:"gold", label:"Gold (XAUUSD)"},
                {value:"index", label:"Index (CFD)"},
                {value:"crypto", label:"Crypto"}
            ]
        })}
        ${field({label:"Symbol (e.g., EURUSD / USDJPY / XAUUSD)", id:"pip_symbol", type:"text", value:"EURUSD"})}
        ${field({label:"Lots / Contracts", id:"pip_lots", value:"1", step:"0.01", min:"0"})}
        ${field({label:"Contract Size (per 1 lot)", id:"pip_contract", value:"100000", step:"1", min:"0"})}
        ${field({label:"Pip Size", id:"pip_pipsize", value:"", step:"0.0001", min:"0", placeholder:"Empty = auto"})}
        ${field({label:"FX Rate (Quote → Account)", id:"pip_fx", value:"1", step:"0.000001", min:"0",
            placeholder:"USD account & quote=JPY → 1/USDJPY"})}
      `)}
      ${actions(`
        <button class="tbtn primary" id="pip_calc">Calculate</button>
        <button class="tbtn" id="pip_auto">Auto Defaults</button>
      `)}
      ${result("pip_out")}
      <div class="tmuted" style="margin-top:10px;">
        Tip: If your account currency is USD and the quote currency is USD → FX = 1.<br>
        If quote is JPY (e.g., USDJPY) and account is USD → FX = 1 / USDJPY.
      </div>
    `);

        const applyDefaults = ()=>{
            const type = $("pip_type").value;
            const sym = $("pip_symbol").value;
            const d = defaultsByType(type);
            $("pip_contract").value = String(d.contract);
            $("pip_pipsize").value = String(sym ? defaultPipSize(sym) : d.pipSize);
            $("pip_fx").value = "1";
        };

        $("pip_auto").onclick = applyDefaults;
        applyDefaults();

        $("pip_calc").onclick = ()=>{
            const lots = num($("pip_lots").value);
            const contract = num($("pip_contract").value);
            const pipSize = num($("pip_pipsize").value);
            const fx = num($("pip_fx").value);

            if (![lots, contract, pipSize, fx].every(Number.isFinite) || lots<=0 || contract<=0 || pipSize<=0 || fx<=0){
                $("pip_out").textContent = "Result: Invalid inputs.";
                return;
            }

            const pipQuote = contract * pipSize * lots;
            const pipAccount = pipQuote * fx;

            $("pip_out").textContent =
                `Pip value (quote): ${fmt(pipQuote, 6)}\n` +
                `Pip value (account): ${fmt(pipAccount, 6)}\n` +
                `Formula: contract × pipSize × lots × FX(quote→account)`;
        };
    }
};

/* =========================================================
   2) RISK/REWARD (PRO)
   ========================================================= */
const TOOL_RR = {
    id:"rr",
    tier:"V1 • Calculator",
    icon:"⚖️",
    name:"Risk / Reward",
    desc:"Correct long/short R:R with validation.",
    render(root){
        root.innerHTML = box(`
      ${row(`
        ${selectField({
            label:"Direction",
            id:"rr_dir",
            value:"long",
            options:[{value:"long", label:"Long"},{value:"short", label:"Short"}]
        })}
        ${field({label:"Entry", id:"rr_entry", value:"100", step:"0.0001", min:"0"})}
        ${field({label:"Stop Loss", id:"rr_sl", value:"98", step:"0.0001", min:"0"})}
        ${field({label:"Take Profit", id:"rr_tp", value:"106", step:"0.0001", min:"0"})}
      `)}
      ${actions(`<button class="tbtn primary" id="rr_calc">Calculate</button>`)}
      ${result("rr_out")}
    `);

        $("rr_calc").onclick = ()=>{
            const dir = $("rr_dir").value;
            const entry = num($("rr_entry").value);
            const sl = num($("rr_sl").value);
            const tp = num($("rr_tp").value);

            if (![entry, sl, tp].every(Number.isFinite)){
                $("rr_out").textContent = "Result: Invalid inputs.";
                return;
            }

            let risk = 0, reward = 0;
            if (dir === "long"){
                risk = entry - sl;
                reward = tp - entry;
            } else {
                risk = sl - entry;
                reward = entry - tp;
            }

            if (risk <= 0 || reward <= 0){
                $("rr_out").textContent = "Result: SL/TP does not match the selected direction.";
                return;
            }

            $("rr_out").textContent =
                `Risk: ${fmt(risk, 6)}\nReward: ${fmt(reward, 6)}\nR:R = 1:${fmt(reward / risk, 2)}`;
        };
    }
};

/* =========================================================
   3) POSITION SIZE (PRO)
   lot = risk$ / (stopPips × pipValuePerLotInAccount)
   pipValuePerLotInAccount = contract × pipSize × fx
   ========================================================= */
const TOOL_POS = {
    id:"pos",
    tier:"V1 • Risk",
    icon:"🎯",
    name:"Position Size (Pro Model)",
    desc:"Risk$ / (StopPips × PipValuePerLot). Works offline.",
    render(root){
        root.innerHTML = box(`
      ${row(`
        ${field({label:"Account Balance", id:"ps_bal", value:"1000", step:"0.01", min:"0"})}
        ${field({label:"Risk %", id:"ps_risk", value:"1", step:"0.1", min:"0"})}
        ${field({label:"Stop Distance (pips)", id:"ps_stop", value:"20", step:"0.1", min:"0"})}

        ${selectField({
            label:"Instrument Type",
            id:"ps_type",
            value:"forex",
            options:[
                {value:"forex", label:"Forex"},
                {value:"gold", label:"Gold (XAUUSD)"},
                {value:"index", label:"Index (CFD)"},
                {value:"crypto", label:"Crypto"}
            ]
        })}
        ${field({label:"Symbol", id:"ps_symbol", type:"text", value:"EURUSD"})}
        ${field({label:"Contract Size (per 1 lot)", id:"ps_contract", value:"100000", step:"1", min:"0"})}
        ${field({label:"Pip Size", id:"ps_pipsize", value:"", step:"0.0001", min:"0", placeholder:"Empty = auto"})}
        ${field({label:"FX Rate (Quote → Account)", id:"ps_fx", value:"1", step:"0.000001", min:"0"})}
      `)}
      ${actions(`
        <button class="tbtn primary" id="ps_calc">Calculate</button>
        <button class="tbtn" id="ps_auto">Auto Defaults</button>
      `)}
      ${result("ps_out")}
      <div class="tmuted" style="margin-top:10px;">
        Formula: lot = Risk$ / (StopPips × PipValuePerLot)<br>
        PipValuePerLot = contract × pipSize × FX(quote→account)
      </div>
    `);

        const applyDefaults = ()=>{
            const type = $("ps_type").value;
            const sym = $("ps_symbol").value;
            const d = defaultsByType(type);
            $("ps_contract").value = String(d.contract);
            $("ps_pipsize").value = String(sym ? defaultPipSize(sym) : d.pipSize);
            $("ps_fx").value = "1";
        };

        $("ps_auto").onclick = applyDefaults;
        applyDefaults();

        $("ps_calc").onclick = ()=>{
            const bal = num($("ps_bal").value);
            const riskPct = num($("ps_risk").value);
            const stopPips = num($("ps_stop").value);
            const contract = num($("ps_contract").value);
            const pipSize = num($("ps_pipsize").value);
            const fx = num($("ps_fx").value);

            if (![bal, riskPct, stopPips, contract, pipSize, fx].every(Number.isFinite) ||
                bal<=0 || riskPct<=0 || stopPips<=0 || contract<=0 || pipSize<=0 || fx<=0){
                $("ps_out").textContent = "Result: Invalid inputs.";
                return;
            }

            const riskUsd = bal * (riskPct/100);
            const pipValuePerLot = contract * pipSize * fx;
            const lot = riskUsd / (stopPips * pipValuePerLot);

            $("ps_out").textContent =
                `Risk amount: ${fmt(riskUsd, 2)}\n` +
                `Pip value (1 lot): ${fmt(pipValuePerLot, 6)}\n` +
                `Suggested lot size: ${fmt(lot, 4)}\n` +
                `Stop: ${fmt(stopPips, 1)} pips`;
        };
    }
};

/* =========================================================
   4) SESSION STATUS (Istanbul time)
   - Simple and fast offline schedule
   ========================================================= */
const TOOL_SESS = {
    id:"sess",
    tier:"V1 • Info",
    icon:"🕒",
    name:"Session Status",
    desc:"Tokyo/London/New York + overlap volatility (Istanbul time).",
    render(root){
        const now = nowIstanbul();
        const h = now.getHours() + now.getMinutes()/60;

        // Approx Istanbul-time ranges
        const tokyo = h>=3 && h<12;
        const london = h>=10 && h<19;
        const ny = h>=15 && h<24;

        const open = (b)=> b ? "Open ✅" : "Closed ❌";
        let vol = "Low";
        if ((tokyo && london) || (london && ny)) vol = "High (Overlap)";
        else if (tokyo || london || ny) vol = "Medium";

        root.innerHTML = box(`
      <div class="tresult">
Istanbul time: ${now.toLocaleString()}
Tokyo: ${open(tokyo)}
London: ${open(london)}
New York: ${open(ny)}

Volatility: ${vol}
      </div>
      <div class="tmuted" style="margin-top:10px;">
        Note: Ranges are practical approximations and can be adjusted.
      </div>
    `);
    }
};

/* =========================================================
   5) RISK GUARD (strict)
   ========================================================= */
const TOOL_GUARD = {
    id:"guard",
    tier:"V1 • Safety",
    icon:"⚠️",
    name:"Risk Guard",
    desc:"Flags over-risking and estimates lot size using pip value.",
    render(root){
        root.innerHTML = box(`
      ${row(`
        ${field({label:"Account Balance", id:"rg_bal", value:"1000", step:"0.01", min:"0"})}
        ${field({label:"Risk %", id:"rg_risk", value:"2", step:"0.1", min:"0"})}
        ${field({label:"Stop Distance (pips)", id:"rg_stop", value:"20", step:"0.1", min:"0"})}
        ${field({label:"Pip Value (1 lot, account)", id:"rg_pipval", value:"10", step:"0.0001", min:"0",
            placeholder:"EURUSD 1 lot ≈ 10 USD/pip"})}
      `)}
      ${actions(`<button class="tbtn primary" id="rg_calc">Check</button>`)}
      ${result("rg_out")}
    `);

        $("rg_calc").onclick = ()=>{
            const bal = num($("rg_bal").value);
            const rp = num($("rg_risk").value);
            const stop = num($("rg_stop").value);
            const pipVal = num($("rg_pipval").value);

            if (![bal,rp,stop,pipVal].every(Number.isFinite) || bal<=0 || rp<=0 || stop<=0 || pipVal<=0){
                $("rg_out").textContent = "Result: Invalid inputs.";
                return;
            }

            const riskAmt = bal*(rp/100);
            const lossPerLot = stop * pipVal;
            const lot = riskAmt / lossPerLot;

            let tag = "✅ Normal";
            if (rp >= 5) tag = "❌ Extreme (5%+)";
            else if (rp >= 3) tag = "⚠️ High (3%+)";

            const advice = rp >= 3
                ? "Suggestion: reduce risk. High risk accelerates drawdown."
                : "Suggestion: keep 1–2% risk per trade for consistency.";

            $("rg_out").textContent =
                `Risk amount: ${fmt(riskAmt,2)}\n` +
                `Estimated lot: ${fmt(lot,4)}\n` +
                `Status: ${tag}\n` +
                advice;
        };
    }
};

/* =========================================================
   6) TRADE JOURNAL (LocalStorage, real)
   - Add/Delete
   - Filter by result
   ========================================================= */
const TOOL_JOURNAL = {
    id:"journal",
    tier:"V2 • Tracker",
    icon:"📓",
    name:"Trade Journal",
    desc:"Store trades locally (fast). Filter and delete.",
    render(root){
        root.innerHTML = `
      ${box(`
        ${row(`
          ${field({label:"Pair", id:"j_pair", type:"text", placeholder:"EURUSD / BTCUSDT", value:""})}
          ${selectField({
            label:"Side",
            id:"j_side",
            value:"long",
            options:[{value:"long",label:"Long"},{value:"short",label:"Short"}]
        })}
          ${field({label:"Entry", id:"j_entry", type:"text", value:""})}
          ${field({label:"SL", id:"j_sl", type:"text", value:""})}
          ${field({label:"TP", id:"j_tp", type:"text", value:""})}
          ${selectField({
            label:"Result",
            id:"j_res",
            value:"open",
            options:[
                {value:"open",label:"Open"},
                {value:"win",label:"Win"},
                {value:"loss",label:"Loss"},
                {value:"be",label:"Break-even"}
            ]
        })}
        `)}
        ${textarea({label:"Notes", id:"j_note", placeholder:"Setup, emotions, mistakes..."})}
        ${actions(`
          <button class="tbtn primary" id="j_add">Add</button>
          <button class="tbtn" id="j_clear">Clear All</button>
        `)}
      `)}

      ${box(`
        ${row(`
          ${selectField({
            label:"Filter",
            id:"j_filter",
            value:"all",
            options:[
                {value:"all",label:"All"},
                {value:"open",label:"Open"},
                {value:"win",label:"Win"},
                {value:"loss",label:"Loss"},
                {value:"be",label:"Break-even"}
            ]
        })}
          ${field({label:"Search Pair", id:"j_search", type:"text", placeholder:"e.g. EUR", value:""})}
        `)}
      `)}

      <div class="tlist" id="j_list"></div>
    `;

        const renderList = ()=>{
            const arr = readLS(LS.journal, []);
            const filter = $("j_filter").value;
            const q = $("j_search").value.trim().toUpperCase();

            const items = arr.filter(it=>{
                const okFilter = filter==="all" ? true : it.result===filter;
                const okQuery = q ? (it.pair || "").toUpperCase().includes(q) : true;
                return okFilter && okQuery;
            });

            const list = $("j_list");
            if (!items.length){
                list.innerHTML = `<div class="tmuted">No entries.</div>`;
                return;
            }

            list.innerHTML = items.map(it=>`
        <div class="titem">
          <div class="titem-top">
            <div><b>${it.pair}</b> • ${it.side.toUpperCase()} • ${it.result.toUpperCase()}</div>
            <span class="tpill">${new Date(it.ts).toLocaleString()}</span>
          </div>
          <div class="tmuted" style="margin-top:6px;">
            Entry: ${it.entry || "—"} • SL: ${it.sl || "—"} • TP: ${it.tp || "—"}
          </div>
          ${it.note ? `<div style="margin-top:8px; opacity:.92; white-space:pre-wrap;">${it.note}</div>` : ""}
          <div class="tactions" style="margin-top:10px;">
            <button class="tbtn" data-del="${it.id}">Delete</button>
          </div>
        </div>
      `).join("");

            list.querySelectorAll("[data-del]").forEach(btn=>{
                btn.onclick = ()=>{
                    const id = btn.getAttribute("data-del");
                    const next = readLS(LS.journal, []).filter(x=>x.id !== id);
                    writeLS(LS.journal, next);
                    renderList();
                };
            });
        };

        $("j_add").onclick = ()=>{
            const pair = $("j_pair").value.trim();
            if (!pair){ alert("Pair is required."); return; }

            const entry = {
                id: crypto.randomUUID(),
                ts: Date.now(),
                pair,
                side: $("j_side").value,
                entry: $("j_entry").value.trim(),
                sl: $("j_sl").value.trim(),
                tp: $("j_tp").value.trim(),
                result: $("j_res").value,
                note: $("j_note").value.trim(),
            };

            const arr = readLS(LS.journal, []);
            arr.unshift(entry);
            writeLS(LS.journal, arr);

            $("j_pair").value="";
            $("j_entry").value="";
            $("j_sl").value="";
            $("j_tp").value="";
            $("j_note").value="";
            $("j_res").value="open";

            renderList();
        };

        $("j_clear").onclick = ()=>{
            if (confirm("Clear all journal entries?")) {
                writeLS(LS.journal, []);
                renderList();
            }
        };

        $("j_filter").onchange = renderList;
        $("j_search").oninput = renderList;

        renderList();
    }
};

/* =========================================================
   7) DAILY LOSS TRACKER (real)
   - Auto reset per day
   ========================================================= */
const TOOL_DAILY = {
    id:"daily",
    tier:"V2 • Discipline",
    icon:"🧯",
    name:"Daily Loss Tracker",
    desc:"Tracks daily max loss and remaining budget (offline).",
    render(root){
        const today = new Date().toDateString();
        let st = readLS(LS.daily, { day: today, balance: 1000, maxLossPct: 3, pnl: 0 });

        if (st.day !== today){
            st = { ...st, day: today, pnl: 0 };
            writeLS(LS.daily, st);
        }

        root.innerHTML = box(`
      ${row(`
        ${field({label:"Account Balance", id:"d_bal", value:String(st.balance), step:"0.01", min:"0"})}
        ${field({label:"Max Daily Loss %", id:"d_max", value:String(st.maxLossPct), step:"0.1", min:"0"})}
        ${field({label:"Today's PnL ($) (negative = loss)", id:"d_pnl", value:String(st.pnl), step:"0.01"})}
        <div class="tfield"><label>Today</label><input type="text" value="${today}" disabled></div>
      `)}
      ${actions(`
        <button class="tbtn primary" id="d_save">Save</button>
        <button class="tbtn" id="d_reset">Reset Today</button>
      `)}
      ${result("d_out")}
    `);

        const compute = ()=>{
            const bal = num($("d_bal").value);
            const maxPct = num($("d_max").value);
            const pnl = num($("d_pnl").value);

            if (![bal,maxPct,pnl].every(Number.isFinite) || bal<=0 || maxPct<=0){
                $("d_out").textContent = "Result: Invalid inputs.";
                return;
            }

            const maxLoss = bal*(maxPct/100);
            const loss = Math.max(0, -pnl);
            const remaining = Math.max(0, maxLoss - loss);

            let status = "✅ OK";
            if (loss >= maxLoss) status = "❌ STOP (limit hit)";
            else if (loss >= maxLoss*0.7) status = "⚠️ Warning (70%+ used)";

            $("d_out").textContent =
                `Max daily loss: $${fmt(maxLoss,2)}\n` +
                `Used loss: $${fmt(loss,2)}\n` +
                `Remaining: $${fmt(remaining,2)}\n` +
                `Status: ${status}`;
        };

        $("d_save").onclick = ()=>{
            const next = {
                day: today,
                balance: num($("d_bal").value),
                maxLossPct: num($("d_max").value),
                pnl: num($("d_pnl").value)
            };
            writeLS(LS.daily, next);
            compute();
        };

        $("d_reset").onclick = ()=>{
            if (!confirm("Reset today's PnL to 0?")) return;
            $("d_pnl").value = "0";
            const next = readLS(LS.daily, st);
            next.day = today;
            next.pnl = 0;
            writeLS(LS.daily, next);
            compute();
        };

        compute();
    }
};

/* =========================================================
   8) ECONOMIC CALENDAR (manual, real)
   - Add/Delete
   - Sort by datetime string (user format)
   ========================================================= */
const TOOL_ECON = {
    id:"econ",
    tier:"V2 • Events",
    icon:"🗓️",
    name:"Economic Calendar (Manual)",
    desc:"Add and manage your own event list (offline).",
    render(root){
        root.innerHTML = `
      ${box(`
        ${row(`
          ${field({label:"Date/Time (YYYY-MM-DD HH:MM)", id:"e_ts", type:"text", placeholder:"2025-12-21 16:30"})}
          ${selectField({
            label:"Impact",
            id:"e_imp",
            value:"HIGH",
            options:[
                {value:"HIGH", label:"HIGH"},
                {value:"MED", label:"MED"},
                {value:"LOW", label:"LOW"}
            ]
        })}
          ${field({label:"Title", id:"e_title", type:"text", placeholder:"CPI / NFP / FOMC..."})}
          ${field({label:"Note (optional)", id:"e_note", type:"text", placeholder:"Short note"})}
        `)}
        ${actions(`
          <button class="tbtn primary" id="e_add">Add</button>
          <button class="tbtn" id="e_clear">Clear All</button>
        `)}
      `)}
      <div class="tlist" id="e_list"></div>
    `;

        const parseTS = (s)=>{
            // Expect "YYYY-MM-DD HH:MM"
            const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/.exec(s.trim());
            if (!m) return NaN;
            const [_, Y, Mo, D, H, Mi] = m;
            const dt = new Date(Number(Y), Number(Mo)-1, Number(D), Number(H), Number(Mi));
            return dt.getTime();
        };

        const renderList = ()=>{
            const arr = readLS(LS.econ, []);
            const sorted = [...arr].sort((a,b)=> (parseTS(a.ts) - parseTS(b.ts)));

            const list = $("e_list");
            if (!sorted.length){
                list.innerHTML = `<div class="tmuted">No events.</div>`;
                return;
            }

            list.innerHTML = sorted.map(ev=>`
        <div class="titem">
          <div class="titem-top">
            <div><b>${ev.impact}</b> • ${ev.ts} • ${ev.title}</div>
            <button class="tbtn" data-del="${ev.id}">Delete</button>
          </div>
          ${ev.note ? `<div class="tmuted" style="margin-top:8px;">${ev.note}</div>` : ""}
        </div>
      `).join("");

            list.querySelectorAll("[data-del]").forEach(btn=>{
                btn.onclick = ()=>{
                    const id = btn.getAttribute("data-del");
                    const next = readLS(LS.econ, []).filter(x=>x.id !== id);
                    writeLS(LS.econ, next);
                    renderList();
                };
            });
        };

        $("e_add").onclick = ()=>{
            const ts = $("e_ts").value.trim();
            const impact = $("e_imp").value;
            const title = $("e_title").value.trim();
            const note = $("e_note").value.trim();

            if (!ts || !title){
                alert("Date/Time and Title are required.");
                return;
            }
            // Validate format quickly
            const ok = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/.test(ts);
            if (!ok){
                alert("Use format: YYYY-MM-DD HH:MM");
                return;
            }

            const arr = readLS(LS.econ, []);
            arr.push({ id: crypto.randomUUID(), ts, impact, title, note });
            writeLS(LS.econ, arr);

            $("e_ts").value=""; $("e_title").value=""; $("e_note").value="";
            renderList();
        };

        $("e_clear").onclick = ()=>{
            if (confirm("Clear all events?")) {
                writeLS(LS.econ, []);
                renderList();
            }
        };

        renderList();
    }
};

/* ---------- Tools registry ---------- */
const TOOLS = [
    TOOL_PIP,
    TOOL_RR,
    TOOL_POS,
    TOOL_SESS,
    TOOL_GUARD,
    TOOL_JOURNAL,
    TOOL_DAILY,
    TOOL_ECON,
];

/* ---------- Grid ---------- */
function renderToolsGrid(){
    const grid = $("tools-grid");
    grid.innerHTML = TOOLS.map(t=>`
    <div class="tool-card" data-open="${t.id}">
      <div class="tool-top">
        <div class="tool-ico">${t.icon}</div>
        <span class="tool-badge">${t.tier}</span>
      </div>
      <h3 class="tool-name">${t.name}</h3>
      <p class="tool-desc">${t.desc}</p>
    </div>
  `).join("");

    grid.querySelectorAll("[data-open]").forEach(card=>{
        card.onclick = ()=>{
            const id = card.getAttribute("data-open");
            const tool = TOOLS.find(x=>x.id === id);
            if (tool) openTool(tool);
        };
    });
}

document.addEventListener("DOMContentLoaded", ()=>{
    renderToolsGrid();
    bindModalClose();
});
