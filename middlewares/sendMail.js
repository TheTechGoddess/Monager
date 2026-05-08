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
  console.log("📨 [MAIL INIT] sendMail called");

  console.log("📥 Raw input:", {
    from,
    to,
    subject,
  });

  console.log("🌍 ENV CHECK:", {
    RESEND_API_KEY_EXISTS: !!process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
  });

  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  const recipients = Array.isArray(to) ? to : [to];

  console.log("👥 Recipients normalized:", recipients);

  const fallbackFrom = process.env.RESEND_FROM_EMAIL || "";
  const sender = (from || fallbackFrom || "").trim();

  console.log("📤 Sender resolution:", {
    fromArg: from,
    fallbackFrom,
    finalSender: sender,
    length: sender.length,
    charCodes: [...sender].map(c => c.charCodeAt(0)), // reveals hidden chars
  });

  if (!sender) {
    console.error("❌ Sender is empty after resolution");
    throw new Error("RESEND_FROM_EMAIL is not configured");
  }

  const isValidFormat =
    /^[^<\s]+@[^<\s]+\.[^<\s>]+/.test(sender) || sender.includes("<");

  if (!isValidFormat) {
    console.error("❌ Invalid sender format detected:", sender);
    throw new Error(`Invalid from format: ${sender}`);
  }

  console.log("🚀 Sending email via Resend...");

  const response = await resend.emails.send({
    from: sender,
    to: recipients,
    subject,
    html,
    text,
  });

  console.log("📬 Resend response:", JSON.stringify(response, null, 2));

  if (response.error) {
    console.error("❌ Resend error:", response.error);
    throw new Error(response.error.message || "Resend email failed");
  }

  console.log("✅ Email sent successfully:", response.data?.id);

  return {
    accepted: recipients,
    id: response.data?.id || null,
  };
};

module.exports = { sendMail };