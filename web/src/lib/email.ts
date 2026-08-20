import nodemailer from "nodemailer";

interface SendActivationEmailParams {
  to: string;
  activationLink: string;
}

export async function sendActivationEmail({ to, activationLink }: SendActivationEmailParams) {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  const mailOptions = {
    from: process.env.SMTP_FROM || "Admin <noreply@orizon.in>",
    to,
    subject: "Activate your Orizon Account",
    text: `Hello,

Your Orizon account has been created. Please use the following link to activate your account and set up your password:

${activationLink}

This link is single-use and will expire in 48 hours.

Thank you,
Orizon Admin
`,
    html: `
      <p>Hello,</p>
      <p>Your Orizon account has been created. Please use the following link to activate your account and set up your password:</p>
      <p><a href="${activationLink}">${activationLink}</a></p>
      <p>This link is single-use and will expire in 48 hours.</p>
      <p>Thank you,<br/>Orizon Admin</p>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent: %s", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error("======================================");
    console.error("❌ ERROR: Failed to send activation email");
    console.error("Recipient:", to);
    if (error.code === 'EAUTH') {
      console.error("Authentication failed. Please check your GMAIL_USER and GMAIL_APP_PASSWORD in .env.local");
      console.error("Did you enable 2FA and create an App Password in your Google Account?");
    }
    console.error("Full Error Details:", error);
    console.error("======================================");
    return { success: false, error };
  }
}
