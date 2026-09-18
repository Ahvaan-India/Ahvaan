require('dotenv').config();

const API_KEY = process.env.API_KEY;
const DEVICE_ID = process.env.DEVICE_ID;

async function sendTestAlert() {
    try {
        const response = await fetch(
            `https://api.textbee.dev/api/v1/gateway/devices/${DEVICE_ID}/send-sms`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": API_KEY,
                },
                body: JSON.stringify({
                    recipients: ["+91XXXXXXXXX"], // replace with real recipient number
                    message: "AHVAAN TEST ALERT: High heat detected!"
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

sendTestAlert();
