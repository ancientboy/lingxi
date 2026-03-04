/**
 * 支付宝支付服务
 */

import crypto from 'crypto';

class AlipayService {
  constructor(config) {
    this.appId = config.appId;
    this.privateKey = this.formatPrivateKey(config.privateKey);
    this.alipayPublicKey = this.formatPublicKey(config.alipayPublicKey);
    this.gateway = config.sandbox 
      ? 'https://openapi.alipaydev.com/gateway.do'
      : 'https://openapi.alipay.com/gateway.do';
    this.notifyUrl = config.notifyUrl;
    this.returnUrl = config.returnUrl;
    this.charset = 'utf-8';
    this.signType = 'RSA2';
  }

  sign(params) {
    const sortedParams = Object.keys(params)
      .filter(key => params[key] !== undefined && params[key] !== '' && key !== 'sign')
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(sortedParams);
    return sign.sign(this.privateKey, 'base64');
  }

  verify(params) {
    let sign = params.sign;
    const signType = params.sign_type;
    
    if (!sign) return false;
    
    // URL 解码 sign
    try {
      sign = decodeURIComponent(sign);
    } catch (e) {
      console.log('[签名解码失败]', e.message);
    }

    const sortedParams = Object.keys(params)
      .filter(key => params[key] !== undefined && params[key] !== '' && key !== 'sign' && key !== 'sign_type')
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');

    console.log('[验签] 待签名字符串长度:', sortedParams.length);
    console.log('[验签] sign长度:', sign.length);
    
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(sortedParams);
    
    const result = verify.verify(this.alipayPublicKey, sign, 'base64');
    console.log('[验签结果]', result);
    
    return result;
  }

  formatPublicKey(key) {
    const cleanKey = key.replace(/\s+/g, '');
    return `-----BEGIN PUBLIC KEY-----\n${cleanKey}\n-----END PUBLIC KEY-----`;
  }

  formatPrivateKey(key) {
    const cleanKey = key.replace(/\s+/g, '');
    return `-----BEGIN PRIVATE KEY-----\n${cleanKey}\n-----END PRIVATE KEY-----`;
  }

  buildRequestUrl(method, bizContent, additionalParams = {}) {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    const params = {
      app_id: this.appId,
      method,
      format: 'JSON',
      charset: this.charset,
      sign_type: this.signType,
      timestamp,
      version: '1.0',
      biz_content: JSON.stringify(bizContent),
      ...additionalParams
    };

    if (this.notifyUrl) params.notify_url = this.notifyUrl;
    if (this.returnUrl) params.return_url = this.returnUrl;

    params.sign = this.sign(params);

    const queryString = Object.keys(params)
      .map(key => `${key}=${encodeURIComponent(params[key])}`)
      .join('&');

    return `${this.gateway}?${queryString}`;
  }

  createPagePay(order) {
    const bizContent = {
      out_trade_no: order.outTradeNo,
      total_amount: order.totalAmount,
      subject: order.subject,
      body: order.body,
      product_code: 'FAST_INSTANT_TRADE_PAY'
    };
    return this.buildRequestUrl('alipay.trade.page.pay', bizContent);
  }

  createWapPay(order) {
    const bizContent = {
      out_trade_no: order.outTradeNo,
      total_amount: order.totalAmount,
      subject: order.subject,
      body: order.body,
      product_code: 'QUICK_WAP_WAY'
    };
    return this.buildRequestUrl('alipay.trade.wap.pay', bizContent);
  }

  createAppPay(order) {
    const bizContent = {
      out_trade_no: order.outTradeNo,
      total_amount: order.totalAmount,
      subject: order.subject,
      body: order.body,
      product_code: 'QUICK_MSECURITY_PAY'
    };
    return this.buildRequestUrl('alipay.trade.app.pay', bizContent);
  }

  queryOrder(outTradeNo) {
    return this.buildRequestUrl('alipay.trade.query', { out_trade_no: outTradeNo });
  }

  closeOrder(outTradeNo) {
    return this.buildRequestUrl('alipay.trade.close', { out_trade_no: outTradeNo });
  }

  refund(order) {
    const bizContent = {
      out_trade_no: order.outTradeNo,
      refund_amount: order.refundAmount,
      refund_reason: order.refundReason || '用户申请退款',
      out_request_no: order.outRequestNo || `refund_${Date.now()}`
    };
    return this.buildRequestUrl('alipay.trade.refund', bizContent);
  }

  parseNotify(params) {
    console.log('[收到回调] 参数keys:', Object.keys(params).join(','));
    
    if (!this.verify(params)) {
      throw new Error('签名验证失败');
    }

    return {
      outTradeNo: params.out_trade_no,
      tradeNo: params.trade_no,
      tradeStatus: params.trade_status,
      totalAmount: params.total_amount,
      buyerId: params.buyer_id,
      gmtPayment: params.gmt_payment,
      notifyTime: params.notify_time
    };
  }
}

export default AlipayService;
