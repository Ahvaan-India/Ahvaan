import nodemailer from "nodemailer";
import { buildRichAlertHtml } from "../lib/email/compose";

async function main() {
  console.log("Testing rich HTML nodemailer email dispatch...");
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "ahvaan.alerts@gmail.com",
      pass: "nzweywmxdzpspahg",
    },
  });

  const html = buildRichAlertHtml({
    wardName: "Bidhannagar Ward 1",
    district: "North 24 Parganas",
    wardNumber: 1,
    level: "CRITICAL RISK",
    customMessage: "[Ahvaan Heat Alert] Automated subscription request for Ward 1, North 24 Parganas.\nNotification dispatched to recipient upon heat threshold breach.",
    htsi: 0.78,
    wbgt: 32.4,
    temp: 37.8,
    humidity: 78,
  });

  try {
    const info = await transporter.sendMail({
      from: "Ahvaan Alerts <ahvaan.alerts@gmail.com>",
      to: "ahvaan.alerts@gmail.com",
      subject: "[Ahvaan CRITICAL RISK Advisory] Bidhannagar Ward 1",
      text: "Ahvaan Heat Advisory - Bidhannagar Ward 1",
      html,
    });
    console.log("SUCCESS! Rich HTML Message ID:", info.messageId);
  } catch (e) {
    console.error("FAILED with error:", e);
  }
}

main();
