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

  const copyToClipboard = () => {
    navigator.clipboard.writeText(roomId);
    const btn = document.getElementById('room-id-display');
    const originalText = btn.innerText;
    btn.innerText = 'COPIED!';
    setTimeout(() => {
      btn.innerText = originalText;
    }, 2000);
  };

  if (!gameStarted) {
    return (
      <div className="lobby-container">
        <h1>LAST ESCAPE</h1>
        <div className="lobby-content-grid">
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
              <h2 
                id="room-id-display" 
                className="clickable-room-id" 
                onClick={copyToClipboard}
                title="Click to copy"
              >
                Room: {roomId}
              </h2>
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

          {/* How to Play Section */}
          <div className="how-to-play">
            <div className="htp-column">
              <h3>OBJECTIVE</h3>
              <p>Locate <span>MASTER KEY</span> at the center. Reach a <span>CORNER EXIT</span> to win.</p>
            </div>
            <div className="htp-column">
              <h3>MECHANICS</h3>
              <ul>
                <li><span>DRAIN</span>: Carrier drains HP from others.</li>
                <li><span>REWARD</span>: Kills restore HP & Range.</li>
                <li><span>ZONE</span>: Stay inside to avoid damage.</li>
              </ul>
            </div>
            <div className="htp-column">
              <h3>CONTROLS</h3>
              <div className="controls-grid">
                <div className="control-item"><span>ARROWS</span> MOVE</div>
                <div className="control-item"><span>WASD</span> AIM</div>
                <div className="control-item"><span>SPACE</span> FIRE</div>
              </div>
            </div>
          </div>
        </div>
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
