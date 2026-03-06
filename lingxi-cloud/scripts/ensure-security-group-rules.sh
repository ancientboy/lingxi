#!/bin/bash
# 确保安全组规则完整
# 用于检查并添加缺失的端口规则

SG_ID="sg-bp175bcj1jn10tbtxba8"
REGION="cn-hangzhou"

echo "========================================"
echo "🔒 检查安全组规则"
echo "========================================"
echo ""
echo "安全组 ID: $SG_ID"
echo "区域: $REGION"
echo ""

# 需要开放的端口列表
PORTS=(
  "22:SSH"
  "80:HTTP"
  "443:HTTPS"
  "3000:灵犀云后端"
  "8000:备用HTTP"
  "8080:备用HTTP"
  "9876:文件预览服务"
  "13000:灵犀云备用"
  "17860:其他服务"
  "18789:OpenClaw_Gateway"
  "18790:OpenClaw备用"
  "18791:OpenClaw备用"
  "18792:OpenClaw备用"
)

echo "🔧 检查并添加缺失端口..."
echo ""

for item in "${PORTS[@]}"; do
  IFS=':' read -r port desc <<< "$item"
  
  # 尝试添加规则
  result=$(aliyun ecs AuthorizeSecurityGroup \
    --RegionId "$REGION" \
    --SecurityGroupId "$SG_ID" \
    --IpProtocol tcp \
    --PortRange "${port}/${port}" \
    --SourceCidrIp "0.0.0.0/0" \
    --Description "$desc" 2>&1)
  
  if echo "$result" | grep -q "RequestId"; then
    echo "   ✅ 已开放端口 $port ($desc)"
  elif echo "$result" | grep -q "already exist\|Duplicate"; then
    echo "   ⚠️  端口 $port 已存在 ($desc)"
  else
    echo "   ❌ 端口 $port 添加失败"
    echo "      $result"
  fi
done

echo ""
echo "========================================"
echo "✅ 安全组规则检查完成！"
echo "========================================"
echo ""
echo "📋 灵犀云用户服务器端口配置："
echo ""
echo "| 端口  | 用途               |"
echo "|-------|-------------------|"
echo "| 22    | SSH               |"
echo "| 80    | HTTP              |"
echo "| 443   | HTTPS             |"
echo "| 3000  | 灵犀云后端         |"
echo "| 8000  | 备用 HTTP         |"
echo "| 8080  | 备用 HTTP         |"
echo "| 9876  | 文件预览服务       |"
echo "| 13000 | 灵犀云备用         |"
echo "| 17860 | 其他服务          |"
echo "| 18789 | OpenClaw Gateway  |"
echo ""
echo "💡 新创建的用户服务器将自动应用这些规则！"
echo ""
