const express = require("express");
const notificationController = require("../controllers/notificationController");
const { identifier } = require("../middlewares/identification");

const router = express.Router();

router.get("/", identifier, notificationController.getNotifications);
router.patch("/:id/read", identifier, notificationController.markNotificationAsRead);

module.exports = router;
