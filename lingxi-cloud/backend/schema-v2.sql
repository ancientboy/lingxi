-- 灵犀云数据库结构 V2 (方案B: SaaS 远程管理)
-- 支持用户独立服务器部署

-- ============ 用户表 ============
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  invite_code TEXT UNIQUE NOT NULL,
  nickname TEXT,
  password_hash TEXT,
  email TEXT,
  phone TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME
);

-- ============ 用户服务器表 ============
CREATE TABLE IF NOT EXISTS user_servers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  
  -- 服务器信息
  aliyun_instance_id TEXT,        -- 阿里云实例ID
  ip TEXT NOT NULL,               -- 公网IP
  region TEXT DEFAULT 'cn-hangzhou',
  spec TEXT DEFAULT 'ecs.tiny',   -- 规格
  
  -- 访问信息
  ssh_port INTEGER DEFAULT 22,
  ssh_password TEXT DEFAULT 'Lingxi@2026!',
  
  -- OpenClaw 配置
  openclaw_port INTEGER DEFAULT 18789,
  openclaw_token TEXT,            -- 每个用户独立的token
  openclaw_session TEXT,          -- 会话ID
  
  -- 状态
  status TEXT DEFAULT 'pending',  -- pending, creating, running, stopped, error
  health_checked_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============ 用户配置表（飞书/企业微信等）============
CREATE TABLE IF NOT EXISTS user_configs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  
  -- 飞书配置
  feishu_app_id TEXT,
  feishu_app_secret TEXT,
  feishu_enabled INTEGER DEFAULT 0,
  
  -- 企业微信配置
  wecom_corp_id TEXT,
  wecom_agent_id TEXT,
  wecom_secret TEXT,
  wecom_token TEXT,
  wecom_encoding_aes_key TEXT,
  wecom_enabled INTEGER DEFAULT 0,
  
  -- Agent 配置
  agents TEXT,                    -- JSON数组: ["lingxi", "coder", "ops"]
  skills TEXT,                    -- JSON数组
  
  -- 模型配置
  model_provider TEXT DEFAULT 'zhipu',
  model_name TEXT DEFAULT 'glm-5',
  
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============ 部署任务表 ============
CREATE TABLE IF NOT EXISTS deploy_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  server_id TEXT,
  
  task_type TEXT NOT NULL,        -- create_server, deploy_openclaw, update_config
  status TEXT DEFAULT 'pending',  -- pending, running, success, failed
  progress INTEGER DEFAULT 0,     -- 0-100
  
  -- 任务详情
  params TEXT,                    -- JSON参数
  result TEXT,                    -- JSON结果
  error_message TEXT,
  
  started_at DATETIME,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (server_id) REFERENCES user_servers(id)
);

-- ============ 邀请码表 ============
CREATE TABLE IF NOT EXISTS invite_codes (
  code TEXT PRIMARY KEY,
  used INTEGER DEFAULT 0,
  used_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============ 索引 ============
CREATE INDEX IF NOT EXISTS idx_users_invite_code ON users(invite_code);
CREATE INDEX IF NOT EXISTS idx_user_servers_user_id ON user_servers(user_id);
CREATE INDEX IF NOT EXISTS idx_user_servers_status ON user_servers(status);
CREATE INDEX IF NOT EXISTS idx_user_configs_user_id ON user_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_deploy_tasks_user_id ON deploy_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_deploy_tasks_status ON deploy_tasks(status);
