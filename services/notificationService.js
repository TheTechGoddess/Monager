const Notification = require("../models/notificationsModel");
const mongoose = require("mongoose");

exports.createNotificationService = async ({
  userId,
  title,
  message,
  type = "general",
  dedupeKey = null,
  metadata = {},
}) => {
  try {
    const notification = await Notification.create({
      userId,
      title,
      message,
      type,
      dedupeKey,
      metadata,
    });

    return notification;
  } catch (err) {
    if (err?.code === 11000 && dedupeKey) {
      return null;
    }
    throw err;
  }
};

exports.getNotificationsService = async (userId) => {
  return Notification.find({ userId }).sort({ createdAt: -1 });
};

exports.markNotificationAsReadService = async (userId, notificationId) => {
  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    throw new Error("Invalid notification id");
  }

  const notification = await Notification.findOne({ _id: notificationId, userId });
  if (!notification) throw new Error("Notification does not exist!");

  notification.read = true;
  await notification.save();
  return notification;
};
