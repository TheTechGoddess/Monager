const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");

const authRouter = require("./routers/authRouter");
const userRouter = require("./routers/userRouter");
const categoryRouter = require("./routers/categoryRouter");
const transactionRouter = require("./routers/transactionRouter");
const budgetRouter = require("./routers/budgetRouter");
const dashboardRouter = require("./routers/dashboardRouter");
const reportRouter = require("./routers/reportRouter");
const recurringTransactionRouter = require("./routers/recurringTransactionRouter");
const notificationRouter = require("./routers/notificationRouter");
const {
  processRecurringTransactionsService,
} = require("./services/recurringTransactionService");

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(helmet());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/auth", authRouter);
app.use("/api/users", userRouter);
app.use("/api/categories", categoryRouter);
app.use("/api/transactions", transactionRouter);
app.use("/api/budgets", budgetRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/reports", reportRouter);
app.use("/api/recurring-transactions", recurringTransactionRouter);
app.use("/api/notifications", notificationRouter);

app.get("/", (req, res) => {
  res.json({ message: "Monexa backend is alive 🚀" });
});

const startServer = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is not defined");
    }

    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });

    console.log("Database Connected");

    setInterval(async () => {
      try {
        const { createdCount } = await processRecurringTransactionsService();
        if (createdCount) {
          console.log(`Recurring transactions processed: ${createdCount}`);
        }
      } catch (err) {
        console.error("Recurring transactions processing failed:", err.message);
      }
    }, 60 * 1000);

    app.listen(PORT, () => {
      console.log("Listening on port", PORT);
    });
  } catch (err) {
    console.error("Startup failed:", err);
    process.exit(1);
  }
};

startServer();
