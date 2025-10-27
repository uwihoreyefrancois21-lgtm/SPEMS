# SPEMS API Documentation 📚

Complete API reference for Smart Project Expense Management System.

## 🔐 Authentication

All endpoints (except register and login) require authentication via JWT token in the header:
```
Authorization: Bearer YOUR_TOKEN_HERE
```

---

## 1️⃣ Authentication Endpoints

### POST `/api/auth/register`
Register a new user (requires admin approval before login)

**Request Body:**
```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "password123",
  "phone": "+1234567890"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "user": {
      "id": 1,
      "username": "johndoe",
      "email": "john@example.com",
      "phone": "+1234567890",
      "role": "staff",
      "approve_user": false
    },
    "message": "User registered successfully. Please wait for admin approval."
  }
}
```

---

### POST `/api/auth/login`
Login user (only approved users can login)

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": 1,
      "username": "johndoe",
      "email": "john@example.com",
      "role": "staff",
      "approve_user": true
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error (Not Approved):**
```json
{
  "success": false,
  "message": "Your account is pending admin approval"
}
```

---

### GET `/api/auth/me`
Get current authenticated user

**Headers:** `Authorization: Bearer TOKEN`

**Response:**
```json
{
  "success": true,
  "message": "User profile retrieved successfully",
  "data": {
    "user": {
      "id": 1,
      "username": "johndoe",
      "email": "john@example.com",
      "role": "staff",
      "approve_user": true
    }
  }
}
```

---

### POST `/api/auth/approve-user/:userId`
Approve a user (Admin only)

**Headers:** `Authorization: Bearer ADMIN_TOKEN`

**Response:**
```json
{
  "success": true,
  "message": "User approved successfully",
  "data": {
    "user": {
      "id": 1,
      "username": "johndoe",
      "email": "john@example.com",
      "role": "staff",
      "approve_user": true
    }
  }
}
```

---

### POST `/api/auth/reject-user/:userId`
Remove user approval (Admin only)

---

## 2️⃣ Project Endpoints

