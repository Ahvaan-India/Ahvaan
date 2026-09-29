require('dotenv').config();
const API_KEY = process.env.API_KEY;
const DEVICE_ID = process.env.DEVICE_ID;
const {getSMSEnabledUsers} = require ('./smsStore');
async function sendAlertSMS(message, recipients) {
    try {
        if(!recipients.length) {
            console.log("No sms-enabled users");
            return;
        }
        if (process.env.DRY_RUN === 'true') {
            console.log("DRY RUN, would send to:", recipients, "| message:", message);
            return;
        }
        const response = await fetch(
            `https://api.textbee.dev/api/v1/gateway/devices/${DEVICE_ID}/send-sms`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": API_KEY,
                },
                body: JSON.stringify({
                    recipients: recipients,
                    message: message
                })
            }
        );
        const data = await response.json();

        if (!response.ok) {
            console.error("❌ Failed to send SMS. Status:", response.status);
            console.error("Response:", data);
            return;
        }

        console.log("✅ SMS sent successfully!");
        console.log(data);
    } catch (err) {
        console.error("❌ Error while sending SMS:", err);
    }
}
async function triggerHeatwaveAlert(message) {
    const users = await getSMSEnabledUsers();
    const recipients = users.map(u => "+91" + u.phoneNumber);
    await sendAlertSMS(message, recipients);
}

module.exports = { sendAlertSMS, triggerHeatwaveAlert };
