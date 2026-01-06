// /auth/login.js (FINAL - Appwrite auth + JWT + Hetzner user sync)
import { account, ID } from "/assets/appwrite.js";
import "/assets/jwt.js"; // provides SM_JWT_READY / SM_REFRESH_JWT / SM_JWT
import { syncUser } from "/assets/user-sync.js";

document.addEventListener("DOMContentLoaded", () => {
    const submitBtn = document.getElementById("submitBtn");
    const googleBtn = document.getElementById("googleBtn");
    const msgEl = document.getElementById("msg");

    const tabLogin = document.getElementById("tabLogin");
    const tabRegister = document.getElementById("tabRegister");

    const firstNameEl = document.getElementById("firstName");
    const lastNameEl = document.getElementById("lastName");
    const regFields = document.getElementById("regFields");

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

    async function afterLoginFlow() {
        // 1) get user + cache uid
        const user = await account.get();
        if (user?.$id) {
            localStorage.setItem("sm_uid", user.$id);
            window.APPWRITE_USER_ID = user.$id;

            // realtime (if loaded) auth trigger
            try {
                window.dispatchEvent(new Event("sm:uid_ready"));
            } catch {}
        }

        // 2) ensure JWT exists (non-blocking hard-fail only if needed)
        try {
            if (window.SM_JWT_READY) await window.SM_JWT_READY;
            // if still missing, try refresh
            if (!((window.SM_JWT || localStorage.getItem("sm_jwt") || "").trim()) && window.SM_REFRESH_JWT) {
                await window.SM_REFRESH_JWT();
            }
        } catch {}

        // 3) sync user to Hetzner Postgres (profiles/settings etc.)
        // non-blocking: if backend down, user can still browse UI, but features may fail later
        try {
            await syncUser();
        } catch {}
    }

    function goFeed() {
        window.location.href = "/feed/feed.html";
    }

    submitBtn?.addEventListener("click", async () => {
        if (busy) return;
        busy = true;

        const { email, password } = getCreds();
        if (!email || !password) {
            setMsg("Enter email + password");
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
            await afterLoginFlow();

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
