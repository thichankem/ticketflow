import { Router } from 'express';
import locationService from '../services/location.service.js';

const router = Router();

// GET /api/location/provinces - List all supported provinces
router.get('/provinces', (req, res) => {
  const provinces = locationService.getProvinces();
  return res.status(200).json({ provinces });
});

// GET /api/location/distance?from=...&to=... - Calculate distance between two provinces/locations
router.get('/distance', (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: 'Both from and to query parameters are required' });
  }

  const result = locationService.calculateDistance(String(from), String(to));
  return res.status(200).json(result);
});

export default router;
