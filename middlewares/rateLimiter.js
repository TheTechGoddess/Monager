const rateLimit = require("express-rate-limit");
const RATE_LIMIT_WINDOW_MS = 5000;

exports.authLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: 50,
  message: {
    success: false,
    message: "Too many requests. Try again later.",
  },
});

exports.financeWriteLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: 300,
  message: {
    success: false,
    message: "Too many write operations. Try again later.",
  },
});

exports.analyticsLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: 600,
  message: {
    success: false,
    message: "Too many analytics requests. Try again later.",
  },
});
