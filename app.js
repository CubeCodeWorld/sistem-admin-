import express from "express";
import session from "express-session";
import methodOverride from "method-override";
import path from "path";
import { fileURLToPath } from "url";
import ejsMate from "ejs-mate";
import { init, all, get, run } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
await init();

// view engine + static
app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));
app.use(session({ secret: "secret-admin", resave: false, saveUninitialized: true }));

// flash sederhana
app.use((req, res, next) => {
  res.locals.flash = req.session.flash || [];
  req.session.flash = [];
  res.locals.addFlash = (type, msg) => req.session.flash.push({ type, msg });
  next();
});

// Dashboard (stats)
app.get("/", async (req, res) => {
  const [stats] = await all(
    "SELECT " +
      " (SELECT COUNT(*) FROM products) AS products, " +
      " (SELECT SUM(qty) FROM stocks) AS total_stock, " +
      " (SELECT COUNT(*) FROM purchases) AS purchases, " +
      " (SELECT SUM(total_price) FROM purchases WHERE status='PAID') AS revenue"
  );
  res.render("products/index", { stats });
});

// List produk + stok
app.get("/products", async (req, res) => {
  const items = await all(
    "SELECT p.id, p.sku, p.name, p.price, s.qty " +
      "FROM products p JOIN stocks s ON s.product_id=p.id " +
      "ORDER BY p.id ASC"
  );
  res.render("products/index", { items });
});

// Form pembelian baru
app.get("/purchases/new", async (req, res) => {
  const products = await all(
    "SELECT p.id, p.name, p.price, s.qty " +
      "FROM products p JOIN stocks s ON s.product_id=p.id " +
      "ORDER BY p.name ASC"
  );
  res.render("purchases/new", { products });
});

// Create pembelian (kurangi stok)
app.post("/purchases", async (req, res) => {
  try {
    const { product_id, qty } = req.body;
    const product = await get(
      "SELECT p.*, s.qty AS stock FROM products p JOIN stocks s ON s.product_id=p.id WHERE p.id=?",
      [product_id]
    );
    const nqty = parseInt(qty, 10) || 0;

    if (!product) { res.locals.addFlash("danger","Produk tidak ditemukan"); return res.redirect("/purchases/new"); }
    if (nqty <= 0) { res.locals.addFlash("warning","Qty harus > 0"); return res.redirect("/purchases/new"); }
    if (product.stock < nqty) { res.locals.addFlash("danger", "Stok tidak cukup. Sisa: " + product.stock); return res.redirect("/purchases/new"); }

    const total = product.price * nqty;

    await run("BEGIN");
    await run(
      "INSERT INTO purchases (product_id, qty, price_each, total_price, status) VALUES (?,?,?,?,?)",
      [product.id, nqty, product.price, total, "PAID"]
    );
    await run("UPDATE stocks SET qty = qty - ? WHERE product_id = ?", [nqty, product.id]);
    await run("COMMIT");

    req.session.flash.push({ type:"success", msg:"Pembelian berhasil dicatat" });
    res.redirect("/purchases");
  } catch (e) {
    await run("ROLLBACK").catch(()=>{});
    console.error(e);
    req.session.flash.push({ type:"danger", msg:"Terjadi kesalahan" });
    res.redirect("/purchases/new");
  }
});

// List pembelian (dengan filter q & status)
app.get("/purchases", async (req, res) => {
  const { q = "", status = "" } = req.query || {};
  const params = [];
  let where = "";

  if (status) { where += (where ? " AND " : "") + "pu.status = ?"; params.push(status); }
  if (q)      { where += (where ? " AND " : "") + "(p.name LIKE ? OR p.sku LIKE ?)"; params.push(`%${q}%`, `%${q}%`); }

  const sql =
    "SELECT pu.id, pu.qty, pu.price_each, pu.total_price, pu.status, pu.created_at, " +
    "pu.canceled_at, pu.canceled_by, p.name AS product_name, p.sku " +
    "FROM purchases pu JOIN products p ON p.id=pu.product_id " +
    (where ? "WHERE " + where + " " : "") +
    "ORDER BY pu.id DESC";

  const rows = await all(sql, params);
  res.render("purchases/index", { rows, q, status });
});

// Cancel pembelian (restore stok)
app.post("/purchases/:id/cancel", async (req, res) => {
  try {
    const id = req.params.id;
    const admin = "admin@toko";
    const row = await get("SELECT * FROM purchases WHERE id=?", [id]);

    if (!row) { req.session.flash.push({type:"danger", msg:"Pembelian tidak ditemukan"}); return res.redirect("/purchases"); }
    if (row.status === "CANCELED") { req.session.flash.push({type:"warning", msg:"Transaksi sudah dibatalkan"}); return res.redirect("/purchases"); }

    await run("BEGIN");
    await run(
      "UPDATE purchases SET status=?, canceled_at=CURRENT_TIMESTAMP, canceled_by=? WHERE id=?",
      ["CANCELED", admin, id]
    );
    await run("UPDATE stocks SET qty = qty + ? WHERE product_id=?", [row.qty, row.product_id]);
    await run("COMMIT");

    req.session.flash.push({type:"success", msg:"Pembelian dibatalkan & stok direstore"});
    res.redirect("/purchases");
  } catch (e) {
    await run("ROLLBACK").catch(()=>{});
    console.error(e);
    req.session.flash.push({type:"danger", msg:"Gagal membatalkan pembelian"});
    res.redirect("/purchases");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Admin berjalan di http://localhost:" + PORT));
