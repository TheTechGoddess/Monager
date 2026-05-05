const express = require("express");
const dashboardController = require("../controllers/dashboardController");
const { identifier } = require("../middlewares/identification");

const router = express.Router();

router.get("/", identifier, dashboardController.getDashboard);

module.exports = router;
