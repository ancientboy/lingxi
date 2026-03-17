import nodemailer from 'nodemailer';
import { config } from '../config/index.js';

// SMTP 配置
const SMTP_HOST = config.email?.smtpHost || process.env.SMTP_HOST || 'smtp.qq.com';
const SMTP_PORT = parseInt(config.email?.smtpPort || process.env.SMTP_PORT || '465');
const SMTP_USER = config.email?.smtpUser || process.env.SMTP_USER || '';
const SMTP_PASS = config.email?.smtpPass || process.env.SMTP_PASS || '';
const FROM_EMAIL = config.email?.fromEmail || process.env.FROM_EMAIL || SMTP_USER;
const FROM_NAME = config.email?.fromName || process.env.FROM_NAME || 'LumeClaw';

// 创建 transporter
let transporter = null;

if (SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: true, // 465 端口使用 SSL
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
  
  // 验证配置
  transporter.verify((error, success) => {
    if (error) {
      console.error('❌ SMTP 配置验证失败:', error.message);
    } else {
      console.log('✅ SMTP 邮箱服务已就绪');
    }
  });
}

// 验证码存储（生产环境应该用 Redis）
const verificationCodes = new Map();

// 生成 6 位数字验证码
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// 发送验证码
export async function sendVerificationCode(email, type = 'register') {
  try {
    if (!transporter) {
      throw new Error('邮箱服务未配置，请联系管理员配置 SMTP');
    }

    const code = generateCode();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 分钟过期

    // 存储验证码
    verificationCodes.set(email, {
      code,
      expiresAt,
      type,
      createdAt: new Date().toISOString()
    });

    // 发送邮件
    const info = await transporter.sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to: email,
      subject: 'LumeClaw 验证码',
      text: `您的验证码是：${code}，5 分钟有效。如非本人操作，请忽略此邮件。`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #10a37f 0%, #0d8a6c 100%); color: white; padding: 40px 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 28px; }
            .header p { margin: 10px 0 0; opacity: 0.9; }
            .content { padding: 40px 30px; }
            .greeting { font-size: 18px; color: #333; margin-bottom: 20px; }
            .message { color: #666; line-height: 1.8; margin-bottom: 30px; }
            .code-box { background: linear-gradient(135deg, #e8f5f0 0%, #d4edda 100%); border-radius: 8px; padding: 30px; text-align: center; margin: 30px 0; }
            .code { font-size: 36px; font-weight: bold; color: #10a37f; letter-spacing: 12px; font-family: 'Courier New', monospace; }
            .expire { color: #999; font-size: 14px; margin-top: 15px; }
            .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .footer { background: #f8f9fa; padding: 20px 30px; text-align: center; color: #999; font-size: 12px; border-top: 1px solid #e9ecef; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 LumeClaw</h1>
              <p>验证码邮件</p>
            </div>
            <div class="content">
              <div class="greeting">您好，</div>
              <div class="message">
                您正在使用邮箱验证码进行${type === 'register' ? '注册' : type === 'login' ? '登录' : '安全验证'}。
              </div>
              
              <div class="code-box">
                <div class="code">${code}</div>
                <div class="expire">5 分钟内有效</div>
              </div>
              
              <div class="warning">
                <strong>⚠️ 安全提示：</strong>
                <ul style="margin: 10px 0 0 20px; padding: 0;">
                  <li>如非本人操作，请忽略此邮件</li>
                  <li>请勿将验证码告知他人</li>
                  <li>工作人员不会索要验证码</li>
                </ul>
              </div>
              
              <div class="message">
                感谢您的使用！<br>
                LumeClaw 团队
              </div>
            </div>
            <div class="footer">
              <p>© 2026 LumeClaw. All rights reserved.</p>
              <p>此邮件由系统自动发送，请勿回复</p>
            </div>
          </div>
        </body>
        </html>
      `
    });

    console.log(`✅ 验证码邮件已发送：${email}, Message ID: ${info.messageId}`);

    return { success: true, message: '验证码已发送' };
  } catch (error) {
    console.error('❌ 发送验证码失败:', error);
    throw error;
  }
}

// 验证验证码
export async function verifyCode(email, code) {
  try {
    const stored = verificationCodes.get(email);

    if (!stored) {
      return { success: false, error: '请先获取验证码' };
    }

    if (Date.now() > stored.expiresAt) {
      verificationCodes.delete(email);
      return { success: false, error: '验证码已过期' };
    }

    if (stored.code !== code) {
      return { success: false, error: '验证码错误' };
    }

    // 验证成功后删除验证码（防止重复使用）
    verificationCodes.delete(email);

    return { success: true, message: '验证成功' };
  } catch (error) {
    console.error('验证验证码失败:', error);
    throw error;
  }
}

// 清理过期的验证码（定期调用）
export function cleanupExpiredCodes() {
  const now = Date.now();
  for (const [email, data] of verificationCodes.entries()) {
    if (now > data.expiresAt) {
      verificationCodes.delete(email);
    }
  }
}

// 每分钟清理一次
setInterval(cleanupExpiredCodes, 60 * 1000);
