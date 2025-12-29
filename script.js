import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getDatabase, ref, onValue, update, get } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyDRpeeM5RMKPW1CCQao9T1bTPjJ9jwlDM0",
    authDomain: "night-patrolling-robot-ca1c9.firebaseapp.com",
    databaseURL: "https://night-patrolling-robot-ca1c9-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "night-patrolling-robot-ca1c9",
    storageBucket: "night-patrolling-robot-ca1c9.firebasestorage.app",
    messagingSenderId: "548180345208",
    appId: "1:548180345208:web:569e7768477534ca07888d"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Logging
window.logMsg = function (msg) {
    const logDiv = document.getElementById('sys-log');
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    const entry = document.createElement('div');
    entry.innerText = `> [${time}] ${msg}`;
    logDiv.appendChild(entry);
    logDiv.scrollTop = logDiv.scrollHeight;
}

// Connection Status
onValue(ref(db, ".info/connected"), (snap) => {
    const el = document.getElementById("connectionStatus");
    if (snap.val() === true) {
        el.innerText = "UPLINK: ONLINE";
        el.className = "text-xs md:text-sm bg-green-900 px-3 py-1 rounded border border-green-500 shadow-[0_0_10px_#00ff41]";
        logMsg("UPLINK ESTABLISHED");
    } else {
        el.innerText = "UPLINK: OFFLINE";
        el.className = "text-xs md:text-sm bg-red-900 px-3 py-1 rounded border border-red-500 animate-pulse";
        logMsg("CONNECTION LOST");
    }
});

// --- ROBOT HEARTBEAT STATUS ---
onValue(ref(db, 'robot/lastSeen'), (snap) => {
    const lastSeen = snap.val();
    const el = document.getElementById("robotStatus");

    if (!lastSeen) {
        el.innerText = "ROBOT: OFFLINE";
        el.className = "text-xs md:text-sm bg-red-900 px-3 py-1 rounded border border-red-500 animate-pulse";
        return;
    }

    const now = Date.now();
    const isOnline = (now - lastSeen) < 6000;

    if (isOnline) {
        el.innerText = "ROBOT: ONLINE";
        el.className =
            "text-xs md:text-sm bg-green-900 px-3 py-1 rounded border border-green-500 shadow-[0_0_10px_#00ff41]";
    } else {
        el.innerText = "ROBOT: OFFLINE";
        el.className =
            "text-xs md:text-sm bg-red-900 px-3 py-1 rounded border border-red-500 animate-pulse";
    }
});

// --- MAP & GEOLOCATION LOGIC ---
let map, marker;
function initMap() {
    // Default base location (map center when robot is offline)
    const defaultLoc = [28.721, 77.102]; // for example, your base location
    map = L.map('map', { zoomControl: false }).setView(defaultLoc, 15);

    // Add tile layer
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '' }).addTo(map);

    // Robot icon
    const robotIcon = L.divIcon({
        className: 'custom-div-icon',
        html: "<div style='background-color:#00ff41; width:10px; height:10px; border-radius:50%; box-shadow:0 0 10px #00ff41;'></div>",
        iconSize: [10, 10],
        iconAnchor: [5, 5]
    });

    // Initialize marker at default location (hidden)
    marker = L.marker(defaultLoc, { icon: robotIcon }).addTo(map);
    marker.setOpacity(0); // hide initially

    onValue(ref(db, 'robot/location'), (snap) => {
        const val = snap.val();
        if (!val || !val.lat || !val.lng) {
            marker.setOpacity(0); // keep hidden if no location
            return;
        }

        const { lat, lng } = val;
        document.getElementById('val-lat').innerText = lat.toFixed(5);
        document.getElementById('val-lng').innerText = lng.toFixed(5);
        document.getElementById('gps-status').innerText = "SIGNAL LOCKED";
        document.getElementById('gps-status').className = "text-xs text-green-500 font-bold";


        const newLoc = [lat, lng];

        marker.setLatLng(newLoc);
        marker.setOpacity(1);
        map.panTo(newLoc);
    });
}

function updatePosition(position) {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;

    // Update UI
    document.getElementById('gps-status').innerText = "SIGNAL LOCKED";
    document.getElementById('gps-status').className = "text-xs text-green-500 font-bold";
    document.getElementById('val-lat').innerText = lat.toFixed(5);
    document.getElementById('val-lng').innerText = lng.toFixed(5);

    // Update Map
    const newLoc = [lat, lng];
    marker.setLatLng(newLoc);
    map.panTo(newLoc);
}

initMap();

// --- CONTROL LOGIC ---
let currentCommand = 'stop';
let commandInterval = null;

