const express = require("express");
const reportController = require("../controllers/reportController");
const { identifier } = require("../middlewares/identification");

const router = express.Router();

router.get(
  "/monthly",
  identifier,
  reportController.getMonthlyReport,
);
router.get(
  "/category",
  identifier,
  reportController.getCategoryReport,
);

module.exports = router;
