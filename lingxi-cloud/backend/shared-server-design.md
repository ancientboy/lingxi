# 共享服务器设计方案

## 1. 主服务器配置

### 环境变量
```env
# 主服务器（共享模式）
SHARED_OPENCLAW_URL=ws://120.55.192.144:8765
SHARED_OPENCLAW_TOKEN=<主服务器token>

# 用户专属服务器（独立模式）
USER_SERVER_PREFIX=ws://
USER_SERVER_PORT=8765
```

### 数据库设计

#### users 表增加字段
```json
{
  "id": "user_xxx",
  "nickname": "用户A",
  "points": 100,
  "totalSpent": 0,
  "subscription": {
    "plan": "free",
    "status": "active"
  },
  "agents": ["lingxi"],  // 免费用户只有灵犀
  "serverMode": "shared",  // shared | dedicated
  "serverIp": null,  // 独立服务器才有
  "serverPort": null,
  "serverToken": null
}
```

## 2. WebSocket 代理逻辑

### routes/chat.js - 修改 WebSocket 代理

```javascript
// 获取用户的 WebSocket 连接
async function getUserWebSocket(userId) {
  const user = await getUser(userId);

  if (user.serverMode === 'shared') {
    // 共享模式：连接到主服务器
    return {
      url: process.env.SHARED_OPENCLAW_URL,
      token: process.env.SHARED_OPENCLAW_TOKEN,
      sessionPrefix: `shared_${userId}_`  // 会话前缀隔离
    };
  } else {
    // 独立模式：连接到用户专属服务器
    return {
      url: `ws://${user.serverIp}:${user.serverPort}`,
      token: user.serverToken,
      sessionPrefix: `${userId}_`
    };
  }
}

// 强制使用灵犀 Agent（共享模式）
function enforceSharedAgent(userId, agentId) {
  const user = await getUser(userId);

  if (user.serverMode === 'shared') {
    // 共享模式强制使用灵犀
    return 'lingxi';
  }

  // 独立模式可以使用任意 Agent
  return agentId;
}
```

## 3. 权限控制

### 3.1 Agent 切换限制
```javascript
// 切换 Agent 前检查
router.post('/switch-agent', async (req, res) => {
  const { userId, agentId } = req.body;
  const user = await getUser(userId);

  if (user.serverMode === 'shared' && agentId !== 'lingxi') {
    return res.status(403).json({
      error: '免费用户只能使用灵犀',
      hint: '订阅后解锁完整 Agent 团队',
      upgradeUrl: '/subscription'
    });
  }

  // 更新当前 Agent
  user.currentAgent = agentId;
  await saveUser(user);

  res.json({ success: true, agent: agentId });
});
```

### 3.2 使用次数限制
```javascript
// 每日对话次数限制
const DAILY_LIMIT = {
  free: 20,      // 免费用户
  lite: 100,     // Lite 套餐
  pro: Infinity  // PRO 套餐
};

// 检查使用次数
async function checkDailyLimit(userId) {
  const user = await getUser(userId);
  const today = new Date().toDateString();

  // 获取今日使用次数
  const usage = await getDailyUsage(userId, today);
  const limit = DAILY_LIMIT[user.subscription.plan];

  if (usage >= limit) {
    return {
      allowed: false,
      remaining: 0,
      limit: limit,
      message: '今日对话次数已用完，明天再来或升级套餐'
    };
  }

  return {
    allowed: true,
    remaining: limit - usage,
    limit: limit
  };
}
```

## 4. 前端适配

### 4.1 ChatPage 修改

```dart
// 获取 WebSocket 连接信息
Future<WebSocketConfig> _getWebSocketConfig() async {
  final response = await http.get(
    Uri.parse('$API_BASE/api/chat/ws-config'),
    headers: {'Authorization': 'Bearer $token'},
  );

  final data = jsonDecode(response.body);
  return WebSocketConfig(
    url: data['url'],
    token: data['token'],
    sessionPrefix: data['sessionPrefix'],
  );
}

// 切换 Agent 前检查权限
Future<void> _switchAgent(String agentId) async {
  final response = await http.post(
    Uri.parse('$API_BASE/api/chat/switch-agent'),
    headers: {'Authorization': 'Bearer $token'},
    body: {'agentId': agentId},
  );

  if (response.statusCode == 403) {
    // 显示升级提示
    _showUpgradeDialog();
    return;
  }

  // 切换成功
  setState(() => _currentAgent = agentId);
}

// 显示升级对话框
void _showUpgradeDialog() {
  showDialog(
    context: context,
    builder: (context) => AlertDialog(
      title: Text('解锁完整团队'),
      content: Text('订阅后可以使用完整的 8 位 Agent 团队'),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text('稍后再说'),
        ),
        ElevatedButton(
          onPressed: () {
            Navigator.pop(context);
            Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => SubscriptionPage()),
            );
          },
          child: Text('立即订阅'),
        ),
      ],
    ),
  );
}
```

### 4.2 Agent 选择器修改

```dart
// 根据用户权限显示 Agent 列表
Widget _buildAgentSelector() {
  final user = Provider.of<AppProvider>(context).user;
  final isSharedMode = user.serverMode == 'shared';

  return GridView.builder(
    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
      crossAxisCount: 2,
      childAspectRatio: 2.5,
    ),
    itemCount: _agents.length,
    itemBuilder: (context, index) {
      final agent = _agents[index];
      final isLocked = isSharedMode && agent.id != 'lingxi';

      return _buildAgentCard(
        agent: agent,
        isLocked: isLocked,
        onTap: () {
          if (isLocked) {
            _showUpgradeDialog();
          } else {
            _switchAgent(agent.id);
          }
        },
      );
    },
  );
}

