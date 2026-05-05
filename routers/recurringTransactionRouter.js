const express = require("express");
const recurringTransactionController = require("../controllers/recurringTransactionController");
const { identifier } = require("../middlewares/identification");

const router = express.Router();

router.post(
  "/",
  identifier,
  recurringTransactionController.createRecurringTransaction,
);
router.get("/", identifier, recurringTransactionController.getRecurringTransactions);
router.patch(
  "/:id",
  identifier,
  recurringTransactionController.patchRecurringTransaction,
);
router.delete(
  "/:id",
  identifier,
  recurringTransactionController.deleteRecurringTransaction,
);

module.exports = router;
