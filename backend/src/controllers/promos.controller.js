import promosService from '../services/promos.service.js';

class PromosController {
  async create(req, res, next) {
    try {
      const { id } = req.params;
      const promo = await promosService.createPromo(id, req.body, req.user);
      return res.status(201).json({ promo });
    } catch (err) {
      next(err);
    }
  }

  async validate(req, res, next) {
    try {
      const { id } = req.params;
      const { code, subtotal } = req.body;
      const result = await promosService.validatePromo(id, code, subtotal);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async list(req, res, next) {
    try {
      const { id } = req.params;
      const promos = await promosService.listPromos(id, req.user);
      return res.status(200).json({ promos });
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const { id, promoId } = req.params;
      const promo = await promosService.updatePromo(id, promoId, req.body, req.user);
      return res.status(200).json({ promo });
    } catch (err) {
      next(err);
    }
  }

  async delete(req, res, next) {
    try {
      const { id, promoId } = req.params;
      await promosService.deletePromo(id, promoId, req.user);
      return res.status(200).json({
        message: 'Promo code deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  }
}

export default new PromosController();
