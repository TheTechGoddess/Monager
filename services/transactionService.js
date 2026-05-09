const mongoose = require("mongoose");
const Transaction = require("../models/transactionsModel");
const Category = require("../models/categoriesModel");
const Budget = require("../models/budgetsModel");
const PDFDocument = require("pdfkit");
const { createNotificationService } = require("./notificationService");
const {
  createRecurringFromTransactionService,
  autoDetectRecurringFromTransactionsService,
} = require("./recurringTransactionService");

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
  const {
    isRecurring = false,
    recurringMode = "recommendation",
    recurringFrequency = "monthly",
    ...transactionPayload
  } = payload;

  const category = await ensureCategoryOwnership(userId, transactionPayload.category);
  if (category.type !== transactionPayload.type) {
    throw new Error("Transaction type must match category type");
  }

  const transaction = await Transaction.create({
    ...transactionPayload,
    userId,
  });

  if (transaction.type === "expense") {
    await notifyIfBudgetExceeded(
      userId,
      transaction.category,
      transaction.date,
    );
  }

  if (isRecurring) {
    await createRecurringFromTransactionService(userId, transaction, {
      recurringMode,
      recurringFrequency,
    });
  } else {
    await autoDetectRecurringFromTransactionsService(userId, transaction);
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

  const requestedLimit = filters.limit ? Number(filters.limit) : 0;
  const requestedPage = filters.page ? Number(filters.page) : 1;
  const effectiveLimit = requestedLimit || (filters.page ? 20 : 0);
  const skip = effectiveLimit ? (Math.max(requestedPage, 1) - 1) * effectiveLimit : 0;

  const [transactions, total] = await Promise.all([
    Transaction.find(query)
      .populate("category")
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(effectiveLimit),
    Transaction.countDocuments(query),
  ]);

  const pageSize = effectiveLimit || transactions.length || 0;
  const totalPages = pageSize ? Math.max(Math.ceil(total / pageSize), 1) : 1;
  const currentPage = effectiveLimit ? Math.max(requestedPage, 1) : 1;

  return {
    transactions,
    pagination: {
      total,
      pageSize,
      currentPage,
      totalPages,
      hasNextPage: currentPage < totalPages,
      hasPreviousPage: currentPage > 1,
    },
  };
};

const getDateRangeFromExportFilters = (filters = {}) => {
  const now = new Date();
  if (filters.month) {
    const month = Number(filters.month);
    const year = Number(filters.year) || now.getUTCFullYear();
    return {
      startDate: new Date(Date.UTC(year, month - 1, 1)),
      endDate: new Date(Date.UTC(year, month, 1)),
    };
  }

  const startMonth = Number(filters.startMonth);
  const endMonth = Number(filters.endMonth);
  if (startMonth && endMonth) {
    const startYear = Number(filters.startYear) || now.getUTCFullYear();
    const endYear = Number(filters.endYear) || startYear;
    return {
      startDate: new Date(Date.UTC(startYear, startMonth - 1, 1)),
      endDate: new Date(Date.UTC(endYear, endMonth, 1)),
    };
  }

  throw new Error("Provide either month/year or startMonth/endMonth range");
};

const getExportSummary = (transactions = []) => {
  return transactions.reduce(
    (acc, tx) => {
      acc[tx.type] += tx.amount;
      return acc;
    },
    {
      income: 0,
      expense: 0,
      investments: 0,
    },
  );
};

const escapeCsv = (value) => {
  const safe = String(value ?? "");
  if (safe.includes(",") || safe.includes('"') || safe.includes("\n")) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
};

const buildCsvExport = ({ transactions, summary, startDate, endDate }) => {
  const lines = [
    "Date,Type,Category,Description,Amount",
    ...transactions.map((tx) =>
      [
        new Date(tx.date).toISOString().slice(0, 10),
        tx.type,
        tx.category?.name || "Unknown",
        tx.description || "",
        tx.amount,
      ]
        .map(escapeCsv)
        .join(","),
    ),
    "",
    `Range,${startDate.toISOString().slice(0, 10)} to ${new Date(endDate.getTime() - 1).toISOString().slice(0, 10)}`,
    `Total Income,${summary.income}`,
    `Total Expenses,${summary.expense}`,
    `Total Investments,${summary.investments}`,
    `Net Balance,${summary.income - summary.expense - summary.investments}`,
  ];

  return lines.join("\n");
};

const buildPdfExport = async ({ transactions, summary, startDate, endDate }) => {
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  const chunks = [];

  return new Promise((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text("Monager Transaction Export", { align: "left" });
    doc
      .moveDown(0.5)
      .fontSize(10)
      .text(
        `Range: ${startDate.toISOString().slice(0, 10)} to ${new Date(endDate.getTime() - 1).toISOString().slice(0, 10)}`,
      );
    doc.moveDown();

    doc.fontSize(12).text("Summary", { underline: true });
    doc
      .fontSize(10)
      .text(`Income: ${summary.income}`)
      .text(`Expenses: ${summary.expense}`)
      .text(`Investments: ${summary.investments}`)
      .text(`Net Balance: ${summary.income - summary.expense - summary.investments}`);

    doc.moveDown();
    doc.fontSize(12).text("Transactions", { underline: true });
    doc.moveDown(0.5);

    transactions.forEach((tx, index) => {
      doc
        .fontSize(10)
        .text(
          `${index + 1}. ${new Date(tx.date).toISOString().slice(0, 10)} | ${tx.type.toUpperCase()} | ${tx.category?.name || "Unknown"} | ${tx.amount}`,
        );
      if (tx.description) {
        doc
          .fontSize(9)
          .fillColor("#666666")
          .text(`   ${tx.description}`)
          .fillColor("#000000");
      }
      doc.moveDown(0.3);
    });

    doc.end();
  });
};

exports.getTransactionsExportService = async (userId, filters = {}) => {
  const { startDate, endDate } = getDateRangeFromExportFilters(filters);
  const transactions = await Transaction.find({
    userId,
    date: {
      $gte: startDate,
      $lt: endDate,
    },
  })
    .populate("category")
    .sort({ date: 1, createdAt: 1 });

  const summary = getExportSummary(transactions);
  return {
    transactions,
    summary,
    startDate,
    endDate,
    csv: buildCsvExport({
      transactions,
      summary,
      startDate,
      endDate,
    }),
    pdf: await buildPdfExport({
      transactions,
      summary,
      startDate,
      endDate,
    }),
  };
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
