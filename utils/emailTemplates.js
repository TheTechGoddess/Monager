const APP_NAME = "Monager";
const APP_TAGLINE = "Smarter personal finance management";
const APP_SUPPORT_EMAIL = "hello@contact.favourenwonwu.com";
const PRIMARY_COLOR = "#C9429E";
const SOFT_BACKGROUND_COLOR = "#FFF5FB";
const DEFAULT_PLATFORM_URL = "https://monager.favourenwonwu.com";
const PLATFORM_URL =
  process.env.MONEXA_PLATFORM_URL || DEFAULT_PLATFORM_URL;
const LOGO_URL =
  process.env.MONEXA_LOGO_URL || `${PLATFORM_URL}/assets/monagerlight.png`;
const CODE_EXPIRY_MINUTES = 5;

const baseEmailTemplate = ({
  title,
  preheader,
  intro,
  code,
  expiryText,
  detailsTitle,
  details,
  footerNote,
}) => `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:${SOFT_BACKGROUND_COLOR};font-family:Arial,sans-serif;color:#111827;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SOFT_BACKGROUND_COLOR};padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="background:${PRIMARY_COLOR};padding:24px;text-align:center;">
                <img src="${LOGO_URL}" alt="${APP_NAME} logo" style="max-height:56px;display:block;margin:0 auto 4px auto;" />
                <p style="margin:0;font-size:13px;color:#ffffff;">${APP_TAGLINE}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <h2 style="margin:0 0 12px 0;font-size:20px;color:#111827;">${title}</h2>
                <p style="margin:0 0 20px 0;font-size:14px;color:#4b5563;line-height:1.6;">${intro}</p>
                <div style="padding:16px;border:1px dashed ${PRIMARY_COLOR};border-radius:12px;background:${SOFT_BACKGROUND_COLOR};text-align:center;">
                  <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#6b7280;">Verification Code</p>
                  <p style="margin:0;font-size:32px;font-weight:700;letter-spacing:8px;color:#111827;">${code}</p>
                </div>
                <p style="margin:10px 0 0 0;font-size:13px;color:#B91C1C;font-weight:700;">
                  ${expiryText}
                </p>
                <div style="margin-top:20px;padding:16px;border-radius:10px;background:${SOFT_BACKGROUND_COLOR};">
                  <p style="margin:0 0 8px 0;font-size:13px;font-weight:700;color:#111827;">${detailsTitle}</p>
                  <ul style="padding-left:18px;margin:0;color:#4b5563;font-size:13px;line-height:1.7;">
                    ${details.map((item) => `<li>${item}</li>`).join("")}
                  </ul>
                </div>
                <p style="margin:20px 0 0 0;font-size:12px;color:#6b7280;line-height:1.6;">
                  ${footerNote}
                </p>
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #e5e7eb;padding:16px 24px;background:#fafafa;">
                <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6;">
                  Need help? Contact us at
                  <a href="mailto:${APP_SUPPORT_EMAIL}" style="color:${PRIMARY_COLOR};text-decoration:none;">${APP_SUPPORT_EMAIL}</a>
                  or visit <a href="${PLATFORM_URL}" style="color:${PRIMARY_COLOR};text-decoration:none;">${PLATFORM_URL}</a>.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

const buildVerificationCodeEmail = (code) => ({
  html: baseEmailTemplate({
    title: "Confirm your email",
    preheader: "Use this code to verify your Monager account.",
    intro:
      "Welcome to Monager. Use the code below to verify your email address and finish setting up your account.",
    code,
    expiryText: `Code expires in ${CODE_EXPIRY_MINUTES} minutes.`,
    detailsTitle: "Quick details",
    details: [
      `This code expires in ${CODE_EXPIRY_MINUTES} minutes.`,
      "For your security, do not share this code with anyone.",
      "If you did not request this, you can ignore this email safely.",
    ],
    footerNote:
      "This email was sent automatically by Monager account security.",
  }),
  text: `Monager verification code: ${code}. This code expires in ${CODE_EXPIRY_MINUTES} minutes.`,
});

const buildForgotPasswordCodeEmail = (code) => ({
  html: baseEmailTemplate({
    title: "Reset your password",
    preheader: "Use this code to reset your Monager password.",
    intro:
      "We received a password reset request for your Monager account. Use the code below to continue.",
    code,
    expiryText: `Code expires in ${CODE_EXPIRY_MINUTES} minutes.`,
    detailsTitle: "Security reminder",
    details: [
      `This code expires in ${CODE_EXPIRY_MINUTES} minutes.`,
      "If you did not request a password reset, secure your account immediately.",
      "Never share this code with anyone, including support.",
    ],
    footerNote:
      "If this request was not from you, please ignore this email and consider changing your password.",
  }),
  text: `Monager reset code: ${code}. This code expires in ${CODE_EXPIRY_MINUTES} minutes.`,
});

module.exports = {
  buildVerificationCodeEmail,
  buildForgotPasswordCodeEmail,
};
