const express = require("express");
const transactionController = require("../controllers/transactionController");
const { identifier } = require("../middlewares/identification");
const { financeWriteLimiter } = require("../middlewares/rateLimiter");

const router = express.Router();

router.post(
  "/",
  identifier,
  financeWriteLimiter,
  transactionController.createTransaction,
);
router.get("/", identifier, transactionController.getTransactions);
router.patch(
  "/:id",
  identifier,
  financeWriteLimiter,
  transactionController.patchTransaction,
);
router.delete(
  "/:id",
  identifier,
  financeWriteLimiter,
  transactionController.deleteTransaction,
);

module.exports = router;
