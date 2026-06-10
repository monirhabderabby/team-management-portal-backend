import buildTransporter from "../config/email.js";

const sendEmail = async ({ to, subject, html }) => {
  const transporter = buildTransporter();
  if (!transporter) {
    console.log("SMTP not configured. Email content:", { to, subject });
    return;
  }

  const from = process.env.SMTP_FROM || "Team Management Portal <no-reply@teamflow.com>";
  await transporter.sendMail({ from, to, subject, html });
};

export default sendEmail;
