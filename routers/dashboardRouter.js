const express = require("express");
const dashboardController = require("../controllers/dashboardController");
const { identifier } = require("../middlewares/identification");
const { analyticsLimiter } = require("../middlewares/rateLimiter");

const router = express.Router();

router.get("/", identifier, analyticsLimiter, dashboardController.getDashboard);

module.exports = router;
