const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { asyncHandler, successResponse, errorResponse } = require('../utils/helpers');
const { authenticate, isAdmin } = require('../middleware/auth');

// @route   GET /api/reports/project/:id
// @desc    Get detailed report for a specific project
// @access  Private
router.get('/project/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const role = req.user.role;

  // Get project
  const projectResult = await pool.query(
    'SELECT * FROM projects WHERE id = $1',
    [id]
  );

  if (projectResult.rows.length === 0) {
    return errorResponse(res, 404, 'Project not found');
  }

  const project = projectResult.rows[0];

  // Check access
  if (role !== 'admin' && project.user_id !== userId) {
    return errorResponse(res, 403, 'Access denied');
  }

  // Get tasks
  const tasksResult = await pool.query(
    `SELECT * FROM tasks WHERE project_id = $1 ORDER BY task_date DESC`,
    [id]
  );

  // Get transactions
  const transactionsResult = await pool.query(
    `SELECT * FROM transactions WHERE project_id = $1 ORDER BY transaction_date DESC`,
    [id]
  );

  // Get income transactions
  const incomeResult = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count 
     FROM transactions 
     WHERE project_id = $1 AND type = 'income'`,
    [id]
  );

  // Get expense transactions
  const expenseResult = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count 
     FROM transactions 
     WHERE project_id = $1 AND type = 'expense'`,
    [id]
  );

  successResponse(res, 200, {
    project: {
      ...project,
      tasks: tasksResult.rows,
      transactions: transactionsResult.rows,
      income: {
        total: parseFloat(incomeResult.rows[0].total),
        count: parseInt(incomeResult.rows[0].count)
      },
      expense: {
        total: parseFloat(expenseResult.rows[0].total),
        count: parseInt(expenseResult.rows[0].count)
      }
    }
  }, 'Project report retrieved successfully');
}));

// @route   GET /api/reports/dashboard
// @desc    Get dashboard statistics for current user
// @access  Private
router.get('/dashboard', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;

  let statsQuery;
  if (role === 'admin') {
    // Admin sees all projects
    statsQuery = await pool.query(
      `SELECT 
        COUNT(*) as total_projects,
        COALESCE(SUM(total_income), 0) as total_income_all,
        COALESCE(SUM(total_expense), 0) as total_expense_all,
        COALESCE(SUM(balance), 0) as total_balance_all
       FROM projects`
    );

    // Get recent projects
    const recentProjects = await pool.query(
      `SELECT * FROM projects ORDER BY created_at DESC LIMIT 5`
    );

    // Get pending users
    const pendingUsers = await pool.query(
      `SELECT id, username, email, phone, created_at 
       FROM users 
       WHERE approve_user = false 
       ORDER BY created_at DESC`
    );

    successResponse(res, 200, {
      stats: {
        total_projects: parseInt(statsQuery.rows[0].total_projects),
        total_income_all: parseFloat(statsQuery.rows[0].total_income_all),
        total_expense_all: parseFloat(statsQuery.rows[0].total_expense_all),
        total_balance_all: parseFloat(statsQuery.rows[0].total_balance_all)
      },
      recentProjects: recentProjects.rows,
      pendingUsers: pendingUsers.rows
    }, 'Dashboard data retrieved successfully');
  } else {
    // Regular user sees only their projects
    statsQuery = await pool.query(
      `SELECT 
        COUNT(*) as total_projects,
        COALESCE(SUM(total_income), 0) as total_income_all,
        COALESCE(SUM(total_expense), 0) as total_expense_all,
        COALESCE(SUM(balance), 0) as total_balance_all
       FROM projects
       WHERE user_id = $1`,
      [userId]
    );

    // Get user's projects
    const userProjects = await pool.query(
      `SELECT * FROM projects 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [userId]
    );

    // Get total tasks
    const tasksResult = await pool.query(
      `SELECT COUNT(*) as total_tasks 
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       WHERE p.user_id = $1`,
      [userId]
    );

    // Get total transactions
    const transactionsResult = await pool.query(
      `SELECT COUNT(*) as total_transactions 
       FROM transactions t
       JOIN projects p ON t.project_id = p.id
       WHERE p.user_id = $1`,
      [userId]
    );

    successResponse(res, 200, {
      stats: {
        total_projects: parseInt(statsQuery.rows[0].total_projects),
        total_income_all: parseFloat(statsQuery.rows[0].total_income_all),
        total_expense_all: parseFloat(statsQuery.rows[0].total_expense_all),
        total_balance_all: parseFloat(statsQuery.rows[0].total_balance_all),
        total_tasks: parseInt(tasksResult.rows[0].total_tasks),
        total_transactions: parseInt(transactionsResult.rows[0].total_transactions)
      },
      projects: userProjects.rows
    }, 'Dashboard data retrieved successfully');
  }
}));

// @route   GET /api/reports/financial-summary
// @desc    Get financial summary by project
// @access  Private
router.get('/financial-summary', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;

  let summary;
  if (role === 'admin') {
    summary = await pool.query(
      `SELECT 
        id, project_name, 
        total_income, 
        total_expense, 
        balance,
        created_at
       FROM projects
       ORDER BY balance DESC`
    );
  } else {
    summary = await pool.query(
      `SELECT 
        id, project_name, 
        total_income, 
        total_expense, 
        balance,
        created_at
       FROM projects
       WHERE user_id = $1
       ORDER BY balance DESC`,
      [userId]
    );
  }

  successResponse(res, 200, {
    summary: summary.rows
  }, 'Financial summary retrieved successfully');
}));

module.exports = router;
