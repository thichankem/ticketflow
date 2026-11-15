import ordersService from '../services/orders.service.js';
import eventsService from '../services/events.service.js';

class OrdersController {
  async reserve(req, res, next) {
    try {
      const eventId = req.params.id || req.body.event_id;
      const { items, promo_code, queue_token, admission_token } = req.body;
      const queueToken = queue_token || admission_token || req.headers['x-waiting-room-token'] || req.headers['x-queue-token'] || req.headers['x-admission-token'];
      const result = await ordersService.reserveOrder({
        eventId,
        items,
        promoCode: promo_code,
        user: req.user,
        queueToken,
      });
      return res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const order = await ordersService.getOrderById(id, req.user);
      return res.status(200).json({ order });
    } catch (err) {
      next(err);
    }
  }

  async checkout(req, res, next) {
    try {
      const { id } = req.params;
      const { buyer, attendees, payment_method, payment_intent_id } = req.body;
      const result = await ordersService.checkoutOrder(id, {
        buyer,
        attendees,
        payment_method,
        payment_intent_id,
      });
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async cancel(req, res, next) {
    try {
      const { id } = req.params;
      const result = await ordersService.cancelOrder(id, req.user);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async checkIn(req, res, next) {
    try {
      const eventId = req.params.id || req.body.event_id;
      if (!eventId) {
        return res.status(400).json({ error: 'event_id is required for check-in' });
      }
      const event = await eventsService.getEventById(eventId);
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }
      if (req.user && req.user.role !== 'ADMIN' && Number(event.account_id) !== Number(req.user.account_id)) {
        return res.status(403).json({ error: 'Forbidden: Event does not belong to user account' });
      }
      const { barcode, qr_hash, attendee_id } = req.body;
      const scanCode = qr_hash || barcode;
      const result = await ordersService.checkInAttendee(eventId, { barcode: scanCode, qr_hash, attendee_id });
      return res.status(200).json({
        success: true,
        message: result.message || 'Check-in thành công',
        attendee: result.attendee,
      });
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

  async toggleCheckIn(req, res, next) {
    try {
      const { id, attendeeId } = req.params;
      const attendee = await ordersService.toggleAttendeeCheckIn(id, attendeeId, req.user);
      return res.status(200).json({
        message: 'Attendee check-in toggled successfully',
        attendee,
      });
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
      const result = await ordersService.refundOrder(id, req.user);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async processPayment(req, res, next) {
    try {
      const { id } = req.params;
      const { gateway, payment_method } = req.body;
      const result = await ordersService.processPayment(id, {
        gateway,
        payment_method,
        user: req.user,
      });
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async paymentWebhook(req, res, next) {
    try {
      const { order_id, order_public_id, payment_intent_id, payment_method, amount_paid, status } = req.body;
      const signature = req.headers['x-signature'] || req.body.signature;
      const result = await ordersService.handlePaymentWebhook({
        order_id,
        order_public_id,
        payment_intent_id,
        payment_method,
        amount_paid,
        signature,
        status,
      });
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async getReceipt(req, res, next) {
    try {
      const { id } = req.params;
      const receipt = await ordersService.getDigitalReceipt(id, { user: req.user });
      return res.status(200).json({
        receipt,
        order: receipt.order || receipt,
      });
    } catch (err) {
      next(err);
    }
  }

  async transferTicket(req, res, next) {
    try {
      const { attendeeId } = req.params;
      const { new_email, new_name } = req.body;
      const result = await ordersService.transferTicket(attendeeId, {
        new_email,
        new_name,
        user: req.user,
      });
      return res.status(200).json(result);
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