// Agent 卡片（带锁定状态）
Widget _buildAgentCard({agent, isLocked, onTap}) {
  return GestureDetector(
    onTap: onTap,
    child: Container(
      decoration: BoxDecoration(
        color: isLocked ? Colors.grey.shade200 : agent.color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isLocked ? Colors.grey.shade300 : agent.color.withOpacity(0.3),
        ),
      ),
      child: Stack(
        children: [
          // Agent 信息
          Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  agent.icon,
                  color: isLocked ? Colors.grey : agent.color,
                ),
                SizedBox(height: 8),
                Text(
                  agent.name,
                  style: TextStyle(
                    color: isLocked ? Colors.grey : Colors.black87,
                  ),
                ),
              ],
            ),
          ),

          // 锁定图标
          if (isLocked)
            Positioned(
              top: 8,
              right: 8,
              child: Icon(Icons.lock, size: 16, color: Colors.grey),
            ),
        ],
      ),
    ),
  );
}
```

## 5. 订阅流程

### 5.1 订阅成功后自动部署

```javascript
// 订阅成功 webhook
router.post('/webhook/subscription', async (req, res) => {
  const { userId, plan } = req.body;

  if (plan === 'pro') {
    // 自动部署独立服务器
    await deployUserServer(userId);

    // 更新用户状态
    await updateUser(userId, {
      serverMode: 'dedicated',
      agents: ['lingxi', 'coder', 'ops', 'inventor', 'pm', 'noter', 'media', 'smart'],
    });

    // 发送通知
    await sendNotification(userId, {
      title: '🎉 团队已激活',
      body: '你的 8 位 AI 伙伴已就位，快去对话吧！',
    });
  }

  res.json({ success: true });
});
```

## 6. 降级处理

### 6.1 订阅过期

```javascript
// 检查订阅状态
async function checkSubscription(userId) {
  const user = await getUser(userId);

  if (user.subscription.status === 'expired') {
    // 降级到共享模式
    await updateUser(userId, {
      serverMode: 'shared',
      agents: ['lingxi'],
    });

    // 停止独立服务器
    await stopUserServer(userId);

    return {
      downgraded: true,
      message: '订阅已过期，已切换到免费模式'
    };
  }

  return { downgraded: false };
}
```

## 7. 数据迁移

### 7.1 从共享模式升级到独立模式

```javascript
// 迁移会话历史
async function migrateUserData(userId) {
  // 1. 导出共享服务器的会话历史
  const sessions = await exportSharedSessions(userId);

  // 2. 部署独立服务器
  const server = await deployUserServer(userId);

  // 3. 导入会话历史到独立服务器
  await importSessions(server, sessions);

  // 4. 更新用户状态
  await updateUser(userId, {
    serverMode: 'dedicated',
    serverIp: server.ip,
    serverPort: server.port,
    serverToken: server.token,
  });
}
```

## 8. 监控和计费

### 8.1 使用统计

```javascript
// 记录每日使用次数
async function recordUsage(userId) {
  const today = new Date().toDateString();
  const key = `usage:${userId}:${today}`;

  await redis.incr(key);
  await redis.expire(key, 86400);  // 1天后过期
}

// 获取使用统计
async function getUsageStats(userId) {
  const today = new Date().toDateString();
  const key = `usage:${userId}:${today}`;

  return {
    today: await redis.get(key) || 0,
    limit: DAILY_LIMIT[user.subscription.plan],
  };
}
```

## 9. 成本控制

### 9.1 共享服务器资源限制

```yaml
# docker-compose.yml
services:
  openclaw-shared:
    image: openclaw/openclaw:latest
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 8G
        reservations:
          cpus: '2'
          memory: 4G
    environment:
      - MAX_CONCURRENT_USERS=100
      - MAX_SESSIONS_PER_USER=10
      - SESSION_TIMEOUT=3600
```

### 9.2 请求限流

```javascript
// 限流中间件
const rateLimit = require('express-rate-limit');

const sharedLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1分钟
  max: 10,  // 最多10次请求
  message: '请求太频繁，请稍后再试',
  keyGenerator: (req) => {
    return req.user.id;  // 按用户限流
  },
});

app.use('/api/chat', sharedLimiter);
```

## 10. 用户体验优化

### 10.1 首次使用引导

```dart
// 首次使用提示
void _showFirstTimeGuide() {
  showDialog(
    context: context,
    builder: (context) => AlertDialog(
      title: Text('欢迎使用 Lume'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('你现在可以使用灵犀进行对话'),
          SizedBox(height: 8),
          Text('💡 订阅后解锁 8 位 AI 团队'),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text('开始体验'),
        ),
      ],
    ),
  );
}
```

### 10.2 升级引导

```dart
// 在对话中提示升级
Widget _buildUpgradeHint() {
  final user = Provider.of<AppProvider>(context).user;

  if (user.serverMode == 'shared' && user.dailyUsage >= 15) {
    // 使用次数接近限制时提示
    return Container(
      padding: EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.orange.shade50,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Icon(Icons.info, color: Colors.orange),
          SizedBox(width: 8),
          Expanded(
            child: Text(
              '今日对话次数即将用完 (${user.dailyUsage}/20)',
              style: TextStyle(fontSize: 12),
            ),
          ),
          TextButton(
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => SubscriptionPage()),
            ),
            child: Text('升级'),
          ),
        ],
      ),
    );
  }

  return SizedBox.shrink();
}
```
