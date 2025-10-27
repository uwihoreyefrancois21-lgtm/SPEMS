const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { asyncHandler, successResponse, errorResponse } = require('../utils/helpers');
const { authenticate, isAdmin } = require('../middleware/auth');

// @route   GET /api/users
// @desc    Get all users (Admin only)
// @access  Private (Admin)
router.get('/', authenticate, isAdmin, asyncHandler(async (req, res) => {
  const users = await pool.query(
    `SELECT id, username, email, phone, role, approve_user, created_at 
     FROM users 
     ORDER BY created_at DESC`
  );

  successResponse(res, 200, {
    users: users.rows
  }, 'Users retrieved successfully');
}));

// @route   GET /api/users/:id
// @desc    Get user by ID (Admin only)
// @access  Private (Admin)
router.get('/:id', authenticate, isAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await pool.query(
    `SELECT id, username, email, phone, role, approve_user, created_at 
     FROM users 
     WHERE id = $1`,
    [id]
  );

  if (user.rows.length === 0) {
    return errorResponse(res, 404, 'User not found');
  }

  successResponse(res, 200, {
    user: user.rows[0]
  }, 'User retrieved successfully');
}));

// @route   PUT /api/users/:id
// @desc    Update user (Admin only)
// @access  Private (Admin)
router.put('/:id', authenticate, isAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { username, email, phone, role } = req.body;

  const result = await pool.query(
    `UPDATE users 
     SET username = COALESCE($1, username),
         email = COALESCE($2, email),
         phone = COALESCE($3, phone),
         role = COALESCE($4, role),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $5 
     RETURNING id, username, email, phone, role, approve_user`,
    [username, email, phone, role, id]
  );

  if (result.rows.length === 0) {
    return errorResponse(res, 404, 'User not found');
  }

  successResponse(res, 200, {
    user: result.rows[0]
  }, 'User updated successfully');
}));

// @route   DELETE /api/users/:id
// @desc    Delete user (Admin only)
// @access  Private (Admin)
router.delete('/:id', authenticate, isAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Check if user exists
  const userCheck = await pool.query(
    'SELECT id FROM users WHERE id = $1',
    [id]
  );

  if (userCheck.rows.length === 0) {
    return errorResponse(res, 404, 'User not found');
  }

  // Prevent self-deletion
  if (parseInt(id) === req.user.id) {
    return errorResponse(res, 400, 'Cannot delete your own account');
  }

  await pool.query('DELETE FROM users WHERE id = $1', [id]);

  successResponse(res, 200, {}, 'User deleted successfully');
}));

module.exports = router;
