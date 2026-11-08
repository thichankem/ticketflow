import authService from '../services/auth.service.js';

class AdminController {
  async getStats(req, res, next) {
    try {
      const stats = await authService.getStats();
      return res.status(200).json(stats);
    } catch (err) {
      next(err);
    }
  }

  async suspendUser(req, res, next) {
    try {
      const { id } = req.params;
      const user = await authService.suspendUser(id);
      return res.status(200).json({
        message: 'User suspended successfully',
        user,
      });
    } catch (err) {
      next(err);
    }
  }
}

export default new AdminController();
