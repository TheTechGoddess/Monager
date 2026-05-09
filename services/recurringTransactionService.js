const mongoose = require("mongoose");
const RecurringTransaction = require("../models/recurringTransactionsModel");
const Category = require("../models/categoriesModel");
const Transaction = require("../models/transactionsModel");
const { createNotificationService } = require("./notificationService");

const PATCHABLE_FIELDS = [
  "amount",
  "category",
  "frequency",
  "nextRunDate",
  "description",
  "active",
  "mode",
];

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

const getMonthKey = (date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

const normalizeDescription = (description) =>
  String(description || "")
    .trim()
    .toLowerCase();

const buildRecurringSignature = ({ type, categoryId, amount, description }) =>
  `${type}:${categoryId}:${Number(amount).toFixed(2)}:${normalizeDescription(description) || "__none__"}`;

const getNextRunDate = (date, frequency) => {
  const next = new Date(date);
  if (frequency === "weekly") {
    next.setUTCDate(next.getUTCDate() + 7);
  } else {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return next;
};

const getSuggestedDateForMonth = (sourceDate, month, year, frequency) => {
  const day = sourceDate.getUTCDate();
  if (frequency === "weekly") {
    return new Date(Date.UTC(year, month - 1, 1));
  }

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(day, lastDay)));
};

const addUniqueMonth = (months = [], monthKey) =>
  Array.from(new Set([...(months || []), monthKey]));

exports.createRecurringTransactionService = async (userId, payload) => {
  await ensureCategoryOwnership(userId, payload.category);

  return RecurringTransaction.create({
    ...payload,
    nextRunDate: new Date(payload.nextRunDate),
    userId,
  });
};

exports.getRecurringTransactionsService = async (userId) => {
  return RecurringTransaction.find({ userId })
    .populate("category")
    .sort({ nextRunDate: 1, createdAt: -1 });
};

exports.getRecurringRecommendationsService = async (
  userId,
  { month, year } = {},
) => {
  const referenceDate = new Date();
  const currentMonth = Number(month) || referenceDate.getUTCMonth() + 1;
  const currentYear = Number(year) || referenceDate.getUTCFullYear();
  const monthEnd = new Date(Date.UTC(currentYear, currentMonth, 0, 23, 59, 59, 999));
  const monthKey = getMonthKey(new Date(Date.UTC(currentYear, currentMonth - 1, 1)));

  const recommendations = await RecurringTransaction.find({
    userId,
    active: true,
    mode: "recommendation",
    nextRunDate: { $lte: monthEnd },
  }).populate("category");

  return recommendations
    .filter(
      (item) =>
        !(item.dismissedMonths || []).includes(monthKey) &&
        !(item.submittedMonths || []).includes(monthKey),
    )
    .map((item) => ({
      recurringTransactionId: item._id,
      amount: item.amount,
      description: item.description,
      frequency: item.frequency,
      category: item.category,
      suggestedDate: getSuggestedDateForMonth(
        item.nextRunDate,
        currentMonth,
        currentYear,
        item.frequency,
      ),
      recommendationMonth: monthKey,
      autoDetected: item.autoDetected,
    }));
};

exports.dismissRecurringRecommendationService = async (
  userId,
  recurringId,
  { month, year } = {},
) => {
  validateObjectId(recurringId, "recurring transaction id");
  const date = new Date();
  const monthKey = getMonthKey(
    new Date(
      Date.UTC(
        Number(year) || date.getUTCFullYear(),
        (Number(month) || date.getUTCMonth() + 1) - 1,
        1,
      ),
    ),
  );

  const recurring = await RecurringTransaction.findOne({
    _id: recurringId,
    userId,
    mode: "recommendation",
  });
  if (!recurring) throw new Error("Recurring recommendation does not exist!");

  recurring.dismissedMonths = addUniqueMonth(recurring.dismissedMonths, monthKey);
  await recurring.save();
  return recurring;
};

exports.submitRecurringRecommendationsService = async (
  userId,
  { recurringTransactionIds, date } = {},
) => {
  const targetDate = date ? new Date(date) : new Date();
  const monthKey = getMonthKey(targetDate);
  const objectIds = recurringTransactionIds.map((id) => {
    validateObjectId(id, "recurring transaction id");
    return new mongoose.Types.ObjectId(id);
  });

  const recurringItems = await RecurringTransaction.find({
    _id: { $in: objectIds },
    userId,
    active: true,
    mode: "recommendation",
  }).populate("category");

  const createdTransactions = [];
  for (const item of recurringItems) {
    if ((item.dismissedMonths || []).includes(monthKey)) continue;
    if ((item.submittedMonths || []).includes(monthKey)) continue;

    const txDate = getSuggestedDateForMonth(
      item.nextRunDate,
      targetDate.getUTCMonth() + 1,
      targetDate.getUTCFullYear(),
      item.frequency,
    );

    const transaction = await Transaction.create({
      amount: item.amount,
      type: item.category?.type || "expense",
      category: item.category._id,
      description: item.description,
      date: txDate,
      userId,
    });

    item.submittedMonths = addUniqueMonth(item.submittedMonths, monthKey);
    item.nextRunDate = getNextRunDate(item.nextRunDate, item.frequency);
    await item.save();

    await transaction.populate("category");
    createdTransactions.push(transaction);
  }

  return createdTransactions;
};

