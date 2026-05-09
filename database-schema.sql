-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(80),
  password VARCHAR(255) NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  confirmed_at TIMESTAMP WITH TIME ZONE,
  confirmation_token VARCHAR(255),
  token_expiry TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_users_email ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON users (LOWER(username)) WHERE username IS NOT NULL;
CREATE INDEX idx_users_is_admin ON users(is_admin);
CREATE INDEX idx_users_confirmation_token ON users(confirmation_token);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);

-- Ensure new username column exists on older deployments
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username VARCHAR(80);

-- Enable RLS (Row Level Security)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Create policies for users table
CREATE POLICY "Users can view their own profile" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Allow public access for signup" ON users
  FOR INSERT WITH CHECK (true);

-- Create policies for sessions table
CREATE POLICY "Users can view their own sessions" ON sessions
  FOR SELECT USING (auth.uid() = user_id);

-- Guest daily quota table (for unauthenticated question limits)
CREATE TABLE IF NOT EXISTS guest_daily_quota (
  guest_id TEXT NOT NULL,
  day DATE NOT NULL,
  question_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (guest_id, day)
);

CREATE INDEX idx_guest_daily_quota_day ON guest_daily_quota(day);

ALTER TABLE guest_daily_quota ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read guest quota" ON guest_daily_quota
  FOR SELECT USING (true);

CREATE POLICY "Allow anonymous insert guest quota" ON guest_daily_quota
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anonymous update guest quota" ON guest_daily_quota
  FOR UPDATE USING (true);
