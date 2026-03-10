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
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
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

module.exports = db;