const rateLimit = require("express-rate-limit");

exports.authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: "Too many requests. Try again later.",
  },
});

exports.financeWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: {
    success: false,
    message: "Too many write operations. Try again later.",
  },
});

exports.analyticsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 240,
  message: {
    success: false,
    message: "Too many analytics requests. Try again later.",
  },
});
