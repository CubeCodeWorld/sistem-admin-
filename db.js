import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbFile = path.join(__dirname, "data.sqlite");
sqlite3.verbose();
export const db = new sqlite3.Database(dbFile);

export function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}
export function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}
export function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

export async function init() {
  await run("PRAGMA foreign_keys = ON;");

  await run(
    "CREATE TABLE IF NOT EXISTS products (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT," +
      "sku TEXT UNIQUE NOT NULL," +
      "name TEXT NOT NULL," +
      "price INTEGER NOT NULL" +
    ");"
  );

  await run(
    "CREATE TABLE IF NOT EXISTS stocks (" +
      "product_id INTEGER PRIMARY KEY," +
      "qty INTEGER NOT NULL DEFAULT 0," +
      "FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE" +
    ");"
  );

  await run(
    "CREATE TABLE IF NOT EXISTS purchases (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT," +
      "product_id INTEGER NOT NULL," +
      "qty INTEGER NOT NULL," +
      "price_each INTEGER NOT NULL," +
      "total_price INTEGER NOT NULL," +
      "status TEXT NOT NULL DEFAULT 'PAID'," +
      "created_at TEXT NOT NULL DEFAULT (datetime('now'))," +
      "canceled_at TEXT," +
      "canceled_by TEXT," +
      "FOREIGN KEY(product_id) REFERENCES products(id)" +
    ");"
  );

  const count = await get("SELECT COUNT(*) AS c FROM products;");
  if (!count || count.c === 0) {
    const seed = [
      { sku: "SKU-001", name: "Kopi Robusta 250g", price: 35000, qty: 50 },
      { sku: "SKU-002", name: "Kopi Arabica 250g", price: 55000, qty: 40 },
      { sku: "SKU-003", name: "Teh Hijau 200g", price: 25000, qty: 60 },
      { sku: "SKU-004", name: "Gula Aren 500g", price: 28000, qty: 45 },
      { sku: "SKU-005", name: "Susu Bubuk 400g", price: 42000, qty: 30 },
      { sku: "SKU-006", name: "Coklat Bubuk 200g", price: 32000, qty: 35 },
      { sku: "SKU-007", name: "Madu 250ml", price: 70000, qty: 20 },
      { sku: "SKU-008", name: "Biskuit Gandum", price: 18000, qty: 80 },
      { sku: "SKU-009", name: "Keripik Singkong", price: 15000, qty: 100 },
      { sku: "SKU-010", name: "Air Mineral 1.5L", price: 8000, qty: 120 }
    ];
    for (const p of seed) {
      const ins = await run(
        "INSERT INTO products (sku, name, price) VALUES (?, ?, ?);",
        [p.sku, p.name, p.price]
      );
      await run("INSERT INTO stocks (product_id, qty) VALUES (?, ?);", [
        ins.id,
        p.qty
      ]);
    }
    console.log("Seeded 10 products");
  }
}
