/**
 * 模型 API 调用工具
 * 使用 DMXAPI 聚合平台调用免费模型
 * 支持多模型轮询和降级
 */

// 免费文本模型列表（按优先级排序）
const FREE_TEXT_MODELS = [
  'qwen-flash',           // 阿里通义，稳定
  'GLM-4.5-Flash',        // 智谱 GLM
  'Qwen3-8B',             // 通义千问3
  'glm-4-flash',          // 智谱轻量版
  'gpt-4o-mini',          // OpenAI 备用
];

// 免费视觉模型列表（按优先级排序）
const FREE_VISION_MODELS = [
  'GLM-4.1V-Thinking-Flash',  // 智谱视觉+思维
  'glm-4v-plus',              // 智谱视觉
  'qwen-vl-plus',             // 阿里视觉
];

// 模型失败计数（用于自动降级）
const modelFailures = {};
const MAX_FAILURES = 3;  // 连续失败3次后暂时跳过

/**
 * 获取下一个可用模型
 */
function getNextModel(models, imageUrl = null) {
  const modelList = imageUrl ? FREE_VISION_MODELS : FREE_TEXT_MODELS;
  
  for (const model of modelList) {
    const failures = modelFailures[model] || 0;
    if (failures < MAX_FAILURES) {
      return model;
    }
  }
  
  // 所有模型都失败了，重置计数并返回第一个
  console.log('⚠️ 所有模型都失败过，重置计数...');
  for (const model of modelList) {
    modelFailures[model] = 0;
  }
  return modelList[0];
}

/**
 * 记录模型成功
 */
function recordSuccess(model) {
  modelFailures[model] = 0;
}

/**
 * 记录模型失败
 */
function recordFailure(model) {
  modelFailures[model] = (modelFailures[model] || 0) + 1;
  console.log(`❌ 模型 ${model} 失败次数: ${modelFailures[model]}`);
}

/**
 * 调用 DMXAPI 免费 API（支持多模型轮询）
 * @param {string} message - 用户消息
 * @param {string} [imageUrl] - 可选图片URL
 * @returns {Promise<string>} - 模型响应
 */
export async function callModelAPI(message, imageUrl = null) {
  const apiKey = process.env.DMXAPI_API_KEY;
  const baseUrl = process.env.DMXAPI_BASE_URL || 'https://www.dmxapi.cn/v1';
  
  if (!apiKey) {
    console.error('❌ 未配置 DMXAPI_API_KEY');
    return '你好！我是 Lume，你的 AI 助手。抱歉，模型服务暂时未配置，请联系管理员。';
  }

  // 获取可用的模型列表
  const modelList = imageUrl ? FREE_VISION_MODELS : FREE_TEXT_MODELS;
  
  // 尝试每个模型，直到成功
  for (let i = 0; i < modelList.length; i++) {
    const model = getNextModel(modelList, imageUrl);
    
    console.log(`🚀 调用 DMXAPI [${i + 1}/${modelList.length}]...`, model, imageUrl ? '(视觉)' : '');

    try {
      // 构建消息内容
      let content;
      if (imageUrl) {
        content = [
          { type: 'text', text: message || '请描述这张图片' },
          { type: 'image_url', image_url: { url: imageUrl } }
        ];
      } else {
        content = message;
      }

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'system',
              content: '你是 Lume，一个友好、聪明的 AI 助手。用简洁自然的语言回复用户。'
            },
            {
              role: 'user',
              content: content
            }
          ],
          temperature: 0.7,
          max_tokens: 1024
        })
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(`DMXAPI ${model} 响应错误:`, response.status, text);
        recordFailure(model);
        continue;  // 尝试下一个模型
      }

      const data = await response.json();
      
      // 提取响应内容
      const msg = data.choices?.[0]?.message;
      const responseContent = msg?.content || msg?.reasoning_content || '';
      
      if (!responseContent) {
        console.error(`❌ DMXAPI ${model} 返回空内容:`, data);
        recordFailure(model);
        continue;  // 尝试下一个模型
      }

      // 成功！
      recordSuccess(model);
      console.log(`✅ DMXAPI ${model} 调用成功`);
      return responseContent;
      
    } catch (error) {
      console.error(`模型 ${model} 调用异常:`, error.message);
      recordFailure(model);
      continue;  // 尝试下一个模型
    }
  }

  // 所有模型都失败了
  return '抱歉，AI 服务暂时不可用，请稍后再试。';
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

/**
 * 获取模型状态
 */
export function getModelStatus() {
  return {
    textModels: FREE_TEXT_MODELS.map(m => ({
      name: m,
      failures: modelFailures[m] || 0,
      available: (modelFailures[m] || 0) < MAX_FAILURES
    })),
    visionModels: FREE_VISION_MODELS.map(m => ({
      name: m,
      failures: modelFailures[m] || 0,
      available: (modelFailures[m] || 0) < MAX_FAILURES
    }))
  };
}
