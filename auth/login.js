import { account, ID } from "/assets/appwrite.js";

document.addEventListener("DOMContentLoaded", () => {
    const submitBtn = document.getElementById("submitBtn");
    const googleBtn = document.getElementById("googleBtn");
    const msgEl = document.getElementById("msg");

    const tabLogin = document.getElementById("tabLogin");
    const tabRegister = document.getElementById("tabRegister");

    const firstNameEl = document.getElementById("firstName");
    const lastNameEl = document.getElementById("lastName");
    const regFields = document.getElementById("regFields");

    // ✅ NEW: sm-api base
    const SM_API_BASE = "https://api.chriontoken.com";

    let busy = false;
    let mode = "login";

    function setMsg(t) {
        if (msgEl) msgEl.textContent = t || "";
    }

    function getCreds() {
        const email = document.getElementById("email")?.value?.trim() || "";
        const password = document.getElementById("password")?.value || "";
        return { email, password };
    }

    function getNames() {
        const first = (firstNameEl?.value || "").trim();
        const last = (lastNameEl?.value || "").trim();
        const full = `${first} ${last}`.trim();
        return { first, last, full };
    }

    function setMode(m) {
        mode = m;

        tabLogin?.classList.toggle("active", m === "login");
        tabRegister?.classList.toggle("active", m === "register");

        if (regFields) {
            const open = m === "register";
            regFields.classList.toggle("open", open);
            regFields.setAttribute("aria-hidden", open ? "false" : "true");

            if (!open) {
                if (firstNameEl) firstNameEl.value = "";
                if (lastNameEl) lastNameEl.value = "";
            }
        }

        if (submitBtn) submitBtn.textContent = m === "login" ? "Login" : "Register";
        setMsg("");
    }

    tabLogin?.addEventListener("click", () => setMode("login"));
    tabRegister?.addEventListener("click", () => setMode("register"));

    // ✅ NEW: sm-api ping (ensure user + settings row)
    async function ensureBackendReady(appwriteUid) {
        const uid = String(appwriteUid || "").trim();
        if (!uid) return;

        try {
            await fetch(`${SM_API_BASE}/api/settings?me=${encodeURIComponent(uid)}`, {
                method: "GET",
            });
        } catch (e) {
            // non-blocking
            console.warn("sm-api ensure (non-blocking) failed:", e?.message || e);
        }
    }

    async function afterLogin() {
        const user = await account.get();

        // Appwrite UID (frontend uses this for sm-api me=...)
        localStorage.setItem("sm_uid", user.$id);

        // JWT is optional (keep if your app uses it elsewhere)
        try {
            const jwtObj = await account.createJWT();
            if (jwtObj?.jwt) localStorage.setItem("sm_jwt", jwtObj.jwt);
        } catch {}

        // ✅ ensure user exists in Postgres (Hetzner) + settings row
        await ensureBackendReady(user.$id);
    }

    function goFeed() {
        window.location.href = "/feed/feed.html";
    }

    submitBtn?.addEventListener("click", async () => {
        if (busy) return;
        busy = true;

        const { email, password } = getCreds();
        if (!email || !password) {
            busy = false;
            return;
        }

        try {
            if (mode === "login") {
                setMsg("Logging in...");
                await account.createEmailPasswordSession(email, password);
            } else {
                const { full } = getNames();
                if (!full) {
                    alert("Please enter Name and Surname");
                    setMsg("");
                    busy = false;
                    return;
                }

                setMsg("Creating account...");
                await account.create(ID.unique(), email, password, full);

                setMsg("Opening session...");
                await account.createEmailPasswordSession(email, password);
            }

            setMsg("Preparing session...");
            await afterLogin();

            setMsg("Done");
            goFeed();
        } catch (e) {
            console.error(e);
            alert(e?.message || "Auth error");
            setMsg("");
        } finally {
            busy = false;
        }
    });

    googleBtn?.addEventListener("click", () => {
        const success = location.origin + "/feed/feed.html";
        const failure = location.origin + "/auth/login.html";
        account.createOAuth2Session("google", success, failure);
    });

    setMode("login");
});