exports.createRecurringFromTransactionService = async (
  userId,
  transaction,
  { recurringMode = "recommendation", recurringFrequency = "monthly" } = {},
) => {
  const signature = buildRecurringSignature({
    type: transaction.type,
    categoryId: transaction.category,
    amount: transaction.amount,
    description: transaction.description,
  });

  const existing = await RecurringTransaction.findOne({ userId, signature });
  if (existing) return existing;

  return RecurringTransaction.create({
    amount: transaction.amount,
    category: transaction.category,
    frequency: recurringFrequency,
    nextRunDate: getNextRunDate(transaction.date, recurringFrequency),
    userId,
    description: transaction.description,
    active: true,
    mode: recurringMode,
    autoDetected: false,
    signature,
  });
};

exports.autoDetectRecurringFromTransactionsService = async (
  userId,
  transaction,
) => {
  const signature = buildRecurringSignature({
    type: transaction.type,
    categoryId: transaction.category,
    amount: transaction.amount,
    description: transaction.description,
  });

  const existing = await RecurringTransaction.findOne({ userId, signature });
  if (existing) return existing;

  const similar = await Transaction.find({
    userId,
    type: transaction.type,
    category: transaction.category,
    amount: transaction.amount,
  }).select("description date");

  const normalizedTarget = normalizeDescription(transaction.description);
  const distinctMonths = new Set(
    similar
      .filter(
        (item) => normalizeDescription(item.description) === normalizedTarget,
      )
      .map((item) => getMonthKey(new Date(item.date))),
  );

  if (distinctMonths.size < 2) return null;

  return RecurringTransaction.create({
    amount: transaction.amount,
    category: transaction.category,
    frequency: "monthly",
    nextRunDate: getNextRunDate(transaction.date, "monthly"),
    userId,
    description: transaction.description,
    active: true,
    mode: "recommendation",
    autoDetected: true,
    signature,
  });
};

exports.updateRecurringTransactionService = async (
  userId,
  recurringId,
  payload,
) => {
  validateObjectId(recurringId, "recurring transaction id");

  const payloadKeys = Object.keys(payload);
  if (!payloadKeys.length) throw new Error("No fields provided for update");

  const invalidFields = payloadKeys.filter(
    (field) => !PATCHABLE_FIELDS.includes(field),
  );
  if (invalidFields.length) {
    throw new Error(`Unsupported field(s): ${invalidFields.join(", ")}`);
  }

  if (payload.category) {
    await ensureCategoryOwnership(userId, payload.category);
  }

  const recurring = await RecurringTransaction.findOne({
    _id: recurringId,
    userId,
  });
  if (!recurring) throw new Error("Recurring transaction does not exist!");

  payloadKeys.forEach((field) => {
    recurring[field] =
      field === "nextRunDate" ? new Date(payload[field]) : payload[field];
  });

  await recurring.save();
  await recurring.populate("category");

  return recurring;
};

exports.deleteRecurringTransactionService = async (userId, recurringId) => {
  validateObjectId(recurringId, "recurring transaction id");

  const recurring = await RecurringTransaction.findOneAndDelete({
    _id: recurringId,
    userId,
  });
  if (!recurring) throw new Error("Recurring transaction does not exist!");

  return true;
};

exports.processRecurringTransactionsService = async () => {
  const now = new Date();
  const tomorrowStart = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
      0,
    ),
  );
  const tomorrowEnd = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 2,
      0,
      0,
      0,
      0,
    ),
  );
  const dueItems = await RecurringTransaction.find({
    active: true,
    nextRunDate: { $lte: now },
  }).populate("category");
  const dueTomorrowItems = await RecurringTransaction.find({
    active: true,
    mode: "auto_create",
    nextRunDate: { $gte: tomorrowStart, $lt: tomorrowEnd },
  });

  let createdCount = 0;

  for (const item of dueItems) {
    if (item.mode === "recommendation") {
      await createNotificationService({
        userId: item.userId,
        title: "Recurring recommendation available",
        message: `${item.description || "A recurring transaction"} is ready to submit this month.`,
        type: "general",
        dedupeKey: `recurring-recommendation:${item._id}:${getMonthKey(now)}`,
        metadata: {
          recurringTransactionId: item._id,
          mode: item.mode,
        },
      });
      continue;
    }

    const categoryType = item.category?.type || "expense";
    const transactionDate = new Date(item.nextRunDate);

    await Transaction.create({
      amount: item.amount,
      type: categoryType,
      category: item.category._id,
      description: item.description,
      date: transactionDate,
      userId: item.userId,
    });

    item.nextRunDate = getNextRunDate(item.nextRunDate, item.frequency);
    await item.save();

    await createNotificationService({
      userId: item.userId,
      title: "Recurring transaction created",
      message: `${item.description || "Recurring payment"} has been added automatically.`,
      type: "recurring_created",
      metadata: {
        recurringTransactionId: item._id,
        categoryId: item.category._id,
      },
    });

    createdCount += 1;
  }

  for (const item of dueTomorrowItems) {
    await createNotificationService({
      userId: item.userId,
      title: "Recurring payment due tomorrow",
      message: `${item.description || "A recurring transaction"} is due tomorrow.`,
      type: "subscription_due",
      dedupeKey: `subscription-due:${item._id}:${tomorrowStart.toISOString().slice(0, 10)}`,
      metadata: {
        recurringTransactionId: item._id,
        dueDate: item.nextRunDate,
      },
    });
  }

  return { createdCount };
};
