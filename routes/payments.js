const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { asyncHandler, successResponse, errorResponse } = require('../utils/helpers');
const { authenticate, isAdmin } = require('../middleware/auth');
const { sendPaymentReminderEmail, sendPaymentStatusUpdateEmail } = require('../utils/emailService');

// Helper function to ensure payment_month is first day of month
const getFirstDayOfMonth = (dateString) => {
  if (!dateString) {
    const date = new Date();
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
    return date.toISOString().split('T')[0];
  }
  const date = new Date(dateString);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.toISOString().split('T')[0];
};

// @route   GET /api/payments
// @desc    Get all payments (Admin only) or user's own payments
// @access  Private
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { user_id, status, month, year, start_date, end_date } = req.query;
  const userId = req.user.id;
  const role = req.user.role;

  let query = `
    SELECT up.*, u.username, u.email, u.phone
    FROM user_payments up
    JOIN users u ON up.user_id = u.id
    WHERE 1=1
  `;
  const params = [];
  let paramIndex = 1;

  // Admin can see all, regular users see only their own
  if (role !== 'admin') {
    query += ` AND up.user_id = $${paramIndex}`;
    params.push(userId);
    paramIndex++;
  } else if (user_id) {
    query += ` AND up.user_id = $${paramIndex}`;
    params.push(user_id);
    paramIndex++;
  }

  if (status) {
    query += ` AND up.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  if (month) {
    query += ` AND EXTRACT(MONTH FROM up.payment_month) = $${paramIndex}`;
    params.push(parseInt(month));
    paramIndex++;
  }

  if (year) {
    query += ` AND EXTRACT(YEAR FROM up.payment_month) = $${paramIndex}`;
    params.push(parseInt(year));
    paramIndex++;
  }

  if (start_date) {
    query += ` AND up.payment_month >= $${paramIndex}`;
    params.push(start_date);
    paramIndex++;
  }

  if (end_date) {
    query += ` AND up.payment_month <= $${paramIndex}`;
    params.push(end_date);
    paramIndex++;
  }

  query += ` ORDER BY up.payment_month DESC, up.created_at DESC`;

  const result = await pool.query(query, params);

  successResponse(res, 200, {
    payments: result.rows
  }, 'Payments retrieved successfully');
}));

// @route   GET /api/payments/my-status
// @desc    Get payment status for the current user (last payment, block date, days until block)
// @access  Private
router.get('/my-status', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Last paid payment (any time)
  const lastPaidResult = await pool.query(
    `SELECT paid_at 
     FROM user_payments 
     WHERE user_id = $1 AND status = 'paid' AND paid_at IS NOT NULL
     ORDER BY paid_at DESC
     LIMIT 1`,
    [userId]
  );

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  let lastPaymentAt = null;
  let blockDate = null;
  let daysUntilBlock = 0;

  if (lastPaidResult.rows.length > 0) {
    const paidAt = new Date(lastPaidResult.rows[0].paid_at);
    lastPaymentAt = paidAt.toISOString();

    const block = new Date(paidAt);
    block.setDate(block.getDate() + 30);
    blockDate = block.toISOString();

    const diffMs = block.getTime() - now.getTime();
    daysUntilBlock = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }

  const status = daysUntilBlock > 0 ? 'active' : 'blocked';

  successResponse(res, 200, {
    status,
    last_payment_at: lastPaymentAt,
    block_date: blockDate,
    days_until_block: daysUntilBlock,
  }, 'Payment status retrieved successfully');
}));

// @route   GET /api/payments/:id
// @desc    Get single payment by ID
// @access  Private
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const role = req.user.role;

  const result = await pool.query(
    `SELECT up.*, u.username, u.email, u.phone
     FROM user_payments up
     JOIN users u ON up.user_id = u.id
     WHERE up.id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    return errorResponse(res, 404, 'Payment not found');
  }

  const payment = result.rows[0];

  // Check access
  if (role !== 'admin' && payment.user_id !== userId) {
    return errorResponse(res, 403, 'Access denied');
  }

  successResponse(res, 200, {
    payment
  }, 'Payment retrieved successfully');
}));

