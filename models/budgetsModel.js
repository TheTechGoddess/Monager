const mongoose = require("mongoose");

const budgetSchema = mongoose.Schema(
  {
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Category is required"],
      index: true,
    },
    limit: {
      type: Number,
      required: [true, "Budget limit is required"],
      min: 0,
    },
    month: {
      type: Number,
      required: [true, "Budget month is required"],
      min: 1,
      max: 12,
    },
    year: {
      type: Number,
      required: [true, "Budget year is required"],
      min: 1970,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

budgetSchema.index(
  { userId: 1, category: 1, month: 1, year: 1 },
  { unique: true },
);

module.exports = mongoose.model("Budget", budgetSchema);
