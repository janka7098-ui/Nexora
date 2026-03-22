const express = require("express");
const http = require("http");
const { WebcastPushConnection } = require("tiktok-live-connector");
const socketIo = require("socket.io");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { maxHttpBufferSize: 1e7 });

// ✅ SERVIR ARCHIVOS HTML
app.use(express.static("public"));
app.use(express.json());

// ✅ RUTA PRINCIPAL
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
   API ROBLOX
========================= */
app.get("/ping", (req, res) => {
    res.json({ mensaje: "OK" });
});

app.get("/lastevent", (req, res) => {
    res.json(currentEvent);
});

app.post("/test", (req, res) => {
    const { gift, repeatCount, parts, type, robloxUser } = req.body;

    currentEvent = {
        id: Date.now().toString(),
        action: type === "win" ? "win" : "move",
        amount: Number(parts || 1) * Number(repeatCount || 1),
        target: robloxUser === "ALL_USERS" ? "ALL" : (robloxUser || "ALL")
    };

    console.log("🔥 Evento TEST:", currentEvent);
    res.json({ success: true });
});

app.get("/get-event", (req, res) => {
    res.json(currentEvent);
});

app.get("/reset", (req, res) => {
    currentEvent = {
        id: Date.now().toString(),
        action: "reset",
        amount: 0,
        target: "ALL"
    };
    res.json({ success: true });
});

/* =========================
   REGALOS
========================= */
app.get("/gift-list", (req, res) => {
    const giftsPath = path.join(__dirname, "public", "regalos");

    if (!fs.existsSync(giftsPath)) return res.json([]);

    fs.readdir(giftsPath, (err, files) => {
        if (err) return res.json([]);

        const giftList = files
            .filter(f => f.toLowerCase().endsWith(".png"))
            .map(f => ({
                name: f.replace(".png", ""),
                image: "/regalos/" + f
            }));

        res.json(giftList);
    });
});

/* =========================
   AVATAR PROXY
========================= */
app.get("/avatar-proxy", async (req, res) => {
    try {
        const url = req.query.url;
        const response = await axios.get(url, { responseType: "arraybuffer" });

        res.set("Content-Type", "image/jpeg");
        res.send(response.data);
    } catch {
        res.status(500).send("error");
    }
});

/* =========================
   SOCKET + TIKTOK
========================= */
const allowedKeys = [
    "nexora01","nexora02","nexora03","nexora04","nexora05",
    "nexora06","nexora07","nexora08","nexora09","nexora10"
];

const activeConnections = new Map();

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

            // 🎁 REGALOS
            tiktok.on("gift", (data) => {
                if (data.repeatEnd) {

                    socket.emit("gift", {
                        user: data.nickname,
                        gift: data.giftName,
                        amount: data.repeatCount,
                        image: `/regalos/${data.giftName}.png`,
                        avatar: data.profilePictureUrl
                    });

                    // 👉 ENVÍO A ROBLOX
                    currentEvent = {
                        id: Date.now().toString(),
                        action: "move",
                        amount: data.repeatCount,
                        target: "ALL"
                    };

                    console.log(`🎁 ${data.giftName} x${data.repeatCount}`);
                }
            });

            // 💬 CHAT
            tiktok.on("chat", (data) => {
                socket.emit("chat", {
                    user: data.nickname,
                    message: data.comment,
                    avatar: data.profilePictureUrl
                });
            });

        } catch (err) {
            console.log("Error TikTok:", err);
            socket.emit("status", "error");
        }
    });

    socket.on("disconnect", () => {
        if (activeConnections.has(socket.id)) {
            try {
                activeConnections.get(socket.id).disconnect();
            } catch {}
            activeConnections.delete(socket.id);
        }
    });

});

/* =========================
   PUERTO (RENDER)
========================= */
const PORT = process.env.PORT || 10000;

server.listen(PORT, () => {
    console.log("🚀 Servidor activo en puerto", PORT);
});
