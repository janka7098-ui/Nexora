const socket = io();
const synth = window.speechSynthesis;

let voices = [];

function loadVoices() {
    voices = synth.getVoices();
}
speechSynthesis.onvoiceschanged = loadVoices;

// VOZ
function speak(text) {
    if (!document.getElementById('tts-enabled').checked) return;

    const utter = new SpeechSynthesisUtterance(text);
    utter.volume = document.getElementById('tts-volume').value;

    synth.speak(utter);
}

// CONEXIÓN
document.getElementById('btn-connect').onclick = () => {
    const username = document.getElementById('username').value;
    const key = document.getElementById('key').value;

    if (!username || !key) return alert("Faltan datos");

    socket.emit("startConnection", { username, key });
};

document.getElementById('btn-disconnect').onclick = () => {
    socket.emit("stopConnection");
};

// STATUS
socket.on("status", (status) => {
    const text = document.getElementById('connection-status');

    if (status === "connected") {
        text.innerText = "ONLINE";
        text.style.color = "cyan";
    } else {
        text.innerText = "OFFLINE";
        text.style.color = "red";
    }
});

// CHAT
socket.on("chat", (data) => {
    const container = document.getElementById('chat-container');

    const div = document.createElement('div');
    div.innerText = `${data.user}: ${data.message}`;

    container.prepend(div);

    speak(`${data.user} dice ${data.message}`);
});

// REGALOS
socket.on("gift", (data) => {
    const container = document.getElementById('gift-container');

    const div = document.createElement('div');
    div.innerText = `${data.user} envió ${data.gift}`;

    container.prepend(div);
});

// GUARDAR
document.getElementById('btn-save-action').onclick = () => {
    alert("Guardado (ejemplo)");
};
