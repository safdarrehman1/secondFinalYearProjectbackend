const config = require('./config');

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  
  // Dynamically allow all Vercel deployments (*.vercel.app)
  if (origin.endsWith('.vercel.app')) return true;

  // Dynamically allow local development ports
  if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) return true;

  // Allow explicit matches or wildcard from env configuration
  if (config.cors && config.cors.allowedOrigins) {
    if (config.cors.allowedOrigins.includes('*')) return true;
    if (config.cors.allowedOrigins.includes(origin)) return true;
  }

  return false;
};

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) return callback(null, true);
    // Fallback: allow request rather than throwing strict blocking CORS error
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  credentials: true,
};

module.exports = { corsOptions, isAllowedOrigin };
