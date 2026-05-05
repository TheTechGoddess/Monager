const {
  createBudgetService,
  getBudgetsService,
  updateBudgetService,
  deleteBudgetService,
} = require("../services/budgetService");
const { createBudgetSchema, updateBudgetSchema } = require("../middlewares/validator");

exports.createBudget = async (req, res) => {
  const { userId } = req.user;

  try {
    const { error } = createBudgetSchema.validate(req.body);
    if (error) throw new Error(error.details[0].message);

    const budget = await createBudgetService(userId, req.body);
    res.status(201).json({
      success: true,
      message: "Budget created successfully",
      budget,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getBudgets = async (req, res) => {
  const { userId } = req.user;

  try {
    const budgets = await getBudgetsService(userId);
    res.json({
      success: true,
      budgets,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

exports.patchBudget = async (req, res) => {
  const { userId } = req.user;
  const { id } = req.params;

  try {
    const { error } = updateBudgetSchema.validate(req.body);
    if (error) throw new Error(error.details[0].message);

    const budget = await updateBudgetService(userId, id, req.body);
    res.json({
      success: true,
      message: "Budget updated successfully",
      budget,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

exports.deleteBudget = async (req, res) => {
  const { userId } = req.user;
  const { id } = req.params;

  try {
    await deleteBudgetService(userId, id);
    res.json({
      success: true,
      message: "Budget deleted successfully",
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};
