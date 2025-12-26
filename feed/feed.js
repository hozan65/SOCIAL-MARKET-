/* =========================
  FEED.JS (NO MODULE / NO IMPORT)
  - Supabase CDN (READ ONLY)
  - Like / Comment / Follow: Netlify Functions (Appwrite JWT)
  - News slider (Supabase news table)
  - UI:
     ✅ full photo post card
     ✅ thin action bar
     ✅ comments: NO BOX (flat area)
     ✅ lightbox: photo click -> full readable content + scroll
     ✅ follow state hydrate on load (feed button stays Following after refresh)
========================= */

console.log("✅ feed.js running");

// =========================
// SUPABASE (READ ONLY)
// =========================
const SUPABASE_URL = "https://yzrhqduuqvllatliulqv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_dN5E6cw7uaKj7Cmmpo7RJg_W4FWxjs_";

const sb = window.supabase?.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// =========================
// NETLIFY FUNCTIONS
// =========================
const FN_TOGGLE_LIKE = "/.netlify/functions/toggle_like";
const FN_ADD_COMMENT = "/.netlify/functions/add_comment";
const FN_TOGGLE_FOLLOW = "/.netlify/functions/toggle_follow";
const FN_AUTH_USER = "/.netlify/functions/_auth_user";

// =========================
// DOM
// =========================
const grid = document.getElementById("postsGrid");
const msg = document.getElementById("feedMsg");
const newsSlider = document.getElementById("feed-news-slider");

// =========================
// HELPERS
// =========================
function setMsg(t) {
    if (msg) msg.textContent = t || "";
}

function esc(str) {
    return String(str ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatTime(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}

function formatPairs(pairs) {
    if (Array.isArray(pairs)) return pairs.join(", ");
    return String(pairs ?? "");
}

function shortText(s, max = 140) {
    const t = String(s ?? "").trim();
    if (t.length <= max) return t;
    return t.slice(0, max).trim() + "…";
}

// =========================
// AUTH (Appwrite JWT from /assets/jwt.js)
// =========================
function getJWT() {
    const jwt = window.SM_JWT || localStorage.getItem("sm_jwt");
    if (!jwt) throw new Error("Login required");
    return jwt;
}

async function fnPost(url, body) {
    const jwt = getJWT();

    const r = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify(body || {}),
    });

    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error || `Request failed (${r.status})`);
    return j;
}

async function toggleLike(postId) {
    return fnPost(FN_TOGGLE_LIKE, { post_id: String(postId) });
}

async function addComment(postId, text) {
    const content = String(text || "").trim();
    if (!content) throw new Error("Empty comment");
    return fnPost(FN_ADD_COMMENT, { post_id: String(postId), content });
}

/** follow api expects following_uid */
async function toggleFollow(targetUserId) {
    const id = String(targetUserId || "").trim();
    if (!id) throw new Error("Author id missing");
    return fnPost(FN_TOGGLE_FOLLOW, { following_uid: id });
}

// current user id (for follow hydrate)
let CURRENT_UID = null;
async function ensureCurrentUserId() {
    if (CURRENT_UID) return CURRENT_UID;
    try {
        const r = await fnPost(FN_AUTH_USER, {});
        CURRENT_UID = r?.user?.$id || r?.user?.id || r?.uid || null;
    } catch {
        CURRENT_UID = null;
    }
    return CURRENT_UID;
}

// =========================
// READ HELPERS (Supabase SELECT)
// =========================
async function getLikeCount(postId) {
    if (!sb) throw new Error("Supabase CDN not loaded");
    const { count, error } = await sb
        .from("post_likes")
        .select("*", { count: "exact", head: true })
        .eq("post_id", postId);

    if (error) throw error;
    return count || 0;
}

