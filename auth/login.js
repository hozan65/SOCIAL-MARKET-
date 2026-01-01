import { account, ID } from "/assets/appwrite.js";

const submitBtn = document.getElementById("submitBtn");
const googleBtn = document.getElementById("googleBtn");
const msgEl = document.getElementById("msg");

const tabLogin = document.getElementById("tabLogin");
const tabRegister = document.getElementById("tabRegister");

const firstNameEl = document.getElementById("firstName");
const lastNameEl = document.getElementById("lastName");

const FN_ENSURE = "/.netlify/functions/ensure_profile";

let busy = false;
let mode = "login"; // "login" | "register"

function setMsg(t){ if (msgEl) msgEl.textContent = t || ""; }

function getCreds(){
    const email = document.getElementById("email")?.value?.trim() || "";
    const password = document.getElementById("password")?.value || "";
    return { email, password };
}

function getNames(){
    const first = (firstNameEl?.value || "").trim();
    const last = (lastNameEl?.value || "").trim();
    const full = `${first} ${last}`.trim();
    return { first, last, full };
}

function setMode(m){
    mode = m;
    tabLogin?.classList.toggle("active", m === "login");
    tabRegister?.classList.toggle("active", m === "register");

    // ✅ register modunda name/surname göster
    if (firstNameEl) firstNameEl.style.display = (m === "register") ? "block" : "none";
    if (lastNameEl) lastNameEl.style.display = (m === "register") ? "block" : "none";

    if (submitBtn) submitBtn.textContent = m === "login" ? "Login" : "Register";
    setMsg("");
    console.log(" MODE:", mode);
}

tabLogin?.addEventListener("click", () => setMode("login"));
tabRegister?.addEventListener("click", () => setMode("register"));

async function afterLogin(){
    const user = await account.get();
    localStorage.setItem("sm_uid", user.$id);

    const jwtObj = await account.createJWT();
    if (jwtObj?.jwt) localStorage.setItem("sm_jwt", jwtObj.jwt);

    // ✅ Profil row garanti + name sync (User kalmasın)
    try{
        await fetch(FN_ENSURE, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${jwtObj?.jwt || ""}`,
                "X-Appwrite-JWT": jwtObj?.jwt || ""
            },
            body: JSON.stringify({ ok: true })
        });
    } catch (e) {
        console.warn("ensure_profile failed (non-blocking):", e?.message || e);
    }
}

function goFeed(){ window.location.href = "/feed/feed.html"; }

submitBtn?.addEventListener("click", async () => {
    if (busy) return;
    busy = true;

    const { email, password } = getCreds();
    if (!email || !password){ busy = false; return; }

    try{
        if (mode === "login"){
            setMsg("Logging in...");
            await account.createEmailPasswordSession(email, password);

        } else {
            // ✅ register: name + surname zorunlu
            const { full } = getNames();
            if (!full){
                alert("Please enter Name and Surname");
                setMsg("");
                busy = false;
                return;
            }

            setMsg("Creating account...");

            // ✅ Appwrite name = fullName (User kalmaz)
            await account.create(ID.unique(), email, password, full);

            setMsg("Opening session...");
            await account.createEmailPasswordSession(email, password);
        }

        setMsg("Preparing session...");
        await afterLogin();

        setMsg(" Done");
        goFeed();

    } catch(e){
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

// default
setMode("login");
