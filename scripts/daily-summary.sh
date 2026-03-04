#!/bin/bash
# 每日工作总结脚本
# 每晚 22:00 自动总结今日工作

LOG_FILE="/var/log/daily-summary.log"
NODE_PATH="/usr/bin/node"
SKILL_PATH="/root/.openclaw/workspace/skills/memory-system/conversation-summary.mjs"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# 检查 Node.js 是否存在
if [ ! -f "$NODE_PATH" ]; then
    log "❌ Node.js 未找到"
    exit 1
fi

# 检查技能文件是否存在
if [ ! -f "$SKILL_PATH" ]; then
    log "❌ 技能文件未找到: $SKILL_PATH"
    exit 1
fi

log "📊 开始生成每日总结..."

# 调用总结函数
cd /root/.openclaw/workspace

RESULT=$($NODE_PATH -e "
import('./skills/memory-system/conversation-summary.mjs')
  .then(async (m) => {
    try {
      const result = await m.saveDailySummary();
      if (result) {
        console.log('✅ 总结完成');
        process.exit(0);
      } else {
        console.log('📭 今日无重要内容');
        process.exit(0);
      }
    } catch (e) {
      console.error('❌ 总结失败:', e.message);
      process.exit(1);
    }
  })
  .catch(e => {
    console.error('❌ 模块加载失败:', e.message);
    process.exit(1);
  });
" 2>&1)

if [ $? -eq 0 ]; then
    log "$RESULT"
else
    log "❌ 总结失败: $RESULT"
fi
