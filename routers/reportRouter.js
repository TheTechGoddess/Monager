const express = require("express");
const reportController = require("../controllers/reportController");
const { identifier } = require("../middlewares/identification");
const { analyticsLimiter } = require("../middlewares/rateLimiter");

const router = express.Router();

router.get(
  "/monthly",
  identifier,
  analyticsLimiter,
  reportController.getMonthlyReport,
);
router.get(
  "/category",
  identifier,
  analyticsLimiter,
  reportController.getCategoryReport,
);

module.exports = router;
