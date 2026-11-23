import { api } from './api.js';

export const getOfficerDashboard = () => api.get('/dashboard/officer').then((r) => r.data);
export const listTenders = (params) => api.get('/tenders', { params }).then((r) => r.data);
export const getTender = (id) => api.get(`/tenders/${id}`).then((r) => r.data.tender);
export const updateTender = (id, body) => api.patch(`/tenders/${id}`, body).then((r) => r.data.tender);
export const closeTender = (id) => api.post(`/tenders/${id}/close`).then((r) => r.data.tender);
export const listReviewers = () => api.get('/tenders/reviewers').then((r) => r.data.items);
export const assignReviewers = (id, reviewerIds) => api.put(`/tenders/${id}/reviewers`, { reviewerIds }).then((r) => r.data.tender);
export const getRequirements = (id, version) => api.get(`/tenders/${id}/requirements`, { params: version ? { version } : {} }).then((r) => r.data);
export const saveRequirements = (id, requirements) => api.put(`/tenders/${id}/requirements`, { requirements }).then((r) => r.data);
export const approveRequirements = (id) => api.post(`/tenders/${id}/requirements/approve`).then((r) => r.data);

export function createTender(fields, file) {
  const f = new FormData();
  Object.entries(fields).forEach(([k, v]) => { if (v !== undefined && v !== '') f.append(k, v); });
  f.append('tenderFile', file);
  return api.post('/tenders', f).then((r) => r.data);
}
// Authenticated download: the bearer token cannot ride on a plain <a href>, so fetch as a blob.
export async function openTenderFile(id) {
  const r = await api.get(`/tenders/${id}/file`, { responseType: 'blob' });
  window.open(URL.createObjectURL(r.data), '_blank', 'noopener');
}
