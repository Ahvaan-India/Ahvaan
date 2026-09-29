
const store = require('./smsStore');
const { triggerHeatwaveAlert } = require('./index');
const A = "9002660051", B = "9641674549", C = "9645938449"; // your own test numbers

(async () => {
  await store.enableSMSAlerts(A);
  console.log(await store.getSMSAlertStatus(A));        // enabled
  await triggerHeatwaveAlert("AHVAAN TEST 1");           // A gets it
  await store.disableSMSAlerts(A);
  await triggerHeatwaveAlert("AHVAAN TEST 2");           // nobody (empty list)
  await store.enableSMSAlerts(B); await store.enableSMSAlerts(C);
  await triggerHeatwaveAlert("AHVAAN TEST 3");           // B and C only
  await store.enableSMSAlerts(B);                        // duplicate: no crash
  await store.disableSMSAlerts("9111111111");            // never enabled: no crash
  await store.enableSMSAlerts("123").catch(e => console.log(e.message)); // invalid
})();