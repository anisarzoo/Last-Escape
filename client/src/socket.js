import { io } from 'socket.io-client';

const URL = import.meta.env.VITE_BACKEND_URL || (import.meta.env.PROD
  ? 'https://last-escape-server.onrender.com' 
  : `http://${window.location.hostname}:3001`);

export const socket = io(URL, {
  autoConnect: false
});
