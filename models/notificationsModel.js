const mongoose = require("mongoose");

const notificationSchema = mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: [
        "budget_exceeded",
        "subscription_due",
        "recurring_created",
        "monthly_report_ready",
        "general",
      ],
      default: "general",
      trim: true,
    },
    read: {
      type: Boolean,
      default: false,
    },
    dedupeKey: {
      type: String,
      default: null,
      unique: true,
      sparse: true,
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Notification", notificationSchema);
