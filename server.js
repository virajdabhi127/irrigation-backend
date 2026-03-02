const mqtt = require("mqtt");
const PORT = process.env.PORT || 5000;
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const fs = require("fs");
const app = express();

app.use(express.json());
app.use(cors());

const SECRET_KEY = process.env.SECRET_KEY; // later we can move this

const mqttClient = mqtt.connect("mqtts://38283212ae99409b8e30f1f17de9a408.s1.eu.hivemq.cloud:8883", {
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASS
});

mqttClient.on("connect", () => {
  console.log("Connected to MQTT Broker");
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

  const token = jwt.sign({ username: user.username }, SECRET_KEY, {
    expiresIn: "1h"
  });

  res.json({ token });
});
app.post("/send-command", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) return res.status(403).json({ message: "No token" });

  try {
    jwt.verify(token, SECRET_KEY);
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }

  const { message } = req.body;

  mqttClient.publish("esp32/msg", message, (err) => {
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