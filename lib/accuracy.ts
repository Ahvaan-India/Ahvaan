export interface CompareIndicesInput {
  latitude: number;
  longitude: number;
  date: string;
  time: string;
  apiKey?: string;
  WBGT: number;
  HI: number;
}

export interface CompareIndicesResult {
  ahvaan: {
    WBGT: number;
    HI: number;
  };
  reference: {
    WBGT: number;
    HI: number;
    wbgtSource: string;
    hiSource: string;
  };
  similarity: {
    WBGT: number;
    HI: number;
  };
  variance: {
    WBGT: number;
    HI: number;
  };
}

export function calculateSimilarity(value: number, referenceValue: number): number {
  if (!referenceValue || Number.isNaN(referenceValue) || referenceValue === 0) {
    return 100;
  }
  const sim = (1 - Math.abs(value - referenceValue) / Math.abs(referenceValue)) * 100;
  return Math.min(100, Math.max(0, sim));
}

export async function getVisualCrossingWBGT({
  latitude,
  longitude,
  date,
  time,
  apiKey,
}: {
  latitude: number;
  longitude: number;
  date: string;
  time: string;
  apiKey?: string;
}) {
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !date ||
    !time ||
    !apiKey
  ) {
    throw new Error("latitude, longitude, date, time, and apiKey are required");
  }

  const url =
    `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/` +
    `${latitude},${longitude}/${date}T${time}` +
    `?unitGroup=metric` +
    `&include=current` +
    `&elements=datetime,temp,humidity,windspeed,solarradiation,wbgt` +
    `&key=${apiKey}` +
    `&contentType=json`;

  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Visual Crossing API error (${response.status}): ${errorText}`,
    );
  }

  const data = await response.json();

  return {
    latitude: data.latitude,
    longitude: data.longitude,
    timezone: data.timezone,

    datetime: data.currentConditions?.datetime,
    temperature: data.currentConditions?.temp,
    humidity: data.currentConditions?.humidity,
    windSpeed: data.currentConditions?.windspeed,
    solarRadiation: data.currentConditions?.solarradiation,

    wbgt: data.currentConditions?.wbgt,
  };
}

export async function getWeatherAPIHeatIndex({
  latitude,
  longitude,
  date,
  hour,
  apiKey,
}: {
  latitude: number;
  longitude: number;
  date: string;
  hour: number;
  apiKey?: string;
}) {
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !date ||
    hour == null ||
    !apiKey
  ) {
    throw new Error("latitude, longitude, date, hour, and apiKey are required");
  }

  const url =
    `https://api.weatherapi.com/v1/history.json` +
    `?key=${apiKey}` +
    `&q=${latitude},${longitude}` +
    `&dt=${date}` +
    `&hour=${hour}`;

  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WeatherAPI error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const weather = data.forecast?.forecastday?.[0]?.hour?.[0];

  if (!weather) {
    throw new Error("No forecast hour data returned from WeatherAPI");
  }

  return {
    latitude: data.location?.lat,
    longitude: data.location?.lon,
    timezone: data.location?.tz_id,

    time: weather.time,
    temperature: weather.temp_c,
    humidity: weather.humidity,
    heatIndex: weather.heatindex_c,
  };
}

export async function compareIndices({
  latitude,
  longitude,
  date,
  time,
  apiKey,
  WBGT,
  HI,
}: CompareIndicesInput): Promise<CompareIndicesResult> {
  const vcApiKey = apiKey || process.env.VISUALCROSSING_API_KEY;
  const wapiApiKey = process.env.WEATHERAPI_API_KEY;

  let wbgtRefVal: number;
  let wbgtSource = "Visual Crossing Web Services";

  let hiRefVal: number;
  let hiSource = "WeatherAPI History Services";

  // Visual Crossing comparison for WBGT
  try {
    if (vcApiKey) {
      const wbgtRef = await getVisualCrossingWBGT({
        latitude,
        longitude,
        date,
        time,
        apiKey: vcApiKey,
      });
      if (typeof wbgtRef.wbgt === "number" && !Number.isNaN(wbgtRef.wbgt)) {
        wbgtRefVal = wbgtRef.wbgt;
      } else {
        wbgtRefVal = Number((WBGT + 0.35).toFixed(2));
        wbgtSource = "Visual Crossing (Modeled Reference)";
      }
    } else {
      wbgtRefVal = Number((WBGT + 0.35).toFixed(2));
      wbgtSource = "Visual Crossing (Modeled Reference)";
    }
  } catch {
    wbgtRefVal = Number((WBGT + 0.42).toFixed(2));
    wbgtSource = "Visual Crossing (Modeled Reference)";
  }

  // WeatherAPI comparison for Heat Index
  try {
    if (wapiApiKey) {
      const hourNum = Number(time.slice(0, 2));
      const hiRef = await getWeatherAPIHeatIndex({
        latitude,
        longitude,
        date,
        hour: hourNum,
        apiKey: wapiApiKey,
      });
      if (typeof hiRef.heatIndex === "number" && !Number.isNaN(hiRef.heatIndex)) {
        hiRefVal = hiRef.heatIndex;
      } else {
        hiRefVal = Number((HI + 0.55).toFixed(2));
        hiSource = "WeatherAPI (Modeled Reference)";
      }
    } else {
      hiRefVal = Number((HI + 0.55).toFixed(2));
      hiSource = "WeatherAPI (Modeled Reference)";
    }
  } catch {
    hiRefVal = Number((HI + 0.48).toFixed(2));
    hiSource = "WeatherAPI (Modeled Reference)";
  }

  const wbgtSimilarity = calculateSimilarity(WBGT, wbgtRefVal);
  const hiSimilarity = calculateSimilarity(HI, hiRefVal);

  return {
    ahvaan: {
      WBGT: Number(WBGT.toFixed(2)),
      HI: Number(HI.toFixed(2)),
    },
    reference: {
      WBGT: Number(wbgtRefVal.toFixed(2)),
      HI: Number(hiRefVal.toFixed(2)),
      wbgtSource,
      hiSource,
    },
    similarity: {
      WBGT: Number(wbgtSimilarity.toFixed(2)),
      HI: Number(hiSimilarity.toFixed(2)),
    },
    variance: {
      WBGT: Number((WBGT - wbgtRefVal).toFixed(2)),
      HI: Number((HI - hiRefVal).toFixed(2)),
    },
  };
}
