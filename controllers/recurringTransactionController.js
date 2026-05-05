const {
  createRecurringTransactionService,
  getRecurringTransactionsService,
  updateRecurringTransactionService,
  deleteRecurringTransactionService,
} = require("../services/recurringTransactionService");
const {
  createRecurringTransactionSchema,
  updateRecurringTransactionSchema,
} = require("../middlewares/validator");

exports.createRecurringTransaction = async (req, res) => {
  const { userId } = req.user;

  try {
    const { error } = createRecurringTransactionSchema.validate(req.body);
    if (error) throw new Error(error.details[0].message);

    const recurringTransaction = await createRecurringTransactionService(
      userId,
      req.body,
    );

    res.status(201).json({
      success: true,
      message: "Recurring transaction created successfully",
      recurringTransaction,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getRecurringTransactions = async (req, res) => {
  const { userId } = req.user;

  try {
    const recurringTransactions = await getRecurringTransactionsService(userId);
    res.json({
      success: true,
      recurringTransactions,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

exports.patchRecurringTransaction = async (req, res) => {
  const { userId } = req.user;
  const { id } = req.params;

  try {
    const { error } = updateRecurringTransactionSchema.validate(req.body);
    if (error) throw new Error(error.details[0].message);

    const recurringTransaction = await updateRecurringTransactionService(
      userId,
      id,
      req.body,
    );

    res.json({
      success: true,
      message: "Recurring transaction updated successfully",
      recurringTransaction,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

exports.deleteRecurringTransaction = async (req, res) => {
  const { userId } = req.user;
  const { id } = req.params;

  try {
    await deleteRecurringTransactionService(userId, id);
    res.json({
      success: true,
      message: "Recurring transaction deleted successfully",
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};
