const express = require("express");
const http = require("http");
const { WebcastPushConnection } = require("tiktok-live-connector");
const socketIo = require("socket.io");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
    maxHttpBufferSize: 1e7
});

// ✅ IMPORTANTE: SERVIR HTML
app.use(express.static("public"));

// Middleware
app.use(express.json());

/* =========================
   RUTA PRINCIPAL (INDEX)
========================= */
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* =========================
   ESTADO PARA ROBLOX
========================= */
let currentEvent = {
    id: "0",
    action: "none",
    amount: 0,
    target: "ALL"
};

/* =========================
   PUENTE PARA ROBLOX
========================= */
app.get('/ping', (req, res) => {
    console.log("👋 ¡Bingo! El panel web se comunicó.");
    res.json({ mensaje: "Prueba exitosa" });
});

app.get('/lastevent', (req, res) => {
    res.json(currentEvent);
});

app.post('/test', (req, res) => {
    const { gift, repeatCount, parts, type, robloxUser } = req.body;

    currentEvent = {
        id: Date.now().toString(),
        action: type === "win" ? "win" : "move",
        amount: Number(parts) * Number(repeatCount), 
        target: robloxUser === "ALL_USERS" ? "ALL" : robloxUser
    };

    console.log("🔥 Nuevo evento (TEST):", currentEvent);
    res.json({ success: true, message: "Evento enviado a Roblox" });
});

app.get('/get-event', (req, res) => {
    res.json(currentEvent);
});

app.get('/reset', (req, res) => {
    currentEvent = {
        id: Date.now().toString(),
        action: "reset",
        amount: 0,
        target: "ALL"
    };
    console.log("🔄 Reset general activado");
    res.json({ success: true });
});

/* =========================
   LISTA DE REGALOS Y PROXY
========================= */
app.get("/gift-list", (req, res) => {
    const giftsPath = path.join(__dirname, "public", "regalos");
    if (!fs.existsSync(giftsPath)) return res.json([]);
    fs.readdir(giftsPath, (err, files) => {
        if (err) return res.json([]);
        const giftList = files
            .filter(f => f.toLowerCase().endsWith(".png"))
            .map(f => ({ name: f.replace(".png", ""), image: "/regalos/" + f }));
        res.json(giftList);
    });
});

app.get("/avatar-proxy", async (req, res) => {
    try {
        const url = req.query.url;
        const response = await axios.get(url, { responseType: "arraybuffer" });
        res.set("Content-Type", "image/jpeg");
        res.send(response.data);
    } catch (err) { res.status(500).send("avatar error"); }
});

const allowedKeys = ["nexora01", "nexora02", "nexora03", "nexora04", "nexora05", "nexora06", "nexora07", "nexora08", "nexora09", "nexora10"];
const activeConnections = new Map();
const userActions = new Map();

/* =========================
   SOCKET.IO LOGIC
========================= */
io.on("connection", (socket) => {

    socket.on("startConnection", async ({ username, key }) => {
        if (!username || !key) return;
        if (!allowedKeys.includes(key)) {
            socket.emit("status", "invalid_key");
            return;
        }

        const tiktok = new WebcastPushConnection(username);

        try {
            await tiktok.connect();
            activeConnections.set(socket.id, tiktok);
            socket.emit("status", "connected");

            tiktok.on("gift", (data) => {
                if (data.repeatEnd) {
                    socket.emit("gift", {
                        user: data.nickname,
                        gift: data.giftName,
                        amount: data.repeatCount,
                        image: `/regalos/${data.giftName}.png`,
                        avatar: data.profilePictureUrl
                    });

                    currentEvent = {
                        id: Date.now().toString(),
                        action: "move",
                        amount: data.repeatCount,
                        target: "ALL"
                    };

                    console.log(`🎁 Regalo en Vivo: ${data.giftName} x${data.repeatCount} -> Roblox`);
                }
            });

            tiktok.on("chat", (data) => {
                socket.emit("chat", {
                    user: data.nickname,
                    message: data.comment,
                    avatar: data.profilePictureUrl,
                    isMod: data.isModerator,
                    isSub: data.isSubscriber,
                    isFollower: data.followRole === 1 || data.followRole === 2
                });
            });

        } catch (err) { socket.emit("status", "error"); }
    });

    socket.on("disconnect", () => {
        if (activeConnections.has(socket.id)) {
            try { activeConnections.get(socket.id).disconnect(); } catch { }
            activeConnections.delete(socket.id);
        }
    });
});

/* =========================
   PUERTO (RENDER)
========================= */
const PORT = process.env.PORT || 10000;

server.listen(PORT, () => {
    console.
