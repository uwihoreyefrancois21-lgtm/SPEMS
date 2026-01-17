const jwt = require('jsonwebtoken');
const pool = require('../config/database');

// Middleware to verify JWT token
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided. Authentication required.' 
      });
    }

    const token = authHeader.split(' ')[1];
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Check if user still exists and is approved
      const userQuery = await pool.query(
        'SELECT id, username, email, role, approve_user FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (userQuery.rows.length === 0) {
        return res.status(401).json({ 
          success: false, 
          message: 'User not found.' 
        });
      }

      if (!userQuery.rows[0].approve_user) {
        return res.status(403).json({ 
          success: false, 
          message: 'Account not approved by admin.' 
        });
      }

      // Check payment status (skip for admin users)
      if (userQuery.rows[0].role !== 'admin') {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        oneMonthAgo.setHours(0, 0, 0, 0);
        
        // Check for a paid payment within the last month with valid paid_at timestamp
        const paymentCheck = await pool.query(
          `SELECT id, status, paid_at, payment_month 
           FROM user_payments 
           WHERE user_id = $1 
             AND status = 'paid' 
             AND paid_at IS NOT NULL
             AND paid_at >= $2
           ORDER BY paid_at DESC 
           LIMIT 1`,
          [decoded.userId, oneMonthAgo]
        );

        if (paymentCheck.rows.length === 0) {
          return res.status(403).json({ 
            success: false, 
            message: 'Account blocked. Please make your monthly payment (15,000 RWF) to continue using the system. Contact admin for assistance.' 
          });
        }
      }

      req.user = userQuery.rows[0];
      next();
    } catch (error) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid or expired token.' 
      });
    }
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: 'Authentication error.' 
    });
  }
};

// Middleware to check admin role
const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({ 
      success: false, 
      message: 'Admin access required.' 
    });
  }
};

// Middleware to check if user owns resource or is admin
const authorizeUser = (req, res, next) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  const resourceUserId = req.params.userId || req.body.user_id;

  if (userId === parseInt(userId) || userRole === 'admin') {
    next();
  } else {
    return res.status(403).json({ 
      success: false, 
      message: 'Unauthorized access.' 
    });
  }
};

module.exports = {
  authenticate,
  isAdmin,
  authorizeUser
};
