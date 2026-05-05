const mongoose = require("mongoose");
const Transaction = require("../models/transactionsModel");
const Category = require("../models/categoriesModel");
const Budget = require("../models/budgetsModel");
const { createNotificationService } = require("./notificationService");

const PATCHABLE_FIELDS = ["amount", "type", "category", "description", "date"];

const validateObjectId = (id, fieldName) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error(`Invalid ${fieldName}`);
  }
};

const ensureCategoryOwnership = async (userId, categoryId) => {
  validateObjectId(categoryId, "category id");

  const category = await Category.findOne({ _id: categoryId, userId });
  if (!category) throw new Error("Category does not exist!");

  return category;
};

const notifyIfBudgetExceeded = async (userId, categoryId, date) => {
  const transactionDate = new Date(date);
  const month = transactionDate.getUTCMonth() + 1;
  const year = transactionDate.getUTCFullYear();

  const budget = await Budget.findOne({
    userId,
    category: categoryId,
    month,
    year,
  }).populate("category");

  if (!budget) return;

  const spentResult = await Transaction.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        category: new mongoose.Types.ObjectId(categoryId),
        type: "expense",
        date: {
          $gte: new Date(Date.UTC(year, month - 1, 1)),
          $lt: new Date(Date.UTC(year, month, 1)),
        },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$amount" },
      },
    },
  ]);

  const spent = spentResult[0]?.total || 0;
  if (spent <= budget.limit) return;

  await createNotificationService({
    userId,
    title: "Budget exceeded",
    message: `You exceeded your ${budget.category?.name || "category"} budget by ${spent - budget.limit}.`,
    type: "budget_exceeded",
    dedupeKey: `budget-exceeded:${budget._id}:${month}:${year}`,
    metadata: {
      budgetId: budget._id,
      month,
      year,
      spent,
      limit: budget.limit,
    },
  });
};

exports.createTransactionService = async (userId, payload) => {
  const category = await ensureCategoryOwnership(userId, payload.category);
  if (category.type !== payload.type) {
    throw new Error("Transaction type must match category type");
  }

  const transaction = await Transaction.create({
    ...payload,
    userId,
  });

  if (transaction.type === "expense") {
    await notifyIfBudgetExceeded(
      userId,
      transaction.category,
      transaction.date,
    );
  }

  return transaction;
};

exports.getTransactionsService = async (userId, filters = {}) => {
  const query = { userId };

  if (filters.type) {
    query.type = filters.type;
  }

  if (filters.category) {
    if (mongoose.Types.ObjectId.isValid(filters.category)) {
      query.category = filters.category;
    } else {
      const category = await Category.findOne({
        userId,
        name: { $regex: `^${String(filters.category).trim()}$`, $options: "i" },
      });
      if (!category) throw new Error("Category does not exist!");
      query.category = category._id;
    }
  }

  if (filters.month) {
    query.$expr = {
      $eq: [{ $month: "$date" }, Number(filters.month)],
    };
  }

  if (filters.startDate || filters.endDate) {
    query.date = {};
    if (filters.startDate) {
      query.date.$gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      query.date.$lte = new Date(filters.endDate);
    }
  }

  if (filters.amountMin || filters.amountMax) {
    query.amount = {};
    if (filters.amountMin) {
      query.amount.$gte = Number(filters.amountMin);
    }
    if (filters.amountMax) {
      query.amount.$lte = Number(filters.amountMax);
    }
  }

  const transactions = await Transaction.find(query)
    .populate("category")
    .sort({ date: -1, createdAt: -1 });

  return transactions;
};

exports.updateTransactionService = async (userId, transactionId, payload) => {
  validateObjectId(transactionId, "transaction id");

  const payloadKeys = Object.keys(payload);
  if (!payloadKeys.length) throw new Error("No fields provided for update");

  const invalidFields = payloadKeys.filter(
    (field) => !PATCHABLE_FIELDS.includes(field),
  );
  if (invalidFields.length) {
    throw new Error(`Unsupported field(s): ${invalidFields.join(", ")}`);
  }

  if (payload.category) {
    const category = await ensureCategoryOwnership(userId, payload.category);
    if ((payload.type || undefined) && category.type !== payload.type) {
      throw new Error("Transaction type must match category type");
    }
  } else if (payload.type) {
    const existingTransaction = await Transaction.findOne({
      _id: transactionId,
      userId,
    }).populate("category");
    if (!existingTransaction) throw new Error("Transaction does not exist!");
    if (existingTransaction.category.type !== payload.type) {
      throw new Error("Transaction type must match category type");
    }
  }

  const transaction = await Transaction.findOne({ _id: transactionId, userId });
  if (!transaction) throw new Error("Transaction does not exist!");

  payloadKeys.forEach((field) => {
    transaction[field] = payload[field];
  });

  await transaction.save();
  await transaction.populate("category");

  if (transaction.type === "expense") {
    await notifyIfBudgetExceeded(
      userId,
      transaction.category._id,
      transaction.date,
    );
  }

  return transaction;
};

exports.deleteTransactionService = async (userId, transactionId) => {
  validateObjectId(transactionId, "transaction id");

  const transaction = await Transaction.findOneAndDelete({
    _id: transactionId,
    userId,
  });
  if (!transaction) throw new Error("Transaction does not exist!");

  return true;
};
