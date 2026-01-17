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

// Helper function to update project totals (including tasks and transactions)
const updateProjectTotals = async (projectId) => {
  // Calculate totals from transactions
  const incomeTransactionsResult = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) as total 
     FROM transactions 
     WHERE project_id = $1 AND type = 'income'`,
    [projectId]
  );

  const expenseTransactionsResult = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) as total 
     FROM transactions 
     WHERE project_id = $1 AND type = 'expense'`,
    [projectId]
  );

  // Calculate totals from tasks
  const incomeTasksResult = await pool.query(
    `SELECT COALESCE(SUM(cost), 0) as total 
     FROM tasks 
     WHERE project_id = $1 AND type = 'income'`,
    [projectId]
  );

  const expenseTasksResult = await pool.query(
    `SELECT COALESCE(SUM(cost), 0) as total 
     FROM tasks 
     WHERE project_id = $1 AND type = 'expense'`,
    [projectId]
  );

  const totalIncome = parseFloat(incomeTransactionsResult.rows[0].total) + parseFloat(incomeTasksResult.rows[0].total);
  const totalExpense = parseFloat(expenseTransactionsResult.rows[0].total) + parseFloat(expenseTasksResult.rows[0].total);

  // Update project totals (balance is auto-calculated)
  await pool.query(
    `UPDATE projects 
     SET total_income = $1, total_expense = $2, updated_at = CURRENT_TIMESTAMP 
     WHERE id = $3`,
    [totalIncome, totalExpense, projectId]
  );
};

// @route   GET /api/tasks
// @desc    Get all tasks (can filter by project_id and month)
// @access  Private
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { project_id, month, year } = req.query;
  const userId = req.user.id;
  const role = req.user.role;

  // Build WHERE conditions
  let whereConditions = [];
  let queryParams = [];
  let paramIndex = 1;

  // Handle project_id filter
  if (project_id) {
    // Check project access
    const accessCheck = await checkProjectAccess(project_id, userId, role);
    if (!accessCheck.authorized) {
      return errorResponse(res, 403, accessCheck.error);
    }
    whereConditions.push(`t.project_id = $${paramIndex}`);
    queryParams.push(project_id);
    paramIndex++;
  } else if (role !== 'admin') {
    // Non-admin users see only their projects
    whereConditions.push(`p.user_id = $${paramIndex}`);
    queryParams.push(userId);
    paramIndex++;
  }

  // Handle month filter (format: YYYY-MM or just month number 1-12)
  if (month) {
    if (year) {
      // Both month and year provided (e.g., month=1, year=2024)
      whereConditions.push(`EXTRACT(MONTH FROM t.task_date) = $${paramIndex}`);
      queryParams.push(parseInt(month));
      paramIndex++;
      whereConditions.push(`EXTRACT(YEAR FROM t.task_date) = $${paramIndex}`);
      queryParams.push(parseInt(year));
      paramIndex++;
    } else if (month.includes('-')) {
      // Format: YYYY-MM (e.g., "2024-01")
      const [yearPart, monthPart] = month.split('-');
      whereConditions.push(`EXTRACT(MONTH FROM t.task_date) = $${paramIndex}`);
      queryParams.push(parseInt(monthPart));
      paramIndex++;
      whereConditions.push(`EXTRACT(YEAR FROM t.task_date) = $${paramIndex}`);
      queryParams.push(parseInt(yearPart));
      paramIndex++;
    } else {
      // Just month number (current year assumed)
      const currentYear = new Date().getFullYear();
      whereConditions.push(`EXTRACT(MONTH FROM t.task_date) = $${paramIndex}`);
      queryParams.push(parseInt(month));
      paramIndex++;
      whereConditions.push(`EXTRACT(YEAR FROM t.task_date) = $${paramIndex}`);
      queryParams.push(currentYear);
      paramIndex++;
    }
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  let tasks;
  tasks = await pool.query(
    `SELECT t.*, p.project_name 
     FROM tasks t 
     JOIN projects p ON t.project_id = p.id 
     ${whereClause}
     ORDER BY t.task_date DESC, t.created_at DESC`,
    queryParams
  );

  successResponse(res, 200, {
    tasks: tasks.rows
  }, 'Tasks retrieved successfully');
}));

