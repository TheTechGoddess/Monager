const Category = require("../models/categoriesModel");
const mongoose = require("mongoose");

const PATCHABLE_FIELDS = ["name", "type", "icon", "color"];

const validateCategoryId = (categoryId) => {
  if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    throw new Error("Invalid category id");
  }
};

exports.createCategoryService = async (userId, payload) => {
  const category = await Category.create({
    ...payload,
    userId,
  });

  return category;
};

exports.getCategoriesService = async (userId) => {
  const categories = await Category.find({ userId }).sort({ createdAt: -1 });
  return categories;
};

exports.updateCategoryService = async (userId, categoryId, payload) => {
  validateCategoryId(categoryId);

  const category = await Category.findOne({ _id: categoryId, userId });
  if (!category) throw new Error("Category does not exist!");

  const payloadKeys = Object.keys(payload);
  if (!payloadKeys.length) throw new Error("No fields provided for update");

  const invalidFields = payloadKeys.filter(
    (field) => !PATCHABLE_FIELDS.includes(field),
  );
  if (invalidFields.length) {
    throw new Error(`Unsupported field(s): ${invalidFields.join(", ")}`);
  }

  payloadKeys.forEach((field) => {
    category[field] = payload[field];
  });

  await category.save();
  return category;
};

exports.deleteCategoryService = async (userId, categoryId) => {
  validateCategoryId(categoryId);

  const category = await Category.findOneAndDelete({ _id: categoryId, userId });
  if (!category) throw new Error("Category does not exist!");

  return true;
};
