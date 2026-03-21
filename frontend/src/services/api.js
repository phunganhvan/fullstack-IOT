import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  timeout: 10000,
});

export const getDashboard      = ()              => api.get('/dashboard');
export const getSensors        = (params)        => api.get('/sensors', { params });
export const getActions        = (params)        => api.get('/actions', { params });
export const getDevices        = ()              => api.get('/devices');
export const controlDevice     = (deviceName, action) => api.post('/devices/control', { deviceName, action });

export default api;
