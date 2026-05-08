const nodemailer = require("nodemailer");

const transport = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  family: 4,

  auth: {
    user: process.env.NODE_CODE_SENDING_EMAIL_ADDRESS,
    pass: process.env.NODE_CODE_SENDING_EMAIL_PASSWORD,
  },

  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

module.exports = transport;