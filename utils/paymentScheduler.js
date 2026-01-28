let cron;
try {
  cron = require('node-cron');
} catch (error) {
  console.warn('node-cron not available. Payment scheduler will not run automatically.');
}

const pool = require('../config/database');
const { sendPaymentReminderEmail, sendUpcomingBlockReminderEmail } = require('./emailService');

// Run payment check daily at 9 AM
const schedulePaymentChecks = () => {
  if (!cron) {
    console.warn('Payment scheduler not available. Install node-cron to enable automatic payment checks.');
    return;
  }
  
  // Schedule daily check at 9 AM
  cron.schedule('0 9 * * *', async () => {
    console.log('Running daily payment check...');
    await checkAndRemindPayments();
  });

  console.log('Payment scheduler initialized. Will check payments daily at 9 AM.');
};

const checkAndRemindPayments = async () => {
  try {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    oneMonthAgo.setHours(0, 0, 0, 0);

    // Get all approved non-admin users
    const users = await pool.query(
      `SELECT id, email, username, approve_user
       FROM users
       WHERE approve_user = true AND role != 'admin'`
    );

    let remindersSent = 0;
    let upcomingBlockRemindersSent = 0;
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
            // Ignore unique constraint violations
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
            const currentPayment = existingCurrentPayment.rows[0];
            // Always mark as unpaid if it's not for current month or if paid_at is old
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
          console.log(`Payment reminder sent to ${user.email}`);
        } catch (error) {
          console.error(`Failed to send reminder to ${user.email}:`, error);
        }
      }

      // Upcoming block reminder: 2 days before 30-day window ends from last payment
      const lastPaidAny = await pool.query(
        `SELECT paid_at 
         FROM user_payments 
         WHERE user_id = $1 AND status = 'paid' AND paid_at IS NOT NULL
         ORDER BY paid_at DESC
         LIMIT 1`,
        [user.id]
      );

      if (lastPaidAny.rows.length > 0) {
        const paidAt = new Date(lastPaidAny.rows[0].paid_at);
        const blockDate = new Date(paidAt);
        blockDate.setDate(blockDate.getDate() + 30);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const diffMs = blockDate.getTime() - today.getTime();
        const daysUntilBlock = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        if (daysUntilBlock === 2) {
          try {
            await sendUpcomingBlockReminderEmail(user.email, user.username, {
              lastPaidAt: paidAt,
              blockDate,
              daysUntilBlock
            });
            upcomingBlockRemindersSent++;
            console.log(`Upcoming block reminder (2 days) sent to ${user.email}`);
          } catch (error) {
            console.error(`Failed to send upcoming block reminder to ${user.email}:`, error);
          }
        }
      }
    }

    console.log(`Payment check completed. ${remindersSent} monthly reminders sent, ${upcomingBlockRemindersSent} upcoming-block reminders sent, ${paymentsCreated} payments created, ${paymentsUpdated} payments updated.`);
  } catch (error) {
    console.error('Error in payment check:', error);
  }
};

module.exports = {
  schedulePaymentChecks,
  checkAndRemindPayments
};

