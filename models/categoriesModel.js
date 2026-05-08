const mongoose = require("mongoose");
const {
  CATEGORY_TYPES,
  resolveCategoryIcon,
  resolveCategoryColor,
} = require("../utils/categoryMeta");

const categorySchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
    },
    type: {
      type: String,
      enum: CATEGORY_TYPES,
      required: [true, "Category type is required"],
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    icon: {
      type: String,
      default: function iconDefault() {
        return resolveCategoryIcon(this.type);
      },
      trim: true,
    },
    color: {
      type: String,
      default: function colorDefault() {
        return resolveCategoryColor(this.type);
      },
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

categorySchema.pre("validate", function syncIconWithType() {
  if (this.type) {
    this.icon = resolveCategoryIcon(this.type);
    this.color = resolveCategoryColor(this.type);
  }
});

module.exports = mongoose.model("Category", categorySchema);
