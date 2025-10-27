const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { asyncHandler, successResponse, errorResponse } = require('../utils/helpers');
const { authenticate, isAdmin } = require('../middleware/auth');

// @route   GET /api/projects
// @desc    Get all projects for current user or all projects (admin)
// @access  Private
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;

  let projects;
  if (role === 'admin') {
    // Admin can see all projects
    projects = await pool.query(
      `SELECT p.*, u.username, u.email 
       FROM projects p 
       LEFT JOIN users u ON p.user_id = u.id 
       ORDER BY p.created_at DESC`
    );
  } else {
    // Regular users see only their projects
    projects = await pool.query(
      `SELECT * FROM projects 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [userId]
    );
  }

  successResponse(res, 200, {
    projects: projects.rows
  }, 'Projects retrieved successfully');
}));

// @route   GET /api/projects/:id
// @desc    Get single project by ID
// @access  Private
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const role = req.user.role;

  const projectResult = await pool.query(
    `SELECT p.*, u.username, u.email 
     FROM projects p 
     LEFT JOIN users u ON p.user_id = u.id 
     WHERE p.id = $1`,
    [id]
  );

  if (projectResult.rows.length === 0) {
    return errorResponse(res, 404, 'Project not found');
  }

  const project = projectResult.rows[0];

  // Check if user owns this project or is admin
  if (role !== 'admin' && project.user_id !== userId) {
    return errorResponse(res, 403, 'Access denied');
  }

  successResponse(res, 200, {
    project
  }, 'Project retrieved successfully');
}));

// @route   POST /api/projects
// @desc    Create new project
// @access  Private
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { project_name, description, start_date, end_date } = req.body;

  if (!project_name) {
    return errorResponse(res, 400, 'Project name is required');
  }

  const result = await pool.query(
    `INSERT INTO projects (user_id, project_name, description, start_date, end_date) 
     VALUES ($1, $2, $3, $4, $5) 
     RETURNING *`,
    [userId, project_name, description || null, start_date || null, end_date || null]
  );

  successResponse(res, 201, {
    project: result.rows[0]
  }, 'Project created successfully');
}));

// @route   PUT /api/projects/:id
// @desc    Update project
// @access  Private
router.put('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const role = req.user.role;
  const { project_name, description, start_date, end_date } = req.body;

  // Check if project exists and user owns it
  const projectCheck = await pool.query(
    'SELECT * FROM projects WHERE id = $1',
    [id]
  );

  if (projectCheck.rows.length === 0) {
    return errorResponse(res, 404, 'Project not found');
  }

  if (role !== 'admin' && projectCheck.rows[0].user_id !== userId) {
    return errorResponse(res, 403, 'Access denied');
  }

  const result = await pool.query(
    `UPDATE projects 
     SET project_name = COALESCE($1, project_name),
         description = COALESCE($2, description),
         start_date = COALESCE($3, start_date),
         end_date = COALESCE($4, end_date),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $5 
     RETURNING *`,
    [project_name, description, start_date, end_date, id]
  );

  successResponse(res, 200, {
    project: result.rows[0]
  }, 'Project updated successfully');
}));

// @route   DELETE /api/projects/:id
// @desc    Delete project
// @access  Private
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const role = req.user.role;

  // Check if project exists and user owns it
  const projectCheck = await pool.query(
    'SELECT * FROM projects WHERE id = $1',
    [id]
  );

  if (projectCheck.rows.length === 0) {
    return errorResponse(res, 404, 'Project not found');
  }

  if (role !== 'admin' && projectCheck.rows[0].user_id !== userId) {
    return errorResponse(res, 403, 'Access denied');
  }

  await pool.query('DELETE FROM projects WHERE id = $1', [id]);

  successResponse(res, 200, {}, 'Project deleted successfully');
}));

module.exports = router;
