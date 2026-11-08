import promosService from '../services/promos.service.js';

class PromosController {
  async create(req, res, next) {
    try {
      const { id } = req.params;
      const promo = await promosService.createPromo(id, req.body);
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
}

export default new PromosController();
