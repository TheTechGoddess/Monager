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

const getNextRunDate = (date, frequency) => {
  const next = new Date(date);
  if (frequency === "weekly") {
    next.setUTCDate(next.getUTCDate() + 7);
  } else {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return next;
};

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
    recurring[field] = field === "nextRunDate" ? new Date(payload[field]) : payload[field];
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
    nextRunDate: { $gte: tomorrowStart, $lt: tomorrowEnd },
  });

  let createdCount = 0;

  for (const item of dueItems) {
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
