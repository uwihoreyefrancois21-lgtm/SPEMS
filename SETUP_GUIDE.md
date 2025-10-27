# SPEMS Setup Guide 🚀

Complete setup instructions for Smart Project Expense Management System.

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Configure Environment

Create a `.env` file in the root directory (you may need to create this manually):

```env
DATABASE_URL=postgresql://postgres.putgsqrbnacomsnvazio:iwwCOIyR5Brz5p0N@aws-1-eu-west-1.pooler.supabase.com:5432/postgres
JWT_SECRET=change_this_to_a_random_secret_key_in_production
PORT=5000
NODE_ENV=development
```

**Important:** Change the `JWT_SECRET` to a strong random string in production!

## Step 3: Database Setup

### Option A: Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Run the database schema (provided in your project requirements)

### Option B: Using psql Command Line

```bash
psql postgresql://postgres.putgsqrbnacomsnvazio:iwwCOIyR5Brz5p0N@aws-1-eu-west-1.pooler.supabase.com:5432/postgres
```

Then run:
```sql
-- 1️⃣ USERS TABLE
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    role VARCHAR(20) CHECK (role IN ('admin', 'staff')) DEFAULT 'staff',
    approve_user BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2️⃣ PROJECTS TABLE
CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    project_name VARCHAR(150) NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    total_income DECIMAL(12,2) DEFAULT 0,
    total_expense DECIMAL(12,2) DEFAULT 0,
    balance DECIMAL(12,2) GENERATED ALWAYS AS (total_income - total_expense) STORED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3️⃣ TASKS TABLE
CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    project_id INT REFERENCES projects(id) ON DELETE CASCADE,
    task_name VARCHAR(150) NOT NULL,
    description TEXT,
    worker_name VARCHAR(100),
    worker_phone VARCHAR(20),
    cost DECIMAL(12,2) DEFAULT 0,
    task_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4️⃣ TRANSACTIONS TABLE
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    project_id INT REFERENCES projects(id) ON DELETE CASCADE,
    task_id INT REFERENCES tasks(id) ON DELETE SET NULL,
    type VARCHAR(20) CHECK (type IN ('income', 'expense')),
    amount DECIMAL(12,2) NOT NULL,
    description TEXT,
    transaction_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Step 4: Create First Admin User

You need to create the first admin user manually. Here are three methods:

### Method 1: Via Supabase Dashboard (Easiest)

1. Go to Supabase Dashboard → Table Editor → users table
2. Click "Insert row"
3. Fill in the form:
   - `username`: your username
   - `email`: your email
   - `password`: Hash the password using this tool: https://bcrypt-generator.com/ (rounds: 10)
   - `phone`: your phone (optional)
   - `role`: `admin`
   - `approve_user`: `true`
4. Save

### Method 2: Register via API then Promote via SQL

1. First, register a user via API:
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "email": "admin@example.com",
    "password": "admin123",
    "phone": "+1234567890"
  }'
```

2. Then promote to admin via SQL:
```sql
UPDATE users 
SET role = 'admin', approve_user = true 
WHERE email = 'admin@example.com';
```

### Method 3: Direct SQL Insert (Requires password hashing)

Run this in your database (replace with your values):

```sql
-- Generate a bcrypt hash for your password first using: https://bcrypt-generator.com/
-- For password: "admin123", the hash is (example only):
INSERT INTO users (username, email, password, role, approve_user)
VALUES (
  'admin',
  'admin@example.com',
  '$2a$10$YOUR_BCRYPT_HASH_HERE',
  'admin',
  true
);
```

## Step 5: Start the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:5000`

## Step 6: Test the Setup

### Test Login:
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "admin123"
  }'
```

You should receive a token in the response.

### Test API:
Open your browser and go to: `http://localhost:5000`

You should see the API welcome page with all available endpoints.

## Step 7: Approve More Users (Admin)

Once logged in as admin, you can approve other users:

```bash
curl -X POST http://localhost:5000/api/auth/approve-user/USER_ID \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

## 🔧 Troubleshooting

### Database Connection Error
- Check your `.env` file has the correct `DATABASE_URL`
- Make sure your Supabase project is active
- Verify database credentials

### User Can't Login
- Check if user is approved: `approve_user` should be `true`
- Verify the password is correct
- Check the user's role

### "No token provided" Error
- Make sure you're sending the Authorization header
- Format: `Authorization: Bearer YOUR_TOKEN`

### Port Already in Use
- Change the PORT in `.env` to another port (e.g., 5001)
- Or kill the process using port 5000

## 📝 Quick Test Workflow

1. **Register a staff user:**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"staff","email":"staff@example.com","password":"staff123"}'
```

2. **Login as admin and approve staff:**
```bash
# Login as admin
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}'

# Copy the token from response, then approve staff user
curl -X POST http://localhost:5000/api/auth/approve-user/2 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

3. **Login as staff:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"staff@example.com","password":"staff123"}'
```

4. **Create a project:**
```bash
curl -X POST http://localhost:5000/api/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_STAFF_TOKEN" \
  -d '{"project_name":"Test Project","description":"My first project"}'
```

5. **Add a transaction:**
```bash
curl -X POST http://localhost:5000/api/transactions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_STAFF_TOKEN" \
  -d '{"project_id":1,"type":"income","amount":5000,"description":"Initial funding"}'
```

6. **Check project balance:**
```bash
curl -X GET http://localhost:5000/api/projects/1 \
  -H "Authorization: Bearer YOUR_STAFF_TOKEN"
```

The balance should automatically be calculated! 🎉

---

**Setup complete! You're ready to use SPEMS.** 🚀
