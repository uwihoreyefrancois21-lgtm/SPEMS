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
  res.json({
    success: true,
    message: 'Smart Project Expense Management System (SPEMS) API',
    version: '1.0.0',
    endpoints: {
      auth: {
        'POST /api/auth/register': 'Register new user',
        'POST /api/auth/login': 'Login user',
        'GET /api/auth/me': 'Get current user',
        'POST /api/auth/approve-user/:userId': 'Approve user (Admin)',
        'POST /api/auth/reject-user/:userId': 'Reject user (Admin)'
      },
      projects: {
        'GET /api/projects': 'Get all projects',
        'GET /api/projects/:id': 'Get project by ID',
        'POST /api/projects': 'Create project',
        'PUT /api/projects/:id': 'Update project',
        'DELETE /api/projects/:id': 'Delete project'
      },
      tasks: {
        'GET /api/tasks': 'Get all tasks (filter by ?project_id=)',
        'GET /api/tasks/:id': 'Get task by ID',
        'POST /api/tasks': 'Create task',
        'PUT /api/tasks/:id': 'Update task',
        'DELETE /api/tasks/:id': 'Delete task'
      },
      transactions: {
        'GET /api/transactions': 'Get all transactions (filter by ?project_id=)',
        'GET /api/transactions/:id': 'Get transaction by ID',
        'POST /api/transactions': 'Create transaction (auto-updates project balance)',
        'PUT /api/transactions/:id': 'Update transaction',
        'DELETE /api/transactions/:id': 'Delete transaction'
      },
      reports: {
        'GET /api/reports/project/:id': 'Get detailed project report',
        'GET /api/reports/dashboard': 'Get dashboard statistics',
        'GET /api/reports/financial-summary': 'Get financial summary'
      },
      users: {
        'GET /api/users': 'Get all users (Admin)',
        'GET /api/users/:id': 'Get user by ID (Admin)',
        'PUT /api/users/:id': 'Update user (Admin)',
        'DELETE /api/users/:id': 'Delete user (Admin)'
      }
    },
    note: 'All endpoints except register and login require authentication. Add "Authorization: Bearer <token>" header.'
  });
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
