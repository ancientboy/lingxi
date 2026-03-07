/**
 * 模型 API 调用工具
 * 直接调用大模型 API（不经过 OpenClaw）
 */

/**
 * 调用百炼 Coding 套餐 API
 * @param {string} message - 用户消息
 * @returns {Promise<string>} - 模型响应
 */
export async function callModelAPI(message) {
  try {
    // 使用百炼 Coding 套餐
    const apiKey = process.env.BAILIAN_CODING_API_KEY;
    const baseUrl = process.env.BAILIAN_CODING_BASE_URL || 'https://coding.dashscope.aliyuncs.com/v1';
    
    if (!apiKey) {
      console.error('❌ 未配置 BAILIAN_CODING_API_KEY');
      return '你好！我是 Lume，你的 AI 助手。抱歉，模型服务暂时未配置，请联系管理员。';
    }

    console.log('🚀 调用百炼 Coding API...');

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'qwen3.5-plus',
        messages: [
          {
            role: 'system',
            content: '你是 Lume，一个友好、聪明的 AI 助手。用简洁自然的语言回复用户。'
          },
          {
            role: 'user',
            content: message
          }
        ],
        temperature: 0.7,
        max_tokens: 1024
      })
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('百炼 Coding API 响应错误:', response.status, text);
      return '抱歉，AI 服务响应异常，请稍后再试。';
    }

    const data = await response.json();
    
    // 提取响应内容
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      console.error('❌ 百炼返回空内容:', data);
      return '抱歉，AI 服务返回内容为空，请稍后再试。';
    }

    console.log('✅ 百炼 Coding API 调用成功');
    return content;
  } catch (error) {
    console.error('模型 API 调用异常:', error);
    return `抱歉，AI 服务暂时不可用：${error.message}`;
  }
}

/**
 * 测试模型连接
 * @returns {Promise<boolean>} - 连接是否成功
 */
export async function testModelConnection() {
  try {
    const response = await callModelAPI('你好');
    return response && !response.includes('抱歉');
  } catch (error) {
    console.error('模型连接测试失败:', error);
    return false;
  }
}
