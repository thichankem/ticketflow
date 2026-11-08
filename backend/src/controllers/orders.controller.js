import ordersService from '../services/orders.service.js';

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
      const { id } = req.params;
      const { barcode, attendee_id } = req.body;
      const result = await ordersService.checkInAttendee(id, { barcode, attendee_id });
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}

export default new OrdersController();
