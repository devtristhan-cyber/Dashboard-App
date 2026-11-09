const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Database (SQLite file is created automatically) ----------
const db = new Database(path.join(__dirname, 'inventory.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    category   TEXT    NOT NULL,
    price      REAL    NOT NULL CHECK (price >= 0),
    quantity   INTEGER NOT NULL CHECK (quantity >= 0),
    created_at TEXT    DEFAULT CURRENT_TIMESTAMP
  )
`);

// Add sample data the first time the app runs
if (db.prepare('SELECT COUNT(*) AS n FROM products').get().n === 0) {
  const insert = db.prepare(
    'INSERT INTO products (name, category, price, quantity) VALUES (?, ?, ?, ?)'
  );
  [
    ['Wireless Mouse', 'Accessories', 24.99, 48],
    ['Mechanical Keyboard', 'Accessories', 89.5, 6],
    ['27" Monitor', 'Displays', 249.0, 14],
    ['USB-C Hub', 'Accessories', 39.0, 3],
    ['Laptop Stand', 'Furniture', 45.75, 22],
    ['Webcam 1080p', 'Video', 59.9, 9],
  ].forEach((row) => insert.run(...row));
}

// ---------- Middleware ----------
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Validate incoming product data
function validate(body) {
  const name = String(body.name || '').trim();
  const category = String(body.category || '').trim();
  const price = Number(body.price);
  const quantity = Number(body.quantity);

  if (!name) return { error: 'Name is required.' };
  if (!category) return { error: 'Category is required.' };
  if (!Number.isFinite(price) || price < 0) return { error: 'Price must be 0 or more.' };
  if (!Number.isInteger(quantity) || quantity < 0) return { error: 'Quantity must be a whole number, 0 or more.' };

  return { data: { name, category, price, quantity } };
}

// ---------- API routes ----------

// READ: dashboard summary
app.get('/api/stats', (req, res) => {
  const stats = db.prepare(`
    SELECT
      COUNT(*)                                   AS totalProducts,
      COALESCE(SUM(quantity), 0)                 AS totalUnits,
      COALESCE(SUM(price * quantity), 0)         AS inventoryValue,
      COALESCE(SUM(CASE WHEN quantity <= 10 THEN 1 ELSE 0 END), 0) AS lowStock
    FROM products
  `).get();
  const byCategory = db.prepare(`
    SELECT category, COUNT(*) AS count FROM products GROUP BY category ORDER BY count DESC
  `).all();
  res.json({ ...stats, byCategory });
});

// READ: all products (optional ?search=)
app.get('/api/products', (req, res) => {
  const search = `%${(req.query.search || '').trim()}%`;
  const rows = db.prepare(`
    SELECT * FROM products
    WHERE name LIKE ? OR category LIKE ?
    ORDER BY id DESC
  `).all(search, search);
  res.json(rows);
});

// CREATE
app.post('/api/products', (req, res) => {
  const { data, error } = validate(req.body);
  if (error) return res.status(400).json({ error });

  const result = db
    .prepare('INSERT INTO products (name, category, price, quantity) VALUES (?, ?, ?, ?)')
    .run(data.name, data.category, data.price, data.quantity);

  res.status(201).json(db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid));
});

// UPDATE
app.put('/api/products/:id', (req, res) => {
  const { data, error } = validate(req.body);
  if (error) return res.status(400).json({ error });

  const result = db
    .prepare('UPDATE products SET name = ?, category = ?, price = ?, quantity = ? WHERE id = ?')
    .run(data.name, data.category, data.price, data.quantity, req.params.id);

  if (result.changes === 0) return res.status(404).json({ error: 'Product not found.' });
  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id));
});

// DELETE
app.delete('/api/products/:id', (req, res) => {
  const result = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Product not found.' });
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
});
