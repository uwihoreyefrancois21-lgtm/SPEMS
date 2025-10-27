const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { asyncHandler, successResponse, errorResponse } = require('../utils/helpers');
const { authenticate } = require('../middleware/auth');

// Helper function to check project access
const checkProjectAccess = async (projectId, userId, role) => {
  const projectCheck = await pool.query(
    'SELECT user_id FROM projects WHERE id = $1',
    [projectId]
  );

  if (projectCheck.rows.length === 0) {
    return { authorized: false, error: 'Project not found' };
  }

  if (role !== 'admin' && projectCheck.rows[0].user_id !== userId) {
    return { authorized: false, error: 'Access denied to this project' };
  }

  return { authorized: true };
};

// Helper function to update project totals
const updateProjectTotals = async (projectId) => {
  // Calculate totals
  const incomeResult = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) as total 
     FROM transactions 
     WHERE project_id = $1 AND type = 'income'`,
    [projectId]
  );

  const expenseResult = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) as total 
     FROM transactions 
     WHERE project_id = $1 AND type = 'expense'`,
    [projectId]
  );

  const totalIncome = parseFloat(incomeResult.rows[0].total);
  const totalExpense = parseFloat(expenseResult.rows[0].total);

  // Update project totals (balance is auto-calculated)
  await pool.query(
    `UPDATE projects 
     SET total_income = $1, total_expense = $2, updated_at = CURRENT_TIMESTAMP 
     WHERE id = $3`,
    [totalIncome, totalExpense, projectId]
  );
};

// @route   GET /api/transactions
// @desc    Get all transactions (can filter by project_id)
// @access  Private
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { project_id } = req.query;
  const userId = req.user.id;
  const role = req.user.role;

  let transactions;
  if (project_id) {
    // Check project access
    const accessCheck = await checkProjectAccess(project_id, userId, role);
    if (!accessCheck.authorized) {
      return errorResponse(res, 403, accessCheck.error);
    }

    transactions = await pool.query(
      `SELECT t.*, p.project_name 
       FROM transactions t 
       JOIN projects p ON t.project_id = p.id 
       WHERE t.project_id = $1 
       ORDER BY t.transaction_date DESC, t.created_at DESC`,
      [project_id]
    );
  } else {
    // Get all transactions for user's projects
    if (role === 'admin') {
      transactions = await pool.query(
        `SELECT t.*, p.project_name 
         FROM transactions t 
         JOIN projects p ON t.project_id = p.id 
         ORDER BY t.transaction_date DESC, t.created_at DESC`
      );
    } else {
      transactions = await pool.query(
        `SELECT t.*, p.project_name 
         FROM transactions t 
         JOIN projects p ON t.project_id = p.id 
         WHERE p.user_id = $1 
         ORDER BY t.transaction_date DESC, t.created_at DESC`,
        [userId]
      );
    }
  }

  successResponse(res, 200, {
    transactions: transactions.rows
  }, 'Transactions retrieved successfully');
}));

// @route   GET /api/transactions/:id
// @desc    Get single transaction by ID
// @access  Private
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const role = req.user.role;

  const transactionResult = await pool.query(
    `SELECT t.*, p.project_name, p.user_id as project_owner_id
     FROM transactions t 
     JOIN projects p ON t.project_id = p.id 
     WHERE t.id = $1`,
    [id]
  );

  if (transactionResult.rows.length === 0) {
    return errorResponse(res, 404, 'Transaction not found');
  }

  const transaction = transactionResult.rows[0];

  // Check if user has access
  if (role !== 'admin' && transaction.project_owner_id !== userId) {
    return errorResponse(res, 403, 'Access denied');
  }

  successResponse(res, 200, {
    transaction
  }, 'Transaction retrieved successfully');
}));

// @route   POST /api/transactions
// @desc    Create new transaction (and update project totals)
// @access  Private
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;
  const { project_id, task_id, type, amount, description, transaction_date } = req.body;

  if (!project_id || !type || !amount) {
    return errorResponse(res, 400, 'Project ID, type, and amount are required');
  }

  if (type !== 'income' && type !== 'expense') {
    return errorResponse(res, 400, 'Type must be either "income" or "expense"');
  }

  // Check project access
  const accessCheck = await checkProjectAccess(project_id, userId, role);
  if (!accessCheck.authorized) {
    return errorResponse(res, 403, accessCheck.error);
  }

  // Insert transaction
  const result = await pool.query(
    `INSERT INTO transactions (project_id, task_id, type, amount, description, transaction_date) 
     VALUES ($1, $2, $3, $4, $5, $6) 
     RETURNING *`,
    [project_id, task_id || null, type, amount, description || null, transaction_date || null]
  );

  // Update project totals
  await updateProjectTotals(project_id);

  successResponse(res, 201, {
    transaction: result.rows[0]
  }, 'Transaction created successfully');
}));

// @route   PUT /api/transactions/:id
// @desc    Update transaction (and update project totals)
// @access  Private
router.put('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const role = req.user.role;
  const { type, amount, description, transaction_date } = req.body;

  // Get transaction and check access
  const transactionResult = await pool.query(
    `SELECT t.*, p.user_id as project_owner_id 
     FROM transactions t 
     JOIN projects p ON t.project_id = p.id 
     WHERE t.id = $1`,
    [id]
  );

  if (transactionResult.rows.length === 0) {
    return errorResponse(res, 404, 'Transaction not found');
  }

  if (role !== 'admin' && transactionResult.rows[0].project_owner_id !== userId) {
    return errorResponse(res, 403, 'Access denied');
  }

  const projectId = transactionResult.rows[0].project_id;

  // Update transaction
  const result = await pool.query(
    `UPDATE transactions 
     SET type = COALESCE($1, type),
         amount = COALESCE($2, amount),
         description = COALESCE($3, description),
         transaction_date = COALESCE($4, transaction_date),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $5 
     RETURNING *`,
    [type, amount, description, transaction_date, id]
  );

  // Update project totals
  await updateProjectTotals(projectId);

  successResponse(res, 200, {
    transaction: result.rows[0]
  }, 'Transaction updated successfully');
}));

// @route   DELETE /api/transactions/:id
// @desc    Delete transaction (and update project totals)
// @access  Private
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const role = req.user.role;

  // Get transaction and check access
  const transactionResult = await pool.query(
    `SELECT t.*, p.user_id as project_owner_id 
     FROM transactions t 
     JOIN projects p ON t.project_id = p.id 
     WHERE t.id = $1`,
    [id]
  );

  if (transactionResult.rows.length === 0) {
    return errorResponse(res, 404, 'Transaction not found');
  }

  if (role !== 'admin' && transactionResult.rows[0].project_owner_id !== userId) {
    return errorResponse(res, 403, 'Access denied');
  }

  const projectId = transactionResult.rows[0].project_id;

  await pool.query('DELETE FROM transactions WHERE id = $1', [id]);

  // Update project totals
  await updateProjectTotals(projectId);

  successResponse(res, 200, {}, 'Transaction deleted successfully');
}));

module.exports = router;
