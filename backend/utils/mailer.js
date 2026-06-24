/**
 * 验证码邮件发送（SMTP）
 */
import nodemailer from 'nodemailer';
import { config } from '../config/index.js';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const smtp = config.email?.smtp;
  if (!smtp?.host) return null;

  transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  });
  return transporter;
}

function buildVerificationEmailHtml(code, minutes = 10) {
  const brand = config.email.fromName || 'Lume';
  const site = config.email.siteUrl || 'https://lumeword.cn';
  const digits = code.split('').join(' ');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>登录验证码</title>
</head>
<body style="margin:0;padding:0;background:#f3f1ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f1ec;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background:#ffffff;border-radius:20px;border:1px solid #e8e6e1;box-shadow:0 8px 32px rgba(0,0,0,0.06);">
          <tr>
            <td style="padding:36px 32px 28px;text-align:center;">
              <div style="width:40px;height:40px;margin:0 auto 20px;border-radius:10px;background:#1a1a1a;color:#fff;font-weight:700;font-size:18px;line-height:40px;">L</div>
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#1a1a1a;line-height:1.3;">登录 ${brand}</h1>
              <p style="margin:0;font-size:15px;color:#525252;line-height:1.5;">在登录页输入下方验证码即可完成登录</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 28px;text-align:center;">
              <div style="display:inline-block;padding:20px 28px;background:#fbfaf8;border:1px solid #e8e6e1;border-radius:14px;">
                <span style="font-size:32px;font-weight:700;letter-spacing:0.35em;color:#1a1a1a;font-variant-numeric:tabular-nums;">${digits}</span>
              </div>
              <p style="margin:18px 0 0;font-size:13px;color:#8a8a8a;">验证码 ${minutes} 分钟内有效，请勿泄露给他人</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 32px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#8a8a8a;line-height:1.6;">
                如非本人操作，可忽略此邮件。<br>
                访问 <a href="${site}" style="color:#3d6b62;text-decoration:none;">${site.replace(/^https?:\/\//, '')}</a>
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:20px 0 0;font-size:11px;color:#8a8a8a;">© ${brand}</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendVerificationCodeEmail(email, code) {
  const from = config.email.from;
  const fromName = config.email.fromName || 'Lume';
  const transport = getTransporter();
  const minutes = 10;

  const mail = {
    from: from ? `"${fromName}" <${from}>` : undefined,
    to: email,
    subject: `${code} 是您的 ${fromName} 登录验证码`,
    text: `你的登录验证码是：${code}，${minutes} 分钟内有效。如非本人操作请忽略此邮件。`,
    html: buildVerificationEmailHtml(code, minutes),
  };

  if (!transport || !from) {
    console.log(`📧 [邮件未配置 SMTP] 验证码 → ${email}: ${code}`);
    return { sent: false, devLogged: true };
  }

  await transport.sendMail(mail);
  console.log(`📧 验证码已发送至 ${email}`);
  return { sent: true };
}

export function isEmailConfigured() {
  return !!(config.email?.smtp?.host && config.email?.from);
}
