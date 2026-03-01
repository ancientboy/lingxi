#!/bin/bash
# 灵犀云健康监控脚本
# 每5分钟检查一次，服务挂掉自动重启

LOG_FILE="/var/log/lingxi-health.log"
ALERT_FILE="/tmp/lingxi-alert-sent"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

check_service() {
    # 检查 pm2 进程是否存在
    if ! pm2 list | grep -q "lingxi-cloud.*online"; then
        log "⚠️ 服务未运行，尝试重启..."
        pm2 start lingxi-cloud 2>/dev/null || \
        cd /root/.openclaw/workspace/lingxi-cloud/backend && pm2 start npm --name "lingxi-cloud" -- start
        sleep 5
        if pm2 list | grep -q "lingxi-cloud.*online"; then
            log "✅ 服务重启成功"
        else
            log "❌ 服务重启失败"
        fi
    fi
    
    # 检查 HTTP 响应
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ --connect-timeout 5)
    if [ "$RESPONSE" != "200" ]; then
        log "⚠️ HTTP 响应异常: $RESPONSE，尝试重启..."
        pm2 restart lingxi-cloud
        sleep 5
        RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ --connect-timeout 5)
        if [ "$RESPONSE" = "200" ]; then
            log "✅ HTTP 恢复正常"
        else
            log "❌ HTTP 仍然异常: $RESPONSE"
        fi
    fi
}

check_service
