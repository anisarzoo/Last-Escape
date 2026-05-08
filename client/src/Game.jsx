import { useRef, useEffect, useState, useMemo } from 'react';
import { socket } from './socket';
import { MAZE_MAP, TILE_SIZE, MAZE_WIDTH, MAZE_HEIGHT } from './constants';
import { 
  Skull, 
  Target, 
  Activity, 
  Wind, 
  Zap,
  Crosshair
} from 'lucide-react';

// --- AUDIO ENGINE ---
let audioCtx = null;
const initAudio = () => {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
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
    const bufferSize = audioCtx.sampleRate * 0.1;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
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
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1000;
    const bufferSize = audioCtx.sampleRate * 0.2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
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
  const posRef = useRef({ x: TILE_SIZE * 0.5, y: TILE_SIZE * 0.5 });
  const aimAngleRef = useRef(0);
  const [gameState, setGameState] = useState(null);
  const [gameOver, setGameOver] = useState(null);
  const [isSpectating, setIsSpectating] = useState(false);
  const [spectateTargetId, setSpectateTargetId] = useState(null);
  const [dashCDRemaining, setDashCDRemaining] = useState(0);
  const [muzzleFlash, setMuzzleFlash] = useState(0);
  const [screenShake, setScreenShake] = useState(0);
  const [killFeed, setKillFeed] = useState([]);
  const keysRef = useRef({});
  const shootCooldownRef = useRef(0);
  const dashCooldownRef = useRef(0);
  const dashTimeRef = useRef(0);
  const particlesRef = useRef([]);
  const lastEmitTimeRef = useRef(0);
  const velRef = useRef({ x: 0, y: 0 });
  const smoothedPlayersRef = useRef({});
  const localBulletsRef = useRef([]);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [isMobile, setIsMobile] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);

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
  const localPlayer = gameState?.players.find((p) => p.id === socket.id);
  const isTeamMode = Boolean(gameState?.isTeamMode || roomData?.isTeamMode);
  const isEliminated = Boolean(localPlayer && localPlayer.hp <= 0);
  const activeSpectating = isSpectating || (isTeamMode && isEliminated && !gameOver);

  const spectateCandidates = useMemo(() => {
    if (!gameState || !localPlayer) return [];

    const aliveOthers = gameState.players.filter((p) => p.id !== socket.id && p.hp > 0);
    if (aliveOthers.length === 0) return [];

    if (isTeamMode && localPlayer.teamId) {
      const aliveTeammates = aliveOthers.filter((p) => p.teamId === localPlayer.teamId);
      if (aliveTeammates.length > 0) return aliveTeammates;
      return aliveOthers.filter((p) => p.teamId !== localPlayer.teamId);
    }

    const killer = aliveOthers.find((p) => p.id === localPlayer.killedBy);
    if (!killer) return aliveOthers;
    return [killer, ...aliveOthers.filter((p) => p.id !== killer.id)];
  }, [gameState, isTeamMode, localPlayer]);

  const spectateTarget = useMemo(() => {
    if (spectateCandidates.length === 0) return null;
    return spectateCandidates.find((p) => p.id === spectateTargetId) || spectateCandidates[0];
  }, [spectateCandidates, spectateTargetId]);

  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
      setIsPortrait(window.innerHeight > window.innerWidth);
      setIsMobile(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 0));
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setDashCDRemaining(Math.max(0, 3000 - (Date.now() - dashCooldownRef.current)));
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
        setScreenShake(Date.now());
      }
      if (data.type === 'shoot') createParticles(data.x, data.y, 'rgba(147, 197, 253, 0.5)', 3, 1, 0.2);
      if (data.type === 'dash') createParticles(data.x, data.y, '#6366f1', 15, 3);
      if (data.type === 'zone-removed') createParticles(data.x, data.y, '#f43f5e', 30, 8, 2);
      if (data.type === 'ricochet') createParticles(data.x, data.y, '#fff', 6, 2, 0.3);
      if (data.type === 'dash-hit') {
        createParticles(data.x, data.y, '#a855f7', 20, 6, 0.8);
        setScreenShake(Date.now());
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
        setScreenShake(Date.now());
      }
    };
    socket.on('player-knockback', handleKnockback);

    return () => {
      socket.off('play-sound', handleSound);
      socket.off('player-knockback', handleKnockback);
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
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    let lastTime = performance.now();
    let loopId;

    const gameLoop = (time) => {
      const dt = Math.min(2, (time - lastTime) / 16.66);
      lastTime = time;

      if (gameState) {
        gameState.players.forEach(p => {
          if (p.id === socket.id) return;
          if (!smoothedPlayersRef.current[p.id]) {
            smoothedPlayersRef.current[p.id] = { x: p.x, y: p.y, vx: 0, vy: 0 };
          }
          const sp = smoothedPlayersRef.current[p.id];
          sp.vx *= 0.88; sp.vy *= 0.88;
          sp.x += sp.vx * dt; sp.y += sp.vy * dt;
          sp.x += (p.x - sp.x) * 0.3; sp.y += (p.y - sp.y) * 0.3;
        });
      }

      const loopMaze = gameState?.maze || roomData?.maze || MAZE_MAP;
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

      if (!gameOver) {
        const now = Date.now();
        const isDashing = now - dashTimeRef.current < 200;
        const keys = keysRef.current;
        let speedMultiplier = 1;
        
        if (isDashing) {
          speedMultiplier = 4;
          createParticles(posRef.current.x, posRef.current.y, 'rgba(99, 102, 241, 0.4)', 2, 0.5, 0.5);
        } else if (localPlayer?.isCarryingKey) {
          speedMultiplier = 1.25;
        }

        if (keys['Shift'] && now - dashCooldownRef.current > 3000 && !isDashing) {
          dashTimeRef.current = now;
          dashCooldownRef.current = now;
          socket.emit('player-dash');
          socket.emit('play-sound', { x: posRef.current.x, y: posRef.current.y, type: 'dash' });
        }

        let inputX = 0, inputY = 0;
        if (keys['ArrowUp']) inputY -= 1;
        if (keys['ArrowDown']) inputY += 1;
        if (keys['ArrowLeft']) inputX -= 1;
        if (keys['ArrowRight']) inputX += 1;

        // Mobile Move Joystick Input
        if (isMobile && moveJoystickRef.current.active) {
          inputX = moveJoystickRef.current.x;
          inputY = moveJoystickRef.current.y;
        }

        const ACCEL = 0.8 * dt * speedMultiplier;
        const FRICTION = isDashing ? 0.98 : 0.88;
        if (inputX !== 0) velRef.current.x += inputX * ACCEL;
        if (inputY !== 0) velRef.current.y += inputY * ACCEL;
        velRef.current.x *= FRICTION;
        velRef.current.y *= FRICTION;

        if (isDashing) {
          const dashMag = 12;
          const currentMag = Math.sqrt(velRef.current.x**2 + velRef.current.y**2);
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
        let adx = 0, ady = 0, aimPressed = false;
        if (keys['w'] || keys['W']) { ady -= 1; aimPressed = true; }
        if (keys['s'] || keys['S']) { ady += 1; aimPressed = true; }
        if (keys['a'] || keys['A']) { adx -= 1; aimPressed = true; }
        if (keys['d'] || keys['D']) { adx += 1; aimPressed = true; }

        if (aimPressed) targetAngle = Math.atan2(ady, adx);
        else if (isMobile && aimJoystickRef.current.active) {
          targetAngle = Math.atan2(aimJoystickRef.current.y, aimJoystickRef.current.x);
        }
        else if (inputX !== 0 || inputY !== 0) targetAngle = Math.atan2(inputY, inputX);

        const angleDiff = (targetAngle - aimAngleRef.current + Math.PI * 3) % (Math.PI * 2) - Math.PI;
        aimAngleRef.current += angleDiff * 0.4;

        const r = 14;
        let px = posRef.current.x, py = posRef.current.y;

        let tx = px + dx;
        if (dy !== 0 && dx === 0) tx += ((Math.floor(px / TILE_SIZE) + 0.5) * TILE_SIZE - px) * 0.15;
        let canX = true;
        const currentMaze = gameState?.maze || roomData?.maze || MAZE_MAP;
        const xPts = [{x:tx-r,y:py-r},{x:tx+r,y:py-r},{x:tx-r,y:py+r},{x:tx+r,y:py+r}];
        for(let p of xPts) {
          const tile = currentMaze[Math.floor(p.y/TILE_SIZE)]?.[Math.floor(p.x/TILE_SIZE)];
          if(tile === 1 || tile === 3) { canX=false; break; }
        }
        if(canX) px = tx; else velRef.current.x = 0;

        let ty = py + dy;
        if (dx !== 0 && dy === 0) ty += ((Math.floor(py / TILE_SIZE) + 0.5) * TILE_SIZE - py) * 0.15;
        let canY = true;
        const yPts = [{x:px-r,y:ty-r},{x:px+r,y:ty-r},{x:px-r,y:ty+r},{x:px+r,y:ty+r}];
        for(let p of yPts) {
          const tile = currentMaze[Math.floor(p.y/TILE_SIZE)]?.[Math.floor(p.x/TILE_SIZE)];
          if(tile === 1 || tile === 3) { canY=false; break; }
        }
        if(canY) py = ty; else velRef.current.y = 0;

        const angleChanged = Math.abs(angleDiff) > 0.01;
        if (!isEliminated && (px !== posRef.current.x || py !== posRef.current.y || angleChanged)) {
          posRef.current = { x: px, y: py };
          if (now - lastEmitTimeRef.current > 30) {
            socket.emit('player-move', { x: px, y: py, aimAngle: aimAngleRef.current });
            lastEmitTimeRef.current = now;
          }
        }

        if ((keys[' '] || mobileShootRef.current) && now - shootCooldownRef.current > 500) {
          initAudio();
          socket.emit('player-shoot');
          setMuzzleFlash(now);
          shootCooldownRef.current = now;
        }
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        const { width, height } = dimensions;
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }

        ctx.fillStyle = '#020617'; ctx.fillRect(0, 0, width, height);

        const curX = posRef.current.x, curY = posRef.current.y;
        let targetX = curX, targetY = curY;

        if (activeSpectating && gameState) {
          const targetId = spectateTarget?.id || spectateTargetId;
          const targetPlayer = gameState.players.find((p) => p.id === targetId && p.hp > 0);
          if (targetPlayer) { targetX = targetPlayer.x; targetY = targetPlayer.y; }
          else {
            let closest = null, minDist = Infinity;
            gameState.players.forEach(p => {
              if (p.hp > 0 && p.id !== socket.id) {
                const d = Math.sqrt((posRef.current.x - p.x)**2 + (posRef.current.y - p.y)**2);
                if (d < minDist) { minDist = d; closest = p; }
              }
            });
            if (closest) { targetX = closest.x; targetY = closest.y; }
            else { targetX = MAZE_WIDTH / 2; targetY = MAZE_HEIGHT / 2; }
          }
        }

        const camX = width / 2 - targetX, camY = height / 2 - targetY;
        ctx.save();
        if (Date.now() - screenShake < 200) {
          const intensity = 8 * (1 - (Date.now() - screenShake) / 200);
          ctx.translate(Math.random() * intensity - intensity/2, Math.random() * intensity - intensity/2);
        }
        ctx.translate(camX, camY);

        particlesRef.current.forEach((p, i) => {
          p.x += p.vx; p.y += p.vy; p.life -= 0.02;
          if (p.life <= 0) { particlesRef.current.splice(i, 1); return; }
          ctx.save(); ctx.globalAlpha = p.life / p.maxLife; ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill(); ctx.restore();
        });

        if (gameState && !gameState.key.carrierId) {
          ctx.save(); ctx.strokeStyle = 'rgba(244, 63, 94, 0.4)'; ctx.lineWidth = 15; ctx.beginPath();
          ctx.arc(MAZE_WIDTH / 2, MAZE_HEIGHT / 2, gameState.zoneRadius, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = 'rgba(244, 63, 94, 0.8)'; ctx.lineWidth = 5; ctx.stroke();
          ctx.shadowBlur = 30; ctx.shadowColor = '#f43f5e'; ctx.stroke(); ctx.restore();
        }


        const activeMaze = gameState?.maze || roomData?.maze || MAZE_MAP;
        activeMaze.forEach((row, y) => {
          row.forEach((tile, x) => {
            const tx=x*TILE_SIZE, ty=y*TILE_SIZE;
            if (tile === 1) {
              ctx.fillStyle = '#1e293b'; ctx.fillRect(tx, ty, TILE_SIZE, TILE_SIZE);
              ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 2; ctx.strokeRect(tx+2, ty+2, TILE_SIZE-4, TILE_SIZE-4);
              ctx.shadowBlur = 8; ctx.shadowColor = '#6366f1'; ctx.strokeRect(tx+2, ty+2, TILE_SIZE-4, TILE_SIZE-4);
              ctx.shadowBlur = 0;
            } else if (tile === 3) {
              // Weak Wall
              ctx.fillStyle = '#451a03'; ctx.fillRect(tx, ty, TILE_SIZE, TILE_SIZE);
              ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2; ctx.strokeRect(tx+4, ty+4, TILE_SIZE-8, TILE_SIZE-8);
              // Cracked texture look
              ctx.beginPath(); ctx.strokeStyle = 'rgba(245, 158, 11, 0.3)'; ctx.moveTo(tx+10, ty+10); ctx.lineTo(tx+TILE_SIZE-10, ty+TILE_SIZE-10); ctx.stroke();
            } else if (tile === 2) {
              ctx.fillStyle = 'rgba(16, 185, 129, 0.1)'; ctx.fillRect(tx, ty, TILE_SIZE, TILE_SIZE);
              ctx.strokeStyle = '#10b981'; ctx.strokeRect(tx, ty, TILE_SIZE, TILE_SIZE);
              ctx.fillStyle = '#10b981'; ctx.font='900 12px Outfit'; ctx.textAlign='center';
              ctx.fillText('EXIT', tx+TILE_SIZE/2, ty+TILE_SIZE/2+4);
            }
          });
        });

        if (gameState) {
          localBulletsRef.current.forEach(b => {
            ctx.fillStyle = '#fde047'; ctx.shadowBlur = 10; ctx.shadowColor = '#fde047';
            ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;
          });

          const k = gameState.key;
          if (k && !k.carrierId) {
            const pulse = (Math.sin(Date.now() / 200) + 1) / 2;
            drawKey(ctx, k.x, k.y, pulse);
          }

          gameState.players.forEach(p => {
            if (p.hp <= 0) return;
            ctx.save();
            const isMe = p.id === socket.id, sp = smoothedPlayersRef.current[p.id];
            const px = isMe ? curX : (sp ? sp.x : p.x), py = isMe ? curY : (sp ? sp.y : p.y);
            const pAngle = isMe ? aimAngleRef.current : (p.aimAngle || 0);
            ctx.translate(px, py);

            if (isMe && Date.now() - muzzleFlash < 100) {
              ctx.fillStyle = 'rgba(253, 224, 71, 0.3)'; ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI*2); ctx.fill();
            }

            ctx.save(); ctx.rotate(pAngle); ctx.fillStyle = '#94a3b8'; ctx.fillRect(12, -4, 22, 8); ctx.restore();

            const color = isMe ? '#6366f1' : '#f43f5e';
            const grad = ctx.createRadialGradient(0,0,0,0,0,16);
            grad.addColorStop(0, color); grad.addColorStop(1, '#000');
            ctx.fillStyle = grad;
            if (p.isCarryingKey) { ctx.shadowBlur = 30; ctx.shadowColor = '#fbbf24'; ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 4; }
            else { ctx.strokeStyle='#fff'; ctx.lineWidth=2; }
            ctx.beginPath(); ctx.arc(0,0,16,0,Math.PI*2); ctx.fill(); ctx.stroke(); ctx.shadowBlur=0;

            if (!isMe) {
              const barW = 44, barH = 6;
              ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(-barW/2, -38, barW, barH);
              ctx.fillStyle = p.hp > 30 ? '#10b981' : '#f43f5e'; ctx.fillRect(-barW/2, -38, (p.hp/100)*barW, barH);
              ctx.fillStyle = '#fff'; ctx.font = '900 12px Outfit'; ctx.textAlign = 'center';
              ctx.fillText(p.name.toUpperCase(), 0, -45);
            }
            ctx.restore();
          });
        }
        ctx.restore();

        // Minimap Drawing
        const mCanvas = minimapCanvasRef.current;
        if (mCanvas && gameState) {
          const mCtx = mCanvas.getContext('2d');
          const mSize = 160, mScale = mSize / MAZE_WIDTH;
          mCtx.clearRect(0,0,mSize,mSize);
          
          const currentMaze = gameState.maze || MAZE_MAP;
          currentMaze.forEach((row, y) => {
            row.forEach((tile, x) => {
              if (tile === 1) {
                mCtx.fillStyle = 'rgba(255,255,255,0.15)';
                mCtx.fillRect(x * TILE_SIZE * mScale, y * TILE_SIZE * mScale, TILE_SIZE * mScale, TILE_SIZE * mScale);
              } else if (tile === 3) {
                mCtx.fillStyle = 'rgba(245, 158, 11, 0.4)'; // Weak wall color on minimap
                mCtx.fillRect(x * TILE_SIZE * mScale, y * TILE_SIZE * mScale, TILE_SIZE * mScale, TILE_SIZE * mScale);
              } else if (tile === 2) {
                mCtx.fillStyle = 'rgba(16, 185, 129, 0.3)'; // Exit color on minimap
                mCtx.fillRect(x * TILE_SIZE * mScale, y * TILE_SIZE * mScale, TILE_SIZE * mScale, TILE_SIZE * mScale);
              }
            });
          });
          
          if (!gameState.key.carrierId && gameState.zoneRadius < MAZE_WIDTH) {
            mCtx.strokeStyle = '#f43f5e';
            mCtx.lineWidth = 2;
            mCtx.setLineDash([4, 2]); // Dashed zone on minimap for clarity
            mCtx.beginPath();
            mCtx.arc((MAZE_WIDTH/2)*mScale, (MAZE_HEIGHT/2)*mScale, gameState.zoneRadius*mScale, 0, Math.PI * 2);
            mCtx.stroke();
            mCtx.setLineDash([]); // Reset
            
            // Add a subtle fill to the "danger" area (outside zone)
            mCtx.fillStyle = 'rgba(244, 63, 94, 0.1)';
            mCtx.beginPath();
            mCtx.rect(0, 0, mSize, mSize);
            mCtx.arc((MAZE_WIDTH/2)*mScale, (MAZE_HEIGHT/2)*mScale, gameState.zoneRadius*mScale, 0, Math.PI * 2, true);
            mCtx.fill();
          }
          const kPulse = (Math.sin(Date.now()/200)+1)/2;
          mCtx.fillStyle='#eab308'; mCtx.shadowBlur = 10 * kPulse; mCtx.shadowColor = '#eab308'; mCtx.beginPath(); mCtx.arc(gameState.key.x*mScale, gameState.key.y*mScale, 4, 0, Math.PI * 2); mCtx.fill(); mCtx.shadowBlur = 0;
          gameState.players.forEach(p=>{ if(p.hp>0){ mCtx.fillStyle=p.id===socket.id?'#6366f1':'#f43f5e'; mCtx.beginPath(); mCtx.arc((p.id===socket.id?curX:p.x)*mScale, (p.id===socket.id?curY:p.y)*mScale, 3, 0, Math.PI*2); mCtx.fill(); }});
        }
      }

      loopId = requestAnimationFrame(gameLoop);
    };

    loopId = requestAnimationFrame(gameLoop);

    // player-moved listener removed to prevent packet backlog feedback loop

    socket.on('game-state', (state) => {
      // Check for kills
      if (prevPlayersRef.current) {
        state.players.forEach(p => {
          const prevP = prevPlayersRef.current[p.id];
          if (prevP && prevP.hp > 0 && p.hp <= 0) {
            const killer = state.players.find(kp => kp.id === p.killedBy);
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
      prevPlayersRef.current = state.players.reduce((acc, p) => ({ ...acc, [p.id]: p }), {});

      setGameState(state);
      
      // Authoritative server sync for local player
      const serverMe = state.players.find(p => p.id === socket.id);
      if (serverMe) {
        const dist = Math.sqrt((posRef.current.x - serverMe.x)**2 + (posRef.current.y - serverMe.y)**2);
        const isRecentlyDashed = Date.now() - dashTimeRef.current < 500;
        if (dist > 150 && !isRecentlyDashed) {
          posRef.current = { x: serverMe.x, y: serverMe.y };
        }
      }
      
      const serverBulletIds = new Set(state.bullets.map(b => b.id));
      localBulletsRef.current = localBulletsRef.current.filter(b => serverBulletIds.has(b.id));
      state.bullets.forEach(sb => {
        const lb = localBulletsRef.current.find(b => b.id === sb.id);
        if (lb) {
          const dist = Math.sqrt((lb.x - sb.x)**2 + (lb.y - sb.y)**2);
          if (dist > 30) { lb.x = sb.x; lb.y = sb.y; }
          lb.vx = sb.vx; lb.vy = sb.vy;
        } else {
          localBulletsRef.current.push({ ...sb });
        }
      });
    });
    socket.on('game-over', setGameOver);

    return () => {
      cancelAnimationFrame(loopId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      socket.off('game-state');
      socket.off('game-over');
    };
  }, [gameState, gameOver, muzzleFlash, roomData, spectateTargetId, isSpectating]);

  const isKeyCarrier = gameState?.key.carrierId === socket.id;
  const hasTeamsInSummary = Boolean(gameOver?.stats?.some((s) => s.teamId));

  const handleTouchStart = (e) => {
    if (!isMobile) return;
    initAudio();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const { clientX, clientY } = touch;
      
      // Left half = movement
      if (clientX < dimensions.width / 2) {
        if (!moveJoystickRef.current.active) {
          moveJoystickRef.current = { active: true, x: 0, y: 0, startX: clientX, startY: clientY, curX: clientX, curY: clientY, id: touch.identifier };
          setJoystickUI(prev => ({ ...prev, move: { active: true, x: clientX, y: clientY, curX: clientX, curY: clientY } }));
        }
      } 
      // Right half = Floating Fire & Aiming
      else {
        if (!mobileShootRef.current) {
          mobileShootRef.current = true;
          shootTouchIdRef.current = touch.identifier;
          shootTouchStartRef.current = { x: clientX, y: clientY };
          
          // Re-use aim joystick state for visual feedback
          aimJoystickRef.current = { active: true, x: 0, y: 0, startX: clientX, startY: clientY, curX: clientX, curY: clientY, id: touch.identifier };
          setJoystickUI(prev => ({ ...prev, aim: { active: true, x: clientX, y: clientY, curX: clientX, curY: clientY, isFiring: true } }));

          // Immediate first shot
          const now = Date.now();
          if (now - shootCooldownRef.current > 500) {
            initAudio();
            socket.emit('player-shoot');
            setMuzzleFlash(now);
            shootCooldownRef.current = now;
          }
        }
      }
    }
  };

  const handleTouchMove = (e) => {
    if (!isMobile) return;
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
        const dist = Math.min(50, Math.sqrt(dx * dx + dy * dy));
        const angle = Math.atan2(dy, dx);
        aimJoystickRef.current.x = Math.cos(angle);
        aimJoystickRef.current.y = Math.sin(angle);
        aimJoystickRef.current.curX = aimJoystickRef.current.startX + Math.cos(angle) * dist;
        aimJoystickRef.current.curY = aimJoystickRef.current.startY + Math.sin(angle) * dist;
        setJoystickUI(prev => ({ ...prev, aim: { ...prev.aim, curX: aimJoystickRef.current.curX, curY: aimJoystickRef.current.curY } }));
      }
    }
  };

  const handleTouchEnd = (e) => {
    if (!isMobile) return;
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
    if (Date.now() - dashCooldownRef.current > 3000) {
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
            <button className="mobile-btn dash-btn" onTouchStart={handleMobileDash}>
              <Wind size={24} />
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

          {/* Key Carrier Alert */}
          {gameState?.key.carrierId && (
            <div className="key-carrier-alert">
              <Zap size={18} fill="currentColor" />
              <span>{isKeyCarrier ? 'YOU HAVE THE MASTER KEY' : `${gameState.players.find(p => p.id === gameState.key.carrierId)?.name.toUpperCase()} HAS THE KEY`}</span>
              <Zap size={18} fill="currentColor" />
            </div>
          )}

          {/* Main HUD */}
          {localPlayer && !isEliminated && (
            <div className="hud-container">
              <div className="hud-header">
                <div className="hud-player-info">
                  <span className="hud-player-name">{localPlayer.name.toUpperCase()}</span>
                </div>
                <div className={`hud-dash-indicator ${dashCDRemaining > 0 ? 'cooldown' : ''}`}>
                  <Wind size={14} />
                  <span>{dashCDRemaining > 0 ? `${(dashCDRemaining/1000).toFixed(1)}s` : 'READY'}</span>
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
              </div>
            </div>
          )}
        </div>
      )}

      {/* Elimination Overlay */}
      {isEliminated && !activeSpectating && !gameOver && (
        <div className="elimination-overlay">
          <div className="overlay-content">
            <h1 className="glitch-text">TERMINATED</h1>
            <p style={{color: 'var(--text-dim)', marginBottom: '2rem'}}>
              Killed by: <span style={{color: 'var(--danger)', fontWeight: 800}}>
                {localPlayer.killedBy === 'ZONE' ? 'THE DEADLY ZONE' : (gameState?.players.find(p=>p.id===localPlayer.killedBy)?.name.toUpperCase() || 'UNKNOWN AGENT')}
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
          <span style={{opacity: 0.6, fontSize: '0.8rem'}}>WATCHING</span>
          <span style={{color: 'var(--accent)'}}>{spectateTargetName}</span>
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
                  {gameOver.stats?.sort((a,b) => b.score - a.score).map((s, i) => (
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
    </div>
  );
};

export default Game;


