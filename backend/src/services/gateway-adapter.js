/**
 * Payment Gateway Adapter & Provider Integration
 * File: backend/src/services/gateway-adapter.js
 *
 * Implements compliant VNPay sandbox integration, HMAC-SHA512 checksums,
 * payment intent creation, webhook verification, and refund settlement.
 */

import crypto from 'node:crypto';

/**
 * Formats a Date or date string to VNPay 14-digit format (YYYYMMDDHHmmss) in GMT+7.
 */
export function formatVnpDate(dateInput) {
  if (!dateInput) return null;
  if (typeof dateInput === 'string' && /^\d{14}$/.test(dateInput)) {
    return dateInput;
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  // Convert UTC to Vietnam Time (GMT+7 = UTC + 7 hours)
  const gmt7Date = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  const YYYY = gmt7Date.getUTCFullYear();
  const MM = String(gmt7Date.getUTCMonth() + 1).padStart(2, '0');
  const DD = String(gmt7Date.getUTCDate()).padStart(2, '0');
  const HH = String(gmt7Date.getUTCHours()).padStart(2, '0');
  const mm = String(gmt7Date.getUTCMinutes()).padStart(2, '0');
  const ss = String(gmt7Date.getUTCSeconds()).padStart(2, '0');
  return `${YYYY}${MM}${DD}${HH}${mm}${ss}`;
}

export class PaymentGatewayService {
  constructor() {
    this.tmnCode = process.env.VNP_TMN_CODE || (process.env.NODE_ENV === 'production' ? null : 'DEMOTMN1');
    this.hashSecret = process.env.VNP_HASH_SECRET || (process.env.NODE_ENV === 'production' ? null : 'RAOEXHYVSDDIIENYWSLDIIZTANXUXZFJ');
    this.vnpUrl = process.env.VNP_URL || (process.env.NODE_ENV === 'production' ? null : 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html');
    this.refundUrl = process.env.VNP_REFUND_URL || null;
    this.webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET || (process.env.NODE_ENV === 'production' ? null : 'ticketflow-payment-webhook-secret-2026');
  }

  /**
   * Enforces mandatory, non-empty payment secrets on startup in production mode (TF-V3-P0-07, V8-08, V9-11).
   */
  validateProductionConfig() {
    if (process.env.NODE_ENV === 'production') {
      if (!process.env.VNP_TMN_CODE || !process.env.VNP_HASH_SECRET) {
        throw new Error('Fatal Configuration Error: VNP_TMN_CODE and VNP_HASH_SECRET are strictly required in production.');
      }
      if (!process.env.PAYMENT_WEBHOOK_SECRET) {
        throw new Error('Fatal Configuration Error: PAYMENT_WEBHOOK_SECRET is strictly required in production.');
      }
      if (!process.env.VNP_REFUND_URL || !process.env.VNP_REFUND_URL.startsWith('https://')) {
        throw new Error('Fatal Configuration Error: VNP_REFUND_URL (HTTPS) is strictly required in production for remote settlement and reconciliation.');
      }
      if (!process.env.VNP_URL || !process.env.VNP_URL.startsWith('https://')) {
        throw new Error('Fatal Configuration Error: VNP_URL (HTTPS) is strictly required in production.');
      }
      if (!process.env.VNP_RETURN_URL || !process.env.VNP_RETURN_URL.startsWith('https://')) {
        throw new Error('Fatal Configuration Error: VNP_RETURN_URL (HTTPS) is strictly required in production.');
      }
    }
  }

  /**
   * Builds compliant VNPay payment URL with sorted query parameters and HMAC-SHA512 signature.
   */
  createVNPayUrl({ orderId, orderCode, amount, ipAddr = '127.0.0.1', returnUrl = null }) {
    this.validateProductionConfig();
    const isProd = process.env.NODE_ENV === 'production';
    const createDate = formatVnpDate(new Date());
    const txnRef = String(orderCode || orderId);

    const targetReturnUrl = returnUrl || process.env.VNP_RETURN_URL || (isProd ? null : `http://localhost:5173/orders/${orderId}/receipt`);
    if (!targetReturnUrl) {
      const err = new Error('Payment return URL (VNP_RETURN_URL) is not configured in production mode.');
      err.statusCode = 500;
      throw err;
    }
    const targetPaymentUrl = this.vnpUrl || process.env.VNP_URL || (isProd ? null : 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html');
    if (!targetPaymentUrl) {
      const err = new Error('Payment gateway URL (VNP_URL) is not configured in production mode.');
      err.statusCode = 500;
      throw err;
    }

    const vnpParams = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: this.tmnCode || process.env.VNP_TMN_CODE || 'DEMOTMN1',
      vnp_Locale: 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: txnRef,
      vnp_OrderInfo: `Thanh toan don hang ${txnRef}`,
      vnp_OrderType: 'other',
      vnp_Amount: Math.round(Number(amount) * 100),
      vnp_ReturnUrl: targetReturnUrl,
      vnp_IpAddr: ipAddr || '127.0.0.1',
      vnp_CreateDate: createDate,
    };

    const sortedKeys = Object.keys(vnpParams).sort();
    const signData = sortedKeys
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(vnpParams[key]))}`)
      .join('&');

    const secret = this.hashSecret || process.env.VNP_HASH_SECRET || 'RAOEXHYVSDDIIENYWSLDIIZTANXUXZFJ';
    const hmac = crypto.createHmac('sha512', secret);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
    vnpParams['vnp_SecureHash'] = signed;

    const queryString = sortedKeys
      .concat('vnp_SecureHash')
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(vnpParams[key]))}`)
      .join('&');

    return `${targetPaymentUrl}?${queryString}`;
  }

  /**
   * Verifies incoming VNPay callback parameters using HMAC-SHA512.
   */
  verifyVNPaySignature(queryObj = {}) {
    this.validateProductionConfig();
    const secureHash = queryObj['vnp_SecureHash'];
    if (!secureHash) return false;

    const cleanParams = { ...queryObj };
    delete cleanParams['vnp_SecureHash'];
    delete cleanParams['vnp_SecureHashType'];

    const sortedKeys = Object.keys(cleanParams).sort();
    const signData = sortedKeys
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(cleanParams[key]))}`)
      .join('&');

    const secret = this.hashSecret || process.env.VNP_HASH_SECRET || 'RAOEXHYVSDDIIENYWSLDIIZTANXUXZFJ';
    const hmac = crypto.createHmac('sha512', secret);
    const computedHash = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    const a = Buffer.from(String(secureHash).toLowerCase(), 'utf-8');
    const b = Buffer.from(computedHash.toLowerCase(), 'utf-8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  /**
   * Signs a standard payment webhook payload using HMAC-SHA256.
   */
  signWebhookPayload(payload) {
    const secret = this.webhookSecret || process.env.PAYMENT_WEBHOOK_SECRET || 'ticketflow-payment-webhook-secret-2026';
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Verifies standard payment webhook signature using constant-time comparison.
   */
  verifyWebhookSignature(payload, signature) {
    this.validateProductionConfig();
    if (!signature) return false;
    const expected = this.signWebhookPayload(payload);
    const a = Buffer.from(String(signature), 'utf8');
    const b = Buffer.from(expected, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  /**
   * Verifies payment gateway refund response signature using constant-time comparison (TF-V4-P0-01, V6-09).
   * Strictly adheres to official VNPay Merchant WebAPI 2.1.0 refund format:
   * vnp_ResponseId|vnp_Command|vnp_ResponseCode|vnp_Message|vnp_TmnCode|vnp_TxnRef|vnp_Amount|vnp_BankCode|vnp_PayDate|vnp_TransactionNo|vnp_TransactionType|vnp_TransactionStatus|vnp_OrderInfo
   */
  verifyRefundResponseSignature(responseData) {
    if (!responseData || !responseData.vnp_SecureHash) {
      return false;
    }
    const secret = this.hashSecret || process.env.VNP_HASH_SECRET || 'RAOEXHYVSDDIIENYWSLDIIZTANXUXZFJ';

    // Format per VNPay Refund specification 2.1.0:
    const fields = [
      responseData.vnp_ResponseId ?? '',
      responseData.vnp_Command ?? '',
      responseData.vnp_ResponseCode ?? '',
      responseData.vnp_Message ?? '',
      responseData.vnp_TmnCode ?? '',
      responseData.vnp_TxnRef ?? '',
      responseData.vnp_Amount != null ? String(responseData.vnp_Amount) : '',
      responseData.vnp_BankCode ?? '',
      responseData.vnp_PayDate ?? '',
      responseData.vnp_TransactionNo ?? '',
      responseData.vnp_TransactionType ?? '',
      responseData.vnp_TransactionStatus ?? '',
      responseData.vnp_OrderInfo ?? '',
    ];
    const dataToHash = fields.join('|');
    const calculatedHash = crypto.createHmac('sha512', secret).update(Buffer.from(dataToHash, 'utf-8')).digest('hex');

    const a = Buffer.from(String(responseData.vnp_SecureHash).toLowerCase(), 'utf8');
    const b = Buffer.from(calculatedHash.toLowerCase(), 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  /**
   * Executes refund request through payment gateway provider.
   * In production runtime, performs real signed HTTP call to provider endpoint or fails closed (HTTP 502).
   * Mocks are strictly prohibited in production mode (TF-V4-P0-01, TF-V4-P0-02, V6-01, V6-02).
   */
  async executeGatewayRefund({
    orderId,
    providerTxnRef = null,
    orderCode = null,
    transactionId,
    amount,
    refundId,
    providerRequestId = null,
    reason = 'Customer requested refund',
    allowMock = false,
    createDate = null,
    ipAddr = '127.0.0.1',
    transactionType = null,
    originalAmount = null,
    targetUrl = null,
  }) {
    if (!transactionId) {
      if (Number(amount) > 0) {
        const err = new Error('Cannot execute remote gateway refund for paid order without valid transaction reference (vnp_TransactionNo).');
        err.statusCode = 400;
        throw err;
      }
      return {
        settled: true,
        accepted: true,
        gateway_refund_id: `LOCAL-ZERO-${refundId}`,
        message: 'No external gateway charge found; local settlement confirmed.',
      };
    }

    const isProd = process.env.NODE_ENV === 'production';
    if (isProd && allowMock) {
      const err = new Error('Mock refund settlement is strictly prohibited in production mode.');
      err.statusCode = 400;
      throw err;
    }

    const finalTargetUrl = targetUrl || this.refundUrl || process.env.VNP_REFUND_URL;

    // In production without configured refund endpoint, fail closed (V8-08)
    if (isProd && !finalTargetUrl) {
      const err = new Error('Production gateway refund provider is not configured or reachable. Remote settlement aborted to prevent ledger divergence.');
      err.statusCode = 502;
      throw err;
    }

    // In dev / test with allowMock flag and no explicit endpoint, permit offline mock settlement
    if (!isProd && allowMock && !finalTargetUrl) {
      const timestamp = new Date().toISOString();
      const signPayload = `${orderId}|${transactionId}|${amount}|${refundId}|${timestamp}`;
      const secret = this.hashSecret || 'RAOEXHYVSDDIIENYWSLDIIZTANXUXZFJ';
      const refundHash = crypto.createHmac('sha256', secret).update(signPayload).digest('hex');

      return {
        settled: true,
        accepted: true,
        mock: true,
        gateway_refund_id: `GW-REF-MOCK-${Date.now()}-${refundId}`,
        provider: 'VNPAY',
        refund_hash: refundHash,
        amount,
        settled_at: timestamp,
        message: 'Mock sandbox refund settlement confirmed.',
      };
    }

    // Real signed HTTP POST call to gateway refund endpoint
    const endpoint = finalTargetUrl || (isProd ? null : 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction');
    if (!endpoint) {
      const err = new Error('Gateway refund endpoint is not configured in production mode.');
      err.statusCode = 502;
      throw err;
    }
    const reqDate = formatVnpDate(new Date());
    const txnDate = createDate ? (formatVnpDate(createDate) || reqDate) : reqDate;

    // Strictly immutable provider request ID across retries (V6-01)
    const immutableRequestId = String(providerRequestId || refundId);
    if (!immutableRequestId || immutableRequestId === 'undefined') {
      const err = new Error('Immutable provider_request_id is strictly required for gateway refund execution.');
      err.statusCode = 400;
      throw err;
    }
    const requestId = immutableRequestId;

    const secret = this.hashSecret || process.env.VNP_HASH_SECRET || 'RAOEXHYVSDDIIENYWSLDIIZTANXUXZFJ';
    const tmnCode = this.tmnCode || process.env.VNP_TMN_CODE || 'DEMOTMN1';

    let determinedTxnType = transactionType;
    if (!determinedTxnType) {
      if (originalAmount != null && Number(amount) < Number(originalAmount)) {
        determinedTxnType = '03'; // 03: Partial refund (V9-06)
      } else {
        determinedTxnType = '02'; // 02: Full refund
      }
    }

    const vnp_RequestId = String(requestId);
    const vnp_Version = '2.1.0';
    const vnp_Command = 'refund';
    const vnp_TmnCode = String(tmnCode);
    const vnp_TransactionType = String(determinedTxnType);
    const vnp_TxnRef = String(providerTxnRef || orderCode || orderId);
    const vnp_Amount = Math.round(Number(amount) * 100);
    const vnp_TransactionNo = String(transactionId);
    const vnp_TransactionDate = String(txnDate);
    const vnp_CreateBy = 'TicketFlow System';
    const vnp_CreateDate = reqDate;
    const vnp_IpAddr = ipAddr || '127.0.0.1';
    const vnp_OrderInfo = `Hoan tien don hang ${vnp_TxnRef}: ${reason}`;

    const dataToHash = [
      vnp_RequestId,
      vnp_Version,
      vnp_Command,
      vnp_TmnCode,
      vnp_TransactionType,
      vnp_TxnRef,
      vnp_Amount,
      vnp_TransactionNo,
      vnp_TransactionDate,
      vnp_CreateBy,
      vnp_CreateDate,
      vnp_IpAddr,
      vnp_OrderInfo,
    ].join('|');

    const vnp_SecureHash = crypto.createHmac('sha512', secret).update(Buffer.from(dataToHash, 'utf-8')).digest('hex');

    const requestBody = {
      vnp_RequestId,
      vnp_Version,
      vnp_Command,
      vnp_TmnCode,
      vnp_TransactionType,
      vnp_TxnRef,
      vnp_Amount,
      vnp_TransactionNo,
      vnp_TransactionDate,
      vnp_CreateBy,
      vnp_CreateDate,
      vnp_IpAddr,
      vnp_OrderInfo,
      vnp_SecureHash,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const err = new Error(`Payment gateway refund HTTP error: ${response.status} ${response.statusText}`);
        err.statusCode = 502;
        throw err;
      }

      const responseData = await response.json();

      // 1. Mandatory field presence verification per VNPay Refund API Contract (V6-02, V7-08)
      const mandatoryFields = [
        'vnp_ResponseId',
        'vnp_Command',
        'vnp_ResponseCode',
        'vnp_TmnCode',
        'vnp_TxnRef',
        'vnp_Amount',
        'vnp_TransactionStatus',
        'vnp_BankCode',
        'vnp_TransactionNo',
        'vnp_TransactionType',
        'vnp_SecureHash',
      ];
      for (const field of mandatoryFields) {
        if (responseData[field] === undefined || responseData[field] === null || String(responseData[field]).trim() === '') {
          const err = new Error(`Payment gateway refund response missing mandatory field: ${field}`);
          err.statusCode = 502;
          err.gatewayResponse = responseData;
          throw err;
        }
      }

      // 2. Verify refund response signature integrity (TF-V4-P0-01, V6-02)
      const isValidSig = this.verifyRefundResponseSignature(responseData);
      if (!isValidSig) {
        const sigErr = new Error('Payment gateway refund response signature verification failed. Untrusted remote response rejected.');
        sigErr.statusCode = 502;
        sigErr.gatewayResponse = responseData;
        throw sigErr;
      }

      // 3. Strict response binding checks (TF-V4-P0-01, V6-02, V7-08, V9-01)
      if (String(responseData.vnp_TxnRef) !== vnp_TxnRef) {
        const err = new Error(`Payment gateway refund response binding error: txnRef mismatch (expected ${vnp_TxnRef}, got ${responseData.vnp_TxnRef})`);
        err.statusCode = 502;
        throw err;
      }
      if (Number(responseData.vnp_Amount) !== Math.round(Number(amount) * 100)) {
        const err = new Error(`Payment gateway refund response binding error: amount mismatch (expected ${Math.round(Number(amount) * 100)}, got ${responseData.vnp_Amount})`);
        err.statusCode = 502;
        throw err;
      }
      if (String(responseData.vnp_TmnCode) !== String(tmnCode)) {
        const err = new Error(`Payment gateway refund response binding error: tmnCode mismatch (expected ${tmnCode}, got ${responseData.vnp_TmnCode})`);
        err.statusCode = 502;
        throw err;
      }
      if (responseData.vnp_Command !== 'refund') {
        const err = new Error(`Payment gateway refund response binding error: unexpected command '${responseData.vnp_Command}'`);
        err.statusCode = 502;
        throw err;
      }
      if (String(responseData.vnp_TransactionType) !== String(determinedTxnType)) {
        const err = new Error(`Payment gateway refund response binding error: transaction type mismatch (expected ${determinedTxnType}, got ${responseData.vnp_TransactionType})`);
        err.statusCode = 502;
        throw err;
      }
      if (!responseData.vnp_TransactionNo || String(responseData.vnp_TransactionNo).trim() === '') {
        const err = new Error('Payment gateway refund response missing valid vnp_TransactionNo');
        err.statusCode = 502;
        throw err;
      }

      // 4. Response code & Transaction status verification (V6-02)
      if (responseData.vnp_ResponseCode !== '00') {
        const err = new Error(`Payment gateway refund rejected: code ${responseData.vnp_ResponseCode} - ${responseData.vnp_Message || 'Unknown gateway error'}`);
        err.statusCode = 400;
        err.gatewayResponse = responseData;
        throw err;
      }

      if (responseData.vnp_TransactionStatus !== '00') {
        const err = new Error(`Payment gateway refund transaction status unsuccessful: status ${responseData.vnp_TransactionStatus}`);
        err.statusCode = 502;
        err.gatewayResponse = responseData;
        throw err;
      }

      // 5. Authoritative provider reference verification (do not fake gateway_refund_id)
      const realProviderRef = responseData.vnp_ResponseId || responseData.vnp_TransactionNo;
      if (!realProviderRef) {
        const err = new Error('Payment gateway refund response missing authoritative provider reference (vnp_ResponseId/vnp_TransactionNo).');
        err.statusCode = 502;
        throw err;
      }

      return {
        settled: true,
        accepted: true,
        mock: false,
        gateway_refund_id: String(realProviderRef),
        provider: 'VNPAY',
        response_code: responseData.vnp_ResponseCode,
        transaction_status: responseData.vnp_TransactionStatus,
        amount,
        provider_request_id: vnp_RequestId,
        message: 'Gateway refund approved and settlement confirmed by provider.',
      };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.statusCode) throw err;

      // Distinguish network timeout / disconnect from business logic failure (V6-03)
      const isTimeout = err.name === 'AbortError' || err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET';
      const gatewayErr = new Error(`Payment gateway communication failure: ${err.message}`);
      gatewayErr.statusCode = 502;
      gatewayErr.isNetworkTimeout = isTimeout;
      throw gatewayErr;
    }
  }

  /**
   * Verifies payment gateway querydr response signature using HMAC-SHA512 constant-time comparison (V7-01).
   * Strictly adheres to official VNPay Merchant WebAPI 2.1.0 querydr response format:
   * vnp_ResponseId|vnp_Command|vnp_ResponseCode|vnp_Message|vnp_TmnCode|vnp_TxnRef|vnp_Amount|vnp_BankCode|vnp_PayDate|vnp_TransactionNo|vnp_TransactionType|vnp_TransactionStatus|vnp_OrderInfo|vnp_PromotionCode|vnp_PromotionAmount
   */
  verifyQuerydrResponseSignature(responseData) {
    if (!responseData || !responseData.vnp_SecureHash) {
      return false;
    }
    const secret = this.hashSecret || process.env.VNP_HASH_SECRET || 'RAOEXHYVSDDIIENYWSLDIIZTANXUXZFJ';

    const fields = [
      responseData.vnp_ResponseId ?? '',
      responseData.vnp_Command ?? '',
      responseData.vnp_ResponseCode ?? '',
      responseData.vnp_Message ?? '',
      responseData.vnp_TmnCode ?? '',
      responseData.vnp_TxnRef ?? '',
      responseData.vnp_Amount != null ? String(responseData.vnp_Amount) : '',
      responseData.vnp_BankCode ?? '',
      responseData.vnp_PayDate ?? '',
      responseData.vnp_TransactionNo ?? '',
      responseData.vnp_TransactionType ?? '',
      responseData.vnp_TransactionStatus ?? '',
      responseData.vnp_OrderInfo ?? '',
      responseData.vnp_PromotionCode ?? '',
      responseData.vnp_PromotionAmount != null ? String(responseData.vnp_PromotionAmount) : '',
    ];
    const dataToHash = fields.join('|');
    const calculatedHash = crypto.createHmac('sha512', secret).update(Buffer.from(dataToHash, 'utf-8')).digest('hex');

    const a = Buffer.from(String(responseData.vnp_SecureHash).toLowerCase(), 'utf8');
    const b = Buffer.from(calculatedHash.toLowerCase(), 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  /**
   * Queries transaction status from VNPay (Command: querydr) with strict HMAC signature
   * verification and response binding (V6-04, V7-01, V7-09).
   */
  async queryTransactionStatus({
    orderId,
    txnRef = null,
    orderCode = null,
    providerTxnRef = null,
    txnDate,
    amount = null,
    originalAmount = null,
    expectedAmounts = null,
    expectedTransactionType = null,
    requestId = null,
    ipAddr = '127.0.0.1',
    allowMock = false,
  }) {
    this.validateProductionConfig();

    if (!orderId) {
      const err = new Error('orderId is required for querydr transaction query');
      err.statusCode = 400;
      throw err;
    }

    if (!txnDate) {
      const err = new Error('Original payment transaction date (txnDate) is required for VNPay querydr');
      err.statusCode = 400;
      throw err;
    }

    const formattedTxnDate = formatVnpDate(txnDate);
    if (!formattedTxnDate) {
      const err = new Error('Invalid payment transaction date format for querydr');
      err.statusCode = 400;
      throw err;
    }

    const targetUrl = this.refundUrl || process.env.VNP_REFUND_URL || (process.env.NODE_ENV === 'production' ? null : 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction');
    if (process.env.NODE_ENV === 'production' && !targetUrl) {
      const err = new Error('Production gateway endpoint is not configured for querydr (missing VNP_REFUND_URL)');
      err.statusCode = 502;
      throw err;
    }

    const reqDate = formatVnpDate(new Date());
    const queryRequestId = String(requestId || `QDR-${Date.now()}-${orderId}`);
    const secret = this.hashSecret || process.env.VNP_HASH_SECRET || 'RAOEXHYVSDDIIENYWSLDIIZTANXUXZFJ';
    const tmnCode = this.tmnCode || process.env.VNP_TMN_CODE || 'DEMOTMN1';

    const vnp_RequestId = queryRequestId;
    const vnp_Version = '2.1.0';
    const vnp_Command = 'querydr';
    const vnp_TmnCode = String(tmnCode);
    const vnp_TxnRef = String(txnRef || providerTxnRef || orderCode || orderId);
    const vnp_OrderInfo = `Truy van don hang ${vnp_TxnRef}`;
    const vnp_TransactionDate = String(formattedTxnDate);
    const vnp_CreateDate = reqDate;
    const vnp_IpAddr = ipAddr || '127.0.0.1';

    const dataToHash = [
      vnp_RequestId,
      vnp_Version,
      vnp_Command,
      vnp_TmnCode,
      vnp_TxnRef,
      vnp_TransactionDate,
      vnp_CreateDate,
      vnp_IpAddr,
      vnp_OrderInfo,
    ].join('|');

    const vnp_SecureHash = crypto.createHmac('sha512', secret).update(Buffer.from(dataToHash, 'utf-8')).digest('hex');

    const requestBody = {
      vnp_RequestId,
      vnp_Version,
      vnp_Command,
      vnp_TmnCode,
      vnp_TxnRef,
      vnp_TransactionDate,
      vnp_CreateDate,
      vnp_IpAddr,
      vnp_OrderInfo,
      vnp_SecureHash,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const err = new Error(`querydr HTTP error: ${response.status} ${response.statusText}`);
        err.statusCode = 502;
        throw err;
      }

      const responseData = await response.json();

      // 1. Mandatory field presence verification (V7-01)
      const mandatoryFields = [
        'vnp_ResponseId',
        'vnp_Command',
        'vnp_ResponseCode',
        'vnp_TmnCode',
        'vnp_TxnRef',
        'vnp_Amount',
        'vnp_TransactionStatus',
        'vnp_SecureHash',
      ];
      for (const field of mandatoryFields) {
        if (responseData[field] === undefined || responseData[field] === null || String(responseData[field]).trim() === '') {
          const err = new Error(`Payment gateway querydr response missing mandatory field: ${field}`);
          err.statusCode = 502;
          err.gatewayResponse = responseData;
          throw err;
        }
      }

      // 2. Strict HMAC-SHA512 signature verification (V7-01)
      const isValidSig = this.verifyQuerydrResponseSignature(responseData);
      if (!isValidSig) {
        const sigErr = new Error('Payment gateway querydr response signature verification failed. Untrusted remote response rejected.');
        sigErr.statusCode = 502;
        sigErr.gatewayResponse = responseData;
        throw sigErr;
      }

      // 3. Strict response binding checks (V7-01, V8-02, V9-04)
      if (String(responseData.vnp_TxnRef) !== vnp_TxnRef) {
        const err = new Error(`Payment gateway querydr response binding error: txnRef mismatch (expected ${vnp_TxnRef}, got ${responseData.vnp_TxnRef})`);
        err.statusCode = 502;
        throw err;
      }
      if (String(responseData.vnp_TmnCode) !== String(tmnCode)) {
        const err = new Error(`Payment gateway querydr response binding error: tmnCode mismatch (expected ${tmnCode}, got ${responseData.vnp_TmnCode})`);
        err.statusCode = 502;
        throw err;
      }
      if (responseData.vnp_Command !== 'querydr') {
        const err = new Error(`Payment gateway querydr response binding error: unexpected command '${responseData.vnp_Command}'`);
        err.statusCode = 502;
        throw err;
      }

      // 3b. Strict Transaction Type and Amount binding (V9-07, V10-P1-02)
      const respTxnType = responseData.vnp_TransactionType;
      const respAmt = Number(responseData.vnp_Amount);

      if (expectedTransactionType && respTxnType && String(respTxnType) !== String(expectedTransactionType)) {
        const err = new Error(`Payment gateway querydr response binding error: transaction type mismatch (expected ${expectedTransactionType}, got ${respTxnType})`);
        err.statusCode = 502;
        throw err;
      }

      if (respTxnType === '03') {
        // Partial refund (03): MUST match partial refund amount (req.amount)
        if (amount != null) {
          const expectedPartialAmt = Math.round(Number(amount) * 100);
          if (respAmt !== expectedPartialAmt) {
            const err = new Error(`Payment gateway querydr response binding error: partial refund amount mismatch for type 03 (expected ${expectedPartialAmt}, got ${respAmt})`);
            err.statusCode = 502;
            throw err;
          }
        }
      } else if (respTxnType === '02') {
        // Full refund (02): MUST match full original amount
        const expectedFullAmt = Math.round(Number(originalAmount != null ? originalAmount : amount) * 100);
        if (respAmt !== expectedFullAmt) {
          const err = new Error(`Payment gateway querydr response binding error: full refund amount mismatch for type 02 (expected ${expectedFullAmt}, got ${respAmt})`);
          err.statusCode = 502;
          throw err;
        }
      } else if (respTxnType === '01') {
        // Direct payment (01): MUST match original payment total
        const expectedPayAmt = Math.round(Number(originalAmount != null ? originalAmount : amount) * 100);
        if (respAmt !== expectedPayAmt) {
          const err = new Error(`Payment gateway querydr response binding error: payment amount mismatch for type 01 (expected ${expectedPayAmt}, got ${respAmt})`);
          err.statusCode = 502;
          throw err;
        }
      } else if (amount != null || originalAmount != null || Array.isArray(expectedAmounts)) {
        // Fallback for untyped or legacy responses
        const validAmounts = [];
        if (amount != null) validAmounts.push(Math.round(Number(amount) * 100));
        if (originalAmount != null) validAmounts.push(Math.round(Number(originalAmount) * 100));
        if (Array.isArray(expectedAmounts)) {
          validAmounts.push(...expectedAmounts.map((a) => Math.round(Number(a) * 100)));
        }
        if (validAmounts.length > 0 && !validAmounts.includes(respAmt)) {
          const err = new Error(`Payment gateway querydr response binding error: amount mismatch (expected one of [${validAmounts.join(', ')}], got ${respAmt})`);
          err.statusCode = 502;
          throw err;
        }
      }

      // 4. Strict validation for successful querydr response contract (V8-11)
      if (responseData.vnp_ResponseCode === '00') {
        if (!responseData.vnp_TransactionNo || String(responseData.vnp_TransactionNo).trim() === '') {
          const err = new Error('Payment gateway querydr response missing mandatory vnp_TransactionNo for successful transaction (code 00)');
          err.statusCode = 502;
          err.gatewayResponse = responseData;
          throw err;
        }
        if (!responseData.vnp_TransactionType || String(responseData.vnp_TransactionType).trim() === '') {
          const err = new Error('Payment gateway querydr response missing mandatory vnp_TransactionType for successful transaction (code 00)');
          err.statusCode = 502;
          err.gatewayResponse = responseData;
          throw err;
        }
      }

      return {
        verified: true,
        response_code: responseData.vnp_ResponseCode,
        transaction_status: responseData.vnp_TransactionStatus,
        vnp_ResponseCode: responseData.vnp_ResponseCode,
        vnp_TransactionStatus: responseData.vnp_TransactionStatus,
        transaction_no: responseData.vnp_TransactionNo,
        transaction_type: responseData.vnp_TransactionType,
        vnp_TransactionType: responseData.vnp_TransactionType,
        amount: Number(responseData.vnp_Amount) / 100,
        raw_amount: Number(responseData.vnp_Amount),
        bank_code: responseData.vnp_BankCode,
        pay_date: responseData.vnp_PayDate,
        message: responseData.vnp_Message,
        response_id: responseData.vnp_ResponseId,
        raw: responseData,
        raw_response: responseData,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.statusCode) throw err;
      const isTimeout = err.name === 'AbortError' || err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET';
      const gatewayErr = new Error(`Payment gateway querydr communication failure: ${err.message}`);
      gatewayErr.statusCode = 502;
      gatewayErr.isNetworkTimeout = isTimeout;
      throw gatewayErr;
    }
  }
}

export default new PaymentGatewayService();
