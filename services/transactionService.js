const mongoose = require("mongoose");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const Transaction = require("../models/transactionsModel");
const Category = require("../models/categoriesModel");
const Budget = require("../models/budgetsModel");
const User = require("../models/usersModel");
const RecurringTransaction = require("../models/recurringTransactionsModel");
const PDFDocument = require("pdfkit");
const { createNotificationService } = require("./notificationService");
const {
  autoDetectRecurringFromTransactionsService,
} = require("./recurringTransactionService");

const PATCHABLE_FIELDS = [
  "amount",
  "type",
  "category",
  "description",
  "date",
  "isRecurring",
  "recurringMode",
  "recurringFrequency",
];
const TRANSACTION_PATCHABLE_FIELDS = [
  "amount",
  "type",
  "category",
  "description",
  "date",
  "isRecurring",
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

const normalizeDescription = (description) =>
  String(description || "")
    .trim()
    .toLowerCase();

const getCategoryId = (category) => category?._id || category;

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

const findRecurringForTransaction = async (userId, transaction, oldSignature) => {
  if (transaction.recurringTransaction) {
    const linked = await RecurringTransaction.findOne({
      _id: transaction.recurringTransaction,
      userId,
    });
    if (linked) return linked;
  }

  const bySourceTransaction = await RecurringTransaction.findOne({
    sourceTransaction: transaction._id,
    userId,
  });
  if (bySourceTransaction) return bySourceTransaction;

  if (!oldSignature) return null;
  return RecurringTransaction.findOne({ userId, signature: oldSignature });
};

const syncTransactionRecurringSettings = async (
  userId,
  transaction,
  {
    oldSignature,
    isRecurring,
    recurringMode,
    recurringFrequency,
  } = {},
) => {
  const shouldDisableRecurring = isRecurring === false;
  const shouldEnableRecurring =
    isRecurring === true || recurringMode !== undefined || recurringFrequency !== undefined;

  if (!shouldDisableRecurring && !shouldEnableRecurring) return null;

  const existing = await findRecurringForTransaction(
    userId,
    transaction,
    oldSignature,
  );

  if (shouldDisableRecurring) {
    if (existing) {
      existing.active = false;
      await existing.save();
    }
    transaction.isRecurring = false;
    transaction.recurringTransaction = null;
    await transaction.save();
    return null;
  }

  const frequency = recurringFrequency || existing?.frequency || "monthly";
  const mode = recurringMode || existing?.mode || "recommendation";
  const signature = buildRecurringSignature({
    type: transaction.type,
    categoryId: getCategoryId(transaction.category),
    amount: transaction.amount,
    description: transaction.description,
  });

  const recurringPayload = {
    amount: transaction.amount,
    category: getCategoryId(transaction.category),
    frequency,
    nextRunDate: getNextRunDate(transaction.date, frequency),
    userId,
    sourceTransaction: transaction._id,
    description: transaction.description,
    active: true,
    mode,
    autoDetected: false,
    signature,
  };

  const recurring = existing
    ? Object.assign(existing, recurringPayload)
    : new RecurringTransaction(recurringPayload);

  await recurring.save();
  transaction.isRecurring = true;
  transaction.recurringTransaction = recurring._id;
  await transaction.save();
  await recurring.populate("category");
  return recurring;
};

const getTransactionId = (transaction) => String(transaction?._id || "");

const getRecurringId = (recurring) => {
  if (!recurring) return null;
  return String(recurring?._id || recurring);
};

const getTransactionSignature = (transaction) =>
  buildRecurringSignature({
    type: transaction.type,
    categoryId: getCategoryId(transaction.category),
    amount: transaction.amount,
    description: transaction.description,
  });

const attachRecurringMetadata = (transaction, recurring) => {
  const data =
    typeof transaction.toObject === "function"
      ? transaction.toObject()
      : { ...transaction };
  const activeRecurring = recurring && recurring.active !== false ? recurring : null;

  data.isRecurring = Boolean(activeRecurring);
  data.recurringTransaction = activeRecurring || null;
  data.recurringMode = activeRecurring?.mode || null;
  data.recurringFrequency = activeRecurring?.frequency || null;

  return data;
};

const hydrateTransactionsRecurringMetadata = async (userId, transactions = []) => {
  if (!transactions.length) return [];

  const recurringIds = transactions
    .map((transaction) => getRecurringId(transaction.recurringTransaction))
    .filter(Boolean);
  const transactionIds = transactions.map((transaction) => transaction._id);
  const signatures = transactions.map(getTransactionSignature);

  const recurringItems = await RecurringTransaction.find({
    userId,
    $or: [
      { _id: { $in: recurringIds } },
      { sourceTransaction: { $in: transactionIds } },
      { signature: { $in: signatures } },
    ],
  }).populate("category");

  const byId = new Map();
  const bySourceTransaction = new Map();
  const bySignature = new Map();

  recurringItems.forEach((item) => {
    byId.set(String(item._id), item);
    if (item.sourceTransaction) {
      bySourceTransaction.set(String(item.sourceTransaction), item);
    }
    if (item.signature) {
      bySignature.set(item.signature, item);
    }
  });

  return transactions.map((transaction) => {
    const recurring =
      byId.get(getRecurringId(transaction.recurringTransaction)) ||
      bySourceTransaction.get(getTransactionId(transaction)) ||
      bySignature.get(getTransactionSignature(transaction));

    return attachRecurringMetadata(transaction, recurring);
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
    await syncTransactionRecurringSettings(userId, transaction, {
      isRecurring: true,
      recurringMode,
      recurringFrequency,
    });
    await transaction.populate("recurringTransaction");
  } else {
    const recurring = await autoDetectRecurringFromTransactionsService(
      userId,
      transaction,
    );
    if (recurring?.active !== false) {
      transaction.isRecurring = true;
      transaction.recurringTransaction = recurring._id;
      await transaction.save();
    }
  }

  const [hydratedTransaction] = await hydrateTransactionsRecurringMetadata(userId, [
    transaction,
  ]);
  return hydratedTransaction;
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
      .populate("recurringTransaction")
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(effectiveLimit),
    Transaction.countDocuments(query),
  ]);

  const pageSize = effectiveLimit || transactions.length || 0;
  const totalPages = pageSize ? Math.max(Math.ceil(total / pageSize), 1) : 1;
  const currentPage = effectiveLimit ? Math.max(requestedPage, 1) : 1;

  const hydratedTransactions = await hydrateTransactionsRecurringMetadata(
    userId,
    transactions,
  );

  return {
    transactions: hydratedTransactions,
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

const formatDate = (date) => new Date(date).toISOString().slice(0, 10);

const formatDisplayDate = (date) =>
  new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));

