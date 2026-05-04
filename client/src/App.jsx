import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Html5QrcodeScanner } from 'html5-qrcode';
import './style.css';

const API = 'http://localhost:5001/api';

function request(path, token, options = {}) {
  return fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  }).then(async response => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Something went wrong');
    return data;
  });
}

function Login({ onLogin }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const data = await request('/login', '', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      onLogin(data);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="loginPage">
      <section className="loginCard glass">
        <div className="logoCircle">📦</div>
        <h1>Inventory Management For Small Businesses</h1>
        <p>Track stock, suppliers, sales, branches, low stock alerts, and barcode scanning.</p>
        <form onSubmit={submit} className="formStack">
          <label>Username</label>
          <input value={username} onChange={e => setUsername(e.target.value)} />
          <label>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
          {error && <div className="error">{error}</div>}
          <button className="primaryBtn">Login</button>
        </form>
        <div className="loginHint">
          <strong>Admin:</strong> admin / admin123<br />
          <strong>Staff:</strong> staff / staff123
        </div>
      </section>
    </main>
  );
}

function BarChart({ title, items, labelKey = 'label', valueKey = 'value', suffix = '' }) {
  const max = Math.max(1, ...items.map(item => Number(item[valueKey]) || 0));
  return (
    <div className="chartCard">
      <h3>{title}</h3>
      {items.length === 0 ? <p>No data available.</p> : items.map((item, index) => {
        const value = Number(item[valueKey]) || 0;
        return (
          <div className="barRow" key={`${item[labelKey]}-${index}`}>
            <span className="barLabel">{item[labelKey]}</span>
            <div className="barTrack"><div className={`barFill color${index % 5}`} style={{ width: `${Math.max(8, (value / max) * 100)}%` }} /></div>
            <strong>{value}{suffix}</strong>
          </div>
        );
      })}
    </div>
  );
}

function MiniLineChart({ title, items }) {
  const width = 520;
  const height = 170;
  const values = items.map(item => Number(item.revenue) || 0);
  const max = Math.max(1, ...values);
  const points = values.length > 1
    ? values.map((v, i) => `${(i / (values.length - 1)) * width},${height - (v / max) * 130 - 20}`).join(' ')
    : `0,${height - 20} ${width},${height - 20}`;
  return (
    <div className="chartCard">
      <h3>{title}</h3>
      {items.length === 0 ? <p>No sales yet.</p> : (
        <>
          <svg viewBox={`0 0 ${width} ${height}`} className="lineChart" role="img" aria-label={title}>
            <polyline points={points} fill="none" stroke="#4f46e5" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            {values.map((v, i) => {
              const x = values.length > 1 ? (i / (values.length - 1)) * width : width / 2;
              const y = height - (v / max) * 130 - 20;
              return <circle key={i} cx={x} cy={y} r="6" fill="#ec4899" />;
            })}
          </svg>
          <div className="chartLabels">{items.map(item => <span key={item.label}>{item.label}</span>)}</div>
        </>
      )}
    </div>
  );
}

