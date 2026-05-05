const {
  getNotificationsService,
  markNotificationAsReadService,
} = require("../services/notificationService");

exports.getNotifications = async (req, res) => {
  const { userId } = req.user;

  try {
    const notifications = await getNotificationsService(userId);
    res.json({
      success: true,
      notifications,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

exports.markNotificationAsRead = async (req, res) => {
  const { userId } = req.user;
  const { id } = req.params;

  try {
    const notification = await markNotificationAsReadService(userId, id);
    res.json({
      success: true,
      message: "Notification marked as read",
      notification,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};
