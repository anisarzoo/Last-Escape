import { useState, useEffect } from 'react';
import { socket } from './socket';
import Game from './Game';
import { 
  Trophy, 
  Settings, 
  Gamepad2, 
  Crown, 
  Copy, 
  Check,
  HelpCircle
} from 'lucide-react';
import './App.css';

const MODE_OPTIONS = [
  { value: 'ffa', label: 'FFA', description: 'Up to 8 solo players' },
  { value: '2v2', label: '2v2', description: 'Two teams, 2 players each' },
  { value: '4v4', label: '4v4', description: 'Two teams, 4 players each' }
];

const APP_VERSION = "v1.6.5";

const modeLabels = {
  ffa: 'Free For All',
  '2v2': '2v2 Teams',
  '4v4': '4v4 Teams'
};

function App() {
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('lastEscape_playerName') || '');
  const [roomId, setRoomId] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [roomData, setRoomData] = useState(null);
  const [showRules, setShowRules] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [error, setError] = useState('');
  const [selectedMode, setSelectedMode] = useState('ffa');
  const [showCreateOptions, setShowCreateOptions] = useState(false);

  // Persist player name
  useEffect(() => {
    if (playerName) {
      localStorage.setItem('lastEscape_playerName', playerName);
    }
  }, [playerName]);

  useEffect(() => {
    function onRoomUpdate(data) {
      setRoomData(data);
      setRoomId(data.id);
      setIsJoined(true);
      setError('');
    }

    function onGameStarted() {
      setGameStarted(true);
    }

    function onError(err) {
      setError(err.message);
      setIsJoined(false);
      setTimeout(() => setError(''), 4000);
    }

    socket.on('room-update', onRoomUpdate);
    socket.on('game-started', onGameStarted);
    socket.on('error', onError);

    return () => {
      socket.off('room-update', onRoomUpdate);
      socket.off('game-started', onGameStarted);
      socket.off('error', onError);
    };
  }, []);

  const handleLeaveRoom = () => {
    socket.emit('leave-room');
    setIsJoined(false);
    setRoomData(null);
    setRoomId('');
    setShowCreateOptions(false);
  };

  const handleCreate = () => {
    if (playerName) {
      const newRoomId = Math.random().toString(36).substr(2, 6).toUpperCase();
      socket.connect();
      socket.emit('join-room', { roomId: newRoomId, playerName, create: true, mode: selectedMode });
    }
  };

  const handleJoin = () => {
    if (playerName && roomId) {
      socket.connect();
      socket.emit('join-room', { roomId, playerName, create: false });
    }
  };

  const handleStart = () => {
    socket.emit('start-game');
  };

  const copyToClipboard = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(roomId);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
        return;
      }
      const textArea = document.createElement("textarea");
      textArea.value = roomId;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.top = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      textArea.setSelectionRange(0, 99999);
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (successful) {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      }
    } catch (err) {
      console.error('Copy failed: ', err);
    }
  };

  const canStartMatch = roomData?.isTeamMode
    ? roomData.players.length === roomData.maxPlayers
    : (roomData?.players.length || 0) >= 2;

  const teamSummary = roomData?.isTeamMode ? roomData.players.reduce((acc, p) => {
    if (p.teamId === 'A') acc.A += 1;
    if (p.teamId === 'B') acc.B += 1;
    return acc;
  }, { A: 0, B: 0 }) : null;

  if (!gameStarted) {
    return (
      <div className="lobby-container">
        {/* Floating Game Rules Tooltip */}
        <div 
          className={`rules-floating-btn ${showRules ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setShowRules(!showRules);
          }}
        >
          <HelpCircle size={24} />
        </div>

        {/* Global Click Handler to close rules */}
        {showRules && <div className="rules-backdrop" onClick={() => setShowRules(false)}></div>}

        {/* Rules Modal - Moved out of button for correct stacking context */}
        <div className={`rules-tooltip-card ${showRules ? 'active' : ''}`} onClick={(e) => e.stopPropagation()}>
          <div className="rules-header-row">
            <h4>ADVANCED PROTOCOLS</h4>
            <button className="rules-close-btn" onClick={() => setShowRules(false)}>&times;</button>
          </div>
          <div className="rules-section">
            <h5>Gate Lockdown</h5>
            <p>Exit gates are <span>biometrically locked</span>. You must secure the <span>Master Key</span> and hold it for <span>60 seconds</span> to override the lockdown and open the exits.</p>
          </div>
          <div className="rules-section">
            <h5>Combat Siphon</h5>
            <p>Every confirmed elimination restores <span>25% of your max health</span> and permanently boosts your <span>Weapon Range</span>.</p>
          </div>
          <div className="rules-section">
            <h5>Atmospheric Collapse</h5>
            <p>The <span>Safe Zone</span> shrinks continuously until the <span>Master Key</span> is secured. Once captured, the zone stabilizes.</p>
          </div>
        </div>

        {/* Background Decorative Elements */}
        <div className="bg-blobs">
          <div className="blob blob-1"></div>
          <div className="blob blob-2"></div>
          <div className="blob blob-3"></div>
        </div>

        {/* Global Landscape Lock Overlay */}
        <div className="landscape-lock">
          <div className="rotate-device-animation">
            <div className="phone"></div>
          </div>
          <h2>Landscape Required</h2>
          <p>Please rotate your screen to play Last Escape</p>
          <button 
            className="landscape-request-btn"
            onClick={() => {
              try {
                if (document.documentElement.requestFullscreen) {
                  document.documentElement.requestFullscreen();
                }
                if (window.screen.orientation && window.screen.orientation.lock) {
                  window.screen.orientation.lock('landscape').catch(() => {});
                }
              } catch {
                // Ignore fullscreen/orientation API failures on unsupported devices.
              }
            }}
          >
            Enter Landscape
          </button>
        </div>

        <h1>LAST ESCAPE</h1>
        
        <div className="lobby-content-grid">
          {!isJoined ? (
            <div className="login-box">
              {!showCreateOptions ? (
                <>
                  <h2>Join the Maze</h2>
                  {error && <div className="error-message">{error}</div>}
                  <input
                    type="text"
                    placeholder="Your Nickname"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    maxLength={15}
                  />
                  <button 
                    onClick={() => setShowCreateOptions(true)} 
                    disabled={!playerName}
                  >
                    Create Room
                  </button>
                  <div className="divider">OR</div>
                  <input
                    type="text"
                    placeholder="Enter Room ID"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                    className="room-id-input"
                  />
                  <button onClick={handleJoin} disabled={!playerName || !roomId}>
                    Join Room
                  </button>
                </>
              ) : (
                <>
                  <h2>Room Settings</h2>
                  <div className="mode-selector">
                    {MODE_OPTIONS.map((modeOption) => (
                      <button
                        key={modeOption.value}
                        type="button"
                        className={`mode-pill ${selectedMode === modeOption.value ? 'active' : ''}`}
                        onClick={() => setSelectedMode(modeOption.value)}
                      >
                        <span>{modeOption.label}</span>
                        <small>{modeOption.description}</small>
                      </button>
                    ))}
                  </div>
                  <button onClick={handleCreate} className="start-btn">
                    Confirm & Create
                  </button>
                  <button 
                    onClick={() => setShowCreateOptions(false)} 
                    className="back-btn"
                  >
                    Back to Join
                  </button>
                </>
              )}
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

              <div className="mode-readout">
                <span className="mode-readout-label">Mode</span>
                <strong>{modeLabels[roomData?.mode] || 'Free For All'}</strong>
                {roomData?.isTeamMode && (
                  <span className="team-balance">TEAM A {teamSummary?.A || 0} : {teamSummary?.B || 0} TEAM B</span>
                )}
              </div>
              
              <div className="player-list-scroll">
                {roomData?.players.map(p => (
                  <div key={p.id} className="player-row">
                    <span className="player-dot" style={{ background: p.color, color: p.color }}></span>
                    <span style={{flex: 1}}>{p.name} {p.id === socket.id && '(You)'}</span>
                    {roomData?.isTeamMode && p.teamId && (
                      <span className={`team-chip team-${p.teamId.toLowerCase()}`}>TEAM {p.teamId}</span>
                    )}
                    {p.isHost && <Crown size={16} style={{color: '#fbbf24'}} />}
                  </div>
                ))}
              </div>

              {roomData?.hostId === socket.id ? (
                <button onClick={handleStart} className="start-btn" disabled={!canStartMatch}>
                  START MISSION
                </button>
              ) : (
                <div className="waiting-msg">
                  <p>Awaiting host initialization...</p>
                </div>
              )}
              {!canStartMatch && (
                <div className="start-hint">
                  {roomData?.isTeamMode
                    ? `Start requires exactly ${roomData.maxPlayers} players (${roomData.teamSize}v${roomData.teamSize}).`
                    : 'Start requires at least 2 players.'}
                </div>
              )}
              
              <button 
                onClick={handleLeaveRoom} 
                className="leave-btn"
              >
                LEAVE ROOM
              </button>
            </div>
          )}

          {/* How to Play Section */}
          <div className="how-to-play">
            <div className="htp-column">
              <div className="htp-header">
                <Trophy className="htp-icon" />
                <h3>OBJECTIVE</h3>
              </div>
              <p>Secure the <span>MASTER KEY</span> and reach an <span>EXIT</span>, or eliminate all opponents to be the last survivor.</p>
            </div>
            
            <div className="htp-column">
              <div className="htp-header">
                <Settings className="htp-icon" />
                <h3>MECHANICS</h3>
              </div>
              <ul>
                <li><span>DRAIN</span>: The key carrier siphons health from enemy players over time.</li>
                <li><span>REWARD</span>: Eliminating opponents restores HP and boosts weapon range.</li>
                <li><span>ZONE</span>: The safe zone shrinks continuously until the key is secured.</li>
              </ul>
            </div>
            
            <div className="htp-column">
              <div className="htp-header">
                <Gamepad2 className="htp-icon" />
                <h3>CONTROLS</h3>
              </div>
              <div className="controls-grid">
                <div className="control-item"><span>WASD / ARROWS</span> MOVE</div>
                <div className="control-item"><span>MOUSE</span> AIM</div>
                <div className="control-item"><span>LEFT CLICK</span> FIRE</div>
                <div className="control-item"><span>SHIFT</span> DASH</div>
              </div>
            </div>
          </div>
        </div>
        <div className="app-version">{APP_VERSION}</div>
      </div>
    );
  }

  return (
    <div className="game-wrapper">
      {/* Global Landscape Lock Overlay */}
      <div className="landscape-lock">
        <div className="rotate-device-animation">
          <div className="phone"></div>
        </div>
        <h2>Landscape Required</h2>
        <p>Please rotate your screen to play Last Escape</p>
        <button 
          className="landscape-request-btn"
          onClick={() => {
            try {
              if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen();
              }
              if (window.screen.orientation && window.screen.orientation.lock) {
                window.screen.orientation.lock('landscape').catch(() => {});
              }
            } catch {
              // Ignore fullscreen/orientation API failures on unsupported devices.
            }
          }}
        >
          Enter Landscape
        </button>
      </div>
      <Game roomData={roomData} playerName={playerName} />
    </div>
  );
}

export default App;
