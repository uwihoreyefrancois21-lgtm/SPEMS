const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../config/database');
const { generateToken, asyncHandler, successResponse, errorResponse } = require('../utils/helpers');
const { authenticate, isAdmin } = require('../middleware/auth');
const { sendPasswordResetEmail } = require('../utils/emailService');

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', asyncHandler(async (req, res) => {
  const { username, email, password, phone } = req.body;

  // Validate input
  if (!username || !email || !password) {
    return errorResponse(res, 400, 'Username, email, and password are required');
  }

  // Check if user already exists
  const existingUser = await pool.query(
    'SELECT email FROM users WHERE email = $1',
    [email]
  );

  if (existingUser.rows.length > 0) {
    return errorResponse(res, 400, 'User already exists with this email');
  }

  // Hash password
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  // Insert new user
  const result = await pool.query(
    `INSERT INTO users (username, email, password, phone, role, approve_user) 
     VALUES ($1, $2, $3, $4, 'staff', false) 
     RETURNING id, username, email, phone, role, approve_user`,
    [username, email, hashedPassword, phone || null]
  );

  successResponse(res, 201, {
    user: result.rows[0],
    message: 'User registered successfully. Please wait for admin approval.'
  }, 'Registration successful');
}));

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Validate input
  if (!email || !password) {
    return errorResponse(res, 400, 'Email and password are required');
  }

  // Find user
  const userResult = await pool.query(
    'SELECT id, username, email, password, phone, role, approve_user FROM users WHERE email = $1',
    [email]
  );

  if (userResult.rows.length === 0) {
    return errorResponse(res, 401, 'Invalid credentials');
  }

  const user = userResult.rows[0];

  // Check if user is approved
  if (!user.approve_user) {
    return errorResponse(res, 403, 'Your account is pending admin approval');
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return errorResponse(res, 401, 'Invalid credentials');
  }

  // Generate token
  const token = generateToken(user.id);

  // Remove password from response
  const { password: _, ...userWithoutPassword } = user;

  successResponse(res, 200, {
    user: userWithoutPassword,
    token
  }, 'Login successful');
}));

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  successResponse(res, 200, {
    user: req.user
  }, 'User profile retrieved successfully');
}));

// @route   POST /api/auth/approve-user/:userId
// @desc    Approve a user (Admin only)
// @access  Private (Admin)
router.post('/approve-user/:userId', authenticate, isAdmin, asyncHandler(async (req, res) => {
  const { userId } = req.params;

  // Check if user exists
  const userCheck = await pool.query(
    'SELECT id, approve_user FROM users WHERE id = $1',
    [userId]
  );

  if (userCheck.rows.length === 0) {
    return errorResponse(res, 404, 'User not found');
  }

  // Update approval status
  const result = await pool.query(
    'UPDATE users SET approve_user = true WHERE id = $1 RETURNING id, username, email, role, approve_user',
    [userId]
  );

  successResponse(res, 200, {
    user: result.rows[0]
  }, 'User approved successfully');
}));

// @route   POST /api/auth/reject-user/:userId
// @desc    Reject/Remove user approval (Admin only)
// @access  Private (Admin)
router.post('/reject-user/:userId', authenticate, isAdmin, asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const result = await pool.query(
    'UPDATE users SET approve_user = false WHERE id = $1 RETURNING id, username, email, role, approve_user',
    [userId]
  );

  if (result.rows.length === 0) {
    return errorResponse(res, 404, 'User not found');
  }

  successResponse(res, 200, {
    user: result.rows[0]
  }, 'User approval removed');
}));

// @route   POST /api/auth/forgot-password
// @desc    Request password reset
// @access  Public
router.post('/forgot-password', asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return errorResponse(res, 400, 'Email is required');
  }

  // Check if user exists
  const userResult = await pool.query(
    'SELECT id, email FROM users WHERE email = $1',
    [email]
  );

  if (userResult.rows.length === 0) {
    // For security, don't reveal if the email exists or not
    return successResponse(res, 200, {}, 'If your email is registered, you will receive a password reset link');
  }

  const user = userResult.rows[0];
  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenExpires = new Date(Date.now() + 3600000); // 1 hour from now

  // Save reset token to database
  await pool.query(
    'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
    [resetToken, resetTokenExpires, user.id]
  );

  // Send email with reset link
  try {
    await sendPasswordResetEmail(user.email, resetToken);
    return successResponse(res, 200, {}, 'Password reset link sent to your email');
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return errorResponse(res, 500, 'Failed to send password reset email');
  }
}));

// @route   POST /api/auth/reset-password
// @desc    Reset password with token
// @access  Public
router.post('/reset-password', asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return errorResponse(res, 400, 'Token and new password are required');
  }

  if (newPassword.length < 6) {
    return errorResponse(res, 400, 'Password must be at least 6 characters long');
  }

  // Find user with valid reset token
  const userResult = await pool.query(
    'SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
    [token]
  );

  if (userResult.rows.length === 0) {
    return errorResponse(res, 400, 'Invalid or expired token');
  }

  const user = userResult.rows[0];
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

  // Update password and clear reset token
  await pool.query(
    'UPDATE users SET password = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
    [hashedPassword, user.id]
  );

  successResponse(res, 200, {}, 'Password reset successful');
}));

module.exports = router;
