const Transaction = require("../models/transactionsModel");
const Budget = require("../models/budgetsModel");
const mongoose = require("mongoose");

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const getMonthlyCashflowSeries = async (userId) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const now = new Date();

  const monthly = await Transaction.aggregate([
    {
      $match: {
        userId: userObjectId,
      },
    },
    {
      $group: {
        _id: {
          year: { $year: "$date" },
          month: { $month: "$date" },
          type: "$type",
        },
        amount: { $sum: "$amount" },
      },
    },
    {
      $sort: {
        "_id.year": -1,
        "_id.month": -1,
      },
    },
    { $limit: 12 },
    {
      $project: {
        _id: 0,
        year: "$_id.year",
        month: "$_id.month",
        type: "$_id.type",
        amount: 1,
      },
    },
  ]);

  const bucketMap = monthly.reduce((acc, item) => {
    const key = `${item.year}-${item.month}`;
    if (!acc[key]) {
      acc[key] = {
        year: item.year,
        month: item.month,
        income: 0,
        expense: 0,
        investments: 0,
      };
    }
    acc[key][item.type] = item.amount;
    return acc;
  }, {});

  const rolling12Months = [];
  for (let offset = 11; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const key = `${year}-${month}`;
    const value = bucketMap[key] || {
      year,
      month,
      income: 0,
      expense: 0,
      investments: 0,
    };

    rolling12Months.push({
      month: MONTH_LABELS[month - 1],
      year,
      income: value.income || 0,
      expense: value.expense || 0,
      investments: value.investments || 0,
    });
  }

  return rolling12Months;
};

exports.getDashboardService = async (userId) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const now = new Date();
  const currentMonth = now.getUTCMonth() + 1;
  const currentYear = now.getUTCFullYear();

  const [totals, topCategory, monthlyCashflow, categoryBreakdown, budgetVsActual] = await Promise.all([
    Transaction.aggregate([
      { $match: { userId: userObjectId } },
      {
        $group: {
          _id: "$type",
          total: { $sum: "$amount" },
        },
      },
    ]),
    Transaction.aggregate([
      { $match: { userId: userObjectId, type: "expense" } },
      {
        $group: {
          _id: "$category",
          total: { $sum: "$amount" },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 1 },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          total: 1,
          name: "$category.name",
          categoryId: "$category._id",
          type: "$category.type",
          color: "$category.color",
          icon: "$category.icon",
        },
      },
    ]),
    getMonthlyCashflowSeries(userId),
    Transaction.aggregate([
      { $match: { userId: userObjectId, type: "expense" } },
      {
        $group: {
          _id: "$category",
          value: { $sum: "$amount" },
        },
      },
      { $sort: { value: -1 } },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          categoryId: "$category._id",
          label: "$category.name",
          value: 1,
          color: "$category.color",
          icon: "$category.icon",
          type: "$category.type",
        },
      },
    ]),
    Budget.aggregate([
      {
        $match: {
          userId: userObjectId,
          month: currentMonth,
          year: currentYear,
        },
      },
      {
        $lookup: {
          from: "transactions",
          let: { categoryId: "$category", month: "$month", year: "$year" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$userId", userObjectId] },
                    { $eq: ["$category", "$$categoryId"] },
                    { $eq: ["$type", "expense"] },
                    { $eq: [{ $month: "$date" }, "$$month"] },
                    { $eq: [{ $year: "$date" }, "$$year"] },
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                totalSpent: { $sum: "$amount" },
              },
            },
          ],
          as: "spent",
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          categoryId: "$category._id",
          label: "$category.name",
          budget: "$limit",
          actual: { $ifNull: [{ $arrayElemAt: ["$spent.totalSpent", 0] }, 0] },
          color: "$category.color",
          icon: "$category.icon",
        },
      },
      { $sort: { budget: -1 } },
    ]),
  ]);

  const totalsMap = totals.reduce((acc, item) => {
    acc[item._id] = item.total;
    return acc;
  }, {});

  const totalIncome = totalsMap.income || 0;
  const totalExpenses = totalsMap.expense || 0;
  const totalInvestments = totalsMap.investments || 0;
  const remainingBalance = totalIncome - totalExpenses - totalInvestments;
  const totalCategoryExpense = categoryBreakdown.reduce(
    (sum, item) => sum + item.value,
    0,
  );
  const categoryDistribution = categoryBreakdown.map((item) => ({
    ...item,
    percentage: totalCategoryExpense
      ? Math.round((item.value / totalCategoryExpense) * 100)
      : 0,
  }));

  return {
    totalIncome,
    totalExpenses,
    totalInvestments,
    remainingBalance,
    topSpendingCategory: topCategory[0] || null,
    monthlyCashflow,
    monthlySpending: monthlyCashflow.map((item) => ({
      month: item.month,
      year: item.year,
      amount: item.expense,
    })),
    categoryDistribution,
    budgetVsActual,
  };
};
