import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export const uploadChapter = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return axios.post(`${API_URL}/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000,  // 5 minutes — large PDFs take time to embed
  });
};

export const askQuestion = (session_id, question) =>
  axios.post(`${API_URL}/ask`, { session_id, question });

export const getSummary = (session_id, topic) =>
  axios.post(`${API_URL}/summary`, { session_id, topic });

export const checkHealth = () => axios.get(`${API_URL}/health`);

export const verifyPassword = (password) =>
  axios.post(`${API_URL}/auth`, { password });
