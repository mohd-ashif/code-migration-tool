import nodemailer from "nodemailer";
import { logger } from "../utils/logger";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
  port: Number(process.env.SMTP_PORT || 587),
  secure: false, // true for port 465, false for other ports like 587
  auth: {
    user: process.env.SMTP_USER || "mohdaszif077@gmail.com",
    pass: process.env.SMTP_PASS,
  },
});

// Verify the transporter on server startup
transporter.verify((error: Error | null) => {
  if (error) {
    logger.error(`SMTP connection failed: ${error.message}`);
  } else {
    logger.info("SMTP connected successfully");
  }
});

interface SendEmailParams {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailParams): Promise<void> {
  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER || "mohdaszif077@gmail.com",
    to,
    subject,
    html,
    text,
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info(`Email sent successfully to ${to}`);
  } catch (error: any) {
    logger.error(`Failed to send email to ${to}: ${error.message}`);
    throw new Error(`Email delivery failed: ${error.message}`);
  }
}
