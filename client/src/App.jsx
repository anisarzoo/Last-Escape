import React, { useState, useEffect } from 'react';
import { socket } from './socket';
import Game from './Game';
import './App.css';

function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [playerName, setPlayerName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [roomData, setRoomData] = useState(null);

  useEffect(() => {
    function onRoomUpdate(data) {
      setRoomData(data);
      setRoomId(data.id);
    }

    function onGameStarted() {
      setGameStarted(true);
    }

    socket.on('room-update', onRoomUpdate);
    socket.on('game-started', onGameStarted);

    return () => {
      socket.off('room-update', onRoomUpdate);
      socket.off('game-started', onGameStarted);
    };
  }, []);

  const handleCreate = () => {
    if (playerName) {
      const newRoomId = Math.random().toString(36).substr(2, 6).toUpperCase();
      socket.connect();
      socket.emit('join-room', { roomId: newRoomId, playerName });
      setIsJoined(true);
    }
  };

  const handleJoin = () => {
    if (playerName && roomId) {
      socket.connect();
      socket.emit('join-room', { roomId, playerName });
      setIsJoined(true);
    }
  };

  const handleStart = () => {
    socket.emit('start-game');
  };

  if (!gameStarted) {
    return (
      <div className="lobby-container">
        <h1>LAST ESCAPE</h1>
        {!isJoined ? (
          <div className="login-box">
            <input
              type="text"
              placeholder="Your Name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
            />
            <button onClick={handleCreate} disabled={!playerName}>
              CREATE ROOM
            </button>
            <div className="divider">OR</div>
            <input
              type="text"
              placeholder="Room ID"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
            />
            <button onClick={handleJoin} disabled={!playerName || !roomId}>
              JOIN ROOM
            </button>
          </div>
        ) : (
          <div className="login-box lobby-list">
            <h2>Room: {roomId}</h2>
            <div className="player-list-scroll">
              {roomData?.players.map(p => (
                <div key={p.id} className="player-row">
                  <span className="player-dot" style={{ background: p.color }}></span>
                  {p.name} {p.id === socket.id && '(You)'} {p.isHost && '👑'}
                </div>
              ))}
            </div>
            {roomData?.hostId === socket.id ? (
              <button onClick={handleStart} className="start-btn">
                START GAME
              </button>
            ) : (
              <p className="waiting-msg">Waiting for host to start...</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="game-wrapper">
      <Game roomData={roomData} playerName={playerName} />
    </div>
  );
}

export default App;
