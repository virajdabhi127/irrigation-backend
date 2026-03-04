require("dotenv").config();
const mqtt = require("mqtt");
const PORT = process.env.PORT || 5000;
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const fs = require("fs");
const app = express();

app.use(express.json());
app.use(cors({
  origin: [
    /http:\/\/localhost:\d+/,
    "https://control-irrigation.netlify.app",
    "https://virajdabhi127.github.io"
  ]
}));

const SECRET_KEY = process.env.SECRET_KEY; // later we can move this

const mqttClient = mqtt.connect("mqtts://38283212ae99409b8e30f1f17de9a408.s1.eu.hivemq.cloud:8883", {
  username: process.env.MQTT_USER?.trim(),
  password: process.env.MQTT_PASS?.trim(),
  clientId: "backend_" + Math.random().toString(16).substr(2, 8),
  clean: true
});

mqttClient.on("connect", () => {
  console.log("Connected to MQTT Broker");

  // Subscribe to all device status topics
  mqttClient.subscribe("irrigation/+/status", (err) => {
    if (err) {
      console.error("MQTT Subscribe Error:", err);
    } else {
      console.log("Subscribed to irrigation/+/status");
    }
  });
});
mqttClient.on("message", (topic, message) => {
  console.log("Received:", topic, message.toString());

  const parts = topic.split("/");
  const deviceId = parts[1];   // irrigation/device001/status

  // Here you will later send status to correct user
});
mqttClient.on("error", (err) => {
  console.error("MQTT Error:", err);
});
// Hardcoded users (password is hashed version of "1234")
function getUsers() {
  const data = fs.readFileSync("users.json", "utf8");
  return JSON.parse(data);
}

// LOGIN ROUTE
app.post("/login", async (req, res) => {
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});