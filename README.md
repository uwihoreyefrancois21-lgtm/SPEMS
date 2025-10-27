# Smart Project Expense Management System (SPEMS) 🧾

A comprehensive backend API for managing projects, tasks, and financial transactions with automatic balance calculation.

## 🚀 Features

- **User Management**: Registration, login with JWT authentication
- **User Approval System**: Admin must approve users before they can login
- **Project Management**: Create, update, delete projects
- **Task Management**: Track tasks with worker details (name & phone)
- **Transaction Tracking**: Record income and expenses with automatic project balance calculation
- **Reporting**: Generate detailed reports and dashboard statistics
- **Role-Based Access**: Admin and staff roles with different permissions

## 📋 Prerequisites

- Node.js (v14 or higher)
- PostgreSQL database (Supabase)
- npm or yarn

## 🛠️ Installation

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file in the root directory:
```env
DATABASE_URL=postgresql://postgres.putgsqrbnacomsnvazio:iwwCOIyR5Brz5p0N@aws-1-eu-west-1.pooler.supabase.com:5432/postgres
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
PORT=5000
NODE_ENV=development
```

3. Run the database migrations (create tables):
```sql
-- See your database schema document for SQL
```

## 🎯 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user
- `POST /api/auth/approve-user/:userId` - Approve user (Admin)
- `POST /api/auth/reject-user/:userId` - Reject user (Admin)

### Projects
- `GET /api/projects` - Get all projects
- `GET /api/projects/:id` - Get project by ID
- `POST /api/projects` - Create project
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project

### Tasks
- `GET /api/tasks` - Get all tasks (filter by ?project_id=)
- `GET /api/tasks/:id` - Get task by ID
- `POST /api/tasks` - Create task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task

### Transactions
- `GET /api/transactions` - Get all transactions (filter by ?project_id=)
- `GET /api/transactions/:id` - Get transaction by ID
- `POST /api/transactions` - Create transaction (auto-updates project balance)
- `PUT /api/transactions/:id` - Update transaction
- `DELETE /api/transactions/:id` - Delete transaction

### Reports
- `GET /api/reports/project/:id` - Get detailed project report
- `GET /api/reports/dashboard` - Get dashboard statistics
- `GET /api/reports/financial-summary` - Get financial summary

### Users (Admin Only)
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

## 🚦 Running the Application

```bash
# Development mode
npm run dev

# Production mode
npm start
```

## 📝 Example Usage

### Register a User
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "johndoe",
    "email": "john@example.com",
    "password": "password123",
    "phone": "+1234567890"
  }'
```

### Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'
```

### Create a Project (with token)
```bash
curl -X POST http://localhost:5000/api/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "project_name": "Website Development",
    "description": "Building company website",
    "start_date": "2024-01-01",
    "end_date": "2024-03-31"
  }'
```

## 🔐 Security Features

- JWT-based authentication
- Password hashing with bcryptjs
- User approval system
- Role-based access control
- Automatic balance calculation
- Data validation

## 📊 Database Schema

The system uses 4 main tables:
- **users**: User accounts with roles and approval status
- **projects**: Project information with auto-calculated balance
- **tasks**: Task details with worker information
- **transactions**: Income and expense records

## 👨‍💻 Admin Setup

To create an admin user, manually update the database:

```sql
-- First, register a user normally
-- Then update their role to admin
UPDATE users SET role = 'admin', approve_user = true WHERE email = 'admin@example.com';
```

## 📄 License

ISC

## 👥 Author

SPEMS Development Team