// @route   GET /api/tasks/:id
// @desc    Get single task by ID
// @access  Private
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const role = req.user.role;

  const taskResult = await pool.query(
    `SELECT t.*, p.project_name, p.user_id as project_owner_id
     FROM tasks t 
     JOIN projects p ON t.project_id = p.id 
     WHERE t.id = $1`,
    [id]
  );

  if (taskResult.rows.length === 0) {
    return errorResponse(res, 404, 'Task not found');
  }

  const task = taskResult.rows[0];

  // Check if user has access
  if (role !== 'admin' && task.project_owner_id !== userId) {
    return errorResponse(res, 403, 'Access denied');
  }

  successResponse(res, 200, {
    task
  }, 'Task retrieved successfully');
}));

// @route   POST /api/tasks
// @desc    Create new task
// @access  Private
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;
  const { project_id, task_name, description, worker_name, worker_phone, cost, task_date, type } = req.body;

  if (!project_id || !task_name) {
    return errorResponse(res, 400, 'Project ID and task name are required');
  }

  if (type && type !== 'income' && type !== 'expense') {
    return errorResponse(res, 400, 'Type must be either "income" or "expense"');
  }

  // Check project access
  const accessCheck = await checkProjectAccess(project_id, userId, role);
  if (!accessCheck.authorized) {
    return errorResponse(res, 403, accessCheck.error);
  }

  const result = await pool.query(
    `INSERT INTO tasks (project_id, task_name, description, worker_name, worker_phone, cost, task_date, type) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
     RETURNING *`,
    [project_id, task_name, description || null, worker_name || null, worker_phone || null, cost || 0, task_date || null, type || null]
  );

  // Update project totals
  await updateProjectTotals(project_id);

  successResponse(res, 201, {
    task: result.rows[0]
  }, 'Task created successfully');
}));

// @route   PUT /api/tasks/:id
// @desc    Update task
// @access  Private
router.put('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const role = req.user.role;
  const { task_name, description, worker_name, worker_phone, cost, task_date, type } = req.body;

  // Get task and check access
  const taskResult = await pool.query(
    `SELECT t.*, p.user_id as project_owner_id 
     FROM tasks t 
     JOIN projects p ON t.project_id = p.id 
     WHERE t.id = $1`,
    [id]
  );

  if (taskResult.rows.length === 0) {
    return errorResponse(res, 404, 'Task not found');
  }

  if (role !== 'admin' && taskResult.rows[0].project_owner_id !== userId) {
    return errorResponse(res, 403, 'Access denied');
  }

  if (type && type !== 'income' && type !== 'expense') {
    return errorResponse(res, 400, 'Type must be either "income" or "expense"');
  }

  const projectId = taskResult.rows[0].project_id;

  const result = await pool.query(
    `UPDATE tasks 
     SET task_name = COALESCE($1, task_name),
         description = COALESCE($2, description),
         worker_name = COALESCE($3, worker_name),
         worker_phone = COALESCE($4, worker_phone),
         cost = COALESCE($5, cost),
         task_date = COALESCE($6, task_date),
         type = COALESCE($7, type),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $8 
     RETURNING *`,
    [task_name, description, worker_name, worker_phone, cost, task_date, type, id]
  );

  // Update project totals
  await updateProjectTotals(projectId);

  successResponse(res, 200, {
    task: result.rows[0]
  }, 'Task updated successfully');
}));

// @route   DELETE /api/tasks/:id
// @desc    Delete task
// @access  Private
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const role = req.user.role;

  // Get task and check access
  const taskResult = await pool.query(
    `SELECT t.*, p.user_id as project_owner_id 
     FROM tasks t 
     JOIN projects p ON t.project_id = p.id 
     WHERE t.id = $1`,
    [id]
  );

  if (taskResult.rows.length === 0) {
    return errorResponse(res, 404, 'Task not found');
  }

  if (role !== 'admin' && taskResult.rows[0].project_owner_id !== userId) {
    return errorResponse(res, 403, 'Access denied');
  }

  const projectId = taskResult.rows[0].project_id;

  await pool.query('DELETE FROM tasks WHERE id = $1', [id]);

  // Update project totals
  await updateProjectTotals(projectId);

  successResponse(res, 200, {}, 'Task deleted successfully');
}));

module.exports = router;
