const Transaction = require("../models/transactionsModel");
const mongoose = require("mongoose");

const getMonthlySpendingSeries = async (userId) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const monthly = await Transaction.aggregate([
    {
      $match: {
        userId: userObjectId,
        type: "expense",
      },
    },
    {
      $group: {
        _id: {
          year: { $year: "$date" },
          month: { $month: "$date" },
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
        amount: 1,
      },
    },
  ]);

  return monthly.reverse();
};

exports.getDashboardService = async (userId) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const [totals, topCategory, monthlySpending] = await Promise.all([
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
        },
      },
    ]),
    getMonthlySpendingSeries(userId),
  ]);

  const totalsMap = totals.reduce((acc, item) => {
    acc[item._id] = item.total;
    return acc;
  }, {});

  const totalIncome = totalsMap.income || 0;
  const totalExpenses = totalsMap.expense || 0;
  const remainingBalance = totalIncome - totalExpenses;

  return {
    totalIncome,
    totalExpenses,
    remainingBalance,
    topSpendingCategory: topCategory[0] || null,
    monthlySpending,
  };
};
