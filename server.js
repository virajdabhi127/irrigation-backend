const db = require("./database");
const WebSocket = require("ws");
const rateLimit = require("express-rate-limit");
require("dotenv").config();
const lastSeen = {};
const mqtt = require("mqtt");
const PORT = process.env.PORT || 5000;
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const app = express();

app.use(express.json());
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const wss = new WebSocket.Server({ server });
app.use(cors({
  origin: [
    "http://127.0.0.1:5500",
    "https://control-irrigation.netlify.app",
    "https://virajdabhi127.github.io"
  ]
}));

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
    if(data.alarms && data.alarms !== "NONE" && data.alarms.length !== 0){
      saveAlarm(deviceId,data.alarms);
    }
    deviceStatus[deviceId] = data;
    lastSeen[deviceId] = Date.now();
    const payload = JSON.stringify({
    deviceId: deviceId,
    status: data
  });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
  } catch (err) {
    console.error("Invalid JSON from device:", err);
  }
});
mqttClient.on("error", (err) => {
  console.error("MQTT Error:", err);
});

function saveAlarm(deviceId, alarm){
  if(!alarm || alarm === "NONE" || alarm.length === 0){
    return;
  }
  const alarmList = Array.isArray(alarm) ? alarm : [alarm];
  db.get(
    "SELECT username FROM devices WHERE device_id = ?",
    [deviceId],
    (err, row) => {
      if(err || !row){
        console.log("Device not registered:", deviceId);
        return;
      }
      const username = row.username;
      alarmList.forEach(a => {   
        db.get(      // check if alarm already exists
          "SELECT id FROM alarms WHERE device_id = ? AND alarm = ?",
          [deviceId, a],
          (err, existing) => {
            if(existing){              
              db.run(      // update timestamp
                "UPDATE alarms SET timestamp = CURRENT_TIMESTAMP WHERE id = ?",
                [existing.id]
              );
            }else{
              db.run(       // create new alarm
                "INSERT INTO alarms (username, device_id, alarm) VALUES (?, ?, ?)",
                [username, deviceId, a]
              );
            }
          }
        );
      });
    }
  );
}

setInterval(() => {
  const now = Date.now();
  for (const deviceId in lastSeen) {
    if (now - lastSeen[deviceId] > 60000) {
      console.log(`Device ${deviceId} is OFFLINE`);
    }
  }
}, 30000);

// LOGIN ROUTE
app.post("/login", loginLimiter, (req, res) => {
  const { username, password } = req.body;
  db.get(
    `SELECT users.username, users.password, devices.device_id 
     FROM users 
     LEFT JOIN devices ON users.username = devices.username
     WHERE users.username = ?`,
    [username],
    async (err, user) => {
      if (err) {
        return res.status(500).json({ message: "Database error" });
      }
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
          deviceId: user.device_id
        },
        SECRET_KEY,
        { expiresIn: "1h" }
      );
      res.json({ token });
    }
  );
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

app.get("/alarm-history", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) return res.status(403).json({ message: "No token" });
  let decoded;
  try {
    decoded = jwt.verify(token, SECRET_KEY);
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
  const deviceId = decoded.deviceId;
  db.all(
    `SELECT id, username, device_id, alarm, datetime(timestamp) as timestamp
     FROM alarms
     WHERE device_id = ?
     ORDER BY timestamp DESC
     LIMIT 20`,
    [deviceId],
    (err, rows) => {
      if(err){
        return res.status(500).send(err.message);
      }
      res.json(rows);
    }
  );
});

app.delete("/alarm-history", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) return res.status(403).json({ message: "No token" });
  let decoded;
  try{
    decoded = jwt.verify(token, SECRET_KEY);
  }catch{
    return res.status(401).json({ message: "Invalid token" });
  }
  const deviceId = decoded.deviceId;
  db.run(
    "DELETE FROM alarms WHERE device_id = ?",
    [deviceId],
    function(err){
      if(err){
        return res.status(500).send(err.message);
      }
      const status = deviceStatus[deviceId];
      if(status && status.alarms && status.alarms !== "NONE"){
        saveAlarm(deviceId, status.alarms);
      }
      res.json({ message: "Alarm history cleared" });
    }
  );
});

app.get("/alarms/:username", (req, res) => {
    const username = req.params.username;
    db.all(
        "SELECT * FROM alarms WHERE username = ? ORDER BY timestamp DESC",
        [username],
        (err, rows) => {
            if (err) {
                return res.status(500).send(err.message);
            }
            res.json(rows);
        }
    );
});

app.post("/add-device", (req, res) => {
    const { username, device_id } = req.body;
    const sql = `
        INSERT INTO devices (username, device_id)
        VALUES (?, ?)
    `;
    db.run(sql, [username, device_id], function(err){
        if(err){
            return res.status(500).send(err.message);
        }
        res.send("Device added");
    });
});

app.post("/add-user", async (req, res) => {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run(
        "INSERT INTO users (username, password) VALUES (?, ?)",
        [username, hashedPassword],
        function(err){
            if(err){
                return res.status(500).send(err.message);
            }
            res.send("User added");
        }
    );
});