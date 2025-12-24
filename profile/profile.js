// /profile/profile.js (MODULE) - FINAL
// ✅ Appwrite login + JWT (for Netlify Functions)
// ✅ Supabase READ (public) for loading profile
// ✅ Supabase WRITE via Netlify Function (service role) for saving

import { account } from "/assets/appwrite.js";
import { supabase } from "/services/supabase.js";

const $ = (id) => document.getElementById(id);

const FN_UPSERT_PROFILE = "/.netlify/functions/upsert_profile";

function safeText(v) {
    return String(v ?? "").trim();
}

function avatarFromEmail(email) {
    const seed = encodeURIComponent(String(email || "user").trim().toLowerCase());
    return `https://api.dicebear.com/7.x/identicon/svg?seed=${seed}`;
}

function getJWT() {
    const jwt = localStorage.getItem("sm_jwt");
    if (!jwt) throw new Error("Login required");
    return jwt;
}

async function ensureJWT() {
    // try to create & store a fresh jwt (best-effort)
    try {
        const jwtObj = await account.createJWT();
        if (jwtObj?.jwt) localStorage.setItem("sm_jwt", jwtObj.jwt);
    } catch {
        // keep existing if any
    }
}

async function saveProfileViaFunction(payload) {
    // Make sure we have a JWT (create if missing/old)
    if (!localStorage.getItem("sm_jwt")) await ensureJWT();
    const jwt = getJWT();

    const r = await fetch(FN_UPSERT_PROFILE, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${jwt}`,
        },
        body: JSON.stringify(payload),
    });

    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error || `Save failed (${r.status})`);
    return j;
}

async function boot() {
    let user;
    try {
        user = await account.get();
    } catch {
        location.href = "/auth/login.html";
        return;
    }

    // Save viewer id for non-module pages
    localStorage.setItem("sm_uid", user.$id);

    // ✅ Ensure JWT for Netlify Functions
    await ensureJWT();

    const email = safeText(user.email);
    const name = safeText(user.name) || email.split("@")[0] || "Profile";

    // top area
    $("nameText").textContent = name;
    $("emailText").textContent = email;
    $("providerPill").textContent = "Appwrite";
    $("avatarImg").src = avatarFromEmail(email);

    // form defaults
    $("nameInput").value = name;
    $("emailInput").value = email;

    // load existing profile from Supabase (READ)
    const { data: p, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("appwrite_user_id", user.$id)
        .maybeSingle();

    if (error) console.warn("profile load:", error.message);

    if (p) {
        $("skillsInput").value = p.skills || "";
        $("descInput").value = p.description || "";
        $("bioInput").value = p.bio || "";

        $("xInput").value = p.x || "";
        $("ytInput").value = p.youtube || "";
        $("fbInput").value = p.facebook || "";
        $("igInput").value = p.instagram || "";
        $("webInput").value = p.website || "";

        $("followersNum").textContent = String(p.followers ?? 0);
        $("followingNum").textContent = String(p.following ?? 0);

        $("avatarImg").src = p.avatar_url || avatarFromEmail(email);
    } else {
        $("followersNum").textContent = "0";
        $("followingNum").textContent = "0";
    }

    async function onSave() {
        $("statusText").textContent = "Saving...";
        const nextName = safeText($("nameInput").value);

        const payload = {
            // server will overwrite appwrite_user_id with verified userId, but we send anyway
            appwrite_user_id: user.$id,
            email,
            name: nextName || name,
            avatar_url: avatarFromEmail(email),

            skills: safeText($("skillsInput").value),
            description: safeText($("descInput").value),
            bio: safeText($("bioInput").value),

            x: safeText($("xInput").value),
            youtube: safeText($("ytInput").value),
            facebook: safeText($("fbInput").value),
            instagram: safeText($("igInput").value),
            website: safeText($("webInput").value),

            followers: Number($("followersNum").textContent || 0),
            following: Number($("followingNum").textContent || 0),
        };

        try {
            // update Appwrite display name too
            if (nextName && nextName !== safeText(user.name)) {
                await account.updateName(nextName);
                $("nameText").textContent = nextName;
            }

            await saveProfileViaFunction(payload);

            $("statusText").textContent = "✅ Saved";
            setTimeout(() => ($("statusText").textContent = ""), 2000);
        } catch (e) {
            console.error(e);
            $("statusText").textContent = "";
            alert(e?.message || "Save error");
        }
    }

    $("saveBtn").onclick = onSave;
    $("saveBtnTop").onclick = onSave;

    $("logoutBtn").onclick = async () => {
        try {
            await account.deleteSession("current");
        } catch {}
        localStorage.removeItem("sm_uid");
        localStorage.removeItem("sm_jwt");
        location.href = "/auth/login.html";
    };

    // Tabs (if you kept them)
    document.querySelectorAll(".tab").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            const tab = btn.dataset.tab;
            document.querySelectorAll(".tabPane").forEach((p) => p.classList.remove("show"));
            document.getElementById(`tab-${tab}`)?.classList.add("show");
        });
    });
}

boot();
