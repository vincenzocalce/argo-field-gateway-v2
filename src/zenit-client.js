const DEFAULT_BASE_URL = "https://api.zenittelematics.com";
const MAX_PAGES = 20;

class ZenitUpstreamError extends Error {
  constructor(code, status = 502, { retryAfter = null, cause = null } = {}) {
    super(code, { cause });
    this.name = "ZenitUpstreamError";
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function validateBaseUrl(value) {
  const url = new URL(value || DEFAULT_BASE_URL);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  if (url.protocol !== "https:" && !local) throw new Error("ZENIT_API_BASE_URL deve usare HTTPS");
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url;
}

function isValidVehicleId(value) {
  return typeof value === "string" && /^veh_[A-Za-z0-9]{6,80}$/.test(value);
}

function isRfc3339(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function validateWindow(from, to) {
  if (!isRfc3339(from) || !isRfc3339(to)) return "from e to devono essere timestamp RFC 3339 con fuso";
  const duration = Date.parse(to) - Date.parse(from);
  if (duration <= 0) return "to deve essere successivo a from";
  if (duration > 31 * 24 * 60 * 60 * 1000) return "la finestra non può superare 31 giorni";
  return null;
}

function arrayData(payload) {
  return Array.isArray(payload?.data) ? payload.data : [];
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeVehicle(vehicle) {
  return {
    id: vehicle?.id ?? null,
    plate: vehicle?.plate ?? null,
    name: vehicle?.name ?? null,
    make: vehicle?.make ?? null,
    model: vehicle?.model ?? null,
    type: vehicle?.type ?? null,
    capabilities: vehicle?.capabilities ?? null,
    canBusParameters: Array.isArray(vehicle?.canBusParameters) ? vehicle.canBusParameters : []
  };
}

function normalizeMission(mission) {
  return {
    id: mission?.id ?? null,
    startedAt: mission?.startedAt ?? null,
    endedAt: mission?.endedAt ?? null,
    inProgress: mission?.inProgress ?? null,
    durationSeconds: finiteNumber(mission?.durationSeconds),
    distanceKm: finiteNumber(mission?.distanceKm),
    maxSpeedKmh: finiteNumber(mission?.maxSpeedKmh),
    averageSpeedKmh: finiteNumber(mission?.averageSpeedKmh)
  };
}

function normalizeStop(stop) {
  return {
    id: stop?.id ?? null,
    startedAt: stop?.startedAt ?? null,
    endedAt: stop?.endedAt ?? null,
    inProgress: stop?.inProgress ?? null,
    durationSeconds: finiteNumber(stop?.durationSeconds),
    type: stop?.type ?? null,
    location: stop?.location ? {
      lat: finiteNumber(stop.location.lat),
      lon: finiteNumber(stop.location.lon),
      address: stop.location.address ?? null
    } : null
  };
}

function normalizePosition(position) {
  if (!position) return null;
  return {
    recordedAt: position.recordedAt ?? null,
    receivedAt: position.receivedAt ?? null,
    gpsValid: position.gpsValid ?? null,
    ignitionOn: position.ignitionOn ?? null,
    moving: position.moving ?? null,
    speedKmh: finiteNumber(position.speedKmh),
    location: position.location ? {
      lat: finiteNumber(position.location.lat),
      lon: finiteNumber(position.location.lon)
    } : null
  };
}

function createZenitClient({ apiKey, baseUrl = DEFAULT_BASE_URL, fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  if (typeof apiKey !== "string" || apiKey.trim().length === 0) return null;
  if (typeof fetchImpl !== "function") throw new Error("fetch non disponibile");
  const root = validateBaseUrl(baseUrl);

  async function request(path, params = {}) {
    const url = new URL(path, root);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        signal: controller.signal
      });
    } catch (error) {
      const code = error?.name === "AbortError" ? "zenit_timeout" : "zenit_unreachable";
      throw new ZenitUpstreamError(code, 503, { cause: error });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const retryAfter = response.headers?.get?.("retry-after") || null;
      if (response.status === 429) throw new ZenitUpstreamError("zenit_rate_limited", 503, { retryAfter });
      if (response.status === 401 || response.status === 403) throw new ZenitUpstreamError("zenit_access_denied", 502);
      throw new ZenitUpstreamError("zenit_upstream_error", response.status >= 500 ? 503 : 502);
    }
    try {
      return await response.json();
    } catch (error) {
      throw new ZenitUpstreamError("zenit_invalid_response", 502, { cause: error });
    }
  }

  async function fetchAll(path, params) {
    const items = [];
    let cursor = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const payload = await request(path, { ...params, ...(cursor ? { cursor } : {}) });
      items.push(...arrayData(payload));
      cursor = payload?.page?.nextCursor || null;
      if (!cursor) return items;
    }
    throw new ZenitUpstreamError("zenit_pagination_limit", 502);
  }

  async function listVehicles() {
    const payload = await request("/api/public/v1/vehicles");
    return arrayData(payload).map(normalizeVehicle);
  }

  async function getDailyTelemetry(vehicleId, { from, to }) {
    if (!isValidVehicleId(vehicleId)) throw new TypeError("invalid_vehicle_id");
    if (validateWindow(from, to)) throw new TypeError("invalid_window");
    const encodedId = encodeURIComponent(vehicleId);
    const params = { from, to };
    const [missionRows, stopRows, positionPayload] = await Promise.all([
      fetchAll(`/api/public/v1/vehicles/${encodedId}/missions`, params),
      fetchAll(`/api/public/v1/vehicles/${encodedId}/stops`, params),
      request(`/api/public/v1/vehicles/${encodedId}/position`)
    ]);
    const missions = missionRows.map(normalizeMission);
    const stops = stopRows.map(normalizeStop);
    const distanceKm = missions.reduce((sum, item) => sum + (item.distanceKm ?? 0), 0);
    const stopSeconds = stops.reduce((sum, item) => sum + (item.durationSeconds ?? 0), 0);
    return {
      provider: "zenit",
      vehicleId,
      requestedWindow: { from, to },
      capturedAt: new Date().toISOString(),
      summary: {
        missionsCount: missions.length,
        distanceKm: Math.round(distanceKm * 100) / 100,
        stopsCount: stops.length,
        stopMinutes: Math.round(stopSeconds / 60)
      },
      missions,
      stops,
      latestPosition: normalizePosition(positionPayload?.data)
    };
  }

  return { listVehicles, getDailyTelemetry };
}

module.exports = { ZenitUpstreamError, createZenitClient, isValidVehicleId, validateWindow };
