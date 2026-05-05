const mongoose = require("mongoose");

const recurringTransactionSchema = mongoose.Schema(
  {
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: 0,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Category is required"],
      index: true,
    },
    frequency: {
      type: String,
      enum: ["weekly", "monthly"],
      required: [true, "Frequency is required"],
      trim: true,
    },
    nextRunDate: {
      type: Date,
      required: [true, "Next run date is required"],
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    description: {
      type: String,
      default: null,
      trim: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("RecurringTransaction", recurringTransactionSchema);
