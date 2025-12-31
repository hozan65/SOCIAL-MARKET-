import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
const server = http.createServer(app);

const ORIGIN = process.env.CORS_ORIGIN || "*";
const PORT = Number(process.env.PORT || 3001);
const SOCKET_SECRET = process.env.SOCKET_SECRET || "";

app.use(cors({ origin: ORIGIN === "*" ? true : ORIGIN, credentials: true }));
app.use(express.json({ limit: "1mb" }));

const io = new Server(server, {
    cors: {
        origin: ORIGIN === "*" ? true : ORIGIN,
        methods: ["GET", "POST"],
        credentials: true,
    },
    transports: ["websocket"],
});

app.get("/", (req, res) => res.json({ ok: true, service: "socket-server" }));
app.get("/health", (req, res) => res.json({ ok: true }));

function checkSecret(req, res) {
    if (!SOCKET_SECRET) return true;
    const secret = req.headers["x-socket-secret"];
    if (secret !== SOCKET_SECRET) {
        res.status(401).json({ ok: false, error: "Unauthorized" });
        return false;
    }
    return true;
}

// user rooms (DM)
io.on("connection", (socket) => {
    socket.on("auth_user", (uid) => {
        const id = String(uid || "").trim();
        if (!id) return;
        socket.join(`user:${id}`);
    });
});

// LIKE
app.post("/emit/like", (req, res) => {
    if (!checkSecret(req, res)) return;
    io.emit("like_update", req.body);
    return res.json({ ok: true });
});

// FOLLOW
app.post("/emit/follow", (req, res) => {
    if (!checkSecret(req, res)) return;
    io.emit("follow_update", req.body);
    return res.json({ ok: true });
});

// DM
app.post("/emit/dm", (req, res) => {
    if (!checkSecret(req, res)) return;

    const p = req.body || {};
    if (p.to_id) io.to(`user:${p.to_id}`).emit("dm_new", p);
    if (p.from_id) io.to(`user:${p.from_id}`).emit("dm_new", p);

    return res.json({ ok: true });
});

// COMMENT
app.post("/emit/comment", (req, res) => {
    if (!checkSecret(req, res)) return;
    io.emit("comment_new", req.body);
    return res.json({ ok: true });
});

server.listen(PORT, () => {
    console.log(`✅ socket-server listening on :${PORT}`);
});
