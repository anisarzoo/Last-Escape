import { io } from 'socket.io-client';

const URL = import.meta.env.VITE_BACKEND_URL || (process.env.NODE_ENV === 'production' 
  ? 'https://last-escape-server.onrender.com' 
  : `http://${window.location.hostname}:3001`);

export const socket = io(URL, {
  autoConnect: false,
  transports: ['websocket'] // Force WebSockets to avoid 404 polling issues
});
