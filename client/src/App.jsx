import React, { useState, useEffect } from 'react';
import { socket } from './socket';
import Game from './Game';
import { 
  Trophy, 
  Settings, 
  Gamepad2, 
  Crown, 
  User, 
  ArrowRight, 
  Copy, 
  Check 
} from 'lucide-react';
import './App.css';

function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [playerName, setPlayerName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [roomData, setRoomData] = useState(null);
  const [isCopied, setIsCopied] = useState(false);

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
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  if (!gameStarted) {
    return (
      <div className="lobby-container">
        {/* Background Decorative Elements */}
        <div className="bg-blobs">
          <div className="blob blob-1"></div>
          <div className="blob blob-2"></div>
          <div className="blob blob-3"></div>
        </div>

        <h1>LAST ESCAPE</h1>
        
        <div className="lobby-content-grid">
          {!isJoined ? (
            <div className="login-box">
              <h2>Join the Maze</h2>
              <input
                type="text"
                placeholder="Your Nickname"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                maxLength={15}
              />
              <button onClick={handleCreate} disabled={!playerName}>
                Create Room
              </button>
              <div className="divider">OR</div>
              <input
                type="text"
                placeholder="Enter Room ID"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
              />
              <button onClick={handleJoin} disabled={!playerName || !roomId}>
                Join Room
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
                Room: {roomId} {isCopied ? <Check size={16} style={{marginLeft: 8, color: 'var(--accent)'}} /> : <Copy size={16} style={{marginLeft: 8, opacity: 0.5}} />}
              </h2>
              
              <div className="player-list-scroll">
                {roomData?.players.map(p => (
                  <div key={p.id} className="player-row">
                    <span className="player-dot" style={{ background: p.color, color: p.color }}></span>
                    <span style={{flex: 1}}>{p.name} {p.id === socket.id && '(You)'}</span>
                    {p.isHost && <Crown size={16} style={{color: '#fbbf24'}} />}
                  </div>
                ))}
              </div>

              {roomData?.hostId === socket.id ? (
                <button onClick={handleStart} className="start-btn">
                  START MISSION
                </button>
              ) : (
                <div className="waiting-msg">
                  <p>Awaiting host initialization...</p>
                </div>
              )}
            </div>
          )}

          {/* How to Play Section */}
          <div className="how-to-play">
            <div className="htp-column">
              <div className="htp-header">
                <Trophy className="htp-icon" />
                <h3>OBJECTIVE</h3>
              </div>
              <p>Locate the <span>MASTER KEY</span> hidden at the center. Secure it and reach any <span>CORNER EXIT</span> to survive.</p>
            </div>
            
            <div className="htp-column">
              <div className="htp-header">
                <Settings className="htp-icon" />
                <h3>MECHANICS</h3>
              </div>
              <ul>
                <li><span>DRAIN</span>: The key carrier siphons health from all nearby rivals.</li>
                <li><span>REWARD</span>: Eliminating opponents restores your HP and weapon range.</li>
                <li><span>ZONE</span>: The safe zone is shrinking. Stay inside or perish.</li>
              </ul>
            </div>
            
            <div className="htp-column">
              <div className="htp-header">
                <Gamepad2 className="htp-icon" />
                <h3>CONTROLS</h3>
              </div>
              <div className="controls-grid">
                <div className="control-item"><span>ARROWS</span> MOVE</div>
                <div className="control-item"><span>WASD</span> AIM</div>
                <div className="control-item"><span>SPACE</span> FIRE</div>
                <div className="control-item"><span>SHIFT</span> DASH</div>
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

