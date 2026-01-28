const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { asyncHandler, successResponse, errorResponse } = require('../utils/helpers');
const { authenticate, isAdmin } = require('../middleware/auth');
const PDFDocument = require('pdfkit');

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

// @route   GET /api/reports/project/:id/financial
// @desc    Get financial report for a specific project with optional month/date range filters
// @access  Private
router.get('/project/:id/financial', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { month, year, start_date, end_date } = req.query;
  const userId = req.user.id;
  const role = req.user.role;

  // Get project and check access
  const projectResult = await pool.query(
    'SELECT * FROM projects WHERE id = $1',
    [id]
  );

  if (projectResult.rows.length === 0) {
    return errorResponse(res, 404, 'Project not found');
  }

  const project = projectResult.rows[0];

  if (role !== 'admin' && project.user_id !== userId) {
    return errorResponse(res, 403, 'Access denied');
  }

  // Helper to build date filters for a given column
  const buildDateFilter = (columnName) => {
    const conditions = ['project_id = $1'];
    const params = [id];
    let paramIndex = 2;

    if (start_date && end_date) {
      conditions.push(`${columnName} >= $${paramIndex}`);
      params.push(start_date);
      paramIndex++;
      conditions.push(`${columnName} <= $${paramIndex}`);
      params.push(end_date);
      paramIndex++;
    } else if (start_date) {
      conditions.push(`${columnName} >= $${paramIndex}`);
      params.push(start_date);
      paramIndex++;
    } else if (end_date) {
      conditions.push(`${columnName} <= $${paramIndex}`);
      params.push(end_date);
      paramIndex++;
    } else if (month) {
      let m;
      let y;
      if (year) {
        m = parseInt(month);
        y = parseInt(year);
      } else if (month.includes('-')) {
        const [yearPart, monthPart] = month.split('-');
        m = parseInt(monthPart);
        y = parseInt(yearPart);
      } else {
        const currentYear = new Date().getFullYear();
        m = parseInt(month);
        y = currentYear;
      }
      conditions.push(`EXTRACT(MONTH FROM ${columnName}) = $${paramIndex}`);
      params.push(m);
      paramIndex++;
      conditions.push(`EXTRACT(YEAR FROM ${columnName}) = $${paramIndex}`);
      params.push(y);
      paramIndex++;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    return { whereClause, params };
  };

  const taskFilter = buildDateFilter('task_date');
  const transactionFilter = buildDateFilter('transaction_date');

  const tasksResult = await pool.query(
    `SELECT * FROM tasks ${taskFilter.whereClause} ORDER BY task_date DESC`,
    taskFilter.params
  );

  const transactionsResult = await pool.query(
    `SELECT * FROM transactions ${transactionFilter.whereClause} ORDER BY transaction_date DESC`,
    transactionFilter.params
  );

  // Calculate totals
  const incomeTotal = transactionsResult.rows
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0)
    +
    tasksResult.rows
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + parseFloat(t.cost || 0), 0);

  const expenseTotal = transactionsResult.rows
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0)
    +
    tasksResult.rows
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + parseFloat(t.cost || 0), 0);

  successResponse(res, 200, {
    project: {
      ...project,
      period: {
        month: month || null,
        year: year || null,
        start_date: start_date || null,
        end_date: end_date || null,
      },
      tasks: tasksResult.rows,
      transactions: transactionsResult.rows,
      totals: {
        income: incomeTotal,
        expense: expenseTotal,
        balance: incomeTotal - expenseTotal,
      },
    },
  }, 'Project financial report retrieved successfully');
}));

