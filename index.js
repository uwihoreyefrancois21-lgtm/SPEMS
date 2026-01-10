const express = require('express');
const cors = require('cors');
require('dotenv').config();
const pool = require('./config/database');

// Import routes
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const taskRoutes = require('./routes/tasks');
const transactionRoutes = require('./routes/transactions');
const reportRoutes = require('./routes/reports');
const userRoutes = require('./routes/users');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.type('html').send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>SPEMS • Smart Project Expense Management System</title>
      <style>
        :root {
          --bg: #0f172a;
          --card: #111827;
          --text: #e5e7eb;
          --muted: #9ca3af;
          --primary: #22c55e;
          --primary-dark: #16a34a;
          --accent: #60a5fa;
          --border: #1f2937;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          background: linear-gradient(180deg, #0b1220 0%, var(--bg) 40%);
          color: var(--text);
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, Apple Color Emoji, Segoe UI Emoji;
        }
        .container { max-width: 1100px; margin: 0 auto; padding: 40px 20px; }
        header { text-align: center; padding: 20px 0 10px; }
        .badge {
          display: inline-block; padding: 6px 12px; border-radius: 999px;
          background: rgba(34, 197, 94, 0.12); color: var(--primary);
          border: 1px solid rgba(34,197,94,0.25); font-weight: 600; font-size: 13px;
        }
        h1 { font-size: 34px; margin: 16px 0 6px; letter-spacing: 0.2px; }
        .subtitle { color: var(--muted); font-size: 16px; }
        .grid {
          margin-top: 32px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }
        .card {
          background: linear-gradient(180deg, #0e1628 0%, var(--card) 60%);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 20px;
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
        }
        .card:hover { transform: translateY(-2px); border-color: #2b3948; }
        .plan { display: flex; align-items: baseline; justify-content: space-between; }
        .plan h3 { margin: 0; font-size: 18px; }
        .price { font-size: 24px; font-weight: 700; color: var(--accent); }
        ul { list-style: none; padding: 0; margin: 16px 0 20px; }
        li { margin: 8px 0; color: var(--muted); }
        .cta {
          display: inline-block; text-decoration: none; text-align: center;
          width: 100%; padding: 10px 14px; border-radius: 8px;
          background: var(--primary); color: #03110a; font-weight: 700;
          border: 1px solid rgba(34,197,94,0.6);
        }
        .cta:hover { background: var(--primary-dark); }
        .footnote { text-align: center; color: var(--muted); font-size: 12px; margin-top: 18px; }
        .footer { text-align: center; margin-top: 36px; color: var(--muted); font-size: 14px; }
        .footer a { color: var(--accent); text-decoration: none; }
        @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
      </style>
    </head>
    <body>
      <div class="container">
        <header>
          <span class="badge">Smart Project Expense Management System</span>
          <h1>Choose Your Subscription</h1>
          <p class="subtitle">Track projects, tasks, and finances with real‑time balance reporting.</p>
        </header>

        <section class="grid">
          <div class="card">
            <div class="plan">
              <h3>Starter</h3>
              <span class="price">Free</span>
            </div>
            <ul>
              <li>Up to 3 projects</li>
              <li>Task tracking</li>
              <li>Income & expense logging</li>
              <li>Basic reports</li>
            </ul>
            <a class="cta" href="#">Get Started</a>
            <p class="footnote">Ideal for individuals and small trials.</p>
          </div>

          <div class="card">
            <div class="plan">
              <h3>Pro</h3>
              <span class="price">$19/mo</span>
            </div>
            <ul>
              <li>Unlimited projects</li>
              <li>Team roles & approvals</li>
              <li>Advanced dashboard</li>
              <li>Financial summaries</li>
            </ul>
            <a class="cta" href="#">Upgrade to Pro</a>
            <p class="footnote">Best for growing teams managing multiple projects.</p>
          </div>

          <div class="card">
            <div class="plan">
              <h3>Business</h3>
              <span class="price">$49/mo</span>
            </div>
            <ul>
              <li>Role-based access</li>
              <li>Detailed project reports</li>
              <li>Priority support</li>
              <li>Audit logs</li>
            </ul>
            <a class="cta" href="#">Contact Sales</a>
            <p class="footnote">For organizations needing advanced control and support.</p>
          </div>
        </section>

        <div class="footer">
          <p>Already have an account? Start with the API:</p>
          <p><a href="/api/auth/register">Register</a> • <a href="/login">Login</a></p>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Login page
app.get('/login', (req, res) => {
  res.type('html').send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Login • SPEMS</title>
      <style>
        :root {
          --bg: #0f172a;
          --card: #111827;
          --text: #e5e7eb;
          --muted: #9ca3af;
          --primary: #22c55e;
          --primary-dark: #16a34a;
          --accent: #60a5fa;
          --border: #1f2937;
          --error: #ef4444;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          background: linear-gradient(180deg, #0b1220 0%, var(--bg) 40%);
          color: var(--text);
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, Apple Color Emoji, Segoe UI Emoji;
        }
        .container { max-width: 480px; margin: 0 auto; padding: 40px 20px; }
        .card {
          background: linear-gradient(180deg, #0e1628 0%, var(--card) 60%);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 24px;
        }
        h1 { font-size: 26px; margin: 0 0 6px; }
        .subtitle { color: var(--muted); font-size: 14px; margin-bottom: 18px; }
        label { display: block; font-size: 13px; color: var(--muted); margin-bottom: 6px; }
        input {
          width: 100%; padding: 10px 12px; border-radius: 8px;
          border: 1px solid var(--border); background: #0c1323; color: var(--text);
          outline: none;
        }
        .field { margin-bottom: 14px; }
        .btn {
          width: 100%; padding: 10px 14px; border-radius: 8px;
          background: var(--primary); color: #03110a; font-weight: 700;
          border: 1px solid rgba(34,197,94,0.6); cursor: pointer;
        }
        .btn:hover { background: var(--primary-dark); }
        .error { color: var(--error); font-size: 13px; margin-top: 8px; min-height: 18px; }
        .result {
          margin-top: 14px; padding: 12px; border-radius: 8px;
          border: 1px dashed var(--border); background: #0c1323; color: var(--muted);
          font-size: 12px; word-break: break-all;
        }
        .links { text-align: center; margin-top: 16px; font-size: 14px; color: var(--muted); }
        .links a { color: var(--accent); text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <h1>Login</h1>
          <p class="subtitle">Enter your email and password to continue.</p>
          <form id="loginForm">
            <div class="field">
              <label for="email">Email</label>
              <input id="email" name="email" type="email" placeholder="you@example.com" required />
            </div>
            <div class="field">
              <label for="password">Password</label>
              <input id="password" name="password" type="password" placeholder="••••••••" required />
            </div>
            <button class="btn" type="submit">Login</button>
            <div class="error" id="error"></div>
          </form>
          <div class="result" id="result"></div>
          <div class="links">
            <a href="/">Back to Home</a> • <a href="/api/auth/register">Create account</a>
          </div>
        </div>
      </div>
      <script>
        const form = document.getElementById('loginForm');
        const errorEl = document.getElementById('error');
        const resultEl = document.getElementById('result');
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          errorEl.textContent = '';
          resultEl.textContent = '';
          const email = document.getElementById('email').value.trim();
          const password = document.getElementById('password').value;
          try {
            const res = await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (!res.ok || data.success === false) {
              throw new Error(data.message || 'Login failed');
            }
            try { localStorage.setItem('spems_token', data.data?.token || data.token); } catch {}
            resultEl.textContent = 'Login successful. Token saved. Use API with Authorization Bearer.';
          } catch (err) {
            errorEl.textContent = err.message;
          }
        });
      </script>
    </body>
    </html>
  `);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 SPEMS Server running on http://localhost:${PORT}`);
  console.log(`📊 Database: Connected`);
  console.log(`🔐 JWT Secret: ${process.env.JWT_SECRET ? 'Configured' : 'Not set!'}`);
});
