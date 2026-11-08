export default async function handler(req, res) {
  try {
    const mod = await import('../backend/src/app.js');
    res.status(200).json({ ok: true, appLoaded: Boolean(mod.default) });
  } catch (err) {
    res.status(200).json({ ok: false, error: err.message, stack: err.stack });
  }
}
