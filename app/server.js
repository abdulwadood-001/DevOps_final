const express = require('express');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.PGHOST || 'postgres',
  user: process.env.PGUSER || 'appuser',
  password: process.env.PGPASSWORD || 'apppassword',
  database: process.env.PGDATABASE || 'appdb',
  port: 5432,
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize DB table on startup
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id SERIAL PRIMARY KEY,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Database initialized successfully.');
  } catch (err) {
    console.error('DB init error:', err.message);
  }
}
initDB();

// Health check endpoint (used by Kubernetes readinessProbe)
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Home page - list all notes
app.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM notes ORDER BY created_at DESC');
    const rows = result.rows;

    const listItems = rows.map(r =>
      `<li><strong>#${r.id}</strong> — ${escapeHtml(r.content)} <span style="color:#888;font-size:0.85em;">(${new Date(r.created_at).toLocaleString()})</span></li>`
    ).join('');

    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>DevOps Notes App</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', sans-serif; background: #f0f2f5; color: #333; }
    header { background: #1a73e8; color: white; padding: 20px 40px; }
    header h1 { font-size: 1.6rem; }
    header p { font-size: 0.9rem; opacity: 0.85; margin-top: 4px; }
    .container { max-width: 700px; margin: 40px auto; padding: 0 20px; }
    .card { background: white; border-radius: 10px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-bottom: 24px; }
    h2 { margin-bottom: 16px; font-size: 1.1rem; color: #1a73e8; }
    textarea { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 1rem; resize: vertical; min-height: 80px; }
    button { margin-top: 10px; padding: 10px 24px; background: #1a73e8; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 1rem; }
    button:hover { background: #1558b0; }
    ul { list-style: none; padding: 0; }
    ul li { padding: 12px 0; border-bottom: 1px solid #f0f0f0; line-height: 1.5; }
    ul li:last-child { border-bottom: none; }
    .empty { color: #888; font-style: italic; }
  </style>
</head>
<body>
  <header>
    <h1>📝 DevOps Notes App</h1>
    <p>Deployed via Jenkins &rarr; Docker &rarr; Kubernetes on AWS EC2</p>
  </header>
  <div class="container">
    <div class="card">
      <h2>Add a Note</h2>
      <form method="POST" action="/notes">
        <textarea name="content" placeholder="Write your note here..." required></textarea>
        <br/>
        <button type="submit">Save Note</button>
      </form>
    </div>
    <div class="card">
      <h2>All Notes (${rows.length})</h2>
      ${rows.length === 0
        ? '<p class="empty">No notes yet. Add one above!</p>'
        : `<ul>${listItems}</ul>`}
    </div>
  </div>
</body>
</html>
    `);
  } catch (err) {
    res.status(500).send(`<h2>DB Error</h2><pre>${err.message}</pre>`);
  }
});

// Create note
app.post('/notes', async (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.redirect('/');
  }
  try {
    await pool.query('INSERT INTO notes (content) VALUES ($1)', [content.trim()]);
    res.redirect('/');
  } catch (err) {
    res.status(500).send(`<h2>DB Error</h2><pre>${err.message}</pre>`);
  }
});

// API: get all notes (JSON)
app.get('/api/notes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM notes ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Prometheus metrics endpoint (simple custom metrics)
app.get('/metrics', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM notes');
    const count = result.rows[0].count;
    res.set('Content-Type', 'text/plain');
    res.send(`# HELP notes_total Total number of notes in DB\n# TYPE notes_total gauge\nnotes_total ${count}\n`);
  } catch (err) {
    res.status(500).send('# metrics unavailable\n');
  }
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
