import ordersService from '../services/orders.service.js';
import eventsService from '../services/events.service.js';

function extractSessionToken(req) {
  return (
    req.headers['x-order-token'] ||
    req.headers['x-session-token'] ||
    req.headers['x-guest-token'] ||
    req.cookies?.order_session_token ||
    req.body?.order_token ||
    req.body?.session_token ||
    req.body?.guest_session_token ||
    req.query?.token ||
    null
  );
}

class OrdersController {
  async reserve(req, res, next) {
    try {
      const eventId = req.params.id || req.body.event_id;
      const { items, promo_code } = req.body;
      const result = await ordersService.reserveOrder({
        eventId,
        items,
        promoCode: promo_code,
        user: req.user,
      });
      if (result.session_token) {
        res.cookie('order_session_token', result.session_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 15 * 60 * 1000,
        });
      }
      return res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const sessionToken = extractSessionToken(req);
      const order = await ordersService.getOrderById(id, req.user, sessionToken);
      return res.status(200).json({ order });
    } catch (err) {
      next(err);
    }
  }

  async checkout(req, res, next) {
    try {
      const { id } = req.params;
      const { buyer, attendees, payment_method, payment_intent_id } = req.body;
      const sessionToken = extractSessionToken(req);
      const result = await ordersService.checkoutOrder(id, {
        buyer,
        attendees,
        payment_method,
        payment_intent_id,
        user: req.user || null,
        sessionToken,
      });
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async cancel(req, res, next) {
    try {
      const { id } = req.params;
      const sessionToken = extractSessionToken(req);
      const result = await ordersService.cancelOrder(id, req.user, sessionToken);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async getAttendees(req, res, next) {
    try {
      const { id } = req.params;
      const attendees = await ordersService.getAttendeesByEvent(id, req.user);
      return res.status(200).json({ attendees });
    } catch (err) {
      next(err);
    }
  }

  async createAttendee(req, res, next) {
    try {
      const { id } = req.params;
      const attendee = await ordersService.createGuestAttendee(id, req.body, req.user);
      return res.status(201).json({
        message: 'Guest attendee ticket created successfully',
        attendee,
      });
    } catch (err) {
      next(err);
    }
  }

  async updateAttendee(req, res, next) {
    try {
      const { id, attendeeId } = req.params;
      const attendee = await ordersService.updateAttendee(id, attendeeId, req.body, req.user);
      return res.status(200).json({
        message: 'Attendee updated successfully',
        attendee,
      });
    } catch (err) {
      next(err);
    }
  }

  async deleteAttendee(req, res, next) {
    try {
      const { id, attendeeId } = req.params;
      const result = await ordersService.deleteAttendee(id, attendeeId, req.user);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async checkInAttendee(req, res, next) {
    try {
      const { id } = req.params;
      const { barcode, ticket_code } = req.body;
      const result = await ordersService.checkInAttendee(id, { barcode, ticket_code }, req.user);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async getOrdersByEvent(req, res, next) {
    try {
      const { id } = req.params;
      const orders = await ordersService.getOrdersByEvent(id, req.user);
      return res.status(200).json({ orders });
    } catch (err) {
      next(err);
    }
  }

  async refund(req, res, next) {
    try {
      const { id } = req.params;
      const sessionToken = extractSessionToken(req);
      const reason = req.body?.reason || 'Customer requested refund';
      const idempotencyKey = req.headers['idempotency-key'] || req.body?.idempotency_key || null;
      const result = await ordersService.refundOrder(id, req.user, reason, {
        sessionToken,
        idempotencyKey,
      });
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async processPayment(req, res, next) {
    try {
      const { id } = req.params;
      const gateway = req.body?.gateway || req.query?.gateway || 'VNPAY';
      const payment_method = req.body?.payment_method || req.query?.payment_method;
      const sessionToken = extractSessionToken(req);
      const result = await ordersService.processPayment(id, {
        gateway,
        payment_method,
        user: req.user,
        sessionToken,
        ipAddr: req.ip || req.connection?.remoteAddress || '127.0.0.1',
      });
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async getPaymentStatus(req, res, next) {
    try {
      const { id } = req.params;
      const sessionToken = extractSessionToken(req);
      const order = await ordersService.getOrderById(id, req.user, sessionToken);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      return res.status(200).json({
        id: order.id,
        status: order.status,
        payment_status: order.payment_status,
        payment_gateway: order.payment_gateway,
        total: order.total_gross || order.total,
      });
    } catch (err) {
      next(err);
    }
  }

  async vnpayCallback(req, res, next) {
    try {
      const queryParams = req.query;
      const { gatewayAdapter } = await import('../services/payment.service.js');
      const isValid = gatewayAdapter.verifyVNPaySignature(queryParams);
      if (!isValid) {
        return res.status(400).json({ success: false, message: 'Invalid VNPay checksum signature' });
      }

      const orderRef = queryParams['vnp_TxnRef'];
      const responseCode = queryParams['vnp_ResponseCode'];
      const transactionStatus = queryParams['vnp_TransactionStatus'];
      const tmnCode = queryParams['vnp_TmnCode'];
      const rawAmount = queryParams['vnp_Amount'];
      const txnNo = queryParams['vnp_TransactionNo'] || null;
      const payDate = queryParams['vnp_PayDate'] || null;
      const bankCode = queryParams['vnp_BankCode'] || null;
      const amount = Number(rawAmount) / 100;

      // V10-P0-01: Fail-closed verification of mandatory callback parameters.
      // Mandatory: orderRef, tmnCode, rawAmount (>0), txnNo, responseCode, transactionStatus.
      const hasMandatoryFields = Boolean(
        orderRef &&
        tmnCode &&
        rawAmount !== undefined &&
        rawAmount !== null &&
        rawAmount !== '' &&
        !isNaN(Number(rawAmount)) &&
        Number(rawAmount) > 0 &&
        txnNo &&
        responseCode &&
        transactionStatus
      );

      // Require explicit '00' for BOTH responseCode and transactionStatus
      const isSuccess = hasMandatoryFields && responseCode === '00' && transactionStatus === '00';
      const status = isSuccess ? 'SUCCESS' : 'FAILED';

      const payload = `${orderRef}|${status}|${amount}|${txnNo || ''}`;
      const signature = gatewayAdapter.signWebhookPayload(payload);

      const result = await ordersService.handlePaymentWebhook({
        order_public_id: orderRef,
        payment_intent_id: txnNo,
        payment_method: 'VNPAY',
        amount_paid: amount,
        signature,
        status,
        vnp_pay_date: payDate,
        vnp_bank_code: bankCode,
        vnp_txn_ref: orderRef,
        vnp_response_code: responseCode,
        vnp_transaction_status: transactionStatus,
      });

      if (req.accepts('html')) {
        return res.redirect(`/orders/${orderRef}/receipt?payment_status=${status}`);
      }
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async paymentWebhook(req, res, next) {
    try {
      const {
        order_id,
        order_public_id,
        payment_intent_id,
        payment_method,
        amount_paid,
        status,
        vnp_pay_date,
        vnp_bank_code,
        vnp_txn_ref,
        vnp_response_code,
        vnp_transaction_status,
      } = req.body;
      const signature = req.headers['x-signature'] || req.body.signature;
      const result = await ordersService.handlePaymentWebhook({
        order_id,
        order_public_id,
        payment_intent_id,
        payment_method,
        amount_paid,
        signature,
        status,
        vnp_pay_date,
        vnp_bank_code,
        vnp_txn_ref,
        vnp_response_code,
        vnp_transaction_status,
      });
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async getReceipt(req, res, next) {
    try {
      const { id } = req.params;
      const sessionToken = extractSessionToken(req);
      const receipt = await ordersService.getDigitalReceipt(id, { user: req.user, sessionSecret: sessionToken });
      return res.status(200).json({
        receipt,
        order: receipt.order || receipt,
      });
    } catch (err) {
      next(err);
    }
  }

  async getMyOrders(req, res, next) {
    try {
      const orders = await ordersService.getUserOrders(req.user);
      return res.status(200).json({ orders });
    } catch (err) {
      next(err);
    }
  }

  async massRefund(req, res, next) {
    try {
      const { id } = req.params;
      const result = await ordersService.massRefundEvent(id, req.user);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}

export default new OrdersController();
