const rateLimit = require("express-rate-limit");
require("dotenv").config();
const lastSeen = {};
const deviceOffline = {};
const mqtt = require("mqtt");
const PORT = process.env.PORT || 5000;
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const fs = require("fs");
const app = express();
const http = require("http");
const { Server } = require("socket.io");
const server = http.createServer(app);

app.use(express.json());
app.use(cors({
  origin: [
    "http://127.0.0.1:5500",
    "https://control-irrigation.netlify.app",
    "https://virajdabhi127.github.io"
  ]
}));
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const SECRET_KEY = process.env.SECRET_KEY; // later we can move this

const deviceStatus = {};
const mqttClient = mqtt.connect("mqtts://38283212ae99409b8e30f1f17de9a408.s1.eu.hivemq.cloud:8883", {
  username: process.env.MQTT_USER?.trim(),
  password: process.env.MQTT_PASS?.trim(),
  clientId: "backend_" + Math.random().toString(16).substr(2, 8),
  clean: true
});

const loginLimiter = rateLimit({
  windowMs: 3 * 60 * 1000, 
  max: 3,              
  message: { message: "Too many login attempts. Try again later." },
  standardHeaders: true,
  legacyHeaders: false
});

mqttClient.on("connect", () => {
  console.log("Connected to MQTT Broker");

  mqttClient.subscribe("irrigation/+/status", (err) => {
    if (err) {
      console.error("MQTT Subscribe Error:", err);
    } else {
      console.log("Subscribed to irrigation/+/status");
    }
  });
});
mqttClient.on("message", (topic, message) => {
  const parts = topic.split("/");
  const deviceId = parts[1];
  try {
    const data = JSON.parse(message.toString());
    deviceStatus[deviceId] = data;
    lastSeen[deviceId] = Date.now();
    deviceOffline[deviceId] = false;
    io.emit("device_data", data);
  } catch (err) {
    console.error("Invalid JSON from device:", err);
  }
});
mqttClient.on("error", (err) => {
  console.error("MQTT Error:", err);
});

function getUsers() {
  const data = fs.readFileSync("users.json", "utf8");
  return JSON.parse(data);
}

setInterval(() => {
  const now = Date.now();
  for (const deviceId in lastSeen) {
    if (now - lastSeen[deviceId] > 60000 && !deviceOffline[deviceId]) {
      deviceOffline[deviceId] = true;
      console.log(`Device ${deviceId} is OFFLINE`);
      io.emit("device_data", {
        pump: "",
        voltage: 0,
        mode: "",
        crop: "",
        time: "",
        days: "",
        source: "",
        alarms: null
      });
    }
  }
}, 30000);

// LOGIN ROUTE
app.post("/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  const users = getUsers(); // read fresh data every time
  const user = users.find(u => u.username === username);

  if (!user) {
    return res.status(401).json({ message: "Invalid User ID or Password" });
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    return res.status(401).json({ message: "Invalid User ID or Password" });
  }
  const token = jwt.sign(
  {
    username: user.username,
    deviceId: user.deviceId
  },
  SECRET_KEY,
  { expiresIn: "1h" }
);
  res.json({ token });
});

app.post("/send-command", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) return res.status(403).json({ message: "No token" });
  let decoded;
  try {
    decoded = jwt.verify(token, SECRET_KEY);
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
  if (!deviceStatus[decoded.deviceId]) {
    return res.status(404).json({ message: "Device not connected" });
  }
  const { message } = req.body;
  const topic = `irrigation/${decoded.deviceId}/command`;
  mqttClient.publish(topic, message, (err) => {
    if (err) {
      return res.status(500).json({ message: "MQTT publish failed" });
    }
    res.json({ message: "Command sent successfully" });
  });
});
// VERIFY ROUTE
app.get("/verify", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) return res.status(403).json({ message: "No token" });

  try {
    jwt.verify(token, SECRET_KEY);
    res.json({ valid: true });
  } catch {
    res.status(401).json({ valid: false });
  }
});

app.get("/status", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) return res.status(403).json({ message: "No token" });
  let decoded;
  try {
    decoded = jwt.verify(token, SECRET_KEY);
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
  const deviceId = decoded.deviceId;
  const status = deviceStatus[deviceId];
  if (!status) {
    return res.json({ message: "No data yet" });
  }
  res.json(status);
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});