function Dashboard({ dashboard }) {
  if (!dashboard) return <div className="panel">Loading dashboard...</div>;
  return (
    <section className="pageGrid">
      <div className="metric blue"><span>Total Products</span><strong>{dashboard.totalProducts}</strong></div>
      <div className="metric purple"><span>Total Stock</span><strong>{dashboard.totalStock}</strong></div>
      <div className="metric green"><span>Sales Count</span><strong>{dashboard.totalSales}</strong></div>
      <div className="metric orange"><span>Revenue</span><strong>₹{dashboard.revenue}</strong></div>

      <div className="panel wide analyticsPanel">
        <div className="sectionHeader"><h2>Business Analytics Graphs</h2><span>Sales, stock, branches and product insights</span></div>
        <div className="analyticsGrid">
          <MiniLineChart title="Revenue Trend" items={dashboard.salesTrend || []} />
          <BarChart title="Stock by Branch" items={(dashboard.branchSummary || []).map(b => ({ label: b.branch, value: b.stock }))} />
          <BarChart title="Top Selling Products" items={dashboard.topSelling || []} />
          <BarChart title="Category-wise Stock" items={dashboard.categorySummary || []} />
          <BarChart title="Sales by Branch" items={dashboard.salesByBranch || []} />
          <BarChart title="Low Stock Products" items={(dashboard.lowStock || []).map(p => ({ label: p.name, value: p.quantity }))} suffix=" left" />
        </div>
      </div>

      <div className="panel wide">
        <h2>Low Stock Alerts</h2>
        {dashboard.lowStock.length === 0 ? <p>No low-stock products.</p> : (
          <div className="cardsRow">
            {dashboard.lowStock.map(p => (
              <div className="alertCard" key={p.id}>
                <h3>{p.name}</h3>
                <p>Branch: {p.branch}</p>
                <p>Qty: {p.quantity} / Limit: {p.lowStockLimit}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel wide">
        <h2>Branch-wise Stock Tracking</h2>
        <table>
          <thead><tr><th>Branch</th><th>Available Stock</th></tr></thead>
          <tbody>{dashboard.branchSummary.map(b => <tr key={b.branch}><td>{b.branch}</td><td>{b.stock}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function Products({ token, user, products, refresh }) {
  const emptyForm = { name: '', category: '', sku: '', barcode: '', quantity: '', price: '', lowStockLimit: '', branch: 'Hyderabad' };
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const filtered = products.filter(p => `${p.name} ${p.category} ${p.sku} ${p.barcode} ${p.branch}`.toLowerCase().includes(search.toLowerCase()));

  async function addProduct(e) {
    e.preventDefault();
    setError('');
    try {
      await request('/products', token, { method: 'POST', body: JSON.stringify(form) });
      setForm(emptyForm);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteProduct(id) {
    if (!confirm('Delete this product?')) return;
    await request(`/products/${id}`, token, { method: 'DELETE' });
    refresh();
  }

  return (
    <section className="panel">
      <div className="sectionHeader"><h2>Product Management</h2><span>{user.role === 'admin' ? 'Admin can add/delete products' : 'Staff can view inventory'}</span></div>
      <input className="searchInput" placeholder="Search by name, SKU, barcode, branch..." value={search} onChange={e => setSearch(e.target.value)} />
      {user.role === 'admin' && (
        <form className="gridForm colorfulForm" onSubmit={addProduct}>
          {Object.keys(emptyForm).map(key => (
            <input key={key} placeholder={key} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} required />
          ))}
          <button className="primaryBtn">Add Product</button>
        </form>
      )}
      {error && <div className="error">{error}</div>}
      <table>
        <thead><tr><th>Name</th><th>Category</th><th>SKU</th><th>Barcode</th><th>Qty</th><th>Price</th><th>Branch</th><th>Status</th>{user.role === 'admin' && <th>Action</th>}</tr></thead>
        <tbody>
          {filtered.map(p => (
            <tr key={p.id}>
              <td>{p.name}</td><td>{p.category}</td><td>{p.sku}</td><td>{p.barcode}</td><td>{p.quantity}</td><td>₹{p.price}</td><td>{p.branch}</td>
              <td>{p.quantity <= p.lowStockLimit ? <span className="badge danger">Low Stock</span> : <span className="badge good">Available</span>}</td>
              {user.role === 'admin' && <td><button className="dangerBtn" onClick={() => deleteProduct(p.id)}>Delete</button></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Suppliers({ token }) {
  const [suppliers, setSuppliers] = useState([]);
  const [form, setForm] = useState({ name: '', contact: '', phone: '', product: '' });
  async function load() { setSuppliers(await request('/suppliers', token)); }
  useEffect(() => { load(); }, []);
  async function add(e) {
    e.preventDefault();
    await request('/suppliers', token, { method: 'POST', body: JSON.stringify(form) });
    setForm({ name: '', contact: '', phone: '', product: '' });
    load();
  }
  async function remove(id) {
    await request(`/suppliers/${id}`, token, { method: 'DELETE' });
    load();
  }
  return (
    <section className="panel">
      <h2>Supplier Management</h2>
      <form className="gridForm colorfulForm" onSubmit={add}>
        {Object.keys(form).map(key => <input key={key} placeholder={key} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} required />)}
        <button className="primaryBtn">Add Supplier</button>
      </form>
      <table>
        <thead><tr><th>Name</th><th>Contact</th><th>Phone</th><th>Product</th><th>Action</th></tr></thead>
        <tbody>{suppliers.map(s => <tr key={s.id}><td>{s.name}</td><td>{s.contact}</td><td>{s.phone}</td><td>{s.product}</td><td><button className="dangerBtn" onClick={() => remove(s.id)}>Delete</button></td></tr>)}</tbody>
      </table>
    </section>
  );
}

function Sales({ token, products, sales, refresh }) {
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState('');
  async function record(e) {
    e.preventDefault();
    setMessage('');
    try {
      const sale = await request('/sales', token, { method: 'POST', body: JSON.stringify({ productId, quantity }) });
      setMessage(`Sale recorded. Total: ₹${sale.total}`);
      refresh();
    } catch (err) { setMessage(err.message); }
  }
  return (
    <section className="panel">
      <h2>Sales History</h2>
      <form className="inlineForm" onSubmit={record}>
        <select value={productId} onChange={e => setProductId(e.target.value)} required>
          <option value="">Select product</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.name} — Qty {p.quantity}</option>)}
        </select>
        <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} />
        <button className="primaryBtn">Record Sale</button>
      </form>
      {message && <div className="notice">{message}</div>}
      <table>
        <thead><tr><th>Product</th><th>Quantity</th><th>Total</th><th>Branch</th><th>Date</th></tr></thead>
        <tbody>{sales.map(s => <tr key={s.id}><td>{s.productName}</td><td>{s.quantity}</td><td>₹{s.total}</td><td>{s.branch}</td><td>{new Date(s.createdAt).toLocaleString()}</td></tr>)}</tbody>
      </table>
    </section>
  );
}

function BranchTransfer({ token, user, products, refresh }) {
  const branches = useMemo(
    () => [...new Set(products.map(p => p.branch).filter(Boolean))],
    [products]
  );

  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [toBranch, setToBranch] = useState('');
  const [transfers, setTransfers] = useState([]);
  const [message, setMessage] = useState('');

  async function loadTransfers() {
    try {
      const data = await request('/transfers', token);
      setTransfers(data);
    } catch (err) {
      setMessage(err.message);
    }
  }

  useEffect(() => {
    if (token) loadTransfers();
  }, [token]);

  async function transferStock(e) {
    e.preventDefault();
    setMessage('');

    try {
      const result = await request('/transfers', token, {
        method: 'POST',
        body: JSON.stringify({ productId, quantity, toBranch })
      });

      setMessage(result.message || 'Stock transferred successfully');
      setProductId('');
      setQuantity(1);
      setToBranch('');

      await refresh();
      await loadTransfers();
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <section className="panel">
      <div className="sectionHeader">
        <h2>Branch-wise Stock Transfer</h2>
        <span>
          {user.role === 'admin'
            ? 'Move stock between branches'
            : 'Staff can view transfer history'}
        </span>
      </div>

      {user.role === 'admin' && (
        <form className="gridForm colorfulForm" onSubmit={transferStock}>
          <select
            value={productId}
            onChange={e => setProductId(e.target.value)}
            required
          >
            <option value="">Select source product</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.branch} — Qty {p.quantity}
              </option>
            ))}
          </select>

          <input
            type="number"
            min="1"
            placeholder="Quantity to transfer"
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
            required
          />

          <input
            list="branch-options"
            placeholder="Destination branch"
            value={toBranch}
            onChange={e => setToBranch(e.target.value)}
            required
          />

          <datalist id="branch-options">
            {branches.map(branch => (
              <option key={branch} value={branch} />
            ))}
            <option value="Hyderabad" />
            <option value="Bangalore" />
            <option value="Chennai" />
            <option value="Mumbai" />
          </datalist>

          <button className="primaryBtn">Transfer Stock</button>
        </form>
      )}

      {message && (
        <div
          className={
            message.toLowerCase().includes('failed') ||
            message.toLowerCase().includes('not') ||
            message.toLowerCase().includes('cannot')
              ? 'error'
              : 'notice'
          }
        >
          {message}
        </div>
      )}

      <h3>Transfer History</h3>

      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>SKU</th>
            <th>Qty</th>
            <th>From</th>
            <th>To</th>
            <th>Transferred By</th>
            <th>Date</th>
          </tr>
        </thead>

        <tbody>
          {transfers.map(t => (
            <tr key={t.id}>
              <td>{t.productName}</td>
              <td>{t.sku}</td>
              <td>{t.quantity}</td>
              <td>{t.fromBranch}</td>
              <td>{t.toBranch}</td>
              <td>{t.transferredBy}</td>
              <td>{new Date(t.createdAt).toLocaleString()}</td>
            </tr>
          ))}

          {transfers.length === 0 && (
            <tr>
              <td colSpan="7">No transfers recorded yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function BarcodeScanner({ token }) {
  const [code, setCode] = useState('');
  const [product, setProduct] = useState(null);
  const [message, setMessage] = useState('');
  const [running, setRunning] = useState(false);

  async function lookup(value = code) {
    setProduct(null); setMessage('');
    try {
      const data = await request(`/barcode/${encodeURIComponent(value)}`, token);
      setProduct(data);
    } catch (err) { setMessage(err.message); }
  }

  function startScanner() {
    setRunning(true);
    setMessage('Allow camera permission, then show a barcode to the camera.');
    setTimeout(() => {
      const scanner = new Html5QrcodeScanner('barcode-reader', { fps: 10, qrbox: { width: 250, height: 160 } }, false);
      scanner.render((decodedText) => {
        setCode(decodedText);
        lookup(decodedText);
        scanner.clear();
        setRunning(false);
      }, () => {});
    }, 100);
  }

  return (
    <section className="panel scannerPanel">
      <h2>Barcode Scanner & SKU Lookup</h2>
      <p>Use the camera scanner or manually enter barcode/SKU.</p>
      <div className="inlineForm">
        <input placeholder="Enter barcode or SKU, example 890111100001" value={code} onChange={e => setCode(e.target.value)} />
        <button className="primaryBtn" onClick={() => lookup()}>Lookup</button>
        <button className="secondaryBtn" onClick={startScanner}>Start Camera Scan</button>
      </div>
      {running && <div id="barcode-reader" className="readerBox"></div>}
      {message && <div className="notice">{message}</div>}
      {product && <div className="foundCard"><h3>{product.name}</h3><p>SKU: {product.sku}</p><p>Barcode: {product.barcode}</p><p>Quantity: {product.quantity}</p><p>Branch: {product.branch}</p></div>}
    </section>
  );
}

function App() {
  const [session, setSession] = useState(() => JSON.parse(localStorage.getItem('inventorySession') || 'null'));
  const [tab, setTab] = useState('dashboard');
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [dashboard, setDashboard] = useState(null);

  const token = session?.token;
  const user = session?.user;

  async function refresh() {
    if (!token) return;
    const [p, s, d] = await Promise.all([request('/products', token), request('/sales', token), request('/dashboard', token)]);
    setProducts(p); setSales(s); setDashboard(d);
  }

  useEffect(() => { refresh(); }, [token]);

  function onLogin(data) {
    localStorage.setItem('inventorySession', JSON.stringify(data));
    setSession(data);
  }

  function logout() {
    localStorage.removeItem('inventorySession');
    setSession(null);
  }

  if (!session) return <Login onLogin={onLogin} />;

  return (
    <div className="appShell">
      <aside className="sidebar">
        <h1>📦 Inventory</h1>
        <p className="roleTag">{user.name} · {user.role}</p>
        <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>Dashboard Analytics</button>
        <button className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}>Product Management</button>
        <button className={tab === 'sales' ? 'active' : ''} onClick={() => setTab('sales')}>Sales History</button>
        <button className={tab === 'barcode' ? 'active' : ''} onClick={() => setTab('barcode')}>Barcode Scanner</button>
        <button className={tab === 'transfer' ? 'active' : ''} onClick={() => setTab('transfers')}>
  Branch Transfer
</button>
        {user.role === 'admin' && <button className={tab === 'suppliers' ? 'active' : ''} onClick={() => setTab('suppliers')}>Supplier Management</button>}
        <button className="logout" onClick={logout}>Logout</button>
      </aside>
      <main className="content">
        <header className="topBar"><h2>Inventory Management For Small Businesses</h2><button onClick={refresh}>Refresh Data</button></header>
        {tab === 'dashboard' && <Dashboard dashboard={dashboard} />}
        {tab === 'products' && <Products token={token} user={user} products={products} refresh={refresh} />}
        {tab === 'sales' && <Sales token={token} products={products} sales={sales} refresh={refresh} />}
        {tab === 'barcode' && <BarcodeScanner token={token} />}
        {tab === 'suppliers' && user.role === 'admin' && <Suppliers token={token} />}
          {tab === 'transfers' && (
  <BranchTransfer
    token={token}
    user={user}
    products={products}
    refresh={refresh}
  />
)}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
