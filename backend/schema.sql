-- 灵犀云数据库结构 (SQLite)

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  invite_code TEXT UNIQUE NOT NULL,
  nickname TEXT,
  instance_id TEXT,
  instance_status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME
);

-- 邀请码表
CREATE TABLE IF NOT EXISTS invite_codes (
  code TEXT PRIMARY KEY,
  used INTEGER DEFAULT 0,
  used_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Agent配置表
CREATE TABLE IF NOT EXISTS agent_configs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agents TEXT NOT NULL,  -- JSON数组
  skills TEXT,           -- JSON数组
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_users_invite_code ON users(invite_code);
CREATE INDEX IF NOT EXISTS idx_invite_codes_used ON invite_codes(used);
