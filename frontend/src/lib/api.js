import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

// Centralized error helper
export const apiError = (e, fallback = "Une erreur est survenue") => {
  return e?.response?.data?.detail || e?.message || fallback;
};