// @route   POST /api/payments
// @desc    Create new payment record (Admin only)
// @access  Private (Admin)
router.post('/', authenticate, isAdmin, asyncHandler(async (req, res) => {
  const { user_id, amount, payment_month, status, payment_method } = req.body;

  if (!user_id || !amount || !payment_month) {
    return errorResponse(res, 400, 'User ID, amount, and payment month are required');
  }

  // Ensure payment_month is first day of month
  const normalizedMonth = getFirstDayOfMonth(payment_month);

  // Check if payment already exists for this user and month (using unique constraint)
  const existingCheck = await pool.query(
    `SELECT * FROM user_payments 
     WHERE user_id = $1 AND payment_month = $2`,
    [user_id, normalizedMonth]
  );

  // Validate user exists and is not admin
  const userCheck = await pool.query('SELECT id, role, email, username FROM users WHERE id = $1', [user_id]);
  if (userCheck.rows.length === 0) {
    return errorResponse(res, 404, 'User not found');
  }
  if (userCheck.rows[0].role === 'admin') {
    return errorResponse(res, 400, 'Cannot create payment records for admin users');
  }

  const defaultMethod = 'MOMO';
  const paidAt = status === 'paid' ? new Date() : null;

  let result;

  if (existingCheck.rows.length > 0) {
    // If a record already exists for this month, update it instead of failing
    const existingPayment = existingCheck.rows[0];

    // Decide new paid_at based on status transition
    let newPaidAt = existingPayment.paid_at;
    if (status === 'paid') {
      newPaidAt = new Date();
    } else if (status === 'unpaid') {
      newPaidAt = null;
    }

    result = await pool.query(
      `UPDATE user_payments
       SET amount = $1,
           status = $2,
           payment_method = $3,
           paid_at = $4
       WHERE id = $5
       RETURNING *`,
      [
        parseFloat(amount),
        status || existingPayment.status || 'unpaid',
        payment_method || existingPayment.payment_method || defaultMethod,
        newPaidAt,
        existingPayment.id
      ]
    );

    // Send email notification on status change
    if (status && status !== existingPayment.status) {
      try {
        await sendPaymentStatusUpdateEmail(userCheck.rows[0].email, userCheck.rows[0].username, {
          status,
          paymentMonth: normalizedMonth,
          amount: parseFloat(amount),
          paymentMethod: payment_method || existingPayment.payment_method || defaultMethod,
          paidAt: result.rows[0].paid_at
        });
      } catch (e) {
        console.error('Failed to send payment status update email:', e);
      }
    }

    return successResponse(res, 200, {
      payment: result.rows[0]
    }, 'Payment updated successfully');
  }

  // No existing payment for this month – create a new one
  result = await pool.query(
    `INSERT INTO user_payments (user_id, amount, payment_month, status, payment_method, paid_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      user_id,
      parseFloat(amount),
      normalizedMonth,
      status || 'unpaid',
      payment_method || defaultMethod,
      paidAt
    ]
  );

  // Send email notification if status is explicitly provided (or paid)
  if (status) {
    try {
      await sendPaymentStatusUpdateEmail(userCheck.rows[0].email, userCheck.rows[0].username, {
        status,
        paymentMonth: normalizedMonth,
        amount: parseFloat(amount),
        paymentMethod: payment_method || defaultMethod,
        paidAt: result.rows[0].paid_at
      });
    } catch (e) {
      console.error('Failed to send payment status update email:', e);
    }
  }

  successResponse(res, 201, {
    payment: result.rows[0]
  }, 'Payment created successfully');
}));

// @route   PUT /api/payments/:id
// @desc    Update payment status (Admin only)
// @access  Private (Admin)
router.put('/:id', authenticate, isAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, payment_method, payment_month } = req.body;

  // Get current payment
  const currentPayment = await pool.query(
    'SELECT * FROM user_payments WHERE id = $1',
    [id]
  );

  if (currentPayment.rows.length === 0) {
    return errorResponse(res, 404, 'Payment not found');
  }

  // Validate status if provided
  if (status !== undefined && status !== null && !['paid', 'unpaid', 'late'].includes(status)) {
    return errorResponse(res, 400, 'Valid status (paid, unpaid, or late) is required');
  }

  // Prepare update values
  const updateFields = [];
  const updateValues = [];
  let paramIndex = 1;
  const defaultMethod = 'MOMO';

  if (status !== undefined && status !== null) {
    updateFields.push(`status = $${paramIndex}`);
    updateValues.push(status);
    paramIndex++;
  }

  // Always ensure payment_method is set (default to MOMO if not provided)
  if (payment_method !== undefined) {
    updateFields.push(`payment_method = $${paramIndex}`);
    updateValues.push(payment_method || defaultMethod);
    paramIndex++;
  } else if (!currentPayment.rows[0].payment_method) {
    // If payment_method is not provided and current payment has no method, set default
    updateFields.push(`payment_method = $${paramIndex}`);
    updateValues.push(defaultMethod);
    paramIndex++;
  }

  if (payment_month) {
    const normalizedMonth = getFirstDayOfMonth(payment_month);
    // Check for duplicate if changing month
    if (normalizedMonth !== currentPayment.rows[0].payment_month) {
      const duplicateCheck = await pool.query(
        'SELECT id FROM user_payments WHERE user_id = $1 AND payment_month = $2 AND id != $3',
        [currentPayment.rows[0].user_id, normalizedMonth, id]
      );
      if (duplicateCheck.rows.length > 0) {
        return errorResponse(res, 400, 'Payment already exists for this month');
      }
    }
    updateFields.push(`payment_month = $${paramIndex}`);
    updateValues.push(normalizedMonth);
    paramIndex++;
  }

  // Handle paid_at timestamp
  if (status === 'paid' && currentPayment.rows[0].status !== 'paid') {
    updateFields.push(`paid_at = $${paramIndex}`);
    updateValues.push(new Date());
    paramIndex++;
    // Ensure a default payment method exists when marking paid (if not already set above)
    if (payment_method === undefined && !currentPayment.rows[0].payment_method) {
      // Check if we already added payment_method above
      const hasPaymentMethod = updateFields.some(f => f.includes('payment_method'));
      if (!hasPaymentMethod) {
        updateFields.push(`payment_method = $${paramIndex}`);
        updateValues.push(defaultMethod);
        paramIndex++;
      }
    }
  } else if (status === 'unpaid' && currentPayment.rows[0].status === 'paid') {
    updateFields.push(`paid_at = $${paramIndex}`);
    updateValues.push(null);
    paramIndex++;
  }

  if (updateFields.length === 0) {
    return errorResponse(res, 400, 'No fields to update');
  }

  updateValues.push(id);
  const result = await pool.query(
    `UPDATE user_payments 
     SET ${updateFields.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING *`,
    updateValues
  );

  // Email user when status changes
  if (status !== undefined && status !== null && status !== currentPayment.rows[0].status) {
    try {
      const ures = await pool.query('SELECT email, username FROM users WHERE id = $1', [currentPayment.rows[0].user_id]);
      if (ures.rows.length > 0) {
        await sendPaymentStatusUpdateEmail(ures.rows[0].email, ures.rows[0].username, {
          status,
          paymentMonth: result.rows[0].payment_month,
          amount: result.rows[0].amount,
          paymentMethod: result.rows[0].payment_method || defaultMethod,
          paidAt: result.rows[0].paid_at
        });
      }
    } catch (e) {
      console.error('Failed to send payment status update email:', e);
    }
  }

  successResponse(res, 200, {
    payment: result.rows[0]
  }, 'Payment updated successfully');
}));

// @route   DELETE /api/payments/:id
// @desc    Delete payment (Admin only)
// @access  Private (Admin)
router.delete('/:id', authenticate, isAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const check = await pool.query('SELECT id FROM user_payments WHERE id = $1', [id]);

  if (check.rows.length === 0) {
    return errorResponse(res, 404, 'Payment not found');
  }

  await pool.query('DELETE FROM user_payments WHERE id = $1', [id]);

  successResponse(res, 200, {}, 'Payment deleted successfully');
}));

// @route   POST /api/payments/check-and-remind
// @desc    Check payments and send reminders (Admin only, can be called by cron)
// @access  Private (Admin)
router.post('/check-and-remind', authenticate, isAdmin, asyncHandler(async (req, res) => {
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  oneMonthAgo.setHours(0, 0, 0, 0);

  // Get all approved non-admin users
  const users = await pool.query(
    `SELECT id, email, username, approve_user
     FROM users
     WHERE approve_user = true AND role != 'admin'
     ORDER BY id`
  );

  let remindersSent = 0;
  let paymentsCreated = 0;
  let paymentsUpdated = 0;

  const currentMonth = new Date();
  currentMonth.setDate(1);
  currentMonth.setHours(0, 0, 0, 0);
  const currentMonthStr = currentMonth.toISOString().split('T')[0];

  for (const user of users.rows) {
    // Check if user has a paid payment within the last month
    const recentPaidPayment = await pool.query(
      `SELECT id, payment_month, paid_at, status
       FROM user_payments 
       WHERE user_id = $1 
         AND status = 'paid' 
         AND paid_at IS NOT NULL
         AND paid_at >= $2
       ORDER BY paid_at DESC 
       LIMIT 1`,
      [user.id, oneMonthAgo]
    );

    // Check for existing payment record for current month
    const existingCurrentPayment = await pool.query(
      `SELECT id, status, paid_at
       FROM user_payments 
       WHERE user_id = $1 AND payment_month = $2`,
      [user.id, currentMonthStr]
    );

    let needsReminder = false;

    if (recentPaidPayment.rows.length === 0) {
      // User has no recent paid payment - needs reminder
      needsReminder = true;

      if (existingCurrentPayment.rows.length > 0) {
        // Payment record exists for current month
        const payment = existingCurrentPayment.rows[0];
        
        // If it was marked as paid but paid_at is more than a month ago, reset to unpaid
        if (payment.status === 'paid' && payment.paid_at) {
          const paidDate = new Date(payment.paid_at);
          if (paidDate < oneMonthAgo) {
            await pool.query(
              `UPDATE user_payments 
               SET status = 'unpaid', paid_at = NULL
               WHERE id = $1`,
              [payment.id]
            );
            paymentsUpdated++;
          }
        } else if (payment.status === 'unpaid') {
          // Already unpaid, just needs reminder
        }
      } else {
        // Create new payment record for current month
        try {
          await pool.query(
            `INSERT INTO user_payments (user_id, amount, payment_month, status)
             VALUES ($1, 15000, $2, 'unpaid')`,
            [user.id, currentMonthStr]
          );
          paymentsCreated++;
        } catch (error) {
          // Ignore unique constraint violations (payment already exists)
          if (!error.message.includes('unique_user_month')) {
            console.error(`Error creating payment for user ${user.id}:`, error);
          }
        }
      }
    } else {
      // User has recent paid payment - check if it's for current month
      const lastPaid = recentPaidPayment.rows[0];
      const lastPaidMonth = new Date(lastPaid.payment_month);
      lastPaidMonth.setDate(1);
      lastPaidMonth.setHours(0, 0, 0, 0);
      const lastPaidMonthStr = lastPaidMonth.toISOString().split('T')[0];

      // If last paid payment is not for current month, create/update current month record as unpaid
      if (lastPaidMonthStr !== currentMonthStr) {
        if (existingCurrentPayment.rows.length > 0) {
          // Always mark as unpaid if it's not for current month or if paid_at is old
          const currentPayment = existingCurrentPayment.rows[0];
          if (currentPayment.status === 'paid') {
            const paidDate = currentPayment.paid_at ? new Date(currentPayment.paid_at) : null;
            if (!paidDate || paidDate < oneMonthAgo) {
              await pool.query(
                `UPDATE user_payments 
                 SET status = 'unpaid', paid_at = NULL
                 WHERE id = $1`,
                [currentPayment.id]
              );
              paymentsUpdated++;
              needsReminder = true;
            }
          } else if (currentPayment.status === 'unpaid') {
            needsReminder = true;
          }
        } else {
          // Create new unpaid record for current month
          try {
            await pool.query(
              `INSERT INTO user_payments (user_id, amount, payment_month, status)
               VALUES ($1, 15000, $2, 'unpaid')`,
              [user.id, currentMonthStr]
            );
            paymentsCreated++;
            needsReminder = true;
          } catch (error) {
            if (!error.message.includes('unique_user_month')) {
              console.error(`Error creating payment for user ${user.id}:`, error);
            }
          }
        }
      } else {
        // Last paid payment is for current month, but check if paid_at is still valid
        if (lastPaid.paid_at) {
          const paidDate = new Date(lastPaid.paid_at);
          if (paidDate < oneMonthAgo) {
            // Payment was made more than a month ago, mark as unpaid
            if (existingCurrentPayment.rows.length > 0) {
              await pool.query(
                `UPDATE user_payments 
                 SET status = 'unpaid', paid_at = NULL
                 WHERE id = $1`,
                [existingCurrentPayment.rows[0].id]
              );
              paymentsUpdated++;
              needsReminder = true;
            }
          }
        }
      }
    }

    // Send reminder email if needed
    if (needsReminder) {
      try {
        await sendPaymentReminderEmail(user.email, user.username);
        remindersSent++;
      } catch (error) {
        console.error(`Failed to send reminder to ${user.email}:`, error);
      }
    }
  }

  successResponse(res, 200, {
    remindersSent,
    paymentsCreated,
    paymentsUpdated,
    totalUsersChecked: users.rows.length,
    message: `Payment check completed. ${remindersSent} reminders sent, ${paymentsCreated} payments created, ${paymentsUpdated} payments updated.`
  }, 'Payment check completed');
}));

module.exports = router;

