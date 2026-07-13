import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'explainx_token';

export const saveToken  = (token) => sessionStorage.setItem(TOKEN_KEY, token);
export const loadToken  = () => sessionStorage.getItem(TOKEN_KEY);
export const clearToken = () => sessionStorage.removeItem(TOKEN_KEY);

function authHeaders() {
  const token = loadToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const verifyPassword = (password, student = '') =>
  axios.post(`${API_URL}/auth`, { password, student });

export const getConfig = () => axios.get(`${API_URL}/config`);

export const uploadChapter = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return axios.post(`${API_URL}/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data', ...authHeaders() },
    timeout: 300000,
  });
};

export const askQuestion = (session_id, question, history = [], length = 'normal') =>
  axios.post(`${API_URL}/ask`, { session_id, question, history, length }, { headers: authHeaders() });

export const getSummary = (session_id, topic) =>
  axios.post(`${API_URL}/summary`, { session_id, topic }, { headers: authHeaders() });

export const getQuiz = (session_id) =>
  axios.post(`${API_URL}/quiz`, { session_id }, { headers: authHeaders() });

export const getFlashcards = (session_id) =>
  axios.post(`${API_URL}/flashcards`, { session_id }, { headers: authHeaders() });

export const explainSimply = (session_id, question) =>
  axios.post(`${API_URL}/eli12`, { session_id, question }, { headers: authHeaders() });

export const getFollowups = (session_id, answer) =>
  axios.post(`${API_URL}/followups`, { session_id, answer }, { headers: authHeaders() });

export const checkHealth = () => axios.get(`${API_URL}/health`);
