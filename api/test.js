export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    node: process.version,
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    envKeys: Object.keys(process.env).filter(k => !k.includes('SECRET') && !k.includes('KEY'))
  });
}
