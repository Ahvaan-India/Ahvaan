const REQUIRED_FIELDS = [
  "State",
  "District",
  "Subdistt",
  "Town/Village",
  "Ward",
  "EB",
  "Level",
  "Name",
  "TRU",
  "No_HH",
  "TOT_P",
  "TOT_M",
  "TOT_F",
  "P_06",
  "P_LIT",
  "P_ILL",
  "TOT_WORK_P",
  "MAINWORK_P",
  "MAIN_CL_P",
  "MAIN_AL_P",
  "MAIN_HH_P",
  "MAIN_OT_P",
  "MARGWORK_P",
  "MARG_CL_P",
  "MARG_AL_P",
  "MARG_HH_P",
  "MARG_OT_P",
  "MARGWORK_3_6_P",
  "MARG_CL_3_6_P",
  "MARG_AL_3_6_P",
  "MARG_HH_3_6_P",
  "MARG_OT_3_6_P",
  "MARGWORK_0_3_P",
  "MARG_CL_0_3_P",
  "MARG_AL_0_3_P",
  "MARG_HH_0_3_P",
  "MARG_OT_0_3_P",
  "NON_WORK_P",
];

const NUMERIC_FIELDS = [
  "Ward",
  "EB",
  "No_HH",
  "TOT_P",
  "TOT_M",
  "TOT_F",
  "P_06",
  "P_LIT",
  "P_ILL",
  "TOT_WORK_P",
  "MAINWORK_P",
  "MAIN_CL_P",
  "MAIN_AL_P",
  "MAIN_HH_P",
  "MAIN_OT_P",
  "MARGWORK_P",
  "MARG_CL_P",
  "MARG_AL_P",
  "MARG_HH_P",
  "MARG_OT_P",
  "MARGWORK_3_6_P",
  "MARG_CL_3_6_P",
  "MARG_AL_3_6_P",
  "MARG_HH_3_6_P",
  "MARG_OT_3_6_P",
  "MARGWORK_0_3_P",
  "MARG_CL_0_3_P",
  "MARG_AL_0_3_P",
  "MARG_HH_0_3_P",
  "MARG_OT_0_3_P",
  "NON_WORK_P",
];

function isValidNumber(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(Number(value))
  );
}

function isMissing(value) {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  );
}

export function validateDemographics(wardData) {
  const failedFields = [];

  // No data
  if (!wardData || typeof wardData !== "object") {
    return {
      failedFields: [
        {
          field: "demographics",
          reason: "no_data",
        },
      ],
    };
  }

  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    if (!(field in wardData) || isMissing(wardData[field])) {
      failedFields.push({
        field,
        value: wardData[field],
        reason: "missing_field",
      });
    }
  }

  // Check numeric fields
  for (const field of NUMERIC_FIELDS) {
    const value = wardData[field];

    if (isMissing(value)) {
      continue;
    }

    if (!isValidNumber(value)) {
      failedFields.push({
        field,
        value,
        reason: "invalid_number",
      });
    }
  }

  // Check negative values
  for (const field of NUMERIC_FIELDS) {
    const value = wardData[field];

    if (!isValidNumber(value)) {
      continue;
    }

    if (Number(value) < 0) {
      failedFields.push({
        field,
        value,
        reason: "negative_value",
      });
    }
  }

  // TOT_M + TOT_F = TOT_P
  if (
    isValidNumber(wardData.TOT_P) &&
    isValidNumber(wardData.TOT_M) &&
    isValidNumber(wardData.TOT_F)
  ) {
    const total = Number(wardData.TOT_P);
    const male = Number(wardData.TOT_M);
    const female = Number(wardData.TOT_F);

    if (male + female !== total) {
      failedFields.push({
        field: "TOT_P",
        value: wardData.TOT_P,
        reason: "male_plus_female_does_not_equal_total",
      });
    }
  }

  // Children cannot exceed total population
  if (
    isValidNumber(wardData.P_06) &&
    isValidNumber(wardData.TOT_P) &&
    Number(wardData.P_06) > Number(wardData.TOT_P)
  ) {
    failedFields.push({
      field: "P_06",
      value: wardData.P_06,
      reason: "children_exceed_total_population",
    });
  }

  // Literate + illiterate cannot exceed total population
  if (
    isValidNumber(wardData.P_LIT) &&
    isValidNumber(wardData.P_ILL) &&
    isValidNumber(wardData.TOT_P)
  ) {
    if (
      Number(wardData.P_LIT) + Number(wardData.P_ILL) >
      Number(wardData.TOT_P)
    ) {
      failedFields.push({
        field: "P_LIT",
        value: wardData.P_LIT,
        reason: "literate_plus_illiterate_exceeds_total_population",
      });
    }
  }

  // Everything valid
  if (failedFields.length === 0) {
    return true;
  }

  return {
    failedFields,
  };
}
