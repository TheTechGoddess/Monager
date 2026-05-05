const {
  createTransactionService,
  getTransactionsService,
  updateTransactionService,
  deleteTransactionService,
} = require("../services/transactionService");
const {
  createTransactionSchema,
  updateTransactionSchema,
  getTransactionsQuerySchema,
} = require("../middlewares/validator");

exports.createTransaction = async (req, res) => {
  const { userId } = req.user;

  try {
    const { error } = createTransactionSchema.validate(req.body);
    if (error) throw new Error(error.details[0].message);

    const transaction = await createTransactionService(userId, req.body);
    res.status(201).json({
      success: true,
      message: "Transaction created successfully",
      transaction,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getTransactions = async (req, res) => {
  const { userId } = req.user;

  try {
    const { error } = getTransactionsQuerySchema.validate(req.query);
    if (error) throw new Error(error.details[0].message);
    if (
      req.query.startDate &&
      req.query.endDate &&
      new Date(req.query.startDate) > new Date(req.query.endDate)
    ) {
      throw new Error("startDate must be before or equal to endDate");
    }
    if (
      req.query.amountMin &&
      req.query.amountMax &&
      Number(req.query.amountMin) > Number(req.query.amountMax)
    ) {
      throw new Error("amountMin must be less than or equal to amountMax");
    }

    const transactions = await getTransactionsService(userId, req.query);
    res.json({
      success: true,
      transactions,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

exports.patchTransaction = async (req, res) => {
  const { userId } = req.user;
  const { id } = req.params;

  try {
    const { error } = updateTransactionSchema.validate(req.body);
    if (error) throw new Error(error.details[0].message);

    const transaction = await updateTransactionService(userId, id, req.body);
    res.json({
      success: true,
      message: "Transaction updated successfully",
      transaction,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

exports.deleteTransaction = async (req, res) => {
  const { userId } = req.user;
  const { id } = req.params;

  try {
    await deleteTransactionService(userId, id);
    res.json({
      success: true,
      message: "Transaction deleted successfully",
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};
