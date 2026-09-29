// TEMPORARY in-memory store. Replace ONLY this file's internals with MongoDB later.
const users = []; // { phoneNumber: "9876543210", smsAlertsEnabled: true }

function normalize(phone) {
  const digits = String(phone || "").replace(/\D/g, "").slice(-10);
  if (!/^[6-9]\d{9}$/.test(digits)) throw new Error("Invalid phone number");
  return digits;
}

async function setSMSPreference(phone, enabled) {
  const phoneNumber = normalize(phone);
  const user = users.find(u => u.phoneNumber === phoneNumber);
  if (user) user.smsAlertsEnabled = enabled;
  else users.push({ phoneNumber, smsAlertsEnabled: enabled });
  return { phoneNumber, smsAlertsEnabled: enabled };
}

const enableSMSAlerts = (p) => setSMSPreference(p, true);
const disableSMSAlerts = (p) => setSMSPreference(p, false);

async function getSMSAlertStatus(phone) {
  const phoneNumber = normalize(phone);
  const u = users.find(x => x.phoneNumber === phoneNumber);
  return { phoneNumber, smsAlertsEnabled: !!(u && u.smsAlertsEnabled) };
}

async function getSMSEnabledUsers() {
  return users.filter(u => u.smsAlertsEnabled);
}

module.exports = { enableSMSAlerts, disableSMSAlerts, getSMSAlertStatus, getSMSEnabledUsers };