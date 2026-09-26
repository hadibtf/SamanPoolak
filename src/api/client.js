// Thin fetch wrapper around the Signit API.
// Base URL comes from REACT_APP_API_URL (see .env.sample).
// Attaches the bearer token, parses JSON, and throws typed errors.
// On 401 it clears the token and notifies listeners so the app can show login.

const BASE_URL = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'signit_token';

let authToken = localStorage.getItem(TOKEN_KEY) || null;
const unauthorizedListeners = new Set();

export function getToken() {
  return authToken;
}

export function setToken(token) {
  authToken = token || null;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

// Subscribe to forced logouts (401). Returns an unsubscribe function.
export function onUnauthorized(listener) {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

export class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

async function request(method, path, body) {
  if (!BASE_URL) {
    throw new ApiError('REACT_APP_API_URL is not set', 0);
  }
  const headers = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      // Be explicit for the separate employee origin and never reuse a stale
      // cross-origin response after an API/CORS deployment.
      mode: 'cors',
      cache: 'no-store',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    // Offline / DNS / CORS failure — distinct from an HTTP error.
    throw new ApiError('Network request failed', 0, networkErr.message);
  }

  if (res.status === 401) {
    setToken(null);
    unauthorizedListeners.forEach((fn) => fn());
    throw new ApiError('Unauthorized', 401);
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data?.detail);
  }
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body ?? {}),
  put: (path, body) => request('PUT', path, body ?? {}),
  del: (path) => request('DELETE', path),
};

// --- Convenience wrappers -------------------------------------------------

export const authApi = {
  login: (username, password, surface = 'management') => api.post('/auth/login', { username, password, surface }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
};

// Admin-only user management.
export const usersApi = {
  list: () => api.get('/users'),
  create: (user) => api.post('/users', user),
  remove: (id) => api.del(`/users/${encodeURIComponent(id)}`),
};

export const peopleApi = {
  list: (updatedAfter) =>
    api.get(`/people${updatedAfter ? `?updatedAfter=${encodeURIComponent(updatedAfter)}` : ''}`),
  get: (id) => api.get(`/people/${encodeURIComponent(id)}`),
  create: (person) => api.post('/people', person),
  update: (id, patch) => api.put(`/people/${encodeURIComponent(id)}`, patch),
  employeeAccount: (id) => api.get(`/people/${encodeURIComponent(id)}/employee-account`),
  remove: (id) => api.del(`/people/${encodeURIComponent(id)}`),
};

export const ordersApi = {
  list: (updatedAfter) =>
    api.get(`/orders${updatedAfter ? `?updatedAfter=${encodeURIComponent(updatedAfter)}` : ''}`),
  get: (id) => api.get(`/orders/${encodeURIComponent(id)}`),
  create: (order) => api.post('/orders', order),
  update: (id, patch) => api.put(`/orders/${encodeURIComponent(id)}`, patch),
  remove: (id) => api.del(`/orders/${encodeURIComponent(id)}`),
};

export const markingsApi = {
  list: (updatedAfter) =>
    api.get(`/markings${updatedAfter ? `?updatedAfter=${encodeURIComponent(updatedAfter)}` : ''}`),
  create: (marking) => api.post('/markings', marking),
  remove: (id) => api.del(`/markings/${encodeURIComponent(id)}`),
};

export const expensesApi = {
  list: (updatedAfter) =>
    api.get(`/expenses${updatedAfter ? `?updatedAfter=${encodeURIComponent(updatedAfter)}` : ''}`),
  create: (expense) => api.post('/expenses', expense),
  update: (id, patch) => api.put(`/expenses/${encodeURIComponent(id)}`, patch),
  remove: (id) => api.del(`/expenses/${encodeURIComponent(id)}`),
};

export const productionApi = {
  employees: () => api.get('/production/employees'),
  listTasks: (updatedAfter) => api.get(`/production/tasks${updatedAfter ? `?updatedAfter=${encodeURIComponent(updatedAfter)}` : ''}`),
  assignTask: (task) => api.post('/production/tasks', task),
  updateTask: (taskId, patch) => api.put(`/production/tasks/${encodeURIComponent(taskId)}`, patch),
  setTaskWeight: (taskId, weightOf10Grams) => api.put(`/production/tasks/${encodeURIComponent(taskId)}/weight`, { weightOf10Grams }),
  taskLogs: (taskId) => api.get(`/production/tasks/${encodeURIComponent(taskId)}/logs`),
  logProduction: (taskId, log) => api.post(`/production/tasks/${encodeURIComponent(taskId)}/logs`, log),
  employeeMonthStatistics: (year, month) => api.get(`/production/statistics/month?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`),
  employeeDayStatistics: (date) => api.get(`/production/statistics/day?date=${encodeURIComponent(date)}`),
  managementStatisticsEmployees: () => api.get('/production/statistics/management/employees'),
  managementMonthStatistics: (year, month, employeeUserId) => api.get(`/production/statistics/management/month?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}${employeeUserId ? `&employeeUserId=${encodeURIComponent(employeeUserId)}` : ''}`),
  managementDayStatistics: (date, employeeUserId) => api.get(`/production/statistics/management/day?date=${encodeURIComponent(date)}${employeeUserId ? `&employeeUserId=${encodeURIComponent(employeeUserId)}` : ''}`),
  itemSummary: (orderId, itemUid) => api.get(`/production/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemUid)}/summary`),
};

export const issueNotesApi = {
  list: (updatedAfter) => api.get(`/issue-notes${updatedAfter ? `?updatedAfter=${encodeURIComponent(updatedAfter)}` : ''}`),
  create: (note) => api.post('/issue-notes', note),
  update: (id, patch) => api.put(`/issue-notes/${encodeURIComponent(id)}`, patch),
  remove: (id) => api.del(`/issue-notes/${encodeURIComponent(id)}`),
};

export const inquiriesApi = {
  list: () => api.get('/inquiries'),
  update: (id, patch) => api.put(`/inquiries/${encodeURIComponent(id)}`, patch),
};

export const jobApplicationsApi = {
  list: () => api.get('/job-applications'),
  get: (id) => api.get(`/job-applications/${encodeURIComponent(id)}`),
  update: (id, patch) => api.put(`/job-applications/${encodeURIComponent(id)}`, patch),
  status: () => api.get('/job-applications/status'),
  updateStatus: (open) => api.put('/job-applications/status', { open }),
  remove: (id) => api.del(`/job-applications/${encodeURIComponent(id)}`),
  removeAll: () => api.del('/job-applications'),
};

export const attendanceApi = {
  list: (updatedAfter) =>
    api.get(`/attendance${updatedAfter ? `?updatedAfter=${encodeURIComponent(updatedAfter)}` : ''}`),
  create: (scan) => api.post('/attendance', scan),
  update: (id, patch) => api.put(`/attendance/${encodeURIComponent(id)}`, patch),
  remove: (id) => api.del(`/attendance/${encodeURIComponent(id)}`),
  // Bulk device import: { records:[{cardNo,dateKey,time,status,insertType}], employees? }
  import: (payload) => api.post('/attendance/import', payload),
};

export const holidaysApi = {
  list: (updatedAfter) =>
    api.get(`/holidays${updatedAfter ? `?updatedAfter=${encodeURIComponent(updatedAfter)}` : ''}`),
  // Bulk import of a YEAR.json: { data:[{shamsiDate,isHoliday,holidayDesription}] }
  import: (payload) => api.post('/holidays/import', payload),
};

// Admin-only database backup / restore.
export const adminApi = {
  backup: () => api.get('/backup'),
  restore: (data) => api.post('/restore', data),
};
