const REQUIRED_FIELDS = [
  "time",
  "temperature_2m",
  "relative_humidity_2m",
  "dew_point_2m",
  "apparent_temperature",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "shortwave_radiation",
  "direct_radiation",
  "diffuse_radiation",
  "precipitation",
  "rain",
];

const RANGES = {
  temperature_2m: [-50, 60],
  relative_humidity_2m: [0, 100],
  dew_point_2m: [-50, 60],
  apparent_temperature: [-60, 70],

  wind_speed_10m: [0, 150],
  wind_direction_10m: [0, 360],
  wind_gusts_10m: [0, 200],

  shortwave_radiation: [0, 1500],
  direct_radiation: [0, 1500],
  diffuse_radiation: [0, 1500],

  precipitation: [0, 500],
  rain: [0, 500],
};

function isValidNumber(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== "" &&
    typeof value === "number" &&
    Number.isFinite(value)
  );
}

export function validateForecast(result) {
  const failedFields = [];

  // API/request failed
  if (!result || result.success !== true) {
    return {
      status: false,
      failedFields: ["forecast_api"],
    };
  }

  const hourly = result.hourly;

  if (!hourly) {
    return {
      status: false,
      failedFields: ["hourly"],
    };
  }

  // Check required fields exist and are arrays
  for (const field of REQUIRED_FIELDS) {
    if (!Array.isArray(hourly[field])) {
      failedFields.push({
        field,
        reason: "missing_or_invalid_field",
      });
    }
  }

  // Stop here if required arrays are missing
  if (failedFields.length > 0) {
    return {
      status: false,
      failedFields,
    };
  }

  const recordCount = hourly.time.length;

  // No records
  if (recordCount === 0) {
    failedFields.push({
      field: "time",
      reason: "no_records",
    });
  }

  // Check that every field has the same number of records
  for (const field of REQUIRED_FIELDS) {
    if (hourly[field].length !== recordCount) {
      failedFields.push({
        field,
        reason: "different_record_count",
      });
    }
  }

  // Validate timestamps
  for (let i = 0; i < hourly.time.length; i++) {
    const time = hourly.time[i];

    if (
      typeof time !== "string" ||
      time.trim() === "" ||
      Number.isNaN(new Date(time).getTime())
    ) {
      failedFields.push({
        field: "time",
        index: i,
        value: time,
        reason: "invalid_timestamp",
      });
    }
  }

  // Validate numerical fields
  for (const field of Object.keys(RANGES)) {
    const [min, max] = RANGES[field];

    for (let i = 0; i < hourly[field].length; i++) {
      const value = hourly[field][i];

      // Missing / invalid value
      if (!isValidNumber(value)) {
        failedFields.push({
          field,
          index: i,
          value,
          reason: "missing_or_invalid_value",
        });

        continue;
      }

      // Impossible / unreasonable value
      if (value < min || value > max) {
        failedFields.push({
          field,
          index: i,
          value,
          reason: `value_out_of_range_${min}_to_${max}`,
        });
      }
    }
  }

  // Everything is valid
  if (failedFields.length === 0) {
    return true;
  }

  return {
    status: false,
    failedFields,
  };
}
