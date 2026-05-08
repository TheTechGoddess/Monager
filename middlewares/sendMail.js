const { Resend } = require("resend");

// Gmail setup (deprecated) - kept for reference only.
// const nodemailer = require("nodemailer");
// const transport = nodemailer.createTransport({
//   host: "smtp.gmail.com",
//   port: 465,
//   secure: true,
//   family: 4,
//   auth: {
//     user: process.env.NODE_CODE_SENDING_EMAIL_ADDRESS,
//     pass: process.env.NODE_CODE_SENDING_EMAIL_PASSWORD,
//   },
//   connectionTimeout: 10000,
//   greetingTimeout: 10000,
//   socketTimeout: 15000,
// });

const sendMail = async ({ from, to, subject, html, text }) => {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const recipients = Array.isArray(to) ? to : [to];
  const sender = (from || process.env.RESEND_FROM_EMAIL || "").trim();

  if (!/^[^<\s]+@[^<\s]+\.[^<\s>]+/.test(sender) && !sender.includes("<")) {
    throw new Error(`Invalid from format: ${sender}`);
  }

  if (!sender) {
    throw new Error("RESEND_FROM_EMAIL is not configured");
  }

  const response = await resend.emails.send({
    from: sender,
    to: recipients,
    subject,
    html,
    text,
  });

  if (response.error) {
    throw new Error(response.error.message || "Resend email failed");
  }

  return {
    accepted: recipients,
    id: response.data?.id || null,
  };
};

module.exports = { sendMail };