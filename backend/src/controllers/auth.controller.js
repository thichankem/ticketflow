import authService from '../services/auth.service.js';

class AuthController {
  async register(req, res, next) {
    try {
      const { name, email, password, role } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ error: 'Missing required registration fields' });
      }

      const { user, token, refreshToken } = await authService.register({ name, email, password, role });

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        path: '/api/auth',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });

      return res.status(201).json({
        success: true,
        message: 'Đăng ký tài khoản thành công',
        user,
        token,
        accessToken: token,
      });
    } catch (err) {
      next(err);
    }
  }

  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      const { user, token, refreshToken } = await authService.login({ email, password });

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        path: '/api/auth',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });

      return res.status(200).json({
        success: true,
        user,
        token,
        accessToken: token,
      });
    } catch (err) {
      next(err);
    }
  }

  async refresh(req, res, next) {
    try {
      const refreshToken = req.cookies?.refreshToken;
      if (!refreshToken) {
        return res.status(401).json({ error: 'Unauthorized', message: 'Missing refresh token' });
      }
      const { token } = await authService.refreshToken(refreshToken);
      return res.status(200).json({
        success: true,
        token,
        accessToken: token,
      });
    } catch (err) {
      next(err);
    }
  }

  async me(req, res, next) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const user = await authService.getUserById(req.user.id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      return res.status(200).json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone || '',
          role: user.role,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async updateProfile(req, res, next) {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { name, email, phone } = req.body;
      const result = await authService.updateProfile(req.user.id, { name, email, phone });
      const userObj = result.user || result;
      return res.status(200).json({
        success: true,
        message: 'Cập nhật thông tin hồ sơ thành công',
        user: userObj,
        token: result.token,
      });
    } catch (err) {
      next(err);
    }
  }

  async changePassword(req, res, next) {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { currentPassword, newPassword } = req.body;
      const result = await authService.changePassword(req.user.id, { currentPassword, newPassword });
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async logout(req, res, next) {
    try {
      res.clearCookie('refreshToken', { path: '/api/auth' });
      return res.status(200).json({
        success: true,
        message: 'Đăng xuất thành công',
      });
    } catch (err) {
      next(err);
    }
  }
}

export default new AuthController();
