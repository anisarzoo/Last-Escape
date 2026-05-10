import { useRef, useEffect, useState, useMemo } from 'react';
import { socket } from './socket';
import { MAZE_MAP, TILE_SIZE, MAZE_WIDTH, MAZE_HEIGHT } from './constants';
import {
  Skull,
  Target,
  Activity,
  Wind,
  Zap,
  Crosshair,
  Key,
  RotateCcw
} from 'lucide-react';


// --- AUDIO ENGINE ---
let audioCtx = null;
const noiseCache = {};

const initAudio = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // Pre-cache noise buffers
    const types = { shoot: 0.1, dash: 0.2 };
    Object.entries(types).forEach(([name, duration]) => {
      const bufferSize = audioCtx.sampleRate * duration;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      noiseCache[name] = buffer;
    });
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
};

const playSpatial = (x, y, type, listenerPos) => {
  if (!audioCtx) return;

  const panner = audioCtx.createPanner();
  panner.panningModel = 'equalpower';
  panner.distanceModel = 'exponential';
  panner.refDistance = 100;
  panner.maxDistance = 1500;
  panner.rolloffFactor = 1.5;

  panner.positionX.value = x;
  panner.positionY.value = y;
  panner.positionZ.value = 300;

  audioCtx.listener.positionX.value = listenerPos.x;
  audioCtx.listener.positionY.value = listenerPos.y;
  audioCtx.listener.positionZ.value = 500;

  const gain = audioCtx.createGain();
  gain.connect(panner);
  panner.connect(audioCtx.destination);

  const now = audioCtx.currentTime;

  if (type === 'shoot') {
    const noise = audioCtx.createBufferSource();
    noise.buffer = noiseCache.shoot || audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1000;
    noise.connect(filter);
    filter.connect(gain);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    noise.start(now);
    noise.stop(now + 0.1);
  }
  else if (type === 'hit') {
    const osc = audioCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.2);
    osc.connect(gain);
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    osc.start(now);
    osc.stop(now + 0.2);
  }
  else if (type === 'pickup') {
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.4);
    osc.connect(gain);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    osc.start(now);
    osc.stop(now + 0.4);
  }
  else if (type === 'dash') {
    const noise = audioCtx.createBufferSource();
    noise.buffer = noiseCache.dash || audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1000;
    noise.connect(filter);
    filter.connect(gain);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    noise.start(now);
    noise.stop(now + 0.2);
  }
  else if (type === 'zone-removed') {
    const osc = audioCtx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(10, now + 1.5);
    osc.connect(gain);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 1.5);
    osc.start(now);
    osc.stop(now + 1.5);
  }
  else if (type === 'ricochet') {
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.1);
    osc.connect(gain);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.start(now);
    osc.stop(now + 0.1);
  }
  else if (type === 'dash-hit') {
    const osc = audioCtx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.2);
    osc.connect(gain);
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    osc.start(now);
    osc.stop(now + 0.2);
  }
  else if (type === 'reload-start') {
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.linearRampToValueAtTime(400, now + 0.2);
    osc.connect(gain);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.3);
  }
  else if (type === 'reload-end') {
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.linearRampToValueAtTime(600, now + 0.1);
    osc.connect(gain);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    osc.start(now);
    osc.stop(now + 0.2);
  }
  else if (type === 'pickup-health') {
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.5);
    osc.connect(gain);
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    osc.start(now);
    osc.stop(now + 0.5);
  }
  else if (type === 'pickup-ammo') {
    const osc = audioCtx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.linearRampToValueAtTime(300, now + 0.2);
    osc.connect(gain);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    osc.start(now);
    osc.stop(now + 0.2);
  }
};

