const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./irrigation.db", (err) => {
    if (err) {
        console.log("Database error:", err.message);
    } else {
        console.log("Connected to SQLite database");
    }
});
db.run(`
CREATE TABLE IF NOT EXISTS alarms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    device_id TEXT,
    alarm TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME,
    cleared_at DATETIME
)
`);
db.run(`
CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    device_id TEXT UNIQUE
)
`);
db.run(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
)
`);

const bcrypt = require("bcryptjs");
const defaultPassword = bcrypt.hashSync("Viraj@1968", 10);

db.run(`
INSERT OR IGNORE INTO users (username, password)
VALUES ('viraj', '${defaultPassword}')
`);

db.run(`
INSERT OR IGNORE INTO devices (username, device_id)
VALUES ('viraj', 'viraj')
`);
db.run(`ALTER TABLE alarms ADD COLUMN last_seen DATETIME`, err=>{
    if(err && !err.message.includes("duplicate column")) console.log(err.message);
});
db.run(`ALTER TABLE alarms ADD COLUMN cleared_at DATETIME`, err=>{
    if(err && !err.message.includes("duplicate column")) console.log(err.message);
});
module.exports = db;