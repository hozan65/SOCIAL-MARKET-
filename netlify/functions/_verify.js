// ✅ Named export: getBearer
export function getBearer(eventOrReq) {
    // Netlify Function event (event.headers.authorization)
    const h1 =
        eventOrReq?.headers?.authorization ||
        eventOrReq?.headers?.Authorization ||
        "";

    // Fetch Request object (req.headers.get("authorization"))
    const h2 =
        typeof eventOrReq?.headers?.get === "function"
            ? eventOrReq.headers.get("authorization") || eventOrReq.headers.get("Authorization") || ""
            : "";

    const header = String(h1 || h2 || "").trim();

    // "Bearer xxx"
    const m = header.match(/^Bearer\s+(.+)$/i);
    return m ? m[1].trim() : "";
}
