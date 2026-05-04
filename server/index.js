import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = 'inventory-secret-key';
const PORT = process.env.PORT || 5001;

const db = await mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'inventory_db',
  port: process.env.DB_PORT || 3306
});

await db.query(`
  CREATE TABLE IF NOT EXISTS transfers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    productId INT NOT NULL,
    productName VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    quantity INT NOT NULL,
    fromBranch VARCHAR(100) NOT NULL,
    toBranch VARCHAR(100) NOT NULL,
    transferredBy VARCHAR(100),
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

app.get('/', (req, res) => {
  res.json({ message: 'Inventory Management API is running', port: PORT });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  const [rows] = await db.query(
    'SELECT id, username, role FROM users WHERE username=? AND password=?',
    [username, password]
  );

  if (rows.length === 0) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const user = rows[0];
  const token = jwt.sign(user, JWT_SECRET, { expiresIn: '8h' });

  res.json({ user, token });
});

app.get('/api/products', auth, async (req, res) => {
  const [rows] = await db.query('SELECT * FROM products ORDER BY id DESC');
  res.json(rows);
});

app.post('/api/products', auth, adminOnly, async (req, res) => {
  const { name, category, sku, barcode, quantity, price, lowStockLimit, branch } = req.body;

  await db.query(
    'INSERT INTO products (name, category, sku, barcode, quantity, price, lowStockLimit, branch) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [name, category, sku, barcode, quantity, price, lowStockLimit, branch]
  );

  res.json({ success: true });
});

app.put('/api/products/:id', auth, adminOnly, async (req, res) => {
  const { name, category, sku, barcode, quantity, price, lowStockLimit, branch } = req.body;

  await db.query(
    'UPDATE products SET name=?, category=?, sku=?, barcode=?, quantity=?, price=?, lowStockLimit=?, branch=? WHERE id=?',
    [name, category, sku, barcode, quantity, price, lowStockLimit, branch, req.params.id]
  );

  res.json({ success: true });
});

app.delete('/api/products/:id', auth, adminOnly, async (req, res) => {
  await db.query('DELETE FROM products WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

app.get('/api/barcode/:code', auth, async (req, res) => {
  const [rows] = await db.query(
    'SELECT * FROM products WHERE barcode=? OR sku=?',
    [req.params.code, req.params.code]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Product not found' });
  }

  res.json(rows[0]);
});

app.get('/api/suppliers', auth, adminOnly, async (req, res) => {
  const [rows] = await db.query('SELECT * FROM suppliers ORDER BY id DESC');
  res.json(rows);
});

app.post('/api/suppliers', auth, adminOnly, async (req, res) => {
  const { name, contact, phone, product } = req.body;

  await db.query(
    'INSERT INTO suppliers (name, contact, phone, product) VALUES (?, ?, ?, ?)',
    [name, contact, phone, product]
  );

  res.json({ success: true });
});

app.get('/api/sales', auth, async (req, res) => {
  const [rows] = await db.query('SELECT * FROM sales ORDER BY createdAt DESC');
  res.json(rows);
});

app.post('/api/sales', auth, async (req, res) => {
  const { productId, quantity } = req.body;

  const [products] = await db.query('SELECT * FROM products WHERE id=?', [productId]);

  if (products.length === 0) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const product = products[0];

  if (product.quantity < quantity) {
    return res.status(400).json({ error: 'Not enough stock available' });
  }

  const total = Number(quantity) * Number(product.price);

  await db.query(
    'UPDATE products SET quantity = quantity - ? WHERE id=?',
    [quantity, productId]
  );

  await db.query(
    'INSERT INTO sales (productId, productName, quantity, total, branch) VALUES (?, ?, ?, ?, ?)',
    [product.id, product.name, quantity, total, product.branch]
  );

  res.json({ success: true, total });
});

app.get('/api/transfers', auth, async (req, res) => {
  const [rows] = await db.query('SELECT * FROM transfers ORDER BY createdAt DESC');
  res.json(rows);
});

app.post('/api/transfers', auth, adminOnly, async (req, res) => {
  const { productId, quantity, toBranch } = req.body;
  const transferQty = Number(quantity);

  if (!productId || !toBranch || !transferQty || transferQty <= 0) {
    return res.status(400).json({ error: 'Select product, destination branch, and valid quantity' });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [products] = await connection.query('SELECT * FROM products WHERE id=? FOR UPDATE', [productId]);

    if (products.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Product not found' });
    }

    const sourceProduct = products[0];

    if (sourceProduct.branch === toBranch) {
      await connection.rollback();
      return res.status(400).json({ error: 'Source and destination branches cannot be the same' });
    }

    if (Number(sourceProduct.quantity) < transferQty) {
      await connection.rollback();
      return res.status(400).json({ error: 'Not enough stock in source branch' });
    }

    await connection.query('UPDATE products SET quantity = quantity - ? WHERE id=?', [transferQty, productId]);

    const [destinationRows] = await connection.query(
      'SELECT * FROM products WHERE sku=? AND branch=? FOR UPDATE',
      [sourceProduct.sku, toBranch]
    );

    if (destinationRows.length > 0) {
      await connection.query(
        'UPDATE products SET quantity = quantity + ? WHERE id=?',
        [transferQty, destinationRows[0].id]
      );
    } else {
      await connection.query(
        'INSERT INTO products (name, category, sku, barcode, quantity, price, lowStockLimit, branch) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [sourceProduct.name, sourceProduct.category, sourceProduct.sku, sourceProduct.barcode, transferQty, sourceProduct.price, sourceProduct.lowStockLimit, toBranch]
      );
    }

    await connection.query(
      'INSERT INTO transfers (productId, productName, sku, quantity, fromBranch, toBranch, transferredBy) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [sourceProduct.id, sourceProduct.name, sourceProduct.sku, transferQty, sourceProduct.branch, toBranch, req.user.username]
    );

    await connection.commit();
    res.json({ success: true, message: `Transferred ${transferQty} units to ${toBranch}` });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ error: 'Transfer failed. Please try again.' });
  } finally {
    connection.release();
  }
});

app.get('/api/dashboard', auth, async (req, res) => {
  const [products] = await db.query('SELECT * FROM products');
  const [sales] = await db.query('SELECT * FROM sales');
  const [branchSummary] = await db.query(
    'SELECT branch, SUM(quantity) AS stock FROM products GROUP BY branch'
  );

  const revenue = sales.reduce((sum, sale) => sum + Number(sale.total), 0);
  const lowStock = products.filter(p => Number(p.quantity) <= Number(p.lowStockLimit));

  res.json({
    totalProducts: products.length,
    totalSales: sales.length,
    revenue,
    lowStock,
    branchSummary,
    products,
    sales
  });
});

app.listen(PORT, () => {
  console.log(`Inventory server running on http://localhost:${PORT}`);
});