window.setMode = function (mode) {
    update(ref(db, 'robot/control'), { mode: mode, command: 'stop' })
        .then(() => {
            document.getElementById('cmd-status').innerText = "MODE: " + mode.toUpperCase();
            logMsg(`MODE: ${mode.toUpperCase()}`);

            const manualBtn = document.getElementById('btn-manual');
            const autoBtn = document.getElementById('btn-auto');
            const dpad = document.getElementById('dpad');

            if (mode === 'auto') {
                manualBtn.className = "flex-1 py-1 text-sm rounded text-gray-400 hover:text-white transition-colors";
                autoBtn.className = "flex-1 py-1 text-sm rounded bg-green-600 text-black font-bold hover:opacity-90 transition-colors";
                dpad.style.opacity = "0.3";
                dpad.style.pointerEvents = "none";
            } else {
                manualBtn.className = "flex-1 py-1 text-sm rounded bg-green-600 text-black font-bold hover:opacity-90 transition-colors";
                autoBtn.className = "flex-1 py-1 text-sm rounded text-gray-400 hover:text-white transition-colors";
                dpad.style.opacity = "1";
                dpad.style.pointerEvents = "auto";
            }
        });
}

window.handleInput = async function (cmd, btn, event) {
    if (event.cancelable) event.preventDefault();

    const modeSnap = await get(ref(db, 'robot/control/mode'));
    if (modeSnap.val() === 'auto') return;

    if (commandInterval) return;

    sendCommand(cmd);
    currentCommand = cmd;

    if (btn) btn.classList.add('active-key');

    commandInterval = setInterval(() => {
        sendCommand(cmd);
    }, 500);
};

window.sendCommand = function (cmd) {
    document.getElementById('cmd-status').innerText = "SENDING: " + cmd.toUpperCase();
    update(ref(db, 'robot/control'), { command: cmd })
        .then(() => {
            document.getElementById('cmd-status').innerText = "SENT: " + cmd.toUpperCase();
            if (cmd !== 'stop') logMsg(`CMD TX: ${cmd.toUpperCase()}`);
        })
        .catch(err => logMsg(`ERROR: ${err.message}`));
}

const stopHandler = () => {
    if (commandInterval) {
        clearInterval(commandInterval);
        commandInterval = null;
    }

    if (currentCommand !== 'stop') {
        sendCommand('stop');
        currentCommand = 'stop';
    }

    document.querySelectorAll('.btn-control')
        .forEach(b => b.classList.remove('active-key'));
};

window.addEventListener('touchend', stopHandler);
window.addEventListener('touchcancel', stopHandler);
// Added 'mouseleave' to ensure stop if mouse leaves window
document.body.addEventListener('mouseleave', stopHandler);

const keyMap = { 'ArrowUp': 'fwd', 'w': 'fwd', 'ArrowDown': 'bwd', 's': 'bwd', 'ArrowLeft': 'left', 'a': 'left', 'ArrowRight': 'right', 'd': 'right' };
window.addEventListener('keydown', (e) => {
    if (keyMap[e.key]) {
        const cmd = keyMap[e.key];
        if (currentCommand !== cmd) {
            const btn = document.getElementById(`btn-${cmd}`);
            if (btn) btn.classList.add('active-key');
            sendCommand(cmd);
            currentCommand = cmd;
        }
    }
});
window.addEventListener('keyup', (e) => { if (keyMap[e.key]) stopHandler(); });

// Telemetry
onValue(ref(db, 'robot/status'), (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    document.getElementById('val-dist').innerText = (data.distance || 0);

    const noise = data.noise || 0;
    const noiseElem = document.getElementById('val-noise');
    noiseElem.innerText = noise;

    // Visual Threshold Check for Noise > 200
    if (noise > 200) {
        noiseElem.className = "text-2xl font-bold text-red-500 animate-pulse";
    } else {
        noiseElem.className = "text-2xl font-bold";
    }

    const alertBox = document.getElementById('alert-box');
    // Check specific threat detection alerts OR direct noise threshold logic
    if (data.alerts?.suspicious_sound_alert || data.alerts?.movement_theft_alert || noise > 200) {
        alertBox.className = "mt-2 p-1 text-center text-xs rounded font-bold alert-active border border-red-500 bg-red-900/50 text-red-100";

        let threatType = "THREAT DETECTED";
        if (data.alerts?.movement_theft_alert) threatType = "THEFT (MOTION)";
        else if (data.alerts?.suspicious_sound_alert || noise > 200) threatType = "NOISE LEVEL HIGH";

        alertBox.innerText = `⚠️ SECURITY ALERT: ${threatType}`;
    } else {
        alertBox.className = "mt-2 p-1 text-center text-xs bg-slate-800 rounded text-gray-500";
        alertBox.innerText = "SECTOR SECURE";
    }
});