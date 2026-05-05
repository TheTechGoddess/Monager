const express = require("express");
const recurringTransactionController = require("../controllers/recurringTransactionController");
const { identifier } = require("../middlewares/identification");
const { financeWriteLimiter } = require("../middlewares/rateLimiter");

const router = express.Router();

router.post(
  "/",
  identifier,
  financeWriteLimiter,
  recurringTransactionController.createRecurringTransaction,
);
router.get("/", identifier, recurringTransactionController.getRecurringTransactions);
router.patch(
  "/:id",
  identifier,
  financeWriteLimiter,
  recurringTransactionController.patchRecurringTransaction,
);
router.delete(
  "/:id",
  identifier,
  financeWriteLimiter,
  recurringTransactionController.deleteRecurringTransaction,
);

module.exports = router;