async function loadComments(postId, limit = 30) {
    if (!sb) throw new Error("Supabase CDN not loaded");
    const { data, error } = await sb
        .from("post_comments")
        .select("id, user_id, content, created_at")
        .eq("post_id", postId)
        .order("created_at", { ascending: true })
        .limit(limit);

    if (error) throw error;
    return data || [];
}

// ✅ Follow hydrate: reads follow table and sets button state
async function isFollowing(authorId) {
    if (!sb) return false;
    const me = await ensureCurrentUserId();
    if (!me) return false;
    if (!authorId) return false;

    // ⚠️ table name assumption: "follows"
    // columns: follower_uid, following_uid
    // If your table differs, tell me: table + column names.
    try {
        const { data, error } = await sb
            .from("follows")
            .select("id")
            .eq("follower_uid", me)
            .eq("following_uid", authorId)
            .limit(1);

        if (error) return false;
        return (data || []).length > 0;
    } catch {
        return false;
    }
}

// =========================
// LIGHTBOX (photo click -> full readable text)
// =========================
function ensureLightbox() {
    let lb = document.getElementById("smLightbox");
    if (lb) return lb;

    lb = document.createElement("div");
    lb.id = "smLightbox";
    lb.innerHTML = `
    <div class="lbBack"></div>
    <div class="lbCard" role="dialog" aria-modal="true">
      <button class="lbClose" type="button" aria-label="Close">✕</button>
      <img class="lbImg" alt="post" />
      <div class="lbText">
        <div class="lbTitle"></div>
        <div class="lbDesc"></div>
        <div class="lbMeta"></div>
      </div>
    </div>
  `;
    document.body.appendChild(lb);

    lb.addEventListener("click", (e) => {
        if (
            e.target.classList.contains("lbBack") ||
            e.target.classList.contains("lbClose")
        ) {
            lb.classList.remove("open");
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") lb.classList.remove("open");
    });

    return lb;
}

function openLightboxFromRow(row) {
    const lb = ensureLightbox();
    const img = lb.querySelector(".lbImg");
    const title = lb.querySelector(".lbTitle");
    const desc = lb.querySelector(".lbDesc");
    const meta = lb.querySelector(".lbMeta");

    const pairsText = formatPairs(row.pairs);
    const contentRaw = String(row.content ?? "");
    const created = formatTime(row.created_at);

    if (img) img.src = row.image_path || "";
    if (title) title.textContent = pairsText || "PAIR";
    if (desc) desc.textContent = contentRaw || "";
    if (meta) meta.textContent = created || "";

    lb.classList.add("open");
}

// keep last loaded rows for lightbox open
const ROW_BY_ID = new Map();

// =========================
// RENDER POST (full photo + overlay + thin action bar)
// =========================
function renderPost(row) {
    const market = esc(row.market);
    const category = esc(row.category);
    const timeframe = esc(row.timeframe);

    const pairsText = esc(formatPairs(row.pairs));
    const contentRaw = String(row.content ?? "");
    const contentShort = esc(shortText(contentRaw, 140));

    const image = row.image_path || "";
    const created = esc(formatTime(row.created_at));

    const postId = esc(row.id);
    const authorId = esc(row.author_id || "");

    const cover = image
        ? `
    <div class="post-cover" data-open-post="${postId}">
      <img class="post-img" src="${esc(image)}" alt="chart" loading="lazy" decoding="async">

      <div class="post-tags">
        <span>${market || "MARKET"}</span>
        <span>${category || "Category"}</span>
        <span>${timeframe || "TF"}</span>
      </div>

      <div class="post-overlay">
        <div class="post-overlay-title">${pairsText || "PAIR"}</div>
        ${
            contentShort
                ? `<div class="post-overlay-text">${contentShort}</div>`
                : ""
        }
        <div class="post-overlay-meta">${created}</div>
      </div>
    </div>
  `
        : `
    <div class="post-cover noimg">
      <div class="chart-placeholder">NO IMAGE</div>
    </div>
  `;

    return `
  <article class="post-card post-photo" data-post-id="${postId}" data-author-id="${authorId}">
    ${cover}

    <div class="post-actionbar">
      <button class="likeBtn" data-post-id="${postId}" title="Like">
        ❤️ <span class="likeCount">0</span>
      </button>

      <button class="commentToggleBtn" data-post-id="${postId}" title="Comment">
        💬
      </button>

      <button class="followBtn" data-user-id="${authorId}" title="Follow" ${
        authorId ? "" : "disabled"
    }>
        Follow
      </button>
    </div>

    <div class="commentsWrap" data-post-id="${postId}">
      <div class="cHead">
        <div class="cTitle">Comments</div>
        <button class="cClose" type="button" data-post-id="${postId}">✕</button>
      </div>

      <div class="commentsList"></div>

      <form class="commentForm" data-post-id="${postId}">
        <input class="commentInput" placeholder="Write a comment..." maxlength="280" />
        <button class="commentSend" type="submit">Send</button>
      </form>
    </div>
  </article>`;
}

// =========================
// HYDRATE LIKE + FOLLOW STATES
// =========================
async function hydrateNewPosts(justAddedRows) {
    if (!grid) return;

    // like counts
    for (const r of justAddedRows) {
        try {
            const postId = String(r.id);
            const c = await getLikeCount(postId);
            const btn = grid.querySelector(
                `.likeBtn[data-post-id="${CSS.escape(postId)}"]`
            );
            const span = btn?.querySelector(".likeCount");
            if (span) span.textContent = String(c);
        } catch {}
    }

    // follow state
    for (const r of justAddedRows) {
        try {
            const postId = String(r.id);
            const authorId = String(r.author_id || "");
            const btn = grid.querySelector(
                `.post-card[data-post-id="${CSS.escape(postId)}"] .followBtn`
            );
            if (!btn || !authorId) continue;

            const following = await isFollowing(authorId);
            btn.textContent = following ? "Following" : "Follow";
            btn.classList.toggle("isFollowing", following);
        } catch {}
    }
}

// =========================
// POSTS SHOW MORE (6 by 6)
// =========================
const POSTS_STEP = 6;
let postsPage = 0;
let postsBusy = false;
let postsHasMore = true;

function ensurePostsMoreUI() {
    if (!grid) return;

    let wrap = document.getElementById("postsMoreWrap");
    if (!wrap) {
        wrap = document.createElement("div");
        wrap.id = "postsMoreWrap";
        wrap.className = "postsMoreWrap";
        grid.insertAdjacentElement("afterend", wrap);
    }

    if (!postsHasMore) {
        wrap.innerHTML = `<div class="postsMoreEnd">No more posts</div>`;
        return;
    }

    wrap.innerHTML = `<button id="postsMoreBtn" class="postsMoreBtn" type="button">Show more</button>`;
    const btn = document.getElementById("postsMoreBtn");
    if (btn) btn.onclick = () => loadFeedMore();
}

function setPostsMoreLoading() {
    const wrap = document.getElementById("postsMoreWrap");
    if (wrap)
        wrap.innerHTML = `<button class="postsMoreBtn" type="button" disabled>Loading…</button>`;
}

async function loadFeed(reset = false) {
    if (!grid) return;
    if (!sb) {
        setMsg("❌ Supabase CDN not loaded");
        return;
    }

    if (reset) {
        postsPage = 0;
        postsBusy = false;
        postsHasMore = true;
        grid.innerHTML = "";
        setMsg("Loading feed...");
    }

    await loadFeedMore();
}

async function loadFeedMore() {
    if (!grid || !sb || postsBusy || !postsHasMore) return;
    postsBusy = true;
    setMsg("");

    try {
        ensurePostsMoreUI();
        setPostsMoreLoading();

        const from = postsPage * POSTS_STEP;
        const to = from + POSTS_STEP - 1;

        const { data, error } = await sb
            .from("analyses")
            .select(
                "id, author_id, market, category, timeframe, content, pairs, image_path, created_at"
            )
            .order("created_at", { ascending: false })
            .range(from, to);

        if (error) throw error;

        const rows = data || [];

        if (postsPage === 0 && rows.length === 0) {
            setMsg("No analyses yet.");
            postsHasMore = false;
            ensurePostsMoreUI();
            return;
        }

        // save rows for lightbox
        rows.forEach((r) => ROW_BY_ID.set(String(r.id), r));

        grid.insertAdjacentHTML("beforeend", rows.map(renderPost).join(""));
        await hydrateNewPosts(rows);

        if (rows.length < POSTS_STEP) postsHasMore = false;
        else postsPage++;

        ensurePostsMoreUI();
        setMsg("");
    } catch (err) {
        console.error(err);
        setMsg("❌ Feed error: " + (err?.message || "unknown"));
        ensurePostsMoreUI();
    } finally {
        postsBusy = false;
    }
}

// =========================
// NEWS (Supabase -> Slider)
// =========================
async function fetchNews(limit = 6) {
    if (!sb) throw new Error("Supabase CDN not loaded");

    const { data, error } = await sb
        .from("news")
        .select("id, title, image_url, url, source, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);

    if (error) throw error;
    return data || [];
}

function renderNewsSlide(n, active = false) {
    const title = esc(n.title || "");
    const img = esc(n.image_url || "");
    const url = esc(n.url || "#");
    const source = esc(n.source || "");
    const time = esc(formatTime(n.created_at));

    return `
    <div class="newsSlide ${active ? "active" : ""}" data-url="${url}">
      ${
        img
            ? `<img class="newsSlideImg" src="${img}" alt="" loading="lazy" decoding="async">`
            : `<div class="newsSlideSkeleton">NO IMAGE</div>`
    }
      <div class="newsOverlay">
        <h4 class="newsTitle">${title}</h4>
        <div class="newsMeta">${source ? source + " • " : ""}${time}</div>
      </div>
    </div>
  `;
}

let newsTimer = null;

function startNewsAutoRotate() {
    if (!newsSlider) return;
    const slides = Array.from(newsSlider.querySelectorAll(".newsSlide"));
    if (slides.length <= 1) return;

    let idx = 0;
    clearInterval(newsTimer);
    newsTimer = setInterval(() => {
        slides[idx]?.classList.remove("active");
        idx = (idx + 1) % slides.length;
        slides[idx]?.classList.add("active");
    }, 4200);
}

async function loadNews() {
    if (!newsSlider) return;

    newsSlider.innerHTML = `<div class="newsSlideSkeleton">Loading news…</div>`;

    try {
        const items = await fetchNews(6);
        if (!items.length) {
            newsSlider.innerHTML = `<div class="newsSlideSkeleton">No news yet.</div>`;
            return;
        }

        newsSlider.innerHTML = items
            .map((n, i) => renderNewsSlide(n, i === 0))
            .join("");
        startNewsAutoRotate();
    } catch (err) {
        console.error("❌ News error:", err);
        newsSlider.innerHTML = `<div class="newsSlideSkeleton">News unavailable</div>`;
    }
}

document.addEventListener("click", (e) => {
    const slide = e.target.closest(".newsSlide");
    if (!slide) return;
    const url = slide.dataset.url;
    if (url && url !== "#") window.open(url, "_blank", "noopener");
});

// =========================
// EVENTS (Like/Comment/Follow + Lightbox)
// =========================
document.addEventListener("click", async (e) => {
    // lightbox open
    const cover = e.target.closest(".post-cover[data-open-post]");
    if (cover) {
        // ignore if click is on action bar or comments
        if (e.target.closest(".post-actionbar") || e.target.closest(".commentsWrap")) return;

        const postId = cover.dataset.openPost;
        const row = ROW_BY_ID.get(String(postId));
        if (row?.image_path) openLightboxFromRow(row);
        return;
    }

    const closeBtn = e.target.closest(".cClose");
    if (closeBtn) {
        const postId = closeBtn.dataset.postId;
        document
            .querySelector(`.post-card[data-post-id="${CSS.escape(postId)}"]`)
            ?.classList.remove("isCommentsOpen");
        return;
    }

    const likeBtn = e.target.closest(".likeBtn");
    if (likeBtn) {
        const postId = likeBtn.dataset.postId;
        likeBtn.disabled = true;
        try {
            await toggleLike(postId);
            const c = await getLikeCount(postId);
            likeBtn.querySelector(".likeCount").textContent = String(c);
        } catch (err) {
            alert("❌ " + (err?.message || err));
        } finally {
            likeBtn.disabled = false;
        }
        return;
    }

    const tgl = e.target.closest(".commentToggleBtn");
    if (tgl) {
        const postId = tgl.dataset.postId;
        const card = document.querySelector(
            `.post-card[data-post-id="${CSS.escape(postId)}"]`
        );
        if (!card) return;

        const isOpen = card.classList.contains("isCommentsOpen");
        document
            .querySelectorAll(".post-card.isCommentsOpen")
            .forEach((x) => x.classList.remove("isCommentsOpen"));

        if (!isOpen) {
            card.classList.add("isCommentsOpen");
            try {
                const list = await loadComments(postId);
                const box = card.querySelector(
                    `.commentsWrap[data-post-id="${CSS.escape(postId)}"] .commentsList`
                );
                if (box) {
                    box.innerHTML = list
                        .map(
                            (c) => `
              <div class="commentItem">
                <div class="commentText">${esc(c.content)}</div>
                <div class="commentMeta">${esc(formatTime(c.created_at))}</div>
              </div>
            `
                        )
                        .join("");
                    box.scrollTop = box.scrollHeight;
                }
            } catch (err) {
                alert("❌ " + (err?.message || err));
            }
        }
        return;
    }

    const followBtn = e.target.closest(".followBtn");
    if (followBtn) {
        const targetUserId = followBtn.dataset.userId;
        followBtn.disabled = true;
        try {
            const r = await toggleFollow(targetUserId);
            const isFollowingNow = !!r?.following;
            followBtn.textContent = isFollowingNow ? "Following" : "Follow";
            followBtn.classList.toggle("isFollowing", isFollowingNow);
        } catch (err) {
            alert("❌ " + (err?.message || err));
        } finally {
            followBtn.disabled = false;
        }
        return;
    }
});

document.addEventListener("submit", async (e) => {
    const f = e.target.closest(".commentForm");
    if (!f) return;

    e.preventDefault();
    const postId = f.dataset.postId;

    const card = document.querySelector(
        `.post-card[data-post-id="${CSS.escape(postId)}"]`
    );
    const input = card?.querySelector(
        `.commentsWrap[data-post-id="${CSS.escape(postId)}"] .commentInput`
    );
    const text = input?.value || "";

    const btn = f.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;

    try {
        await addComment(postId, text);
        if (input) input.value = "";

        const list = await loadComments(postId);
        const box = card?.querySelector(
            `.commentsWrap[data-post-id="${CSS.escape(postId)}"] .commentsList`
        );
        if (box) {
            box.innerHTML = list
                .map(
                    (c) => `
          <div class="commentItem">
            <div class="commentText">${esc(c.content)}</div>
            <div class="commentMeta">${esc(formatTime(c.created_at))}</div>
          </div>
        `
                )
                .join("");
            box.scrollTop = box.scrollHeight;
        }
    } catch (err) {
        alert("❌ " + (err?.message || err));
    } finally {
        if (btn) btn.disabled = false;
    }
});

// =========================
// INIT
// =========================
document.addEventListener("DOMContentLoaded", () => {
    loadNews();
    loadFeed(true);
    ensureLightbox();
});
