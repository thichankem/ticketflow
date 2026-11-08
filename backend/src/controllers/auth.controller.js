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

      return res.status(201).json({ user, token });
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

      return res.status(200).json({ user, token });
    } catch (err) {
      next(err);
    }
  }

  async refresh(req, res, next) {
    try {
      const refreshToken = req.cookies?.refreshToken;
      const { token } = await authService.refreshToken(refreshToken);
      return res.status(200).json({ token });
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
          role: user.role,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async logout(req, res, next) {
    try {
      res.clearCookie('refreshToken', { path: '/api/auth' });
      return res.status(200).json({ message: 'Logged out successfully' });
    } catch (err) {
      next(err);
    }
  }
}

export default new AuthController();
