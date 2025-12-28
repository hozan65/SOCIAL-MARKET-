// /messages/messages.js
import { account } from "/assets/appwrite.js";

console.log("✅ messages.js loaded (inbox + chat)");

const esc = (s) =>
    String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

const fmtTime = (iso) => {
    try {
        return new Date(iso).toLocaleString("tr-TR", {
            dateStyle: "short",
            timeStyle: "short",
        });
    } catch {
        return "";
    }
};

const qs = (k) => new URLSearchParams(location.search).get(k);

// ---- elements ----
const $app = document.querySelector(".msgApp");
const $inboxList = document.getElementById("inboxList");
const $inboxHint = document.getElementById("inboxHint");
const $search = document.getElementById("leftSearch");

const $msgList = document.getElementById("msgList");
const $msgForm = document.getElementById("msgForm");
const $msgInput = document.getElementById("msgInput");
const $msgHint = document.getElementById("msgHint");

const $peerName = document.getElementById("peerName");
const $peerSub = document.getElementById("peerSub");
const $peerAva = document.getElementById("peerAva");

const $chatBackBtn = document.getElementById("chatBackBtn");
const $backFeedBtn = document.getElementById("backFeedBtn");

// ---- state ----
let meId = null;
let activeTo = null;
let activeConversationId = null;
let inboxCache = [];
let pollTimer = null;

// ✅ chat değişti mi anlamak için (loading spam yok)
let lastMsgFingerprint = "";

// ---- JWT helpers ----
async function getJwtHeaders() {
    const jwtObj = await account.createJWT();
    const jwt = jwtObj?.jwt;
    if (!jwt) throw new Error("JWT could not be created");
    return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
        "X-Appwrite-JWT": jwt,
        "x-jwt": jwt,
    };
}