const drawKey = (ctx, x, y, pulse) => {
  ctx.save();
  ctx.translate(x, y);
  const floatOffset = Math.sin(Date.now() / 300) * 5;
  ctx.translate(0, floatOffset);
  ctx.strokeStyle = '#fbbf24';
  ctx.fillStyle = '#fbbf24';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.shadowBlur = 15 + pulse * 10;
  ctx.shadowColor = '#fbbf24';
  ctx.beginPath(); ctx.arc(0, -12, 7, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(0, 12); ctx.stroke();
  ctx.fillRect(0, 8, 6, 2.5);
  ctx.fillRect(0, 4, 4, 2.5);
  ctx.restore();
};

const Game = ({ roomData }) => {
  const canvasRef = useRef(null);
  const minimapCanvasRef = useRef(null);
  const offscreenMazeCanvasRef = useRef(null);
  const offscreenMinimapCanvasRef = useRef(null);
  const posRef = useRef({ x: TILE_SIZE * 0.5, y: TILE_SIZE * 0.5 });
  const aimAngleRef = useRef(0);

  // High-frequency state moved to Refs
  const gameStateRef = useRef(null);
  const mazeRef = useRef(MAZE_MAP);

  // UI-triggering state
  const [uiGameState, setUiGameState] = useState(null);
  const [gameOver, setGameOver] = useState(null);
  const [ping, setPing] = useState(0);

  // Ping measurement
  useEffect(() => {
    if (!socket) return;
    const interval = setInterval(() => {
      const start = Date.now();
      // Socket.io standard ping/pong or manual ack
      socket.emit('ping', () => {
        setPing(Date.now() - start);
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [socket]);
  const [isSpectating, setIsSpectating] = useState(false);
  const [spectateTargetId, setSpectateTargetId] = useState(null);
  const [dashCDRemaining, setDashCDRemaining] = useState(0);

  // High-frequency visuals to Refs
  const muzzleFlashRef = useRef(0);
  const screenShakeRef = useRef(0);
  const gameOverRef = useRef(null);
  const isMobileRef = useRef(false);
  const [killFeed, setKillFeed] = useState([]);
  const keysRef = useRef({});
  const mousePosRef = useRef({ x: 0, y: 0 });
  const shootCooldownRef = useRef(0);
  const dashCooldownRef = useRef(0);
  const dashTimeRef = useRef(0);
  const particlesRef = useRef([]);
  const floatingNumbersRef = useRef([]);
  const lastEmitTimeRef = useRef(0);
  const lastMoveEmitTimeRef = useRef(0);
  const velRef = useRef({ x: 0, y: 0 });
  const reloadStartTimesRef = useRef({});
  const smoothedPlayersRef = useRef({});
  const smoothedCameraRef = useRef({ x: TILE_SIZE * 0.5, y: TILE_SIZE * 0.5 });
  const localBulletsRef = useRef([]);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const dimsRef = useRef({ width: window.innerWidth, height: window.innerHeight });
  const [isMobile, setIsMobile] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const [muzzleFlash, setMuzzleFlash] = useState(false);

  // Joystick state (using refs for physics/logic, state for UI)
  const moveJoystickRef = useRef({ active: false, x: 0, y: 0, startX: 0, startY: 0, curX: 0, curY: 0 });
  const aimJoystickRef = useRef({ active: false, x: 0, y: 0, startX: 0, startY: 0, curX: 0, curY: 0 });
  const [joystickUI, setJoystickUI] = useState({
    move: { active: false, x: 0, y: 0 },
    aim: { active: false, x: 0, y: 0, isFiring: false }
  });
  const mobileShootRef = useRef(false);
  const shootTouchIdRef = useRef(null);
  const shootTouchStartRef = useRef({ x: 0, y: 0 });

  const prevPlayersRef = useRef({});
  const localPlayer = uiGameState?.players.find((p) => p.id === socket.id);
  const isTeamMode = Boolean(uiGameState?.isTeamMode || roomData?.isTeamMode);
  const isEliminated = Boolean(localPlayer && localPlayer.hp <= 0);
  const activeSpectating = isSpectating || (isTeamMode && isEliminated && !gameOver);

  const spectateCandidates = useMemo(() => {
    if (!uiGameState || !localPlayer) return [];

    const aliveOthers = uiGameState.players.filter((p) => p.id !== socket.id && p.hp > 0);
    if (aliveOthers.length === 0) return [];

    if (isTeamMode && localPlayer.teamId) {
      const aliveTeammates = aliveOthers.filter((p) => p.teamId === localPlayer.teamId);
      if (aliveTeammates.length > 0) return aliveTeammates;
      return aliveOthers.filter((p) => p.teamId !== localPlayer.teamId);
    }

    const killer = aliveOthers.find((p) => p.id === localPlayer.killedBy);
    if (!killer) return aliveOthers;
    return [killer, ...aliveOthers.filter((p) => p.id !== killer.id)];
  }, [uiGameState, isTeamMode, localPlayer]);

  const spectateTarget = useMemo(() => {
    if (spectateCandidates.length === 0) return null;
    return spectateCandidates.find((p) => p.id === spectateTargetId) || spectateCandidates[0];
  }, [spectateCandidates, spectateTargetId]);

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      setDimensions({ width: w, height: h });
      dimsRef.current = { width: w, height: h };
      setIsPortrait(h > w);
      const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 0);
      setIsMobile(mobile);
      isMobileRef.current = mobile;
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setDashCDRemaining(Math.max(0, 4000 - (Date.now() - dashCooldownRef.current)));
    }, 100);
    return () => clearInterval(timer);
  }, []);

  const createParticles = (x, y, color, count = 10, speed = 2, life = 1) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const s = Math.random() * speed;
      particlesRef.current.push({
        x, y,
        vx: Math.cos(angle) * s,
        vy: Math.sin(angle) * s,
        color, life, maxLife: life,
        size: Math.random() * 3 + 1
      });
    }
  };

  useEffect(() => {
    initAudio();
    const handleSound = (data) => {
      playSpatial(data.x, data.y, data.type, posRef.current);
      if (data.type === 'hit') {
        createParticles(data.x, data.y, '#f43f5e', 12, 4);
        screenShakeRef.current = Date.now();
      }
      if (data.type === 'shoot') createParticles(data.x, data.y, 'rgba(147, 197, 253, 0.5)', 3, 1, 0.2);
      if (data.type === 'dash') createParticles(data.x, data.y, '#6366f1', 15, 3);
      if (data.type === 'zone-removed') createParticles(data.x, data.y, '#f43f5e', 30, 8, 2);
      if (data.type === 'ricochet') createParticles(data.x, data.y, '#fff', 6, 2, 0.3);
      if (data.type === 'dash-hit') {
        createParticles(data.x, data.y, '#a855f7', 20, 6, 0.8);
        screenShakeRef.current = Date.now();
      }
    };
    socket.on('play-sound', handleSound);

    const handleKnockback = (data) => {
      if (smoothedPlayersRef.current[data.id]) {
        smoothedPlayersRef.current[data.id].vx += data.vx;
        smoothedPlayersRef.current[data.id].vy += data.vy;
      }
      if (data.id === socket.id) {
        velRef.current.x += data.vx;
        velRef.current.y += data.vy;
        screenShakeRef.current = Date.now();
      }
    };
    socket.on('player-knockback', handleKnockback);

    const handleDamage = (data) => {
      floatingNumbersRef.current.push({
        x: data.x,
        y: data.y,
        amount: Math.round(data.amount),
        life: 1.0,
        vx: Math.random() * 2 - 1,
        vy: -2
      });
    };
    socket.on('damage-dealt', handleDamage);

    return () => {
      socket.off('play-sound', handleSound);
      socket.off('player-knockback', handleKnockback);
      socket.off('damage-dealt', handleDamage);
    };
  }, []);

  useEffect(() => {
    if (roomData) {
      const me = roomData.players.find(p => p.id === socket.id);
      if (me) posRef.current = { x: me.x, y: me.y };
    }
  }, [roomData]);

  useEffect(() => {
    const handleKeyDown = (e) => { keysRef.current[e.key] = true; };
    const handleKeyUp = (e) => { keysRef.current[e.key] = false; };
    const handleMouseMove = (e) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };
    };
    const handleMouseDown = (e) => {
      if (e.button === 0) keysRef.current['MouseLeft'] = true;
    };
    const handleMouseUp = (e) => {
      if (e.button === 0) keysRef.current['MouseLeft'] = false;
    };
    const handleContextMenu = (e) => e.preventDefault();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('contextmenu', handleContextMenu);



    let lastTime = performance.now();
    let loopId;

    const gameLoop = (time) => {
      const dt = Math.min(2, (time - lastTime) / 16.66);
      lastTime = time;

      const state = gameStateRef.current;
      if (!state) {
        lastTime = time;
        loopId = requestAnimationFrame(gameLoop);
        return;
      }

      const activeIds = state.players.map(p => p.id);
      Object.keys(smoothedPlayersRef.current).forEach(id => {
        if (!activeIds.includes(id)) delete smoothedPlayersRef.current[id];
      });

      state.players.forEach(p => {
        if (p.id === socket.id) return;
        if (!smoothedPlayersRef.current[p.id]) {
          smoothedPlayersRef.current[p.id] = { x: p.x, y: p.y, vx: 0, vy: 0 };
        }
        const sp = smoothedPlayersRef.current[p.id];
        sp.vx *= Math.pow(0.88, dt); sp.vy *= Math.pow(0.88, dt);
        sp.x += sp.vx * dt; sp.y += sp.vy * dt;
        sp.x += (p.x - sp.x) * 0.2 * dt;
        sp.y += (p.y - sp.y) * 0.2 * dt;
      });

      const loopMaze = mazeRef.current || MAZE_MAP;
      localBulletsRef.current.forEach(b => {
        const nextX = b.x + b.vx * dt;
        const nextY = b.y + b.vy * dt;
        const nextTileX = Math.floor(nextX / TILE_SIZE);
        const nextTileY = Math.floor(nextY / TILE_SIZE);
        const isWall = loopMaze[nextTileY]?.[nextTileX] === 1;

        if (isWall) {
          if (b.bounces > 0) {
            const curTileX = Math.floor(b.x / TILE_SIZE);
            const curTileY = Math.floor(b.y / TILE_SIZE);
            let bounced = false;
            if (loopMaze[curTileY]?.[nextTileX] === 1) { b.vx *= -1; bounced = true; }
            if (loopMaze[nextTileY]?.[curTileX] === 1) { b.vy *= -1; bounced = true; }
            if (!bounced) { b.vx *= -1; b.vy *= -1; }
            b.bounces--;
          } else {
            b.vx = 0; b.vy = 0;
          }
        } else {
          b.x = nextX; b.y = nextY;
        }
      });

      if (!gameOverRef.current) {
        const now = Date.now();
        const isDashing = now - dashTimeRef.current < 120;
        const keys = keysRef.current;
        let speedMultiplier = 1;

        if (isDashing) {
          speedMultiplier = 4;
          createParticles(posRef.current.x, posRef.current.y, 'rgba(99, 102, 241, 0.4)', 2, 0.5, 0.5);
        }

        if (keys['Shift'] && now - dashCooldownRef.current > 4000 && !isDashing) {
          dashTimeRef.current = now;
          dashCooldownRef.current = now;
          socket.emit('player-dash');
          socket.emit('play-sound', { x: posRef.current.x, y: posRef.current.y, type: 'dash' });
          keys['Shift'] = false;
        }

        if (keys['r'] || keys['R']) {
          const lp = state.players.find(p => p.id === socket.id);
          if (lp && !lp.isReloading && lp.ammo < lp.maxAmmo && lp.reserveAmmo > 0) {
            socket.emit('player-reload');
          }
          keys['r'] = false;
          keys['R'] = false;
        }

        let inputX = 0, inputY = 0;
        if (keys['ArrowUp'] || keys['w'] || keys['W']) inputY -= 1;
        if (keys['ArrowDown'] || keys['s'] || keys['S']) inputY += 1;
        if (keys['ArrowLeft'] || keys['a'] || keys['A']) inputX -= 1;
        if (keys['ArrowRight'] || keys['d'] || keys['D']) inputX += 1;

        if (moveJoystickRef.current.active) {
          inputX = moveJoystickRef.current.x;
          inputY = moveJoystickRef.current.y;
        }

        const ACCEL = 0.8 * dt * speedMultiplier;
        const FRICTION = isDashing ? 0.98 : 0.85;
        if (inputX !== 0) velRef.current.x += inputX * ACCEL;
        if (inputY !== 0) velRef.current.y += inputY * ACCEL;
        const frictionDt = Math.pow(FRICTION, dt);
        velRef.current.x *= frictionDt;
        velRef.current.y *= frictionDt;

        if (isDashing) {
          const dashMag = 8;
          const currentMag = Math.sqrt(velRef.current.x ** 2 + velRef.current.y ** 2);
          if (currentMag < dashMag) {
            const angle = Math.atan2(velRef.current.y || inputY, velRef.current.x || inputX);
            velRef.current.x = Math.cos(angle) * dashMag;
            velRef.current.y = Math.sin(angle) * dashMag;
          }
        }

        let dx = velRef.current.x * dt, dy = velRef.current.y * dt;

        if (Math.abs(velRef.current.x) + Math.abs(velRef.current.y) > 8) {
          if (Math.random() > 0.7) createParticles(posRef.current.x, posRef.current.y, 'rgba(255,255,255,0.2)', 1, 0.5, 0.3);
        }

        let targetAngle = aimAngleRef.current;
        if (isMobileRef.current) {
          if (aimJoystickRef.current.active) {
            targetAngle = Math.atan2(aimJoystickRef.current.y, aimJoystickRef.current.x);
          }
          else if (inputX !== 0 || inputY !== 0) targetAngle = Math.atan2(inputY, inputX);
        } else {
          const { width, height } = dimsRef.current;
          const camX = width / 2 - smoothedCameraRef.current.x;
          const camY = height / 2 - smoothedCameraRef.current.y;
          const playerScreenX = posRef.current.x + camX;
          const playerScreenY = posRef.current.y + camY;
          targetAngle = Math.atan2(mousePosRef.current.y - playerScreenY, mousePosRef.current.x - playerScreenX);
        }

        const angleDiff = (targetAngle - aimAngleRef.current + Math.PI * 3) % (Math.PI * 2) - Math.PI;
        aimAngleRef.current += angleDiff * 0.4 * dt;

        const r = 14;
        let px = posRef.current.x, py = posRef.current.y;
        const isExitLocked = !state?.key?.carrierId || (state?.pickupLockoutRemaining > 0);

        let tx = px + dx;
        if (Math.abs(inputY) > 0.1 && Math.abs(inputX) < 0.5) tx += ((Math.floor(px / TILE_SIZE) + 0.5) * TILE_SIZE - px) * 0.25 * dt;
        let canX = true;
        if (isExitLocked && (tx < r || tx > MAZE_WIDTH - r)) canX = false;

        if (canX) {
          const currentMaze = loopMaze;
          const curPts = [{ x: px - r, y: py - r }, { x: px + r, y: py - r }, { x: px - r, y: py + r }, { x: px + r, y: py + r }];
          const isCurrentlyInExit = curPts.some(p => currentMaze[Math.floor(p.y / TILE_SIZE)]?.[Math.floor(p.x / TILE_SIZE)] === 2);
          const xPts = [{ x: tx - r, y: py - r }, { x: tx + r, y: py - r }, { x: tx - r, y: py + r }, { x: tx + r, y: py + r }];
          for (let p of xPts) {
            const tile = currentMaze[Math.floor(p.y / TILE_SIZE)]?.[Math.floor(p.x / TILE_SIZE)];
            if (tile === 1 || tile === 3 || (tile === 2 && isExitLocked && !isCurrentlyInExit)) { canX = false; break; }
          }
        }
        if (canX) px = tx; else velRef.current.x = 0;

        let ty = py + dy;
        if (Math.abs(inputX) > 0.1 && Math.abs(inputY) < 0.5) ty += ((Math.floor(py / TILE_SIZE) + 0.5) * TILE_SIZE - py) * 0.25 * dt;
        let canY = true;
        if (isExitLocked && (ty < r || ty > MAZE_HEIGHT - r)) canY = false;

        if (canY) {
          const currentMaze = loopMaze;
          const curPts = [{ x: px - r, y: py - r }, { x: px + r, y: py - r }, { x: px - r, y: py + r }, { x: px + r, y: py + r }];
          const isCurrentlyInExit = curPts.some(p => currentMaze[Math.floor(p.y / TILE_SIZE)]?.[Math.floor(p.x / TILE_SIZE)] === 2);
          const yPts = [{ x: px - r, y: ty - r }, { x: px + r, y: ty - r }, { x: px - r, y: ty + r }, { x: px + r, y: ty + r }];
          for (let p of yPts) {
            const tile = currentMaze[Math.floor(p.y / TILE_SIZE)]?.[Math.floor(p.x / TILE_SIZE)];
            if (tile === 1 || tile === 3 || (tile === 2 && isExitLocked && !isCurrentlyInExit)) { canY = false; break; }
          }
        }
        if (canY) py = ty; else velRef.current.y = 0;

        const angleChanged = Math.abs(angleDiff) > 0.01;
        if (!isEliminated && (px !== posRef.current.x || py !== posRef.current.y || angleChanged)) {
          posRef.current = { x: px, y: py };
          if (now - lastEmitTimeRef.current > 30) {
            socket.emit('player-move', { x: px, y: py, aimAngle: aimAngleRef.current });
            lastEmitTimeRef.current = now;
          }
        }

        if ((keys[' '] || keys['MouseLeft'] || mobileShootRef.current) && now - shootCooldownRef.current > 500) {
          initAudio();
          socket.emit('player-shoot');
          muzzleFlashRef.current = now;
          shootCooldownRef.current = now;
        }
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        const { width, height } = dimsRef.current;
        const dpr = window.devicePixelRatio || 1;

        if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
          canvas.width = Math.floor(width * dpr);
          canvas.height = Math.floor(height * dpr);
          canvas.style.width = `${width}px`;
          canvas.style.height = `${height}px`;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#020617'; ctx.fillRect(0, 0, width, height);

        const curX = posRef.current.x, curY = posRef.current.y;
        let targetX = curX, targetY = curY;

        if (activeSpectating && state) {
          const targetId = spectateTarget?.id || spectateTargetId;
          const targetPlayer = state.players.find((p) => p.id === targetId && p.hp > 0);
          if (targetPlayer) {
            const sp = smoothedPlayersRef.current[targetPlayer.id];
            targetX = sp ? sp.x : targetPlayer.x;
            targetY = sp ? sp.y : targetPlayer.y;
          }
          else {
            let closest = null, minDist = Infinity;
            state.players.forEach(p => {
              if (p.hp > 0 && p.id !== socket.id) {
                const d = Math.sqrt((posRef.current.x - p.x) ** 2 + (posRef.current.y - p.y) ** 2);
                if (d < minDist) { minDist = d; closest = p; }
              }
            });
            if (closest) {
              const sp = smoothedPlayersRef.current[closest.id];
              targetX = sp ? sp.x : closest.x;
              targetY = sp ? sp.y : closest.y;
            }
            else { targetX = MAZE_WIDTH / 2; targetY = MAZE_HEIGHT / 2; }
          }
        }

        smoothedCameraRef.current.x += (targetX - smoothedCameraRef.current.x) * 0.12 * dt;
        smoothedCameraRef.current.y += (targetY - smoothedCameraRef.current.y) * 0.12 * dt;

        const camX = width / 2 - smoothedCameraRef.current.x, camY = height / 2 - smoothedCameraRef.current.y;
        ctx.save();
        if (Date.now() - screenShakeRef.current < 200) {
          const intensity = 8 * (1 - (Date.now() - screenShakeRef.current) / 200);
          ctx.translate(Math.random() * intensity - intensity / 2, Math.random() * intensity - intensity / 2);
        }
        ctx.translate(camX, camY);

        // 0. Lazy-render Offscreen Maze if needed
        if (!offscreenMazeCanvasRef.current && mazeRef.current) {
          const m = mazeRef.current;
          const canvas = document.createElement('canvas');
          canvas.width = MAZE_WIDTH;
          canvas.height = MAZE_HEIGHT;
          const mCtx = canvas.getContext('2d');
          m.forEach((row, y) => {
            row.forEach((tile, x) => {
              const tx = x * TILE_SIZE, ty = y * TILE_SIZE;
              if (tile === 1) {
                const grad = mCtx.createLinearGradient(tx, ty, tx + TILE_SIZE, ty + TILE_SIZE);
                grad.addColorStop(0, '#1e293b'); grad.addColorStop(1, '#0f172a');
                mCtx.fillStyle = grad; mCtx.fillRect(tx, ty, TILE_SIZE, TILE_SIZE);
                mCtx.strokeStyle = '#334155'; mCtx.lineWidth = 1; mCtx.strokeRect(tx + 0.5, ty + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
              } else if (tile === 3) {
                mCtx.fillStyle = '#451a03'; mCtx.fillRect(tx + 2, ty + 2, TILE_SIZE - 4, TILE_SIZE - 4);
                mCtx.strokeStyle = '#f59e0b'; mCtx.lineWidth = 2; mCtx.strokeRect(tx + 4, ty + 4, TILE_SIZE - 8, TILE_SIZE - 8);

                // Draw Cracks based on HP
                const hp = (state.weakWallsHP && state.weakWallsHP[`${y},${x}`]) !== undefined ? state.weakWallsHP[`${y},${x}`] : 100;
                if (hp < 100) {
                  mCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                  mCtx.lineWidth = 1;
                  mCtx.beginPath();
                  if (hp <= 75) { mCtx.moveTo(tx + 10, ty + 10); mCtx.lineTo(tx + 20, ty + 25); mCtx.lineTo(tx + 5, ty + 30); }
                  if (hp <= 50) { mCtx.moveTo(tx + 30, ty + 10); mCtx.lineTo(tx + 25, ty + 20); mCtx.lineTo(tx + 35, ty + 35); }
                  if (hp <= 25) { mCtx.moveTo(tx + 10, ty + 35); mCtx.lineTo(tx + 25, ty + 30); mCtx.lineTo(tx + 30, ty + 40); }
                  mCtx.stroke();
                }
              }
            });
          });
          offscreenMazeCanvasRef.current = canvas;
        }

        // 1. Draw Maze Background (Bottom Layer)
        if (offscreenMazeCanvasRef.current) {
          const camX_val = smoothedCameraRef.current.x;
          const camY_val = smoothedCameraRef.current.y;

          // Source clipping: only draw the visible portion
          const viewW = width, viewH = height;
          const sx = Math.max(0, camX_val - viewW / 2);
          const sy = Math.max(0, camY_val - viewH / 2);
          const sWidth = Math.min(MAZE_WIDTH - sx, viewW);
          const sHeight = Math.min(MAZE_HEIGHT - sy, viewH);

          const dx = sx, dy = sy;
          ctx.drawImage(offscreenMazeCanvasRef.current, sx, sy, sWidth, sHeight, dx, dy, sWidth, sHeight);
        }

        // 2. Draw Zone
        if (state && !state.key.carrierId && state.zoneRadius < 2000) {
          ctx.save();
          ctx.strokeStyle = 'rgba(244, 63, 94, 0.3)'; ctx.lineWidth = 15; ctx.beginPath();
          ctx.arc(MAZE_WIDTH / 2, MAZE_HEIGHT / 2, state.zoneRadius, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = 'rgba(244, 63, 94, 0.7)'; ctx.lineWidth = 4; ctx.stroke();
          ctx.restore();
        }

        // 3. Draw Particles
        particlesRef.current.forEach((p, i) => {
          p.x += p.vx * dt; p.y += p.vy * dt; p.life -= 0.02 * dt;
          if (p.life <= 0) { particlesRef.current.splice(i, 1); return; }
          ctx.globalAlpha = p.life / p.maxLife; ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        });

        // 3.5 Draw Floating Numbers
        floatingNumbersRef.current.forEach((fn, i) => {
          fn.x += fn.vx * dt;
          fn.y += fn.vy * dt;
          fn.life -= 0.02 * dt;
          if (fn.life <= 0) { floatingNumbersRef.current.splice(i, 1); return; }
          ctx.globalAlpha = fn.life;
          ctx.fillStyle = '#f43f5e';
          ctx.font = '900 18px Outfit';
          ctx.textAlign = 'center';
          ctx.fillText(`-${fn.amount}`, fn.x, fn.y);
        });
        ctx.globalAlpha = 1.0;

        // Draw Dynamic Maze Elements (Exit Gate)
        const activeMaze = loopMaze;
        activeMaze.forEach((row, y) => {
          row.forEach((tile, x) => {
            if (tile === 2) {
              const tx = x * TILE_SIZE, ty = y * TILE_SIZE;
              const isLocked = !state?.key?.carrierId || (state?.pickupLockoutRemaining > 0);
              if (isLocked) {
                ctx.fillStyle = 'rgba(244, 63, 94, 0.15)'; ctx.fillRect(tx, ty, TILE_SIZE, TILE_SIZE);
                ctx.strokeStyle = '#f43f5e'; ctx.lineWidth = 4; ctx.strokeRect(tx + 2, ty + 2, TILE_SIZE - 4, TILE_SIZE - 4);
                ctx.strokeStyle = 'rgba(244, 63, 94, 0.6)'; ctx.lineWidth = 3;
                for (let i = 1; i < 4; i++) {
                  ctx.beginPath(); ctx.moveTo(tx + i * (TILE_SIZE / 4), ty + 4); ctx.lineTo(tx + i * (TILE_SIZE / 4), ty + TILE_SIZE - 4); ctx.stroke();
                }
                ctx.fillStyle = '#f43f5e'; ctx.font = '900 11px Outfit'; ctx.textAlign = 'center';
                ctx.fillText('LOCKED', tx + TILE_SIZE / 2, ty + TILE_SIZE / 2 + 4);
              } else {
                ctx.fillStyle = 'rgba(16, 185, 129, 0.2)'; ctx.fillRect(tx, ty, TILE_SIZE, TILE_SIZE);
                ctx.strokeStyle = '#10b981'; ctx.lineWidth = 3; ctx.strokeRect(tx, ty, TILE_SIZE, TILE_SIZE);
                ctx.shadowBlur = 15; ctx.shadowColor = '#10b981'; ctx.strokeRect(tx, ty, TILE_SIZE, TILE_SIZE); ctx.shadowBlur = 0;
                ctx.fillStyle = '#10b981'; ctx.font = '900 13px Outfit'; ctx.textAlign = 'center';
                ctx.fillText('OPEN', tx + TILE_SIZE / 2, ty + TILE_SIZE / 2 + 4);
              }
            }
          });
        });

        if (state) {
          localBulletsRef.current.forEach(b => {
            ctx.fillStyle = 'rgba(253, 224, 71, 0.4)'; ctx.beginPath(); ctx.arc(b.x, b.y, 8, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI * 2); ctx.fill();
          });

          // 4.5 Draw Pickups
          if (state.pickups) {
            state.pickups.forEach(pick => {
              ctx.save();
              ctx.translate(pick.x, pick.y);
              const float = Math.sin(Date.now() / 400) * 4;
              ctx.translate(0, float);

              if (pick.type === 'health') {
                ctx.fillStyle = '#10b981';
                ctx.shadowBlur = 10; ctx.shadowColor = '#10b981';
                ctx.fillRect(-10, -10, 20, 20);
                ctx.fillStyle = '#fff';
                ctx.fillRect(-2, -7, 4, 14);
                ctx.fillRect(-7, -2, 14, 4);
              } else {
                // Realistic Bullet Trio
                ctx.shadowBlur = 15; ctx.shadowColor = '#fde047';
                
                const drawBullet = (ox) => {
                  ctx.save();
                  ctx.translate(ox, 0);
                  // Casing (Brass)
                  ctx.fillStyle = '#d97706';
                  ctx.fillRect(-3, -2, 6, 12);
                  // Projectile (Gold/Copper)
                  ctx.fillStyle = '#fde047';
                  ctx.beginPath();
                  ctx.moveTo(-3, -2);
                  ctx.quadraticCurveTo(0, -12, 3, -2);
                  ctx.fill();
                  // Shine
                  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
                  ctx.lineWidth = 1;
                  ctx.beginPath(); ctx.moveTo(-1, -4); ctx.lineTo(-1, -8); ctx.stroke();
                  ctx.restore();
                };

                drawBullet(-6);
                drawBullet(0);
                drawBullet(6);

                ctx.shadowBlur = 0;
                ctx.fillStyle = '#fde047';
                ctx.font = '900 8px Outfit'; ctx.textAlign = 'center';
                ctx.fillText('AMMO', 0, 18);
              }

              ctx.restore();
            });
          }

          const k = state.key;
          if (k && !k.carrierId) {
            const pulse = (Math.sin(Date.now() / 200) + 1) / 2;
            drawKey(ctx, k.x, k.y, pulse);
          }

          state.players.forEach(p => {
            if (p.hp <= 0) return;
            ctx.save();
            const isMe = p.id === socket.id, sp = smoothedPlayersRef.current[p.id];
            const px = isMe ? curX : (sp ? sp.x : p.x), py = isMe ? curY : (sp ? sp.y : p.y);
            const pAngle = isMe ? aimAngleRef.current : (p.aimAngle || 0);
            
            // Stealth Handling: 100% invisible for others, 40% for self
            if (p.isStealth) {
              ctx.globalAlpha = isMe ? 0.4 : 0;
            } else {
              ctx.globalAlpha = 1.0;
            }

            ctx.translate(px, py);

            if (isMe && Date.now() - muzzleFlashRef.current < 100) {
              ctx.fillStyle = 'rgba(253, 224, 71, 0.3)'; ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
            }

            ctx.save(); ctx.rotate(pAngle); ctx.fillStyle = '#94a3b8'; ctx.fillRect(12, -4, 22, 8); ctx.restore();

            const color = isMe ? '#6366f1' : '#f43f5e';
            const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
            grad.addColorStop(0, color); grad.addColorStop(1, '#000');
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;

            if (p.isCarryingKey) {
              const pulse = (Math.sin(Date.now() / 400) + 1) / 2;
              
              // Subtle radial glow behind player
              const auraGrad = ctx.createRadialGradient(0, 0, 16, 0, 0, 32);
              auraGrad.addColorStop(0, `rgba(251, 191, 36, ${0.2 + pulse * 0.1})`);
              auraGrad.addColorStop(1, 'rgba(251, 191, 36, 0)');
              ctx.fillStyle = auraGrad;
              ctx.beginPath(); ctx.arc(0, 0, 32, 0, Math.PI * 2); ctx.fill();

              // Small floating key indicator above head
              ctx.save();
              ctx.translate(0, -32 - pulse * 4);
              ctx.fillStyle = '#fbbf24';
              ctx.shadowBlur = 10; ctx.shadowColor = '#fbbf24';
              // Draw a tiny key shape
              ctx.beginPath();
              ctx.arc(0, 0, 4, 0, Math.PI * 2);
              ctx.rect(-1, 4, 2, 8);
              ctx.rect(1, 6, 3, 2);
              ctx.rect(1, 9, 3, 2);
              ctx.fill();
              ctx.restore();
            }

            if (p.isReloading) {
              const startTime = reloadStartTimesRef.current[p.id] || p.lastReloadTime;
              const elapsed = Date.now() - startTime;
              const reloadProgress = Math.min(1, Math.max(0, elapsed / 1500));
              
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
              ctx.lineWidth = 4;
              ctx.beginPath();
              ctx.arc(0, 0, 20, 0, Math.PI * 2);
              ctx.stroke();

              ctx.strokeStyle = '#fff';
              ctx.beginPath();
              const startAngle = -Math.PI / 2;
              const endAngle = startAngle + (Math.PI * 2 * reloadProgress);
              ctx.arc(0, 0, 20, startAngle, endAngle);
              ctx.stroke();
            }

            if (!isMe && !p.isStealth) {
              const barW = 44, barH = 6;
              ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(-barW / 2, -38, barW, barH);
              ctx.fillStyle = p.hp > 30 ? '#10b981' : '#f43f5e'; ctx.fillRect(-barW / 2, -38, (p.hp / 100) * barW, barH);
              ctx.fillStyle = '#fff'; ctx.font = '900 12px Outfit'; ctx.textAlign = 'center';
              ctx.fillText(p.name.toUpperCase(), 0, -45);
            }
            ctx.restore();
            ctx.globalAlpha = 1.0; // Reset for next player
          });
        }
        ctx.restore();

        // Minimap Drawing
        const mCanvas = minimapCanvasRef.current;
        if (mCanvas && state) {
          const mCtx = mCanvas.getContext('2d');
          const dpr = window.devicePixelRatio || 1;
          const mSize = 160;
          const mScale = mSize / MAZE_WIDTH;

          if (mCanvas.width !== Math.floor(mSize * dpr) || mCanvas.height !== Math.floor(mSize * dpr)) {
            mCanvas.width = Math.floor(mSize * dpr);
            mCanvas.height = Math.floor(mSize * dpr);
            mCanvas.style.width = `${mSize}px`;
            mCanvas.style.height = `${mSize}px`;
          }
          mCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
          mCtx.clearRect(0, 0, mSize, mSize);

          // Pre-render Minimap Walls if needed
          if (!offscreenMinimapCanvasRef.current) {
            offscreenMinimapCanvasRef.current = document.createElement('canvas');
            offscreenMinimapCanvasRef.current.width = mSize * dpr;
            offscreenMinimapCanvasRef.current.height = mSize * dpr;
            const omCtx = offscreenMinimapCanvasRef.current.getContext('2d');
            omCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

            const currentMaze = mazeRef.current || MAZE_MAP;
            currentMaze.forEach((row, y) => {
              row.forEach((tile, x) => {
                if (tile === 1) {
                  omCtx.fillStyle = 'rgba(255,255,255,0.15)';
                  omCtx.fillRect(x * TILE_SIZE * mScale, y * TILE_SIZE * mScale, TILE_SIZE * mScale, TILE_SIZE * mScale);
                } else if (tile === 3) {
                  omCtx.fillStyle = 'rgba(245, 158, 11, 0.4)';
                  omCtx.fillRect(x * TILE_SIZE * mScale, y * TILE_SIZE * mScale, TILE_SIZE * mScale, TILE_SIZE * mScale);
                } else if (tile === 2) {
                  omCtx.fillStyle = 'rgba(16, 185, 129, 0.3)';
                  omCtx.fillRect(x * TILE_SIZE * mScale, y * TILE_SIZE * mScale, TILE_SIZE * mScale, TILE_SIZE * mScale);
                }
              });
            });
          }

          if (offscreenMinimapCanvasRef.current) {
            mCtx.drawImage(offscreenMinimapCanvasRef.current, 0, 0, mSize, mSize);
          }

          if (!state.key.carrierId && state.zoneRadius < MAZE_WIDTH) {
            mCtx.strokeStyle = '#f43f5e';
            mCtx.lineWidth = 2;
            mCtx.beginPath();
            mCtx.arc((MAZE_WIDTH / 2) * mScale, (MAZE_HEIGHT / 2) * mScale, state.zoneRadius * mScale, 0, Math.PI * 2);
            mCtx.stroke();
            mCtx.fillStyle = 'rgba(244, 63, 94, 0.05)';
            mCtx.fillRect(0, 0, mSize, mSize);
          }
          const kPulse = (Math.sin(Date.now() / 200) + 1) / 2;
          const carrier = state.players.find(p => p.id === state.key.carrierId);
          const hideKeyIcon = carrier && carrier.isStealth && carrier.id !== socket.id;
          
          if (!hideKeyIcon) {
            mCtx.fillStyle = '#eab308'; 
            mCtx.shadowBlur = 10 * kPulse; 
            mCtx.shadowColor = '#eab308'; 
            mCtx.beginPath(); 
            mCtx.arc(state.key.x * mScale, state.key.y * mScale, 4, 0, Math.PI * 2); 
            mCtx.fill(); 
            mCtx.shadowBlur = 0;
          }
          state.players.forEach(p => { 
            if (p.hp > 0) { 
              // Hide stealthy players from minimap unless it's yourself
              if (p.isStealth && p.id !== socket.id) return;
              
              mCtx.fillStyle = p.id === socket.id ? '#6366f1' : '#f43f5e'; 
              mCtx.beginPath(); 
              mCtx.arc((p.id === socket.id ? curX : p.x) * mScale, (p.id === socket.id ? curY : p.y) * mScale, 3, 0, Math.PI * 2); 
              mCtx.fill(); 
            } 
          });
        }
      }

      loopId = requestAnimationFrame(gameLoop);
    };

    loopId = requestAnimationFrame(gameLoop);

    socket.on('initial-maze', (maze) => {
      mazeRef.current = maze;
      offscreenMazeCanvasRef.current = null;
      offscreenMinimapCanvasRef.current = null;
    });

    socket.on('maze-update', ({ x, y, type }) => {
      if (mazeRef.current) {
        mazeRef.current[y][x] = type;
        offscreenMazeCanvasRef.current = null;
        offscreenMinimapCanvasRef.current = null;

        if (type === 0) { // Wall destroyed
          createParticles((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE, '#451a03', 20, 5, 2);
        }
      }
    });

    socket.on('game-state', (data) => {
      // Invalidate offscreen maze if wall HP changed
      if (gameStateRef.current?.weakWallsHP && JSON.stringify(gameStateRef.current.weakWallsHP) !== JSON.stringify(data.weakWallsHP)) {
        offscreenMazeCanvasRef.current = null;
        offscreenMinimapCanvasRef.current = null;
      }

      gameStateRef.current = data;
      localBulletsRef.current = data.bullets;

      setUiGameState(data);

      // Smooth Reload Animation Management
      data.players.forEach(p => {
        if (p.isReloading) {
          if (!reloadStartTimesRef.current[p.id]) {
            reloadStartTimesRef.current[p.id] = Date.now();
          }
        } else {
          delete reloadStartTimesRef.current[p.id];
        }
      });

      // Kill Feed Logic
      if (prevPlayersRef.current) {
        data.players.forEach(p => {
          const prevP = prevPlayersRef.current[p.id];
          if (prevP && prevP.hp > 0 && p.hp <= 0) {
            const killer = data.players.find(kp => kp.id === p.killedBy);
            const entry = {
              id: Date.now(),
              killer: p.killedBy === 'ZONE' ? 'THE ZONE' : (killer ? killer.name : 'Unknown'),
              victim: p.name,
              isZone: p.killedBy === 'ZONE'
            };
            setKillFeed(prev => [entry, ...prev].slice(0, 5));
            setTimeout(() => {
              setKillFeed(prev => prev.filter(e => e.id !== entry.id));
            }, 5000);
          }
        });
      }
      prevPlayersRef.current = data.players.reduce((acc, p) => ({ ...acc, [p.id]: p }), {});

      // Authoritative server sync for local player
      const serverMe = data.players.find(p => p.id === socket.id);
      if (serverMe) {
        const dist = Math.sqrt((posRef.current.x - serverMe.x) ** 2 + (posRef.current.y - serverMe.y) ** 2);
        const isRecentlyDashed = Date.now() - dashTimeRef.current < 500;
        if (dist > 150 && !isRecentlyDashed) {
          posRef.current = { x: serverMe.x, y: serverMe.y };
        }
      }

      const serverBulletIds = new Set(data.bullets.map(b => b.id));
      localBulletsRef.current = localBulletsRef.current.filter(b => serverBulletIds.has(b.id));
      data.bullets.forEach(sb => {
        const lb = localBulletsRef.current.find(b => b.id === sb.id);
        if (lb) {
          const dist = Math.sqrt((lb.x - sb.x) ** 2 + (lb.y - sb.y) ** 2);
          if (dist > 30) { lb.x = sb.x; lb.y = sb.y; }
          lb.vx = sb.vx; lb.vy = sb.vy;
        } else {
          localBulletsRef.current.push({ ...sb });
        }
      });
    });
    socket.on('game-over', (data) => {
      setGameOver(data);
      gameOverRef.current = data;
    });

    return () => {
      cancelAnimationFrame(loopId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('contextmenu', handleContextMenu);
      socket.off('game-state');
      socket.off('game-over');
    };
  }, [roomData, spectateTargetId, isSpectating]);

  const isKeyCarrier = uiGameState?.key.carrierId === socket.id;
  const hasTeamsInSummary = Boolean(gameOver?.stats?.some((s) => s.teamId));

  const handleTouchStart = (e) => {
    if (!isMobileRef.current) return;
    initAudio();
    const { width } = dimsRef.current;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const { clientX, clientY } = touch;

      // Left half = movement
      if (clientX < width / 2) {
        if (!moveJoystickRef.current.active) {
          moveJoystickRef.current = { active: true, x: 0, y: 0, startX: clientX, startY: clientY, curX: clientX, curY: clientY, id: touch.identifier };
          setJoystickUI(prev => ({ ...prev, move: { active: true, x: clientX, y: clientY, curX: clientX, curY: clientY } }));
        }
      }
      // Right half = Floating Fire & Aiming
      else {
        if (!aimJoystickRef.current.active) {
          shootTouchIdRef.current = touch.identifier;
          shootTouchStartRef.current = { x: clientX, y: clientY };

          // Initialize aim joystick state (no firing yet)
          aimJoystickRef.current = { active: true, x: 0, y: 0, startX: clientX, startY: clientY, curX: clientX, curY: clientY, id: touch.identifier };
          setJoystickUI(prev => ({ ...prev, aim: { active: true, x: clientX, y: clientY, curX: clientX, curY: clientY, isFiring: false } }));
          
          // We don't set mobileShootRef.current = true here.
          // It will be set in handleTouchMove once the user drags beyond a threshold.
        }
      }
    }
  };

  const handleTouchMove = (e) => {
    if (!isMobileRef.current) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const { clientX, clientY, identifier } = touch;

      if (moveJoystickRef.current.active && moveJoystickRef.current.id === identifier) {
        const dx = clientX - moveJoystickRef.current.startX;
        const dy = clientY - moveJoystickRef.current.startY;
        const dist = Math.min(50, Math.sqrt(dx * dx + dy * dy));
        const angle = Math.atan2(dy, dx);
        moveJoystickRef.current.x = (Math.cos(angle) * dist) / 50;
        moveJoystickRef.current.y = (Math.sin(angle) * dist) / 50;
        moveJoystickRef.current.curX = moveJoystickRef.current.startX + Math.cos(angle) * dist;
        moveJoystickRef.current.curY = moveJoystickRef.current.startY + Math.sin(angle) * dist;
        setJoystickUI(prev => ({ ...prev, move: { ...prev.move, curX: moveJoystickRef.current.curX, curY: moveJoystickRef.current.curY } }));
      }

      if (aimJoystickRef.current.active && aimJoystickRef.current.id === identifier) {
        const dx = clientX - aimJoystickRef.current.startX;
        const dy = clientY - aimJoystickRef.current.startY;
        const rawDist = Math.sqrt(dx * dx + dy * dy);
        const dist = Math.min(50, rawDist);
        const angle = Math.atan2(dy, dx);
        
        aimJoystickRef.current.x = Math.cos(angle);
        aimJoystickRef.current.y = Math.sin(angle);
        aimJoystickRef.current.curX = aimJoystickRef.current.startX + Math.cos(angle) * dist;
        aimJoystickRef.current.curY = aimJoystickRef.current.startY + Math.sin(angle) * dist;

        // Firing Threshold: Only shoot if dragged beyond 15px
        if (rawDist > 15) {
          mobileShootRef.current = true;
        } else {
          mobileShootRef.current = false;
        }

        setJoystickUI(prev => ({ 
          ...prev, 
          aim: { 
            ...prev.aim, 
            curX: aimJoystickRef.current.curX, 
            curY: aimJoystickRef.current.curY,
            isFiring: mobileShootRef.current 
          } 
        }));
      }
    }
  };

  const handleTouchEnd = (e) => {
    if (!isMobileRef.current) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const identifier = e.changedTouches[i].identifier;
      if (moveJoystickRef.current.id === identifier) {
        moveJoystickRef.current.active = false;
        moveJoystickRef.current.x = 0;
        moveJoystickRef.current.y = 0;
        setJoystickUI(prev => ({ ...prev, move: { active: false, x: 0, y: 0 } }));
      }
      if (aimJoystickRef.current.id === identifier) {
        aimJoystickRef.current.active = false;
        aimJoystickRef.current.id = null;
        aimJoystickRef.current.x = 0;
        aimJoystickRef.current.y = 0;
        setJoystickUI(prev => ({ ...prev, aim: { active: false, x: 0, y: 0, isFiring: false } }));
        mobileShootRef.current = false;
        shootTouchIdRef.current = null;
      }
    }
  };

  // Removed handleMobileShootStart/End as fire is now integrated into Floating Joystick

  const handleMobileDash = (e) => {
    e.stopPropagation();
    initAudio();
    if (Date.now() - dashCooldownRef.current > 4000) {
      dashTimeRef.current = Date.now();
      dashCooldownRef.current = Date.now();
      socket.emit('player-dash');
      socket.emit('play-sound', { x: posRef.current.x, y: posRef.current.y, type: 'dash' });
    }
  };

  const beginSpectating = () => {
    setIsSpectating(true);
    if (spectateCandidates.length > 0) {
      setSpectateTargetId(spectateCandidates[0].id);
    }
  };

  const cycleSpectateTarget = (direction) => {
    if (spectateCandidates.length < 2) return;

    const currentIndex = spectateCandidates.findIndex((p) => p.id === spectateTargetId);
    const safeIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = (safeIndex + direction + spectateCandidates.length) % spectateCandidates.length;
    setSpectateTargetId(spectateCandidates[nextIndex].id);
  };

  const spectateTargetName = spectateTarget ? spectateTarget.name.toUpperCase() : 'BATTLEFIELD';

  return (
    <div
      className="game-wrapper"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <canvas ref={canvasRef} style={{ display: 'block' }} />

      {isMobile && !isPortrait && !gameOver && (
        <div className="mobile-controls-layer">
          <div className="mobile-controls right">
            <button 
              className={`mobile-btn dash-btn ${dashCDRemaining === 0 ? 'can-dash' : ''}`} 
              onTouchStart={handleMobileDash}
            >
              <Wind size={24} />
            </button>

            <button
              className={`mobile-btn reload-btn ${localPlayer?.isReloading ? 'reloading' : ''} ${localPlayer && !localPlayer.isReloading && localPlayer.ammo < localPlayer.maxAmmo && localPlayer.reserveAmmo > 0 ? 'can-reload' : ''} ${localPlayer && localPlayer.ammo === 0 && localPlayer.reserveAmmo === 0 ? 'out-of-ammo' : ''}`}
              onTouchStart={(e) => {


                e.stopPropagation();
                if (localPlayer && !localPlayer.isReloading && localPlayer.ammo < localPlayer.maxAmmo && localPlayer.reserveAmmo > 0) {
                  socket.emit('player-reload');
                }
              }}
              style={{ marginTop: '10px' }}
            >
              <RotateCcw size={24} />
            </button>

          </div>

          {joystickUI.move.active && (
            <div className="joystick-base" style={{ left: joystickUI.move.x, top: joystickUI.move.y }}>
              <div className="joystick-knob" style={{ transform: `translate(${joystickUI.move.curX - joystickUI.move.x}px, ${joystickUI.move.curY - joystickUI.move.y}px)` }} />
            </div>
          )}

          {joystickUI.aim.active && (
            <div
              className={`joystick-base ${joystickUI.aim.isFiring ? 'firing' : ''}`}
              style={{ left: joystickUI.aim.x, top: joystickUI.aim.y }}
            >
              <div
                className="joystick-knob"
                style={{
                  left: 30 + (joystickUI.aim.curX - joystickUI.aim.x),
                  top: 30 + (joystickUI.aim.curY - joystickUI.aim.y)
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Low HP Vignette */}
      <div className={`low-hp-vignette ${(localPlayer?.hp > 0 && localPlayer?.hp < 30) ? 'active' : ''}`} />

      {/* In-Game UI Layer */}
      {!gameOver && (
        <div className="ingame-ui-layer">
          {/* Minimap */}
          <div className="minimap-wrapper">
            <div className="minimap-canvas-container">
              <canvas ref={minimapCanvasRef} width={160} height={160} />
            </div>
          </div>

          {/* Kill Feed */}
          <div className="killfeed-container">
            {killFeed.map(entry => (
              <div key={entry.id} className="kill-entry">
                <span className="killer-name">{entry.killer.toUpperCase()}</span>
                <Skull className="kill-icon" />
                <span className="victim-name">{entry.victim.toUpperCase()}</span>
              </div>
            ))}
          </div>

          {/* Main HUD */}
          {localPlayer && !isEliminated && (
            <div className="hud-container">
              <div className="hud-header">
                <div className="hud-player-info">
                  <span className="hud-player-name">{localPlayer.name.toUpperCase()}</span>
                </div>
                <div className={`hud-dash-indicator ${dashCDRemaining > 0 ? 'cooldown' : ''}`}>
                  <Wind size={14} />
                  <span>{dashCDRemaining > 0 ? `${(dashCDRemaining / 1000).toFixed(1)}s` : 'READY'}</span>
                </div>
              </div>

              <div className="hud-hp-section">
                <div className="hud-hp-bar-bg">
                  <div
                    className={`hud-hp-bar-fill ${localPlayer.hp < 30 ? 'critical' : ''}`}
                    style={{ width: `${localPlayer.hp}%` }}
                  />
                </div>
              </div>

              <div className="hud-stats-row">
                <div className="hud-stat-item">
                  <Skull className="hud-stat-icon" />
                  <span className="hud-stat-value">{localPlayer.score}</span>
                </div>
                <div className="hud-stat-item">
                  <Crosshair className="hud-stat-icon" />
                  <span className="hud-stat-value">{localPlayer.range}T</span>
                </div>
                <div className="hud-stat-item">
                  <Activity className="hud-stat-icon" />
                  <span className="hud-stat-value">{Math.ceil(localPlayer.hp)}%</span>
                </div>
                <div className="hud-stat-item ammo-stat-visual">
                  <div className="ammo-pips">
                    {[...Array(localPlayer.maxAmmo)].map((_, i) => (
                      <div 
                        key={i} 
                        className={`ammo-pip ${i < localPlayer.ammo ? 'filled' : ''}`} 
                      />
                    ))}
                  </div>
                  <div className="ammo-reserve">
                    <span className="reserve-value">{localPlayer.reserveAmmo}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Arena Lock / Key Carrier Alerts */}
      {uiGameState?.exitLockoutRemaining > 0 ? (
        <div className="key-carrier-alert arena-lock">
          <Zap size={20} className="lock-icon" style={{ color: 'var(--accent)' }} />
          <span>
            ARENA LOCK ACTIVE — WALLS BREACHABLE IN: {uiGameState.exitLockoutRemaining}s
          </span>
        </div>
      ) : uiGameState?.key?.carrierId ? (
        <div className="key-carrier-alert">
          <Key size={20} className="lock-icon" />
          <span>
            {uiGameState.players.find(p => p.id === uiGameState.key.carrierId)?.name.toUpperCase()} HAS THE KEY
            {uiGameState.pickupLockoutRemaining > 0 && (
              <span style={{ color: '#f43f5e', marginLeft: '10px', fontWeight: 900 }}>
                — EXITS LOCKED: {uiGameState.pickupLockoutRemaining}s
              </span>
            )}
          </span>
        </div>
      ) : null}

      {/* Elimination Overlay */}
      {isEliminated && !activeSpectating && !gameOver && (
        <div className="elimination-overlay">
          <div className="overlay-content">
            <h1 className="glitch-text">TERMINATED</h1>
            <p style={{ color: 'var(--text-dim)', marginBottom: '2rem' }}>
              Killed by: <span style={{ color: 'var(--danger)', fontWeight: 800 }}>
                {localPlayer.killedBy === 'ZONE' ? 'THE DEADLY ZONE' : (uiGameState?.players.find(p => p.id === localPlayer.killedBy)?.name.toUpperCase() || 'UNKNOWN AGENT')}
              </span>
            </p>
            <div className="overlay-buttons">
              <button onClick={beginSpectating}>{isTeamMode ? 'SPECTATE TEAMMATE' : 'SPECTATE KILLER'}</button>
              <button onClick={() => window.location.reload()}>RETURN TO MENU</button>
            </div>
          </div>
        </div>
      )}

      {/* Spectate Label */}
      {activeSpectating && !gameOver && (
        <div className="spectate-label">
          <span style={{ opacity: 0.6, fontSize: '0.8rem' }}>WATCHING</span>
          <span style={{ color: 'var(--accent)' }}>{spectateTargetName}</span>
          {spectateCandidates.length > 1 && (
            <>
              <button className="spectate-switch-btn" onClick={() => cycleSpectateTarget(-1)}>PREV</button>
              <button className="spectate-switch-btn" onClick={() => cycleSpectateTarget(1)}>NEXT</button>
            </>
          )}
          <button className="spectate-exit-btn" onClick={() => window.location.reload()}>EXIT</button>
        </div>
      )}

      {/* Game Over Overlay */}
      {gameOver && (
        <div className="elimination-overlay game-over">
          <div className="overlay-content summary-box">
            <h1 className="winner-text">MISSION END</h1>
            <p className="winner-name">
              WINNER: <span>{gameOver.winner.toUpperCase()}</span>
            </p>

            <div className="match-stats">
              <table>
                <thead>
                  <tr>
                    <th>AGENT</th>
                    {hasTeamsInSummary && <th>TEAM</th>}
                    <th>KILLS</th>
                    <th>HOLD TIME</th>
                  </tr>
                </thead>
                <tbody>
                  {gameOver.stats?.sort((a, b) => b.score - a.score).map((s, i) => (
                    <tr key={i} className={s.isWinner ? 'winner-row' : ''}>
                      <td>{s.name.toUpperCase()} {s.isWinner ? '(WINNER)' : ''}</td>
                      {hasTeamsInSummary && <td>{s.teamId ? `TEAM ${s.teamId}` : '-'}</td>}
                      <td>{s.score}</td>
                      <td>{s.holdTime}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="overlay-buttons">
              <button onClick={() => window.location.reload()}>REDEPLOY AGENT</button>
            </div>
          </div>
        </div>
      )}
      {/* Connection Status */}
      {!isEliminated && (
        <div className="connection-status">
          <div className={`ping-dot ${ping < 100 ? 'good' : ping < 200 ? 'medium' : 'bad'}`} />
          <span>{ping}ms</span>
        </div>
      )}
    </div>
  );
};

export default Game;


