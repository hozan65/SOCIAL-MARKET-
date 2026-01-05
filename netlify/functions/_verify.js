// netlify/functions/_verify.js
// ✅ Robust JWT extraction (Authorization / X-Appwrite-JWT / x-jwt)
// ✅ Verify via node-appwrite if possible, fallback to Appwrite /account HTTP (most stable)

import { Client, Account } from "node-appwrite";

const DEFAULT_TIMEOUT_MS = 6500;

function getHeaderAny(eventOrReq, name) {
    const lower = String(name).toLowerCase();

    // Netlify event.headers + event.multiValueHeaders
    const h = eventOrReq?.headers || {};
    const mvh = eventOrReq?.multiValueHeaders || {};

    // multiValueHeaders first
    for (const k of Object.keys(mvh || {})) {
        if (String(k).toLowerCase() === lower) {
            const v = mvh[k];
            if (Array.isArray(v) && v[0]) return String(v[0]);
            if (typeof v === "string") return v;
        }
    }

    // plain object headers
    for (const k of Object.keys(h || {})) {
        if (String(k).toLowerCase() === lower) return String(h[k] ?? "");
    }

    // Fetch Request headers (node/edge)
    if (typeof h?.get === "function") {
        return String(h.get(name) || h.get(lower) || "");
    }
    if (typeof eventOrReq?.headers?.get === "function") {
        return String(eventOrReq.headers.get(name) || eventOrReq.headers.get(lower) || "");
    }

    return "";
}

export function getBearer(eventOrReq) {
    const auth = (getHeaderAny(eventOrReq, "authorization") || "").trim();
    if (auth) {
        const m = auth.match(/^Bearer\s+(.+)$/i);
        if (m?.[1]) return m[1].trim();
        // bazı client’lar Bearer yazmadan düz token atabiliyor:
        return auth;
    }

    // ✅ support other headers used in your frontend
    const xjwt =
        (getHeaderAny(eventOrReq, "x-appwrite-jwt") || "").trim() ||
        (getHeaderAny(eventOrReq, "x-jwt") || "").trim() ||
        (getHeaderAny(eventOrReq, "sm-jwt") || "").trim();

    return xjwt || "";
}

// ✅ Fallback HTTP verify (most stable)
async function verifyViaHttp(jwt, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    const endpoint = (process.env.APPWRITE_ENDPOINT || "").trim();
    const projectId = (process.env.APPWRITE_PROJECT_ID || "").trim();
    if (!endpoint || !projectId) throw new Error("Missing Appwrite env");

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
        const r = await fetch(`${endpoint}/account`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "X-Appwrite-Project": projectId,
                "X-Appwrite-JWT": jwt,
            },
            signal: ctrl.signal,
        });

        const txt = await r.text().catch(() => "");
        let data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch { data = null; }

        if (!r.ok) {
            const msg = data?.message || data?.error || `Appwrite /account failed: HTTP ${r.status}`;
            throw new Error(msg);
        }

        if (!data?.$id) throw new Error("Invalid JWT");
        return data;
    } catch (e) {
        if (String(e?.name || "").toLowerCase() === "aborterror") {
            throw new Error("Appwrite /account timeout");
        }
        throw e;
    } finally {
        clearTimeout(t);
    }
}

// ✅ Appwrite JWT -> user doğrulama
export async function verifyAppwriteUser(eventOrReq, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    const jwt = getBearer(eventOrReq);
    if (!jwt) throw new Error("Missing JWT");

    const endpoint = (process.env.APPWRITE_ENDPOINT || "").trim();
    const projectId = (process.env.APPWRITE_PROJECT_ID || "").trim();
    if (!endpoint || !projectId) throw new Error("Missing Appwrite env");

    // 1) Try node-appwrite SDK (fast, clean)
    try {
        const client = new Client().setEndpoint(endpoint).setProject(projectId);
        const account = new Account(client);

        if (typeof client.setJWT === "function") {
            client.setJWT(jwt);
            const me = await account.get();
            if (!me?.$id) throw new Error("Invalid JWT");
            return {
                uid: me.$id,
                email: me.email || "",
                name: me.name || "",
                jwt,
                source: "node-appwrite",
            };
        }
        // if setJWT missing, fallthrough to HTTP
    } catch (e) {
        // fall back below
    }

    // 2) Fallback to HTTP /account (most stable across SDK changes)
    const me = await verifyViaHttp(jwt, { timeoutMs });

    return {
        uid: me.$id,
        email: me.email || "",
        name: me.name || "",
        jwt,
        source: "http-account",
    };
}
