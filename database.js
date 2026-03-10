const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./irrigation.db", (err) => {
    if (err) {
        console.log("Database error:", err.message);
    } else {
        console.log("Connected to SQLite database");
    }
});

db.serialize(() => {

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

});

    const bcrypt = require("bcryptjs");

    const defaultPassword = bcrypt.hashSync("admin123", 10);

    db.run(
    `INSERT OR IGNORE INTO users (username, password) VALUES (?, ?)`,
    ["admin", defaultPassword]
    );

    db.run(
    `INSERT OR IGNORE INTO devices (username, device_id) VALUES (?, ?)`,
    ["admin", "device1"]
    );

module.exports = db;