const formatMoney = (amount, currency = "NGN") => {
  const numericAmount = Number(amount || 0);
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency || "NGN",
      minimumFractionDigits: 2,
    }).format(numericAmount);
  } catch (err) {
    return `${currency || "NGN"} ${numericAmount.toFixed(2)}`;
  }
};

const getSignedAmount = (tx) =>
  tx.type === "income" ? Number(tx.amount || 0) : -Number(tx.amount || 0);

const getAccountHolderName = (user) => {
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ");
  return name || user?.email || "Monager user";
};

const getStatementEndDate = (endDate) => new Date(endDate.getTime() - 1);

const fetchRemoteBuffer = (url) =>
  new Promise((resolve) => {
    const client = url.startsWith("https:") ? https : http;
    const request = client.get(url, (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        resolve(null);
        return;
      }

      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks)));
    });

    request.setTimeout(5000, () => {
      request.destroy();
      resolve(null);
    });
    request.on("error", () => resolve(null));
  });

const getLogoSource = async () => {
  const candidates = [
    process.env.MONEXA_LOGO_PATH,
    process.env.MONAGER_LOGO_PATH,
    path.resolve(__dirname, "..", "assets", "monagerlight.png"),
    path.resolve(__dirname, "..", "..", "assets", "monagerlight.png"),
    path.resolve(__dirname, "..", "..", "..", "assets", "monagerlight.png"),
  ].filter(Boolean);

  const localLogoPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (localLogoPath) return localLogoPath;

  const logoUrl = process.env.MONEXA_LOGO_URL || process.env.MONAGER_LOGO_URL;
  if (!logoUrl || !/^https?:\/\//i.test(logoUrl)) return null;

  return fetchRemoteBuffer(logoUrl);
};

const getExportSummary = (transactions = []) =>
  transactions.reduce(
    (acc, tx) => {
      const amount = Number(tx.amount || 0);
      const categoryName = tx.category?.name || "Unknown";

      acc.byType[tx.type] += amount;
      acc.countByType[tx.type] += 1;
      acc.totalTransactions += 1;
      acc.netBalance += getSignedAmount(tx);

      if (!acc.byCategory[categoryName]) {
        acc.byCategory[categoryName] = {
          category: categoryName,
          type: tx.category?.type || tx.type,
          count: 0,
          total: 0,
        };
      }
      acc.byCategory[categoryName].count += 1;
      acc.byCategory[categoryName].total += amount;

      return acc;
    },
    {
      byType: {
        income: 0,
        expense: 0,
        investments: 0,
      },
      countByType: {
        income: 0,
        expense: 0,
        investments: 0,
      },
      byCategory: {},
      totalTransactions: 0,
      netBalance: 0,
    },
  );

const escapeCsv = (value) => {
  const safe = String(value ?? "");
  if (safe.includes(",") || safe.includes('"') || safe.includes("\n")) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
};

const buildCsvExport = ({ transactions, summary, startDate, endDate, user }) => {
  const statementEndDate = getStatementEndDate(endDate);
  const accountHolder = getAccountHolderName(user);
  const currency = user?.currency || "NGN";
  const categoryTotals = Object.values(summary.byCategory).sort(
    (a, b) => b.total - a.total,
  );
  const lines = [
    "Monager Transaction Statement",
    `Account Holder,${escapeCsv(accountHolder)}`,
    `Email,${escapeCsv(user?.email || "")}`,
    `Currency,${escapeCsv(currency)}`,
    `Period,${formatDate(startDate)} to ${formatDate(statementEndDate)}`,
    `Generated At,${new Date().toISOString()}`,
    "",
    "Summary",
    "Metric,Transaction Count,Amount",
    `Money In,${summary.countByType.income},${summary.byType.income}`,
    `Expenses,${summary.countByType.expense},${summary.byType.expense}`,
    `Investments,${summary.countByType.investments},${summary.byType.investments}`,
    `Net Balance,${summary.totalTransactions},${summary.netBalance}`,
    "",
    "Category Breakdown",
    "Category,Type,Transaction Count,Total Amount",
    ...categoryTotals.map((item) =>
      [item.category, item.type, item.count, item.total].map(escapeCsv).join(","),
    ),
    "",
    "Transactions",
    "Date,Description,Category,Type,Direction,Amount,Signed Amount,Transaction ID,Created At,Updated At",
    ...transactions.map((tx) =>
      [
        formatDate(tx.date),
        tx.description || "",
        tx.category?.name || "Unknown",
        tx.type,
        tx.type === "income" ? "credit" : "debit",
        Number(tx.amount || 0),
        getSignedAmount(tx),
        tx._id,
        tx.createdAt ? new Date(tx.createdAt).toISOString() : "",
        tx.updatedAt ? new Date(tx.updatedAt).toISOString() : "",
      ]
        .map(escapeCsv)
        .join(","),
    ),
  ];

  return `\uFEFF${lines.join("\n")}`;
};

const drawFooter = (doc, pageNumber) => {
  doc
    .fontSize(8)
    .fillColor("#777777")
    .text(
      `Generated by Monager | Page ${pageNumber}`,
      doc.page.margins.left,
      doc.page.height - 38,
      { align: "center" },
    );
};

const drawSummaryCard = (doc, { x, y, width, title, value, color }) => {
  doc
    .roundedRect(x, y, width, 62, 10)
    .fillAndStroke("#FFFFFF", "#F2D3E9")
    .fillColor("#777777")
    .fontSize(8)
    .text(title.toUpperCase(), x + 12, y + 12, { width: width - 24 })
    .fillColor(color)
    .fontSize(13)
    .font("Helvetica-Bold")
    .text(value, x + 12, y + 30, { width: width - 24 })
    .font("Helvetica");
};

const drawTableHeader = (doc, y) => {
  doc.rect(40, y, 515, 24).fill("#2E2357");
  doc
    .fillColor("#FFFFFF")
    .fontSize(8)
    .font("Helvetica-Bold")
    .text("Date", 50, y + 8, { width: 58 })
    .text("Description", 112, y + 8, { width: 156 })
    .text("Category", 278, y + 8, { width: 86 })
    .text("Type", 370, y + 8, { width: 64 })
    .text("Amount", 446, y + 8, { width: 90, align: "right" })
    .font("Helvetica");

  return y + 24;
};

const drawTransactionRow = (doc, tx, y, currency) => {
  const amount = getSignedAmount(tx);
  const rowHeight = 35;

  doc.rect(40, y, 515, rowHeight).fill(y % 2 === 0 ? "#FFF5FB" : "#FFFFFF");
  doc
    .fillColor("#333333")
    .fontSize(8)
    .text(formatDisplayDate(tx.date), 50, y + 10, { width: 58 })
    .text(tx.description || "No description", 112, y + 8, {
      width: 156,
      height: 22,
      ellipsis: true,
    })
    .text(tx.category?.name || "Unknown", 278, y + 10, {
      width: 86,
      ellipsis: true,
    })
    .text(tx.type.toUpperCase(), 370, y + 10, { width: 64 })
    .fillColor(amount >= 0 ? "#86BB75" : "#FB7185")
    .font("Helvetica-Bold")
    .text(formatMoney(amount, currency), 446, y + 10, {
      width: 90,
      align: "right",
    })
    .font("Helvetica")
    .fillColor("#333333");

  doc.moveTo(40, y + rowHeight).lineTo(555, y + rowHeight).stroke("#F2D3E9");
  return y + rowHeight;
};

const buildPdfExport = async ({ transactions, summary, startDate, endDate, user }) => {
  const doc = new PDFDocument({
    margin: 40,
    size: "A4",
    bufferPages: false,
    info: {
      Title: "Monager Transaction Statement",
      Author: "Monager",
      Subject: "Transaction statement",
    },
  });
  const chunks = [];
  const statementEndDate = getStatementEndDate(endDate);
  const accountHolder = getAccountHolderName(user);
  const currency = user?.currency || "NGN";
  const logoSource = await getLogoSource();

  return new Promise((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let pageNumber = 1;

    doc.rect(0, 0, doc.page.width, 128).fill("#C9429E");

    if (logoSource) {
      try {
        doc.image(logoSource, 40, 28, { fit: [120, 52] });
      } catch (err) {
        doc
          .fillColor("#FFFFFF")
          .fontSize(22)
          .font("Helvetica-Bold")
          .text("Monager", 40, 42);
      }
    } else {
      doc
        .fillColor("#FFFFFF")
        .fontSize(22)
        .font("Helvetica-Bold")
        .text("Monager", 40, 42);
    }

    doc
      .fillColor("#FFFFFF")
      .fontSize(20)
      .font("Helvetica-Bold")
      .text("Transaction Statement", 280, 34, { width: 275, align: "right" })
      .fontSize(9)
      .font("Helvetica")
      .text(
        `${formatDisplayDate(startDate)} - ${formatDisplayDate(statementEndDate)}`,
        280,
        62,
        { width: 275, align: "right" },
      )
      .text(`Generated ${formatDisplayDate(new Date())}`, 280, 78, {
        width: 275,
        align: "right",
      });

    doc
      .roundedRect(40, 154, 515, 88, 12)
      .fillAndStroke("#FFF5FB", "#F2D3E9")
      .fillColor("#2E2357")
      .fontSize(10)
      .font("Helvetica-Bold")
      .text("Statement For", 58, 172)
      .font("Helvetica")
      .fontSize(12)
      .text(accountHolder, 58, 192, { width: 240 })
      .fillColor("#555555")
      .fontSize(9)
      .text(user?.email || "", 58, 211, { width: 240 })
      .fillColor("#2E2357")
      .font("Helvetica-Bold")
      .text("Statement Period", 340, 172)
      .font("Helvetica")
      .fontSize(10)
      .text(`${formatDate(startDate)} to ${formatDate(statementEndDate)}`, 340, 192)
      .fillColor("#555555")
      .fontSize(9)
      .text(`${summary.totalTransactions} transaction(s)`, 340, 211);

    const cardY = 270;
    drawSummaryCard(doc, {
      x: 40,
      y: cardY,
      width: 118,
      title: "Money In",
      value: formatMoney(summary.byType.income, currency),
      color: "#86BB75",
    });
    drawSummaryCard(doc, {
      x: 172,
      y: cardY,
      width: 118,
      title: "Expenses",
      value: formatMoney(summary.byType.expense, currency),
      color: "#FB7185",
    });
    drawSummaryCard(doc, {
      x: 304,
      y: cardY,
      width: 118,
      title: "Investments",
      value: formatMoney(summary.byType.investments, currency),
      color: "#2E2357",
    });
    drawSummaryCard(doc, {
      x: 436,
      y: cardY,
      width: 118,
      title: "Net Balance",
      value: formatMoney(summary.netBalance, currency),
      color: summary.netBalance >= 0 ? "#86BB75" : "#FB7185",
    });

    doc
      .fillColor("#2E2357")
      .font("Helvetica-Bold")
      .fontSize(12)
      .text("Transactions", 40, 362)
      .font("Helvetica");

    let y = drawTableHeader(doc, 386);

    if (!transactions.length) {
      doc
        .fillColor("#777777")
        .fontSize(10)
        .text("No transactions found for this statement period.", 50, y + 18);
      y += 55;
    }

    transactions.forEach((tx) => {
      if (y > 730) {
        drawFooter(doc, pageNumber);
        doc.addPage();
        pageNumber += 1;
        y = 58;
        doc
          .fillColor("#2E2357")
          .font("Helvetica-Bold")
          .fontSize(12)
          .text("Transactions continued", 40, 34)
          .font("Helvetica");
        y = drawTableHeader(doc, y);
      }

      y = drawTransactionRow(doc, tx, y, currency);
    });

    const categoryTotals = Object.values(summary.byCategory)
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    if (categoryTotals.length) {
      const categorySectionHeight = 50 + categoryTotals.length * 34;
      if (y + categorySectionHeight > 730) {
        drawFooter(doc, pageNumber);
        doc.addPage();
        pageNumber += 1;
        y = 58;
      } else {
        y += 28;
      }

      doc
        .fillColor("#2E2357")
        .font("Helvetica-Bold")
        .fontSize(12)
        .text("Top Categories", 40, y)
        .font("Helvetica");
      y += 22;

      categoryTotals.forEach((item) => {
        doc
          .roundedRect(40, y, 515, 28, 8)
          .fillAndStroke("#FFF5FB", "#F2D3E9")
          .fillColor("#333333")
          .fontSize(9)
          .text(item.category, 52, y + 9, { width: 180, ellipsis: true })
          .fillColor("#777777")
          .text(item.type.toUpperCase(), 250, y + 9, { width: 90 })
          .text(`${item.count} transaction(s)`, 348, y + 9, { width: 90 })
          .fillColor("#2E2357")
          .font("Helvetica-Bold")
          .text(formatMoney(item.total, currency), 438, y + 9, {
            width: 100,
            align: "right",
          })
          .font("Helvetica");
        y += 34;
      });
    }

    drawFooter(doc, pageNumber);

    doc.end();
  });
};

exports.getTransactionsExportService = async (userId, filters = {}) => {
  const { startDate, endDate } = getDateRangeFromExportFilters(filters);
  const [user, transactions] = await Promise.all([
    User.findById(userId),
    Transaction.find({
      userId,
      date: {
        $gte: startDate,
        $lt: endDate,
      },
    })
      .populate("category")
      .populate("recurringTransaction")
      .sort({ date: 1, createdAt: 1 }),
  ]);

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
      user,
    }),
    pdf: await buildPdfExport({
      transactions,
      summary,
      startDate,
      endDate,
      user,
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

  const transaction = await Transaction.findOne({ _id: transactionId, userId });
  if (!transaction) throw new Error("Transaction does not exist!");

  const oldSignature = buildRecurringSignature({
    type: transaction.type,
    categoryId: getCategoryId(transaction.category),
    amount: transaction.amount,
    description: transaction.description,
  });
  const hadRecurringLink = Boolean(
    transaction.isRecurring || transaction.recurringTransaction,
  );

  if (payload.category) {
    const category = await ensureCategoryOwnership(userId, payload.category);
    const nextType = payload.type || transaction.type;
    if (category.type !== nextType) {
      throw new Error("Transaction type must match category type");
    }
  } else if (payload.type) {
    await transaction.populate("category");
    if (transaction.category.type !== payload.type) {
      throw new Error("Transaction type must match category type");
    }
  }

  payloadKeys
    .filter((field) => TRANSACTION_PATCHABLE_FIELDS.includes(field))
    .forEach((field) => {
      transaction[field] = payload[field];
    });

  await transaction.save();
  await transaction.populate("category");

  const recurringFieldsTouched = [
    "isRecurring",
    "recurringMode",
    "recurringFrequency",
  ].some((field) => Object.prototype.hasOwnProperty.call(payload, field));
  const shouldSyncExistingRecurring = hadRecurringLink || recurringFieldsTouched;

  if (shouldSyncExistingRecurring) {
    const isRecurringForSync = Object.prototype.hasOwnProperty.call(
      payload,
      "isRecurring",
    )
      ? payload.isRecurring
      : hadRecurringLink;

    await syncTransactionRecurringSettings(userId, transaction, {
      oldSignature,
      isRecurring: isRecurringForSync,
      recurringMode: payload.recurringMode,
      recurringFrequency: payload.recurringFrequency,
    });
    await transaction.populate("recurringTransaction");
  }

  if (transaction.type === "expense") {
    await notifyIfBudgetExceeded(
      userId,
      transaction.category._id,
      transaction.date,
    );
  }

  const [hydratedTransaction] = await hydrateTransactionsRecurringMetadata(userId, [
    transaction,
  ]);
  return hydratedTransaction;
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