async function apiGet(url) {
    const headers = await getJwtHeaders();
    const r = await fetch(url, { headers, cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    return j;
}

async function apiPost(url, body) {
    const headers = await getJwtHeaders();
    const r = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body || {}),
        cache: "no-store",
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    return j;
}

// ---- UI: Inbox ----
function renderInbox(list) {
    if (!$inboxList) return;

    if (!list?.length) {
        $inboxList.innerHTML = `<div style="opacity:.7;padding:12px;font-weight:900;">No chats yet.</div>`;
        return;
    }

    $inboxList.innerHTML = list
        .map((c) => {
            const isActive = c.other_id === activeTo ? "active" : "";
            const ava = c.other_avatar_url
                ? `<img src="${esc(c.other_avatar_url)}" alt="">`
                : "";
            const last = esc(c.last_body || "");
            const time = c.last_at ? fmtTime(c.last_at) : "";
            const badge = c.unread ? `<div class="badge">${c.unread}</div>` : "";

            return `
      <div class="chatItem ${isActive}" data-to="${esc(c.other_id)}" data-cid="${esc(
                c.conversation_id
            )}">
        <div class="chatAva">${ava}</div>
        <div class="chatMain">
          <div class="chatRow1">
            <div class="chatName">${esc(c.other_name || "User")}</div>
            <div class="chatTime">${esc(time)}</div>
          </div>
          <div class="chatLast">${last || " "}</div>
        </div>
        ${badge}
      </div>
    `;
        })
        .join("");

    $inboxList.querySelectorAll(".chatItem").forEach((row) => {
        row.addEventListener("click", () => {
            const to = row.getAttribute("data-to");
            const cid = row.getAttribute("data-cid");
            openChat(to, cid, true);
        });
    });
}

function applySearch() {
    const q = ($search?.value || "").trim().toLowerCase();
    const filtered = !q
        ? inboxCache
        : inboxCache.filter((x) => String(x.other_name || "").toLowerCase().includes(q));
    renderInbox(filtered);
}

// ilk yüklemede loading göster, polling’de gösterme
async function loadInbox(showLoading = false) {
    if (showLoading && $inboxHint) $inboxHint.textContent = "Loading...";
    const j = await apiGet("/.netlify/functions/dm_inbox?limit=60");
    inboxCache = j?.list || [];
    if (showLoading && $inboxHint) $inboxHint.textContent = "";
    applySearch();
}

// ---- UI: Chat ----
function renderEmptyChat() {
    if ($peerName) $peerName.textContent = "Select a chat";
    if ($peerSub) $peerSub.textContent = "Direct messages";
    if ($peerAva) $peerAva.innerHTML = "";
    if ($msgList)
        $msgList.innerHTML = `<div style="opacity:.7;padding:14px;font-weight:900;">No chat selected.</div>`;
    if ($msgHint) $msgHint.textContent = "";
    activeTo = null;
    activeConversationId = null;
    lastMsgFingerprint = "";
}

function renderMessages(list) {
    if (!$msgList) return;

    const html = (list || [])
        .map((m) => {
            const mine = m.sender_id === meId;
            const t = m.created_at ? fmtTime(m.created_at) : "";

            const tick = mine
                ? `<span class="tick ${m.read_at ? "read" : ""}"><span>✓</span><span>✓</span></span>`
                : "";

            return `
      <div class="bubble ${mine ? "me" : ""}">
        <div>${esc(m.body)}</div>
        <div class="metaRow">
          <div class="t">${esc(t)}</div>
          ${tick}
        </div>
      </div>
    `
                .trim();
        })
        .join("");

    $msgList.innerHTML =
        html || `<div style="opacity:.7;padding:12px;font-weight:900;">No messages yet.</div>`;

    // ✅ her render sonrası aşağı kay
    $msgList.scrollTop = $msgList.scrollHeight;
}

async function getConversation(to) {
    const j = await apiGet(`/.netlify/functions/dm_get_or_create?to=${encodeURIComponent(to)}`);
    const cid = j?.conversation_id;
    if (!cid) throw new Error("Missing conversation_id");
    return cid;
}

/**
 * ✅ IMPORTANT:
 * showLoading=false => polling'de sessiz
 * showLoading=true  => sadece chat ilk açılırken
 * return true => değişiklik var (yeni mesaj vs)
 */
async function loadMessages(showLoading = false) {
    if (!activeConversationId) return false;

    if (showLoading && $msgHint) $msgHint.textContent = "Loading...";

    const j = await apiGet(
        `/.netlify/functions/dm_list?conversation_id=${encodeURIComponent(activeConversationId)}&limit=120`
    );

    const list = j?.list || [];

    // ✅ fingerprint (değişim kontrolü)
    // dm_list id döndürmüyorsa created_at ile de idare eder
    const last = list.length ? list[list.length - 1] : null;
    const fp = `${list.length}|${last?.id || last?.created_at || ""}`;

    // ✅ değişmediyse UI dokunma (loading spam yok)
    if (fp === lastMsgFingerprint) {
        if (showLoading && $msgHint) $msgHint.textContent = "";
        return false;
    }

    lastMsgFingerprint = fp;

    // ✅ sadece değişince render
    renderMessages(list);

    // ✅ sadece değişince read işaretle
    await apiPost("/.netlify/functions/dm_mark_read", {
        conversation_id: activeConversationId,
    }).catch(() => {});

    if (showLoading && $msgHint) $msgHint.textContent = "";
    return true;
}

async function openChat(to, knownCid, pushUrl) {
    if (!to) return;
    activeTo = to;

    // mobilde chat ekranına geç
    $app?.classList.add("showChat");

    // header info
    const row = inboxCache.find((x) => x.other_id === to);
    if ($peerName) $peerName.textContent = row?.other_name || "Chat";
    if ($peerSub) $peerSub.textContent = "Direct messages";
    if ($peerAva)
        $peerAva.innerHTML = row?.other_avatar_url ? `<img src="${esc(row.other_avatar_url)}" alt="">` : "";

    try {
        // ✅ chat açılırken fingerprint reset
        lastMsgFingerprint = "";

        activeConversationId = knownCid || (await getConversation(to));

        if (pushUrl) {
            const u = new URL(location.href);
            u.searchParams.set("to", to);
            history.pushState({}, "", u.toString());
        }

        applySearch();

        // ✅ sadece ilk açılışta loading göster
        await loadMessages(true);

        if ($msgHint) $msgHint.textContent = "";
    } catch (e) {
        console.error(e);
        if ($msgHint) $msgHint.textContent = "❌ " + (e?.message || e);
    }
}

async function sendMessage(text) {
    if (!activeConversationId) throw new Error("No chat selected");
    await apiPost("/.netlify/functions/dm_send", {
        conversation_id: activeConversationId,
        body: text,
    });

    // ✅ gönderince hemen güncelle (loading yok)
    await loadMessages(false);

    // ✅ inbox'u da güncelle ki last mesaj/saati gelsin
    await loadInbox(false);
}

// ---- BOOT ----
(async function boot() {
    try {
        const me = await account.get();
        meId = me?.$id;
        if (!meId) {
            location.href = "/auth/login.html";
            return;
        }

        // ✅ inbox ilk yüklemede loading göster
        await loadInbox(true);

        const to = (qs("to") || "").trim();
        if (to) {
            const row = inboxCache.find((x) => x.other_id === to);
            await openChat(to, row?.conversation_id || null, false);
        } else {
            renderEmptyChat();
        }

        $search?.addEventListener("input", applySearch);

        // ✅ polling: UI sadece değişince güncellenir (loading yok)
        pollTimer = setInterval(async () => {
            try {
                await loadInbox(false);
                if (activeConversationId) await loadMessages(false);
            } catch {
                // sessiz
            }
        }, 5000); // istersen 8000-12000 yap (supabase daha az yorulur)
    } catch (e) {
        console.error(e);
        if ($msgHint) $msgHint.textContent = "❌ " + (e?.message || e);
    }
})();

// ---- Events ----
$msgForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = ($msgInput?.value || "").trim();
    if (!text) return;
    $msgInput.value = "";
    try {
        await sendMessage(text);
        if ($msgHint) $msgHint.textContent = "";
    } catch (err) {
        console.error(err);
        if ($msgHint) $msgHint.textContent = "❌ " + (err?.message || err);
    }
});

$chatBackBtn?.addEventListener("click", () => {
    // mobilde inbox’a dön
    $app?.classList.remove("showChat");

    // URL'den to kaldır
    const u = new URL(location.href);
    u.searchParams.delete("to");
    history.pushState({}, "", u.toString());
});

$backFeedBtn?.addEventListener("click", () => {
    if (history.length > 1) history.back();
    else location.href = "/feed/feed.html";
});

window.addEventListener("popstate", () => {
    const to = (qs("to") || "").trim();
    if (!to) renderEmptyChat();
});
