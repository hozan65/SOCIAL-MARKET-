// /auth/login.js (MODULE)
// ✅ Appwrite login/register/google
// ✅ After login: store sm_uid + sm_jwt (for Netlify Functions)

import { account, ID } from "/assets/appwrite.js";

const form = document.getElementById("authForm");
const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");
const googleBtn = document.getElementById("googleBtn");
const msgEl = document.getElementById("msg");

let busy = false;

function setMsg(t) {
    if (msgEl) msgEl.textContent = t || "";
}

function getCreds() {
    const email = document.getElementById("email")?.value?.trim() || "";
    const password = document.getElementById("password")?.value || ""; // ✅ trim yok
    return { email, password };
}

form?.addEventListener("submit", (e) => e.preventDefault());

async function afterLogin() {
    // 1) get user and store uid
    const user = await account.get();
    localStorage.setItem("sm_uid", user.$id);

    // 2) create/store JWT for Netlify Functions
    // (functions use Authorization: Bearer <jwt>)
    try {
        const jwtObj = await account.createJWT();
        if (jwtObj?.jwt) localStorage.setItem("sm_jwt", jwtObj.jwt);
    } catch (e) {
        // if jwt fails for any reason, clear so we don't use stale
        localStorage.removeItem("sm_jwt");
        throw e;
    }
}

function goFeed() {
    window.location.href = "/feed/feed.html";
}

loginBtn.onclick = async () => {
    if (busy) return;
    busy = true;

    const { email, password } = getCreds();
    if (!email || !password) {
        busy = false;
        return;
    }

    try {
        setMsg("Logging in...");
        await account.createEmailPasswordSession(email, password);

        setMsg("Preparing session...");
        await afterLogin();

        setMsg("✅ Logged in");
        goFeed();
    } catch (e) {
        console.error(e);
        setMsg("");
        alert(e?.message || "Login error");
    } finally {
        busy = false;
    }
};

registerBtn.onclick = async () => {
    if (busy) return;
    busy = true;

    const { email, password } = getCreds();
    if (!email || !password) {
        busy = false;
        return;
    }

    try {
        setMsg("Creating account...");
        await account.create(ID.unique(), email, password, email.split("@")[0]);

        setMsg("Opening session...");
        await account.createEmailPasswordSession(email, password);

        setMsg("Preparing session...");
        await afterLogin();

        setMsg("✅ Registered & logged in");
        goFeed();
    } catch (e) {
        console.error(e);
        setMsg("");
        alert(e?.message || "Register error");
    } finally {
        busy = false;
    }
};

googleBtn.onclick = () => {
    const success = location.origin + "/feed/feed.html";
    const failure = location.origin + "/auth/login.html";

    // OAuth redirect
    account.createOAuth2Session("google", success, failure);
};
