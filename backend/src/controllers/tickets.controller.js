import ticketsService from '../services/tickets.service.js';

class TicketsController {
  async list(req, res, next) {
    try {
      const { id } = req.params;
      const tiers = await ticketsService.listByEventId(id, true);
      return res.status(200).json({ tiers });
    } catch (err) {
      next(err);
    }
  }

  async create(req, res, next) {
    try {
      const { id } = req.params;
      const tier = await ticketsService.createTier(id, req.body);
      return res.status(201).json({ tier });
    } catch (err) {
      next(err);
    }
  }
}

export default new TicketsController();
