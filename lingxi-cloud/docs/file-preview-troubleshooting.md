# 🔍 文件预览功能 - 完整排查指南

## 当前状态

✅ **后端 API 已修复**
- 添加了 JWT 认证中间件
- API 路径：`/api/user/server`

✅ **前端代码已更新**
- 自动清理 Markdown 符号
- 自动获取服务器信息

✅ **文件服务已部署**
- 主服务器：120.55.192.144:9876
- Paul 服务器：120.26.33.181:9876

---

## 完整工作流程

```
1. 用户登录灵犀云
   ↓
2. 前端调用 /api/user/server（带 JWT token）
   ↓
3. 后端返回用户服务器信息：
   {
     "serverIp": "120.26.33.181",
     "fileServerPort": 9876,
     "fileServerToken": "lingxi-file-server-2026"
   }
   ↓
4. Agent 生成文件并返回消息
   ↓
5. 前端提取文件路径（清理 Markdown 符号）
   ↓
6. 生成预览 URL：
   http://120.26.33.181:9876/preview?path=test.pdf&token=xxx
   ↓
7. 浏览器直接访问文件服务
   ↓
8. 显示文件预览
```

---

## 排查步骤

### 1️⃣ 检查 API 是否返回服务器信息

**在浏览器控制台执行：**

```javascript
// 获取 token
const token = localStorage.getItem('lingxi_token');

// 调用 API
fetch('http://120.55.192.144:3000/api/user/server', {
  headers: { 'Authorization': `Bearer ${token}` }
})
.then(r => r.json())
.then(data => {
  console.log('✅ 服务器信息：', data);
  window.userServerInfo = data; // 保存到全局
})
.catch(err => console.error('❌ 获取失败：', err));
```

**预期结果：**
```json
{
  "serverIp": "120.26.33.181",
  "fileServerPort": 9876,
  "fileServerToken": "lingxi-file-server-2026",
  "status": "running"
}
```

**如果返回错误：**
- `"未登录"` → Token 无效，需要重新登录
- `"未找到运行中的服务器"` → 用户没有分配服务器

---

### 2️⃣ 检查文件服务是否可访问

**在浏览器新标签页打开：**

```
http://120.26.33.181:9876/health
```

**预期结果：**
```json
{
  "status": "ok",
  "port": 9876,
  "workspace": "/root/.openclaw/workspace",
  "exists": true
}
```

---

### 3️⃣ 测试文件访问

**在浏览器新标签页打开：**

```
http://120.26.33.181:9876/preview?path=test-document.pdf&token=lingxi-file-server-2026
```

**预期结果：**
- 浏览器显示 PDF 文件 ✅
- 或者下载 PDF 文件 ✅

**如果显示错误：**
- `{"error":"File not found"}` → 文件不存在
- `{"error":"Unauthorized"}` → Token 不正确
- 无法访问 → 防火墙阻止或服务未启动

---

### 4️⃣ 检查前端是否获取到服务器信息

**在浏览器控制台执行：**

```javascript
// 检查全局变量
console.log('userServerInfo:', window.userServerInfo);

// 如果是 undefined，说明 API 没有被调用
// 需要刷新页面
```

---

### 5️⃣ 检查文件路径提取

**在浏览器控制台执行：**

```javascript
// 测试路径提取
const testText = '- 📄 路径：`/root/.openclaw/workspace/test-document.pdf`';
const files = extractFiles(testText);
console.log('提取的文件：', files);

// 预期结果：
// [{
//   path: "/root/.openclaw/workspace/test-document.pdf",
//   name: "test-document.pdf",
//   type: "pdf"
// }]
```

---

## 常见问题

### Q1: 显示"无法预览：未配置服务器"

**原因：** `userServerInfo` 为空

**解决：**
1. 检查是否登录
2. 检查 API 是否返回服务器信息
3. 刷新页面重新获取

---

### Q2: 显示"File not found"

**原因：** 文件不存在或路径错误

**解决：**
1. 检查文件是否真的存在：`ls /root/.openclaw/workspace/`
2. 检查路径提取是否正确（是否包含特殊符号）
3. 检查文件权限

---

### Q3: 显示"Unauthorized"

**原因：** Token 不正确

**解决：**
1. 检查环境变量 `FILE_SERVER_TOKEN`
2. 检查前端传递的 token 是否正确
3. 重启文件服务

---

### Q4: 无法访问文件服务

**原因：** 防火墙或服务未启动

**解决：**
```bash
# 检查服务状态
ssh root@120.26.33.181 'ps aux | grep "node.*9876"'

# 检查端口
ssh root@120.26.33.181 'netstat -tlnp | grep 9876'

# 开放端口
ssh root@120.26.33.181 'ufw allow 9876'
```

---

## 一键测试脚本

**在浏览器控制台执行：**

```javascript
async function testFilePreview() {
  console.log('🔍 开始测试文件预览功能...\n');

  // 1. 检查登录
  const token = localStorage.getItem('lingxi_token');
  if (!token) {
    console.error('❌ 未登录');
    return;
  }
  console.log('✅ 已登录');

  // 2. 获取服务器信息
  try {
    const res = await fetch('http://120.55.192.144:3000/api/user/server', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const serverInfo = await res.json();
    console.log('✅ 服务器信息：', serverInfo);

    // 3. 测试文件服务
    const testUrl = `http://${serverInfo.serverIp}:9876/health`;
    const healthRes = await fetch(testUrl);
    const health = await healthRes.json();
    console.log('✅ 文件服务状态：', health);

    // 4. 测试文件访问
    const fileUrl = `http://${serverInfo.serverIp}:9876/preview?path=test-document.pdf&token=${serverInfo.fileServerToken}`;
    console.log('✅ 测试文件 URL：', fileUrl);

    // 5. 保存到全局
    window.userServerInfo = serverInfo;
    console.log('\n✅ 测试完成！现在刷新页面应该能看到文件预览了。');

  } catch (err) {
    console.error('❌ 测试失败：', err);
  }
}

testFilePreview();
```

---

## 修复记录

### 2026-03-06 13:46
- ✅ 修复 `/api/user/server` 缺少认证中间件的问题
- ✅ 添加 JWT 认证
- ✅ 返回正确的服务器信息

### 2026-03-06 13:04
- ✅ 修复 Markdown 反引号导致路径错误
- ✅ 清理特殊符号

### 2026-03-06 12:59
- ✅ 改用文件扩展名匹配路径
- ✅ 支持任何路径格式

---

## 下一步

1. **强制刷新浏览器**（Ctrl+Shift+R）
2. **重新让 Agent 生成文件**
3. **查看是否显示预览**

如果还有问题，在浏览器控制台执行上面的测试脚本，把输出结果发给我！
