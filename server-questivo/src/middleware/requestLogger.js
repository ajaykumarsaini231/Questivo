const morgan = require('morgan');
const fs = require('fs');
const path = require('path');

const isVercel = !!process.env.VERCEL;

// Create logs directory only if not on Vercel
let logsDir;
if (!isVercel) {
  logsDir = path.join(__dirname, '..', 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
    console.log('✅ Created logs directory:', logsDir);
  }
}

// Custom tokens
morgan.token('reqId', (req) => req.reqId || 'unknown');
morgan.token('userId', (req) => req.user?.id || 'anonymous');

const logFormat =
  ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" reqId=:reqId userId=:userId';

const accessLogStream = isVercel
  ? { write: (msg) => console.log(msg.trim()) }
  : fs.createWriteStream(path.join(logsDir, 'access.log'), { flags: 'a' });

const errorLogStream = isVercel
  ? { write: (msg) => console.error(msg.trim()) }
  : fs.createWriteStream(path.join(logsDir, 'error.log'), { flags: 'a' });

// ✅ FIXED: dynamic import for nanoid (ESM-safe)
const addRequestId = async (req, res, next) => {
  const { nanoid } = await import('nanoid');
  req.reqId = nanoid(8);
  res.setHeader('X-Request-ID', req.reqId);
  next();
};

const requestLogger = morgan(logFormat, {
  stream: accessLogStream,
  skip: (req, res) => req.url === '/health'
});

const errorLogger = morgan(logFormat, {
  stream: errorLogStream,
  skip: (req, res) => res.statusCode < 400
});

const securityLogger = (req, res, next) => {
  const suspiciousPatterns = [
    /script.*alert/i,
    /union.*select/i,
    /drop.*table/i,
    /<script/i,
    /javascript:/i
  ];

  const url = req.url.toLowerCase();
  const userAgent = (req.get('User-Agent') || '').toLowerCase();

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(url) || pattern.test(userAgent)) {
      const logEntry = {
        timestamp: new Date().toISOString(),
        type: 'SECURITY_ALERT',
        ip: req.ip || req.connection.remoteAddress,
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        reqId: req.reqId,
        pattern: pattern.source
      };

      if (!isVercel) {
        fs.appendFileSync(
          path.join(logsDir, 'security.log'),
          JSON.stringify(logEntry) + '\n'
        );
      } else {
        console.warn('⚠️ SECURITY ALERT:', logEntry);
      }
    }
  }

  next();
};

module.exports = {
  addRequestId,
  requestLogger,
  errorLogger,
  securityLogger
};
