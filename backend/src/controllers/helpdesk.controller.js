import helpdeskService from '../services/helpdesk.service.js';

class HelpdeskController {
  getFaqs(req, res, next) {
    try {
      const { category } = req.query;
      const faqs = helpdeskService.getFaqs(category);
      return res.status(200).json({ faqs });
    } catch (err) {
      next(err);
    }
  }

  async createTicket(req, res, next) {
    try {
      const ticket = await helpdeskService.createTicket({
        user: req.user || null,
        ...req.body,
      });
      return res.status(201).json({
        message: 'Tạo phiếu hỗ trợ khiếu nại thành công',
        ticket,
      });
    } catch (err) {
      next(err);
    }
  }

  async getTicket(req, res, next) {
    try {
      const { id } = req.params;
      const ticket = await helpdeskService.getTicket(id, req.user);
      return res.status(200).json({ ticket });
    } catch (err) {
      next(err);
    }
  }

  async listTickets(req, res, next) {
    try {
      const { status, category } = req.query;
      const tickets = await helpdeskService.listTickets({
        user: req.user,
        status,
        category,
      });
      return res.status(200).json({ tickets });
    } catch (err) {
      next(err);
    }
  }

  async addMessage(req, res, next) {
    try {
      const { id } = req.params;
      const { message } = req.body;
      const result = await helpdeskService.addMessage(id, req.user, message);
      return res.status(201).json({
        message: 'Gửi tin nhắn phản hồi thành công',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async updateStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status, resolution_notes } = req.body;
      const ticket = await helpdeskService.updateTicketStatus(id, status, req.user, resolution_notes);
      return res.status(200).json({
        message: 'Cập nhật trạng thái phiếu hỗ trợ thành công',
        ticket,
      });
    } catch (err) {
      next(err);
    }
  }

  async deleteTicket(req, res, next) {
    try {
      const { id } = req.params;
      const result = await helpdeskService.deleteTicket(id, req.user);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  createFaq(req, res, next) {
    try {
      const faq = helpdeskService.createFaq(req.body);
      return res.status(201).json({ message: 'Tạo FAQ thành công', faq });
    } catch (err) {
      next(err);
    }
  }

  updateFaq(req, res, next) {
    try {
      const { id } = req.params;
      const faq = helpdeskService.updateFaq(id, req.body);
      return res.status(200).json({ message: 'Cập nhật FAQ thành công', faq });
    } catch (err) {
      next(err);
    }
  }

  deleteFaq(req, res, next) {
    try {
      const { id } = req.params;
      const result = helpdeskService.deleteFaq(id);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}

export default new HelpdeskController();