### GET `/api/projects`
Get all projects (user's own projects or all if admin)

**Query Parameters:** None

**Response:**
```json
{
  "success": true,
  "message": "Projects retrieved successfully",
  "data": {
    "projects": [
      {
        "id": 1,
        "user_id": 1,
        "project_name": "Website Development",
        "description": "Building company website",
        "start_date": "2024-01-01",
        "end_date": "2024-03-31",
        "total_income": 10000.00,
        "total_expense": 7500.00,
        "balance": 2500.00
      }
    ]
  }
}
```

---

### GET `/api/projects/:id`
Get single project by ID

**Response:**
```json
{
  "success": true,
  "message": "Project retrieved successfully",
  "data": {
    "project": {
      "id": 1,
      "user_id": 1,
      "project_name": "Website Development",
      "total_income": 10000.00,
      "total_expense": 7500.00,
      "balance": 2500.00
    }
  }
}
```

---

### POST `/api/projects`
Create new project

**Request Body:**
```json
{
  "project_name": "Website Development",
  "description": "Building company website",
  "start_date": "2024-01-01",
  "end_date": "2024-03-31"
}
```

**Required:** `project_name`

**Response:**
```json
{
  "success": true,
  "message": "Project created successfully",
  "data": {
    "project": {
      "id": 1,
      "user_id": 1,
      "project_name": "Website Development",
      "total_income": 0.00,
      "total_expense": 0.00,
      "balance": 0.00
    }
  }
}
```

---

### PUT `/api/projects/:id`
Update project

**Request Body:**
```json
{
  "project_name": "Updated Name",
  "description": "Updated description"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Project updated successfully",
  "data": {
    "project": {
      "id": 1,
      "project_name": "Updated Name"
    }
  }
}
```

---

### DELETE `/api/projects/:id`
Delete project (also deletes related tasks and transactions)

**Response:**
```json
{
  "success": true,
  "message": "Project deleted successfully",
  "data": {}
}
```

---

## 3️⃣ Task Endpoints

### GET `/api/tasks`
Get all tasks

**Query Parameters:**
- `?project_id=1` - Filter by project

**Response:**
```json
{
  "success": true,
  "message": "Tasks retrieved successfully",
  "data": {
    "tasks": [
      {
        "id": 1,
        "project_id": 1,
        "task_name": "Design Landing Page",
        "description": "Create landing page design",
        "worker_name": "John Doe",
        "worker_phone": "+1234567890",
        "cost": 1500.00,
        "task_date": "2024-01-15"
      }
    ]
  }
}
```

---

### GET `/api/tasks/:id`
Get single task by ID

---

### POST `/api/tasks`
Create new task

**Request Body:**
```json
{
  "project_id": 1,
  "task_name": "Design Landing Page",
  "description": "Create landing page design",
  "worker_name": "John Doe",
  "worker_phone": "+1234567890",
  "cost": 1500.00,
  "task_date": "2024-01-15"
}
```

**Required:** `project_id`, `task_name`

---

### PUT `/api/tasks/:id`
Update task

### DELETE `/api/tasks/:id`
Delete task

---

## 4️⃣ Transaction Endpoints

### GET `/api/transactions`
Get all transactions

**Query Parameters:**
- `?project_id=1` - Filter by project

**Response:**
```json
{
  "success": true,
  "message": "Transactions retrieved successfully",
  "data": {
    "transactions": [
      {
        "id": 1,
        "project_id": 1,
        "task_id": 1,
        "type": "expense",
        "amount": 1500.00,
        "description": "Payment for design",
        "transaction_date": "2024-01-15"
      },
      {
        "id": 2,
        "project_id": 1,
        "task_id": null,
        "type": "income",
        "amount": 5000.00,
        "description": "Client payment",
        "transaction_date": "2024-01-20"
      }
    ]
  }
}
```

---

### GET `/api/transactions/:id`
Get single transaction

---

### POST `/api/transactions`
Create transaction (auto-updates project balance)

**Request Body:**
```json
{
  "project_id": 1,
  "task_id": 1,
  "type": "expense",
  "amount": 1500.00,
  "description": "Payment for design",
  "transaction_date": "2024-01-15"
}
```

**Required:** `project_id`, `type` ("income" or "expense"), `amount`

**Important:** This endpoint automatically updates the project's `total_income` or `total_expense` and recalculates `balance`

---

### PUT `/api/transactions/:id`
Update transaction (auto-updates project balance)

### DELETE `/api/transactions/:id`
Delete transaction (auto-updates project balance)

---

## 5️⃣ Report Endpoints

### GET `/api/reports/project/:id`
Get detailed project report

**Response:**
```json
{
  "success": true,
  "message": "Project report retrieved successfully",
  "data": {
    "project": {
      "id": 1,
      "project_name": "Website Development",
      "tasks": [...],
      "transactions": [...],
      "income": {
        "total": 10000.00,
        "count": 3
      },
      "expense": {
        "total": 7500.00,
        "count": 5
      }
    }
  }
}
```

---

### GET `/api/reports/dashboard`
Get dashboard statistics

**For Regular Users:**
```json
{
  "success": true,
  "message": "Dashboard data retrieved successfully",
  "data": {
    "stats": {
      "total_projects": 5,
      "total_income_all": 25000.00,
      "total_expense_all": 18000.00,
      "total_balance_all": 7000.00,
      "total_tasks": 20,
      "total_transactions": 45
    },
    "projects": [...]
  }
}
```

**For Admin:**
```json
{
  "success": true,
  "message": "Dashboard data retrieved successfully",
  "data": {
    "stats": {
      "total_projects": 15,
      "total_income_all": 50000.00,
      "total_expense_all": 35000.00,
      "total_balance_all": 15000.00
    },
    "recentProjects": [...],
    "pendingUsers": [...]
  }
}
```

---

### GET `/api/reports/financial-summary`
Get financial summary by project

**Response:**
```json
{
  "success": true,
  "message": "Financial summary retrieved successfully",
  "data": {
    "summary": [
      {
        "id": 1,
        "project_name": "Website Development",
        "total_income": 10000.00,
        "total_expense": 7500.00,
        "balance": 2500.00
      }
    ]
  }
}
```

---

## 6️⃣ User Management Endpoints (Admin Only)

### GET `/api/users`
Get all users (Admin only)

**Response:**
```json
{
  "success": true,
  "message": "Users retrieved successfully",
  "data": {
    "users": [
      {
        "id": 1,
        "username": "johndoe",
        "email": "john@example.com",
        "role": "staff",
        "approve_user": true
      }
    ]
  }
}
```

---

### GET `/api/users/:id`
Get user by ID

### PUT `/api/users/:id`
Update user

**Request Body:**
```json
{
  "username": "newusername",
  "email": "newemail@example.com",
  "role": "admin"
}
```

### DELETE `/api/users/:id`
Delete user

---

## 🔧 Error Responses

All error responses follow this format:

```json
{
  "success": false,
  "message": "Error message here"
}
```

### Common Status Codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Server Error

---

## 📝 Notes

1. **Auto-Balance Calculation**: The project balance is automatically calculated when transactions are created, updated, or deleted.

2. **User Approval**: Users cannot login until their `approve_user` status is set to `true` by an admin.

3. **Role-Based Access**: 
   - Admins can see all projects, tasks, and transactions
   - Staff can only see their own projects, tasks, and transactions

4. **Foreign Key Constraints**: Deleting a project will automatically delete related tasks and transactions (CASCADE).

5. **Balance Calculation**: 
   ```
   balance = total_income - total_expense
   ```
   This is handled automatically by the database (STORED GENERATED column).

---

## 🚀 Getting Started

1. Install dependencies: `npm install`
2. Configure `.env` file
3. Run migrations to create tables
4. Start server: `npm run dev`
5. Create an admin user manually or through database

---

**Happy Coding! 🎉**
