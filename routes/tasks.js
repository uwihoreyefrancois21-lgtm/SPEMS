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

// @route   GET /api/tasks
// @desc    Get all tasks (can filter by project_id)
// @access  Private
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { project_id } = req.query;
  const userId = req.user.id;
  const role = req.user.role;

  let tasks;
  if (project_id) {
    // Check project access
    const accessCheck = await checkProjectAccess(project_id, userId, role);
    if (!accessCheck.authorized) {
      return errorResponse(res, 403, accessCheck.error);
    }

    tasks = await pool.query(
      `SELECT t.*, p.project_name 
       FROM tasks t 
       JOIN projects p ON t.project_id = p.id 
       WHERE t.project_id = $1 
       ORDER BY t.created_at DESC`,
      [project_id]
    );
  } else {
    // Get all tasks for user's projects
    if (role === 'admin') {
      tasks = await pool.query(
        `SELECT t.*, p.project_name 
         FROM tasks t 
         JOIN projects p ON t.project_id = p.id 
         ORDER BY t.created_at DESC`
      );
    } else {
      tasks = await pool.query(
        `SELECT t.*, p.project_name 
         FROM tasks t 
         JOIN projects p ON t.project_id = p.id 
         WHERE p.user_id = $1 
         ORDER BY t.created_at DESC`,
        [userId]
      );
    }
  }

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
  const { project_id, task_name, description, worker_name, worker_phone, cost, task_date } = req.body;

  if (!project_id || !task_name) {
    return errorResponse(res, 400, 'Project ID and task name are required');
  }

  // Check project access
  const accessCheck = await checkProjectAccess(project_id, userId, role);
  if (!accessCheck.authorized) {
    return errorResponse(res, 403, accessCheck.error);
  }

  const result = await pool.query(
    `INSERT INTO tasks (project_id, task_name, description, worker_name, worker_phone, cost, task_date) 
     VALUES ($1, $2, $3, $4, $5, $6, $7) 
     RETURNING *`,
    [project_id, task_name, description || null, worker_name || null, worker_phone || null, cost || 0, task_date || null]
  );

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
  const { task_name, description, worker_name, worker_phone, cost, task_date } = req.body;

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

  const result = await pool.query(
    `UPDATE tasks 
     SET task_name = COALESCE($1, task_name),
         description = COALESCE($2, description),
         worker_name = COALESCE($3, worker_name),
         worker_phone = COALESCE($4, worker_phone),
         cost = COALESCE($5, cost),
         task_date = COALESCE($6, task_date),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $7 
     RETURNING *`,
    [task_name, description, worker_name, worker_phone, cost, task_date, id]
  );

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

  await pool.query('DELETE FROM tasks WHERE id = $1', [id]);

  successResponse(res, 200, {}, 'Task deleted successfully');
}));

module.exports = router;
