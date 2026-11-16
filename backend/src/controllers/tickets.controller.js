import ticketsService from '../services/tickets.service.js';

class TicketsController {
  async list(req, res, next) {
    try {
      const { id } = req.params;
      const includeHidden = req.user?.role === 'ORGANIZER' || req.user?.role === 'ADMIN';
      const tiers = await ticketsService.listByEventId(id, includeHidden);
      return res.status(200).json({ tiers });
    } catch (err) {
      next(err);
    }
  }

  async create(req, res, next) {
    try {
      const { id } = req.params;
      const tier = await ticketsService.createTier(id, req.body, req.user);
      return res.status(201).json({ tier });
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const { id, tierId } = req.params;
      const tier = await ticketsService.updateTier(id, tierId, req.body, req.user);
      return res.status(200).json({
        message: 'Ticket tier updated successfully',
        tier,
      });
    } catch (err) {
      next(err);
    }
  }

  async delete(req, res, next) {
    try {
      const { id, tierId } = req.params;
      await ticketsService.deleteTier(id, tierId, req.user);
      return res.status(200).json({
        message: 'Ticket tier deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  }
}

export default new TicketsController();
