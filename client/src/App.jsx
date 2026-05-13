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
  HelpCircle,
  Volume2,
  VolumeX,
  Zap,
  ZapOff,
  Maximize,
  Monitor,
  Layout,
  Move,
  MousePointer2,
  Trash2,
  RotateCcw
} from 'lucide-react';
import './App.css';

const MODE_OPTIONS = [
  { value: 'ffa', label: 'FFA', description: 'Up to 8 solo players' },
  { value: '2v2', label: '2v2', description: 'Two teams, 2 players each' },
  { value: '4v4', label: '4v4', description: 'Two teams, 4 players each' }
];

const APP_VERSION = "v1.7.0";

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
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('lastEscape_settings');
    const defaults = {
      masterVolume: 0.7,
      musicEnabled: true,
      sfxEnabled: true,
      screenShakeEnabled: true,
      particlesEnabled: true,
      mouseSensitivity: 1.0,
      mobileControls: {
        fireMode: 'integrated',
        layout: 'standard',
        hud: {
          moveJoystick: { x: 15, y: 70, scale: 1 },
          aimJoystick: { x: 85, y: 70, scale: 1 },
          dashBtn: { x: 92, y: 55, scale: 1 },
          reloadBtn: { x: 92, y: 40, scale: 1 },
          fireBtn: { x: 85, y: 30, scale: 1 }
        }
      }
    };
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Deep merge mobileControls.hud if it exists, otherwise use defaults
        return {
          ...defaults,
          ...parsed,
          mobileControls: {
            ...defaults.mobileControls,
            ...(parsed.mobileControls || {}),
            hud: {
              ...defaults.mobileControls.hud,
              ...(parsed.mobileControls?.hud || {})
            }
          },
          keyBindings: {
            ...defaults.keyBindings,
            ...(parsed.keyBindings || {})
          }
        };
      } catch (e) {
        return defaults;
      }
    }
    return defaults;
  });
  const [activeSettingsCategory, setActiveSettingsCategory] = useState('visuals');
  const [isEditingHUD, setIsEditingHUD] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [listeningFor, setListeningFor] = useState(null);

  useEffect(() => {
    if (!listeningFor) return;

    const handleRemap = (e) => {
      e.preventDefault();
      setSettings(prev => ({
        ...prev,
        keyBindings: {
          ...prev.keyBindings,
          [listeningFor]: e.code
        }
      }));
      setListeningFor(null);
    };

    window.addEventListener('keydown', handleRemap);
    return () => window.removeEventListener('keydown', handleRemap);
  }, [listeningFor]);
  useEffect(() => {
    const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 0);
    setIsMobileDevice(mobile);
  }, []);

  // Persist player name
  useEffect(() => {
    if (playerName) {
      localStorage.setItem('lastEscape_playerName', playerName);
    }
  }, [playerName]);

  // Persist settings
  useEffect(() => {
    localStorage.setItem('lastEscape_settings', JSON.stringify(settings));
  }, [settings]);

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

    function onRematchTriggered() {
      setGameStarted(false);
    }

    socket.on('room-update', onRoomUpdate);
    socket.on('game-started', onGameStarted);
    socket.on('error', onError);
    socket.on('rematch-triggered', onRematchTriggered);

    return () => {
      socket.off('room-update', onRoomUpdate);
      socket.off('game-started', onGameStarted);
      socket.off('error', onError);
      socket.off('rematch-triggered', onRematchTriggered);
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

        {/* Floating Settings Button */}
        <div 
          className={`settings-floating-btn ${showSettings ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setShowSettings(!showSettings);
          }}
        >
          <Settings size={24} />
        </div>

        {/* Global Click Handler to close modals */}
        {(showRules || showSettings) && (
          <div 
            className="rules-backdrop" 
            onClick={() => {
              setShowRules(false);
              setShowSettings(false);
            }}
          ></div>
        )}

        {/* Settings Modal */}
        <div className={`settings-modal-card ${showSettings ? 'active' : ''}`} onClick={(e) => e.stopPropagation()}>
          <div className="settings-header">
            <h4>SETTINGS</h4>
            <button className="rules-close-btn" onClick={() => setShowSettings(false)}>&times;</button>
          </div>
          
          <div className="settings-nav">
            <button 
              className={`settings-nav-btn ${activeSettingsCategory === 'visuals' ? 'active' : ''}`}
              onClick={() => setActiveSettingsCategory('visuals')}
            >
              VISUALS
            </button>
            <button 
              className={`settings-nav-btn ${activeSettingsCategory === 'sound' ? 'active' : ''}`}
              onClick={() => setActiveSettingsCategory('sound')}
            >
              SOUND
            </button>
            <button 
              className={`settings-nav-btn ${activeSettingsCategory === 'controls' ? 'active' : ''}`}
              onClick={() => setActiveSettingsCategory('controls')}
            >
              CONTROLS
            </button>
          </div>

          <div className="settings-scroll-area">
            <div className="settings-content-pane">
              {activeSettingsCategory === 'sound' && (
                <div className="settings-group-compact">
                  <div className="settings-item-row">
                    <div className="settings-info">
                      <label>Master Volume</label>
                      <span>{Math.round((settings.masterVolume ?? 0.7) * 100)}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" max="1" step="0.01" 
                      value={settings.masterVolume ?? 0.7} 
                      onChange={(e) => setSettings({...settings, masterVolume: parseFloat(e.target.value)})}
                    />
                  </div>
                  <div className="settings-toggle-flex">
                    <button 
                      className={`toggle-minimal ${settings.musicEnabled ? 'active' : ''}`}
                      onClick={() => setSettings({...settings, musicEnabled: !settings.musicEnabled})}
                    >
                      {settings.musicEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                      MUSIC
                    </button>
                    <button 
                      className={`toggle-minimal ${settings.sfxEnabled ? 'active' : ''}`}
                      onClick={() => setSettings({...settings, sfxEnabled: !settings.sfxEnabled})}
                    >
                      {settings.sfxEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                      SFX
                    </button>
                  </div>
                </div>
              )}

              {activeSettingsCategory === 'visuals' && (
                <div className="settings-group-compact">
                  <div className="compact-control-row">
                    <div className="control-text">
                      <h6>Neural Vibration</h6>
                      <p>Screen shake effects</p>
                    </div>
                    <button 
                      className={`switch-minimal ${settings.screenShakeEnabled ? 'active' : ''}`}
                      onClick={() => setSettings({...settings, screenShakeEnabled: !settings.screenShakeEnabled})}
                    >
                      <div className="switch-dot"></div>
                    </button>
                  </div>
                  <div className="compact-control-row">
                    <div className="control-text">
                      <h6>Particle Flux</h6>
                      <p>Visual debris and effects</p>
                    </div>
                    <button 
                      className={`switch-minimal ${settings.particlesEnabled ? 'active' : ''}`}
                      onClick={() => setSettings({...settings, particlesEnabled: !settings.particlesEnabled})}
                    >
                      <div className="switch-dot"></div>
                    </button>
                  </div>
                  <button 
                    className="fullscreen-action-btn"
                    onClick={() => {
                      if (!document.fullscreenElement) {
                        document.documentElement.requestFullscreen().catch(() => {});
                      } else {
                        document.exitFullscreen();
                      }
                    }}
                  >
                    <Maximize size={14} />
                    TOGGLE FULLSCREEN
                  </button>
                </div>
              )}

              {activeSettingsCategory === 'controls' && (
                <div className="settings-group-compact">
                  {isMobileDevice ? (
                    <>
                      <div className="compact-control-row">
                        <div className="control-text">
                          <h6>Fire Mode</h6>
                          <p>Integrated or Dedicated button</p>
                        </div>
                        <div className="mini-tab-switch">
                          <button 
                            className={settings.mobileControls.fireMode === 'integrated' ? 'active' : ''}
                            onClick={() => setSettings({
                              ...settings, 
                              mobileControls: { ...settings.mobileControls, fireMode: 'integrated' }
                            })}
                          >
                            INTG
                          </button>
                          <button 
                            className={settings.mobileControls.fireMode === 'dedicated' ? 'active' : ''}
                            onClick={() => setSettings({
                              ...settings, 
                              mobileControls: { ...settings.mobileControls, fireMode: 'dedicated' }
                            })}
                          >
                            DEDIC
                          </button>
                        </div>
                      </div>
                      <div className="compact-control-row">
                        <div className="control-text">
                          <h6>Layout</h6>
                          <p>Standard or Southpaw</p>
                        </div>
                        <div className="mini-tab-switch">
                          <button 
                            className={settings.mobileControls.layout === 'standard' ? 'active' : ''}
                            onClick={() => setSettings({
                              ...settings, 
                              mobileControls: { ...settings.mobileControls, layout: 'standard' }
                            })}
                          >
                            STD
                          </button>
                          <button 
                            className={settings.mobileControls.layout === 'southpaw' ? 'active' : ''}
                            onClick={() => setSettings({
                              ...settings, 
                              mobileControls: { ...settings.mobileControls, layout: 'southpaw' }
                            })}
                          >
                            PAW
                          </button>
                        </div>
                      </div>
                      <button 
                        className="hud-calibrate-btn"
                        onClick={() => setIsEditingHUD(true)}
                      >
                        <Move size={16} />
                        CUSTOMIZE HUD (DRAG & DROP)
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="settings-item-row">
                        <div className="settings-info">
                          <label>Mouse Sensitivity</label>
                          <span>{(settings.mouseSensitivity ?? 1.0).toFixed(2)}x</span>
                        </div>
                        <input 
                          type="range" 
                          min="0.2" max="3.0" step="0.1" 
                          value={settings.mouseSensitivity ?? 1.0} 
                          onChange={(e) => setSettings({...settings, mouseSensitivity: parseFloat(e.target.value)})}
                        />
                      </div>
                      <div className="static-bindings-grid">
                        {[
                          { label: 'MOVE UP', key: 'up' },
                          { label: 'MOVE DOWN', key: 'down' },
                          { label: 'MOVE LEFT', key: 'left' },
                          { label: 'MOVE RIGHT', key: 'right' },
                          { label: 'DASH', key: 'dash' },
                          { label: 'RELOAD', key: 'reload' }
                        ].map(binding => (
                          <div className="binding-item" key={binding.key}>
                            <label>{binding.label}</label>
                            <button 
                              className={`binding-remap-btn ${listeningFor === binding.key ? 'listening' : ''}`}
                              onClick={() => setListeningFor(binding.key)}
                            >
                              {listeningFor === binding.key ? 'PRESS ANY KEY' : (settings.keyBindings?.[binding.key]?.replace('Key', '') || 'SET')}
                            </button>
                          </div>
                        ))}
                        <div className="binding-item">
                          <label>FIRE</label>
                          <span className="static-key">MB1</span>
                        </div>
                      </div>
                      <button 
                        className="reset-defaults-btn"
                        onClick={() => setSettings({
                          ...settings,
                          keyBindings: {
                            up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
                            dash: 'ShiftLeft', reload: 'KeyR'
                          }
                        })}
                      >
                        RESET TO DEFAULTS
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* HUD Editor Overlay */}
        {isEditingHUD && (
          <div className="hud-editor-overlay">
            <div className="hud-editor-header">
              <div className="hud-editor-title-group">
                <h3>HUD CALIBRATION MODE</h3>
                <p>DRAG ELEMENTS TO POSITION • PINCH TO SCALE (COMING SOON)</p>
              </div>
              <button onClick={() => setIsEditingHUD(false)} className="save-hud-btn">
                SAVE & EXIT
              </button>
            </div>
            
            <div className="hud-editor-canvas">
              {Object.entries(settings.mobileControls.hud).map(([key, pos]) => {
                // Only show fireBtn if dedicated mode is on, or just show all for simplicity in editor
                if (key === 'fireBtn' && settings.mobileControls.fireMode !== 'dedicated') return null;

                return (
                  <div 
                    key={key}
                    className={`hud-draggable-element ${key}`}
                    style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                    onTouchMove={(e) => {
                      const touch = e.touches[0];
                      const newX = Math.max(5, Math.min(95, (touch.clientX / window.innerWidth) * 100));
                      const newY = Math.max(5, Math.min(95, (touch.clientY / window.innerHeight) * 100));
                      setSettings({
                        ...settings,
                        mobileControls: {
                          ...settings.mobileControls,
                          hud: {
                            ...settings.mobileControls.hud,
                            [key]: { ...pos, x: newX, y: newY }
                          }
                        }
                      });
                    }}
                  >
                    <div className="drag-handle">
                      <Move size={16} />
                      <span>{key.replace('Btn', '').replace('Joystick', '').toUpperCase()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hud-editor-hint">DRAG ELEMENTS TO POSITION • PINCH TO SCALE (COMING SOON)</div>
          </div>
        )}

        {/* Rules Modal - Moved out of button for correct stacking context */}
        <div className={`rules-tooltip-card ${showRules ? 'active' : ''}`} onClick={(e) => e.stopPropagation()}>
          <div className="rules-header-row">
            <h4>TACTICAL PROTOCOLS</h4>
            <button className="rules-close-btn" onClick={() => setShowRules(false)}>&times;</button>
          </div>
          <div className="rules-scroll-area">
            <div className="rules-grid">
              <div className="rules-section">
                <h5>Gate Lockdown</h5>
                <p>Exit gates are <span>biometrically locked</span>. You must secure the <span>Master Key</span> and hold it for <span>60 seconds</span> to override the lockdown and open the exits.</p>
              </div>
              <div className="rules-section">
                <h5>Neural Siphon</h5>
                <p>The key holder <span>drains health</span> from all opponents. Siphon intensity <span>doubles</span> after 60 seconds of possession.</p>
              </div>
              <div className="rules-section">
                <h5>Biometric Shield</h5>
                <p>Carrying the Master Key activates an energy field that reduces incoming damage by <span>10%</span>.</p>
              </div>
              <div className="rules-section">
                <h5>Combat Siphon</h5>
                <p>Every elimination restores <span>15% HP</span> and permanently boosts your <span>Weapon Range</span>.</p>
              </div>
              <div className="rules-section">
                <h5>Atmospheric Collapse</h5>
                <p>The <span>Safe Zone</span> shrinks until the <span>Master Key</span> is secured. Once captured, the zone stabilizes.</p>
              </div>
              <div className="rules-section">
                <h5>Arena Lock</h5>
                <p>Walls are <span>structurally reinforced</span> and invulnerable for the first <span>30 seconds</span> of the mission.</p>
              </div>
              <div className="rules-section">
                <h5>Supply Drops</h5>
                <p><span>Strategic resources</span> spawn periodically. Secure <span>Medkits</span> for HP or <span>Munition Packs</span> to replenish reserve ammo.</p>
              </div>
              <div className="rules-section">
                <h5>Ghost Protocol</h5>
                <p>Securing the Master Key activates an <span>unbreakable cloak</span> for <span>5 seconds</span>, rendering you 100% invisible to opponents.</p>
              </div>
              <div className="rules-section">
                <h5>Ballistic Ricochet</h5>
                <p>Projectiles are designed for indoor combat, <span>bouncing off surfaces</span> up to 2 times. Use indirect fire to eliminate targets around corners.</p>
              </div>
            </div>
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
          {window.screen.orientation && window.screen.orientation.lock ? (
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
          ) : (
            <div className="rotate-hint-mobile">Please rotate your device manually</div>
          )}
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
                    autoFocus={!playerName}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && playerName) {
                        setShowCreateOptions(true);
                      }
                    }}
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
                    autoFocus={!!playerName}
                    maxLength={6}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && playerName && roomId) {
                        handleJoin();
                      }
                    }}
                  />
                  <button onClick={handleJoin} disabled={!playerName || !roomId}>
                    Join Room
                  </button>
                </>
              ) : (
                <>
                  <h2>Ready for Mission?</h2>
                  <div className="action-box">
                    <p className="action-hint">Configure your operational parameters in the Room Settings area.</p>
                    <button onClick={handleCreate} className="start-btn">
                      Confirm & Create
                    </button>
                    <button 
                      onClick={() => setShowCreateOptions(false)} 
                      className="back-btn"
                    >
                      Back to Join
                    </button>
                  </div>
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
                <span className="mode-readout-label">Protocol</span>
                <strong>{modeLabels[roomData?.mode] || 'Free For All'}</strong>
              </div>
              
              <div className="lobby-actions">
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
                      ? `Requires exactly ${roomData.maxPlayers} players.`
                      : 'Requires at least 2 players.'}
                  </div>
                )}
                
                <button 
                  onClick={handleLeaveRoom} 
                  className="leave-btn"
                >
                  LEAVE ROOM
                </button>
              </div>
            </div>
          )}

          {/* How to Play Section */}
          <div className="how-to-play">
            {!isJoined && !showCreateOptions && (
              <div className="htp-column briefing-column">
                <div className="htp-header">
                  <Trophy className="htp-icon" />
                  <h3>MISSION BRIEFING</h3>
                </div>
                <p>
                  Locate and secure the <span>MASTER KEY</span> from the center of the arena. 
                  Once captured, you must hold the key for <span>60 seconds</span> to override the biometric gate lockdown. 
                  After the countdown, reach any <span>EXIT</span> tile or cross the perimeter to escape. 
                  Alternatively, eliminate all opponents to be the <span>last survivor</span>.
                </p>
              </div>
            )}

            {!isJoined && showCreateOptions && (
              <div className="htp-column settings-column">
                <div className="htp-header">
                  <Settings className="htp-icon" />
                  <h3>ROOM SETTINGS</h3>
                </div>
                <div className="mode-selector-expanded">
                  {MODE_OPTIONS.map((modeOption) => (
                    <button
                      key={modeOption.value}
                      type="button"
                      className={`mode-pill-expanded ${selectedMode === modeOption.value ? 'active' : ''}`}
                      onClick={() => setSelectedMode(modeOption.value)}
                    >
                      <div className="mode-pill-content">
                        <span className="mode-label">{modeOption.label}</span>
                        <p className="mode-desc">{modeOption.description}</p>
                      </div>
                      {selectedMode === modeOption.value && <div className="active-indicator"><Check size={16} /></div>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isJoined && (
              <div className="htp-column players-column">
                <div className="htp-header">
                  <Crown className="htp-icon" />
                  <h3>OPERATIONAL SQUAD</h3>
                  {roomData?.isTeamMode && (
                    <span className="team-balance-pill">
                      TEAM A {teamSummary?.A || 0} : {teamSummary?.B || 0} TEAM B
                    </span>
                  )}
                </div>
                
                <div className={`player-grid-expanded ${roomData?.isTeamMode ? 'team-split' : ''}`}>
                  {roomData?.isTeamMode ? (
                    <>
                      <div className="team-group">
                        <div className="team-header-row">
                          <h4 className="team-title title-a">TEAM ALPHA</h4>
                          {roomData.players.find(p => p.id === socket.id)?.teamId !== 'A' && (
                            <button 
                              className="team-join-btn btn-a"
                              onClick={() => socket.emit('switch-team', { teamId: 'A' })}
                              disabled={roomData.players.filter(p => p.teamId === 'A').length >= roomData.teamSize}
                            >
                              JOIN
                            </button>
                          )}
                        </div>
                        {roomData.players.filter(p => p.teamId === 'A').map(p => (
                          <div key={p.id} className="player-row-expanded">
                            <span className="player-dot" style={{ background: p.color }}></span>
                            <span className="player-name">{p.name} {p.id === socket.id && '(You)'}</span>
                            {p.isHost && <Crown size={14} className="host-icon" />}
                          </div>
                        ))}
                        {/* Empty slots */}
                        {Array.from({ length: roomData.teamSize - roomData.players.filter(p => p.teamId === 'A').length }).map((_, i) => (
                          <div key={`empty-a-${i}`} className="player-row-expanded empty">
                            <span className="player-name">Awaiting Operative...</span>
                          </div>
                        ))}
                      </div>
                      <div className="team-group">
                        <div className="team-header-row">
                          <h4 className="team-title title-b">TEAM BRAVO</h4>
                          {roomData.players.find(p => p.id === socket.id)?.teamId !== 'B' && (
                            <button 
                              className="team-join-btn btn-b"
                              onClick={() => socket.emit('switch-team', { teamId: 'B' })}
                              disabled={roomData.players.filter(p => p.teamId === 'B').length >= roomData.teamSize}
                            >
                              JOIN
                            </button>
                          )}
                        </div>
                        {roomData.players.filter(p => p.teamId === 'B').map(p => (
                          <div key={p.id} className="player-row-expanded">
                            <span className="player-dot" style={{ background: p.color }}></span>
                            <span className="player-name">{p.name} {p.id === socket.id && '(You)'}</span>
                            {p.isHost && <Crown size={14} className="host-icon" />}
                          </div>
                        ))}
                        {/* Empty slots */}
                        {Array.from({ length: roomData.teamSize - roomData.players.filter(p => p.teamId === 'B').length }).map((_, i) => (
                          <div key={`empty-b-${i}`} className="player-row-expanded empty">
                            <span className="player-name">Awaiting Operative...</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="ffa-list-expanded">
                      {roomData?.players.map(p => (
                        <div key={p.id} className="player-row-expanded">
                          <div className="player-info-main">
                            <span className="player-dot" style={{ background: p.color }}></span>
                            <span className="player-name">{p.name} {p.id === socket.id && '(You)'}</span>
                          </div>
                          {p.isHost && <div className="host-badge"><Crown size={12} /> HOST</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            

            
            {!isJoined && !showCreateOptions && (
              <div className="htp-column controls-column">
                <div className="htp-header">
                  <Gamepad2 className="htp-icon" />
                  <h3>CONTROLS</h3>
                </div>
                <div className="controls-grid">
                  <div className="control-item"><span>WASD / ARROWS</span> MOVE</div>
                  <div className="control-item"><span>MOUSE</span> AIM</div>
                  <div className="control-item"><span>LEFT CLICK</span> FIRE</div>
                  <div className="control-item"><span>SHIFT / R</span> DASH / RELOAD</div>
                </div>
              </div>
            )}
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
        {window.screen.orientation && window.screen.orientation.lock ? (
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
        ) : (
          <div className="rotate-hint-mobile">Please rotate your device manually</div>
        )}
      </div>
      <Game roomData={roomData} playerName={playerName} settings={settings} />
    </div>
  );
}

export default App;
