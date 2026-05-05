const mongoose = require("mongoose");
const Budget = require("../models/budgetsModel");
const Category = require("../models/categoriesModel");
const Transaction = require("../models/transactionsModel");

const PATCHABLE_FIELDS = ["category", "limit", "month", "year"];
const MONTH_MAP = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const validateObjectId = (id, fieldName) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error(`Invalid ${fieldName}`);
  }
};

const normalizeMonth = (monthValue) => {
  if (typeof monthValue === "number") {
    if (!Number.isInteger(monthValue) || monthValue < 1 || monthValue > 12) {
      throw new Error("Month must be between 1 and 12");
    }
    return monthValue;
  }

  const asNumber = Number(monthValue);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= 12) {
    return asNumber;
  }

  const monthKey = String(monthValue || "")
    .trim()
    .toLowerCase();
  if (!MONTH_MAP[monthKey]) {
    throw new Error("Invalid month value");
  }

  return MONTH_MAP[monthKey];
};

const ensureExpenseCategoryOwnership = async (userId, categoryId) => {
  validateObjectId(categoryId, "category id");

  const category = await Category.findOne({ _id: categoryId, userId });
  if (!category) throw new Error("Category does not exist!");
  if (category.type !== "expense") {
    throw new Error("Budget can only be created for expense category");
  }

  return category;
};

const getSpentForBudget = async (userId, categoryId, month, year) => {
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 1));

  const result = await Transaction.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        category: new mongoose.Types.ObjectId(categoryId),
        type: "expense",
        date: { $gte: startDate, $lt: endDate },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$amount" },
      },
    },
  ]);

  return result[0]?.total || 0;
};

const withBudgetStats = async (budget) => {
  const spent = await getSpentForBudget(
    budget.userId,
    budget.category?._id || budget.category,
    budget.month,
    budget.year,
  );

  return {
    ...budget.toObject(),
    spent,
    remaining: budget.limit - spent,
  };
};

exports.createBudgetService = async (userId, payload) => {
  const normalizedPayload = {
    ...payload,
    month: normalizeMonth(payload.month),
  };

  await ensureExpenseCategoryOwnership(userId, normalizedPayload.category);

  const existingBudget = await Budget.findOne({
    userId,
    category: normalizedPayload.category,
    month: normalizedPayload.month,
    year: normalizedPayload.year,
  });
  if (existingBudget) {
    throw new Error("Budget already exists for this category and month");
  }

  const budget = await Budget.create({
    ...normalizedPayload,
    userId,
  });
  await budget.populate("category");

  return withBudgetStats(budget);
};

exports.getBudgetsService = async (userId) => {
  const budgets = await Budget.find({ userId })
    .populate("category")
    .sort({ year: -1, month: -1, createdAt: -1 });

  const budgetsWithStats = await Promise.all(budgets.map(withBudgetStats));
  return budgetsWithStats;
};

exports.updateBudgetService = async (userId, budgetId, payload) => {
  validateObjectId(budgetId, "budget id");

  const payloadKeys = Object.keys(payload);
  if (!payloadKeys.length) throw new Error("No fields provided for update");

  const invalidFields = payloadKeys.filter(
    (field) => !PATCHABLE_FIELDS.includes(field),
  );
  if (invalidFields.length) {
    throw new Error(`Unsupported field(s): ${invalidFields.join(", ")}`);
  }

  const budget = await Budget.findOne({ _id: budgetId, userId });
  if (!budget) throw new Error("Budget does not exist!");

  if (payload.category) {
    await ensureExpenseCategoryOwnership(userId, payload.category);
  }

  payloadKeys.forEach((field) => {
    if (field === "month") {
      budget.month = normalizeMonth(payload.month);
      return;
    }

    budget[field] = payload[field];
  });

  const duplicateBudget = await Budget.findOne({
    _id: { $ne: budget._id },
    userId,
    category: budget.category,
    month: budget.month,
    year: budget.year,
  });
  if (duplicateBudget) {
    throw new Error("Budget already exists for this category and month");
  }

  await budget.save();
  await budget.populate("category");

  return withBudgetStats(budget);
};

exports.deleteBudgetService = async (userId, budgetId) => {
  validateObjectId(budgetId, "budget id");

  const budget = await Budget.findOneAndDelete({ _id: budgetId, userId });
  if (!budget) throw new Error("Budget does not exist!");

  return true;
};