// @route   GET /api/reports/project/:id/export
// @desc    Generate and download a PDF financial report for a specific project
// @access  Private
router.get('/project/:id/export', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { month, year, start_date, end_date } = req.query;

  // Reuse the financial JSON endpoint to get data
  req.params.id = id;
  req.query.month = month;
  req.query.year = year;
  req.query.start_date = start_date;
  req.query.end_date = end_date;

  // Manually call the handler logic without sending response yet
  const userId = req.user.id;
  const role = req.user.role;

  const projectResult = await pool.query(
    'SELECT * FROM projects WHERE id = $1',
    [id]
  );

  if (projectResult.rows.length === 0) {
    return errorResponse(res, 404, 'Project not found');
  }

  const project = projectResult.rows[0];

  if (role !== 'admin' && project.user_id !== userId) {
    return errorResponse(res, 403, 'Access denied');
  }

  // Date formatting helpers for PDF (avoid raw ISO strings / timezones)
  const formatDateTime = (value) => {
    if (!value) return 'N/A';
    const d = value instanceof Date ? value : new Date(value);
    const day = String(d.getDate()).padStart(2, '0');
    const monthNum = String(d.getMonth() + 1).padStart(2, '0');
    const yearNum = d.getFullYear();
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    const hourStr = String(hours).padStart(2, '0');
    return `${day}/${monthNum}/${yearNum} ${hourStr}:${minutes} ${ampm}`;
  };

  const formatDateOnly = (value) => {
    if (!value) return 'N/A';
    const d = value instanceof Date ? value : new Date(value);
    const day = String(d.getDate()).padStart(2, '0');
    const monthNum = String(d.getMonth() + 1).padStart(2, '0');
    const yearNum = d.getFullYear();
    return `${day}/${monthNum}/${yearNum}`;
  };

  // Reuse same filter builder as /project/:id/financial, but inline to keep file self-contained
  const buildDateFilter = (columnName) => {
    const conditions = ['project_id = $1'];
    const params = [id];
    let paramIndex = 2;

    if (start_date && end_date) {
      conditions.push(`${columnName} >= $${paramIndex}`);
      params.push(start_date);
      paramIndex++;
      conditions.push(`${columnName} <= $${paramIndex}`);
      params.push(end_date);
      paramIndex++;
    } else if (start_date) {
      conditions.push(`${columnName} >= $${paramIndex}`);
      params.push(start_date);
      paramIndex++;
    } else if (end_date) {
      conditions.push(`${columnName} <= $${paramIndex}`);
      params.push(end_date);
      paramIndex++;
    } else if (month) {
      let m;
      let y;
      if (year) {
        m = parseInt(month);
        y = parseInt(year);
      } else if (month.includes('-')) {
        const [yearPart, monthPart] = month.split('-');
        m = parseInt(monthPart);
        y = parseInt(yearPart);
      } else {
        const currentYear = new Date().getFullYear();
        m = parseInt(month);
        y = currentYear;
      }
      conditions.push(`EXTRACT(MONTH FROM ${columnName}) = $${paramIndex}`);
      params.push(m);
      paramIndex++;
      conditions.push(`EXTRACT(YEAR FROM ${columnName}) = $${paramIndex}`);
      params.push(y);
      paramIndex++;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    return { whereClause, params };
  };

  const taskFilter = buildDateFilter('task_date');
  const transactionFilter = buildDateFilter('transaction_date');

  const tasksResult = await pool.query(
    `SELECT * FROM tasks ${taskFilter.whereClause} ORDER BY task_date DESC`,
    taskFilter.params
  );

  const transactionsResult = await pool.query(
    `SELECT * FROM transactions ${transactionFilter.whereClause} ORDER BY transaction_date DESC`,
    transactionFilter.params
  );

  const incomeTotal = transactionsResult.rows
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0)
    +
    tasksResult.rows
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + parseFloat(t.cost || 0), 0);

  const expenseTotal = transactionsResult.rows
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0)
    +
    tasksResult.rows
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + parseFloat(t.cost || 0), 0);

  const balanceTotal = incomeTotal - expenseTotal;

  // Create PDF
  const doc = new PDFDocument({ margin: 40 });

  const filename = `project_${project.id}_report.pdf`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/pdf');

  doc.pipe(res);

  // Colors for theme
  const primaryBlue = '#1d4ed8';   // blue-700
  const accentYellow = '#facc15';  // yellow-400
  const incomeGreen = '#16a34a';   // green-600
  const expenseRed = '#dc2626';    // red-600

  // Page border (blue outer border with yellow inner accent)
  const pageInnerX = doc.page.margins.left - 10;
  const pageInnerY = doc.page.margins.top - 20;
  const pageInnerWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right + 20;
  const pageInnerHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom + 30;

  // Outer blue border
  doc
    .save()
    .lineWidth(2)
    .strokeColor(primaryBlue)
    .roundedRect(pageInnerX, pageInnerY, pageInnerWidth, pageInnerHeight, 10)
    .stroke()
    .restore();

  // Inner yellow border
  doc
    .save()
    .lineWidth(1)
    .strokeColor(accentYellow)
    .roundedRect(pageInnerX + 4, pageInnerY + 4, pageInnerWidth - 8, pageInnerHeight - 8, 8)
    .stroke()
    .restore();

  // Header bar
  doc
    .save()
    .rect(doc.page.margins.left, doc.page.margins.top - 10, doc.page.width - doc.page.margins.left - doc.page.margins.right, 40)
    .fill(primaryBlue)
    .restore();

  doc
    .fillColor('#ffffff')
    .fontSize(20)
    .text('Project Financial Report', {
      align: 'left',
      continued: false,
      lineGap: 6,
    });

  doc.moveDown(1.5);

  // Project information
  doc.fillColor('#111827').fontSize(12);
  doc.text(`Project: ${project.project_name}`);
  if (project.description) {
    doc.text(`Description: ${project.description}`);
  }
  doc.text(`Generated At: ${formatDateTime(new Date())}`);
  if (start_date || end_date || month) {
    let periodLabel;
    if (start_date || end_date) {
      const startLabel = start_date ? formatDateOnly(start_date) : '...';
      const endLabel = end_date ? formatDateOnly(end_date) : '...';
      periodLabel = `${startLabel} to ${endLabel}`;
    } else if (month && year) {
      periodLabel = `${month}/${year}`;
    } else if (month) {
      periodLabel = `${month}`;
    } else {
      periodLabel = 'All';
    }
    doc.text(
      `Period: ${periodLabel}`
    );
  } else {
    doc.text('Period: All time');
  }

  doc.moveDown();
  // Summary card with yellow background
  const summaryX = doc.page.margins.left;
  const summaryY = doc.y;
  const summaryWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const summaryHeight = 80;

  doc
    .save()
    .roundedRect(summaryX, summaryY, summaryWidth, summaryHeight, 8)
    .fill(accentYellow + '80') // semi-transparent yellow
    .restore();

  doc.moveDown(0.3);
  doc.fontSize(14).fillColor(primaryBlue).text('Summary', summaryX + 10, summaryY + 8);

  doc.fontSize(12);
  doc.moveDown(0.5);

  // Income (green), Expense (red), Balance (green or red)
  doc
    .fillColor(incomeGreen)
    .text(`Total Income: ${incomeTotal.toFixed(2)} RWF`, summaryX + 10, summaryY + 30);

  doc
    .fillColor(expenseRed)
    .text(`Total Expense: ${expenseTotal.toFixed(2)} RWF`, summaryX + 10, summaryY + 46);

  doc
    .fillColor(balanceTotal >= 0 ? incomeGreen : expenseRed)
    .text(`Balance: ${balanceTotal.toFixed(2)} RWF`, summaryX + 10, summaryY + 62);

  doc.moveDown(5);

  doc.moveDown();
  // Tasks section
  doc.fontSize(14).fillColor(primaryBlue).text('Tasks');
  doc.moveDown(0.5);
  if (tasksResult.rows.length === 0) {
    doc.fontSize(12).fillColor('#4b5563').text('No tasks for selected period.');
  } else {
    tasksResult.rows.forEach((t, index) => {
      doc
        .fontSize(12)
        .fillColor('#111827')
        .text(
          `${index + 1}. Date: ${formatDateOnly(t.task_date)}  -  ${t.task_name} (${t.type || 'N/A'}): ${t.cost || 0} RWF`
        );
      if (t.description) {
        doc.fontSize(10).fillColor('#6b7280').text(`  ${t.description}`);
      }
    });
  }

  doc.moveDown();
  // Transactions section
  doc.fontSize(14).fillColor(primaryBlue).text('Transactions');
  doc.moveDown(0.5);
  if (transactionsResult.rows.length === 0) {
    doc.fontSize(12).fillColor('#4b5563').text('No transactions for selected period.');
  } else {
    transactionsResult.rows.forEach((tr, index) => {
      doc
        .fontSize(12)
        .fillColor('#111827')
        .text(
          `${index + 1}. Date: ${formatDateOnly(tr.transaction_date)}  -  ${tr.type || 'N/A'}: ${tr.amount || 0} RWF`
        );
      if (tr.description) {
        doc.fontSize(10).fillColor('#6b7280').text(`  ${tr.description}`);
      }
    });
  }

  doc.end();
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
