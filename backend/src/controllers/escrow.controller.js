import escrowService from '../services/escrow.service.js';

class EscrowController {
  async getEventSummary(req, res, next) {
    try {
      const { id } = req.params;
      const summary = await escrowService.getEventEscrowSummary(id, req.user);
      return res.status(200).json({ escrow: summary });
    } catch (err) {
      next(err);
    }
  }

  async requestPayout(req, res, next) {
    try {
      const { id } = req.params;
      const { bank_name, bank_account_number, bank_account_name, notes } = req.body;
      const payout = await escrowService.requestPayout(id, req.user, {
        bank_name,
        bank_account_number,
        bank_account_name,
        notes,
      });
      return res.status(201).json({
        message: 'Gửi yêu cầu quyết toán doanh thu bảo chứng thành công',
        payout,
      });
    } catch (err) {
      next(err);
    }
  }

  async getAllPayouts(req, res, next) {
    try {
      const payouts = await escrowService.getAllPayouts();
      return res.status(200).json({ payouts });
    } catch (err) {
      next(err);
    }
  }

  async updatePayoutStatus(req, res, next) {
    try {
      const { payoutId } = req.params;
      const { status, notes } = req.body;
      const payout = await escrowService.updatePayoutStatus(payoutId, req.user, status, notes);
      return res.status(200).json({
        message: `Đã cập nhật trạng thái quyết toán thành ${status}`,
        payout,
      });
    } catch (err) {
      next(err);
    }
  }
}

export default new EscrowController();
