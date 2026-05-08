import React, { useRef, useEffect, useState } from 'react';
import { socket } from './socket';
import { MAZE_MAP, TILE_SIZE, MAZE_WIDTH, MAZE_HEIGHT } from './constants';

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
  
  // Set position (Normalized to maze units)
  panner.positionX.value = x;
  panner.positionY.value = y;
  panner.positionZ.value = 300; // Elevation

  // Set Listener
  audioCtx.listener.positionX.value = listenerPos.x;
  audioCtx.listener.positionY.value = listenerPos.y;
  audioCtx.listener.positionZ.value = 500;

  const gain = audioCtx.createGain();
  gain.connect(panner);
  panner.connect(audioCtx.destination);

  const now = audioCtx.currentTime;

  if (type === 'shoot') {
    // Noise-based gunshot
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
  
  // Floating animation
  const floatOffset = Math.sin(Date.now() / 300) * 5;
  ctx.translate(0, floatOffset);
  
  ctx.strokeStyle = '#fbbf24';
  ctx.fillStyle = '#fbbf24';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.shadowBlur = 15 + pulse * 10;
  ctx.shadowColor = '#fbbf24';

  // Ring/Head
  ctx.beginPath();
  ctx.arc(0, -12, 7, 0, Math.PI * 2);
  ctx.stroke();

  // Shaft
  ctx.beginPath();
  ctx.moveTo(0, -5);
  ctx.lineTo(0, 12);
  ctx.stroke();

  // Bits
  ctx.fillRect(0, 8, 6, 2.5);
  ctx.fillRect(0, 4, 4, 2.5);
  
  ctx.restore();
};

const Game = ({ roomData, playerName }) => {
  const canvasRef = useRef(null);
  const posRef = useRef({ x: TILE_SIZE * 0.5, y: TILE_SIZE * 0.5 });
  const aimAngleRef = useRef(0);
  const [gameState, setGameState] = useState(null);
  const [gameOver, setGameOver] = useState(null);
  const [isSpectating, setIsSpectating] = useState(false);
  const [muzzleFlash, setMuzzleFlash] = useState(0);
  const [screenShake, setScreenShake] = useState(0);
  const keysRef = useRef({});
  const shootCooldownRef = useRef(0);
  const dashCooldownRef = useRef(0);
  const dashTimeRef = useRef(0);
  const particlesRef = useRef([]);
  const lastEmitTimeRef = useRef(0);
  const velRef = useRef({ x: 0, y: 0 });
  const smoothedPlayersRef = useRef({}); // { id: { x, y, vx, vy } }
  const localBulletsRef = useRef([]);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const createParticles = (x, y, color, count = 10, speed = 2, life = 1) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const s = Math.random() * speed;
      particlesRef.current.push({
        x, y,
        vx: Math.cos(angle) * s,
        vy: Math.sin(angle) * s,
        color,
        life,
        maxLife: life,
        size: Math.random() * 3 + 1
      });
    }
  };

  // Sync initial position
  useEffect(() => {
    initAudio();
    const handleSound = (data) => {
      playSpatial(data.x, data.y, data.type, posRef.current);
      // Trigger particles on sound events
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
      // Apply to smoothed copy for immediate visual feedback
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
      if (me) {
        posRef.current = { x: me.x, y: me.y };
      }
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

      // Update Smoothed Players
      if (gameState) {
        gameState.players.forEach(p => {
          if (p.id === socket.id) return;
          if (!smoothedPlayersRef.current[p.id]) {
            smoothedPlayersRef.current[p.id] = { x: p.x, y: p.y, vx: 0, vy: 0 };
          }
          const sp = smoothedPlayersRef.current[p.id];
          
          // Friction for smoothed velocity
          sp.vx *= 0.88;
          sp.vy *= 0.88;
          
          // Integrate velocity
          sp.x += sp.vx * dt;
          sp.y += sp.vy * dt;
          
          // Lerp towards server position (Soft sync)
          sp.x += (p.x - sp.x) * 0.3;
          sp.y += (p.y - sp.y) * 0.3;
        });
      }

      // Update Local Bullets (Smoothing with Collision)
      localBulletsRef.current.forEach(b => {
        const nextX = b.x + b.vx * dt;
        const nextY = b.y + b.vy * dt;
        const nextTileX = Math.floor(nextX / TILE_SIZE);
        const nextTileY = Math.floor(nextY / TILE_SIZE);
        const isWall = MAZE_MAP[nextTileY]?.[nextTileX] === 1;

        if (isWall) {
          if (b.bounces > 0) {
            const curTileX = Math.floor(b.x / TILE_SIZE);
            const curTileY = Math.floor(b.y / TILE_SIZE);
            let bounced = false;
            if (MAZE_MAP[curTileY]?.[nextTileX] === 1) { b.vx *= -1; bounced = true; }
            if (MAZE_MAP[nextTileY]?.[curTileX] === 1) { b.vy *= -1; bounced = true; }
            if (!bounced) { b.vx *= -1; b.vy *= -1; }
            b.bounces--;
          } else {
            // Mark for removal or just stop moving (server will sync soon)
            b.vx = 0; b.vy = 0;
          }
        } else {
          b.x = nextX;
          b.y = nextY;
        }
      });

      // 1. PHYSICS & INPUT
      if (!gameOver) {
        let step = 5 * dt;
        const now = Date.now();
        const isDashing = now - dashTimeRef.current < 200;
        const keys = keysRef.current;
        
        if (isDashing) {
          step *= 4; 
          createParticles(posRef.current.x, posRef.current.y, 'rgba(99, 102, 241, 0.4)', 2, 0.5, 0.5);
        }
        else {
          const localPlayer = gameState?.players.find(p => p.id === socket.id);
          if (localPlayer?.isCarryingKey) step *= 1.25;
        }

        // Handle Dash Trigger
        if (keys['Shift'] && now - dashCooldownRef.current > 3000 && !isDashing) {
          dashTimeRef.current = now;
          dashCooldownRef.current = now;
          socket.emit('player-dash');
          socket.emit('play-sound', { x: posRef.current.x, y: posRef.current.y, type: 'dash' });
        }

        // 1. Calculate Raw Input Direction
        let inputX = 0;
        let inputY = 0;
        if (keys['ArrowUp']) inputY -= 1;
        if (keys['ArrowDown']) inputY += 1;
        if (keys['ArrowLeft']) inputX -= 1;
        if (keys['ArrowRight']) inputX += 1;

        // Physics Constants
        const ACCEL = 0.8 * dt;
        const FRICTION = isDashing ? 0.98 : 0.88;
        
        if (inputX !== 0) velRef.current.x += inputX * ACCEL;
        if (inputY !== 0) velRef.current.y += inputY * ACCEL;

        // Apply Friction
        velRef.current.x *= FRICTION;
        velRef.current.y *= FRICTION;

        // Handle Dash Momentum
        if (isDashing) {
          const dashMag = 12;
          const currentMag = Math.sqrt(velRef.current.x**2 + velRef.current.y**2);
          if (currentMag < dashMag) {
            const angle = Math.atan2(velRef.current.y || inputY, velRef.current.x || inputX);
            velRef.current.x = Math.cos(angle) * dashMag;
            velRef.current.y = Math.sin(angle) * dashMag;
          }
        }

        let dx = velRef.current.x * dt;
        let dy = velRef.current.y * dt;

        // Drift Particles
        if (Math.abs(velRef.current.x) + Math.abs(velRef.current.y) > 8) {
          if (Math.random() > 0.7) createParticles(posRef.current.x, posRef.current.y, 'rgba(255,255,255,0.2)', 1, 0.5, 0.3);
        }

        // 2. Stable Aim logic (separate from collision-step)
        let targetAngle = aimAngleRef.current;
        let adx = 0, ady = 0, aimPressed = false;
        if (keys['w'] || keys['W']) { ady -= 1; aimPressed = true; }
        if (keys['s'] || keys['S']) { ady += 1; aimPressed = true; }
        if (keys['a'] || keys['A']) { adx -= 1; aimPressed = true; }
        if (keys['d'] || keys['D']) { adx += 1; aimPressed = true; }

        if (aimPressed) {
          targetAngle = Math.atan2(ady, adx);
        } else if (inputX !== 0 || inputY !== 0) {
          // Use input vector (stable) instead of movement vector (colliding)
          targetAngle = Math.atan2(inputY, inputX);
        }

        // 3. Smooth Angle Transition (Prevents glitchy 180-flips)
        const angleDiff = (targetAngle - aimAngleRef.current + Math.PI * 3) % (Math.PI * 2) - Math.PI;
        aimAngleRef.current += angleDiff * 0.4; // 40% of the way each frame (~6 frames to full turn)

        const r = 14;
        let px = posRef.current.x;
        let py = posRef.current.y;

        // X Collision & Sliding
        let tx = px + dx;
        if (dy !== 0 && dx === 0) tx += ((Math.floor(px / TILE_SIZE) + 0.5) * TILE_SIZE - px) * 0.15;
        let canX = true;
        const xPts = [{x:tx-r,y:py-r},{x:tx+r,y:py-r},{x:tx-r,y:py+r},{x:tx+r,y:py+r}];
        for(let p of xPts) if(MAZE_MAP[Math.floor(p.y/TILE_SIZE)]?.[Math.floor(p.x/TILE_SIZE)]===1){canX=false;break;}
        if(canX) px = tx;
        else velRef.current.x = 0; // Fix sticking

        // Y Collision & Sliding
        let ty = py + dy;
        if (dx !== 0 && dy === 0) ty += ((Math.floor(py / TILE_SIZE) + 0.5) * TILE_SIZE - py) * 0.15;
        let canY = true;
        const yPts = [{x:px-r,y:ty-r},{x:px+r,y:ty-r},{x:px-r,y:ty+r},{x:px+r,y:ty+r}];
        for(let p of yPts) if(MAZE_MAP[Math.floor(p.y/TILE_SIZE)]?.[Math.floor(p.x/TILE_SIZE)]===1){canY=false;break;}
        if(canY) py = ty;
        else velRef.current.y = 0; // Fix sticking

        const angleChanged = Math.abs(angleDiff) > 0.01;
        if (px !== posRef.current.x || py !== posRef.current.y || angleChanged) {
          posRef.current = { x: px, y: py };
          
          // Throttle socket emissions to ~30Hz
          if (now - lastEmitTimeRef.current > 30) {
            socket.emit('player-move', { x: px, y: py, aimAngle: aimAngleRef.current });
            lastEmitTimeRef.current = now;
          }
        }

        if (keys[' '] && now - shootCooldownRef.current > 500) {
          initAudio();
          socket.emit('player-shoot');
          setMuzzleFlash(now);
          shootCooldownRef.current = now;
        }
      }

      // 2. RENDERING (Directly use posRef)
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        const { width, height } = dimensions;
        
        // Sync canvas size if needed (handled by state but double check)
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }

        ctx.fillStyle = '#020617';
        ctx.fillRect(0, 0, width, height);

        const curX = posRef.current.x;
        const curY = posRef.current.y;
        
        let targetX = curX;
        let targetY = curY;

        // Spectate Logic: Follow the killer chain
        if (isSpectating && gameState) {
          const lp = gameState.players.find(p => p.id === socket.id);
          let spectateId = lp?.killedBy;
          
          // Follow the chain: if my killer is dead, watch who killed them
          let targetPlayer = gameState.players.find(p => p.id === spectateId);
          while (targetPlayer && targetPlayer.hp <= 0 && targetPlayer.killedBy && targetPlayer.killedBy !== 'ZONE') {
            targetPlayer = gameState.players.find(p => p.id === targetPlayer.killedBy);
          }

          if (targetPlayer && targetPlayer.hp > 0) {
            targetX = targetPlayer.x;
            targetY = targetPlayer.y;
          } else {
            // Find closest living player to death location
            let closest = null;
            let minDist = Infinity;
            gameState.players.forEach(p => {
              if (p.hp > 0 && p.id !== socket.id) {
                const d = Math.sqrt((posRef.current.x - p.x)**2 + (posRef.current.y - p.y)**2);
                if (d < minDist) {
                  minDist = d;
                  closest = p;
                }
              }
            });

            if (closest) {
              targetX = closest.x;
              targetY = closest.y;
            } else {
              targetX = MAZE_WIDTH / 2;
              targetY = MAZE_HEIGHT / 2;
            }
          }
        }

        const camX = width / 2 - targetX;
        const camY = height / 2 - targetY;

        ctx.save();
        
        // Screen Shake
        if (Date.now() - screenShake < 200) {
          const intensity = 8 * (1 - (Date.now() - screenShake) / 200);
          ctx.translate(Math.random() * intensity - intensity/2, Math.random() * intensity - intensity/2);
        }

        ctx.translate(camX, camY);

        // --- PARTICLES ---
        particlesRef.current.forEach((p, i) => {
          p.x += p.vx;
          p.y += p.vy;
          p.life -= 0.02;
          if (p.life <= 0) {
            particlesRef.current.splice(i, 1);
            return;
          }
          ctx.save();
          ctx.globalAlpha = p.life / p.maxLife;
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
          ctx.restore();
        });

        // Safe Zone Boundary
        if (gameState && !gameState.key.carrierId) {
          ctx.save();
          ctx.strokeStyle = 'rgba(244, 63, 94, 0.4)';
          ctx.lineWidth = 15;
          ctx.beginPath();
          ctx.arc(MAZE_WIDTH / 2, MAZE_HEIGHT / 2, gameState.zoneRadius, 0, Math.PI * 2);
          ctx.stroke();
          
          ctx.strokeStyle = 'rgba(244, 63, 94, 0.8)';
          ctx.lineWidth = 5;
          ctx.stroke();
          
          ctx.shadowBlur = 30;
          ctx.shadowColor = '#f43f5e';
          ctx.stroke();
          ctx.restore();
        }

        // Grid
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.05)'; ctx.lineWidth = 1;
        for (let x=0; x<MAZE_WIDTH; x+=100) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,MAZE_HEIGHT); ctx.stroke(); }
        for (let y=0; y<MAZE_HEIGHT; y+=100) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(MAZE_WIDTH,y); ctx.stroke(); }

        // Maze
        MAZE_MAP.forEach((row, y) => {
          row.forEach((tile, x) => {
            if (tile === 1) {
              const tx=x*TILE_SIZE, ty=y*TILE_SIZE;
              ctx.fillStyle = '#1e293b'; ctx.fillRect(tx, ty, TILE_SIZE, TILE_SIZE);
              ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 2;
              ctx.strokeRect(tx+2, ty+2, TILE_SIZE-4, TILE_SIZE-4);
              ctx.shadowBlur = 8; ctx.shadowColor = '#6366f1';
              ctx.strokeRect(tx+2, ty+2, TILE_SIZE-4, TILE_SIZE-4);
              ctx.shadowBlur = 0;
            } else if (tile === 2) {
              ctx.fillStyle = 'rgba(16, 185, 129, 0.1)'; ctx.fillRect(x*TILE_SIZE, y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
              ctx.strokeStyle = '#10b981'; ctx.strokeRect(x*TILE_SIZE, y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
              ctx.fillStyle = '#10b981'; ctx.font='900 12px Outfit'; ctx.textAlign='center';
              ctx.fillText('EXIT', x*TILE_SIZE+TILE_SIZE/2, y*TILE_SIZE+TILE_SIZE/2+4);
            }
          });
        });

        if (gameState) {
          // Render Smoothed Bullets
          localBulletsRef.current.forEach(b => {
            ctx.fillStyle = '#fde047'; ctx.shadowBlur = 10; ctx.shadowColor = '#fde047';
            ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;
          });

          const k = gameState.key;
          if (k && !k.carrierId) {
            const pulse = (Math.sin(Date.now() / 200) + 1) / 2;
            drawKey(ctx, k.x, k.y, pulse);
            ctx.fillStyle = '#fff'; ctx.font='900 12px Outfit'; ctx.textAlign='center';
            ctx.fillText('MASTER KEY', k.x, k.y-35);
          }

          gameState.players.forEach(p => {
            if (p.hp <= 0) return;
            ctx.save();
            const isMe = p.id === socket.id;
            const sp = smoothedPlayersRef.current[p.id];
            const px = isMe ? curX : (sp ? sp.x : p.x);
            const py = isMe ? curY : (sp ? sp.y : p.y);
            const pAngle = isMe ? aimAngleRef.current : (p.aimAngle || 0);
            ctx.translate(px, py);

            if (isMe && Date.now() - muzzleFlash < 100) {
              ctx.fillStyle = 'rgba(253, 224, 71, 0.3)';
              ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI*2); ctx.fill();
            }

            ctx.save(); ctx.rotate(pAngle); ctx.fillStyle = '#94a3b8'; ctx.fillRect(12, -4, 22, 8); ctx.restore();

            const color = isMe ? '#6366f1' : '#f43f5e';
            const grad = ctx.createRadialGradient(0,0,0,0,0,16);
            grad.addColorStop(0, color); grad.addColorStop(1, '#000');
            ctx.fillStyle = grad;
            if (p.isCarryingKey) { 
              ctx.shadowBlur = 30; 
              ctx.shadowColor = '#fbbf24'; 
              ctx.strokeStyle = '#fbbf24';
              ctx.lineWidth = 4;
            } else {
              ctx.strokeStyle='#fff'; 
              ctx.lineWidth=2; 
            }
            ctx.beginPath(); ctx.arc(0,0,16,0,Math.PI*2); ctx.fill();
            ctx.stroke(); ctx.shadowBlur=0;

            // Only draw overhead UI for other players
            if (!isMe) {
              const barW = 44, barH = 6;
              ctx.fillStyle = 'rgba(0,0,0,0.5)'; 
              ctx.fillRect(-barW/2, -38, barW, barH);
              
              ctx.fillStyle = p.hp > 30 ? '#10b981' : '#f43f5e';
              ctx.fillRect(-barW/2, -38, (p.hp/100)*barW, barH);

              ctx.fillStyle = '#fff'; 
              ctx.font = '900 12px Outfit'; 
              ctx.textAlign = 'center';
              ctx.fillText(p.name.toUpperCase(), 0, -45);
            }
            ctx.restore();
          });
        }
        ctx.restore();

        // UI
        const drawPanel = (x, y, w, h) => {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.8)'; ctx.beginPath(); ctx.roundRect(x,y,w,h,16); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.stroke();
        };

        // 1. Minimap
        const mSize=160, mScale=mSize/MAZE_WIDTH;
        ctx.save(); ctx.translate(24,24); drawPanel(0,0,mSize,mSize);
        MAZE_MAP.forEach((row,y)=>{ row.forEach((tile,x)=>{ if(tile===1){ ctx.fillStyle='rgba(255,255,255,0.05)'; ctx.fillRect(x*TILE_SIZE*mScale, y*TILE_SIZE*mScale, TILE_SIZE*mScale, TILE_SIZE*mScale); } }); });
        if(gameState){
          if (!gameState.key.carrierId) {
            ctx.strokeStyle='rgba(244,63,94,0.5)'; ctx.beginPath(); ctx.arc((MAZE_WIDTH/2)*mScale,(MAZE_HEIGHT/2)*mScale,gameState.zoneRadius*mScale,0,Math.PI*2); ctx.stroke();
          }
          ctx.fillStyle='#eab308'; ctx.beginPath(); ctx.arc(gameState.key.x*mScale, gameState.key.y*mScale, 4, 0, Math.PI * 2); ctx.fill();
          gameState.players.forEach(p=>{ if(p.hp>0){ ctx.fillStyle=p.id===socket.id?'#6366f1':'#f43f5e'; ctx.beginPath(); ctx.arc((p.id===socket.id?curX:p.x)*mScale, (p.id===socket.id?curY:p.y)*mScale, 3, 0, Math.PI*2); ctx.fill(); }});
        }
        ctx.restore();

        // 2. Key Indicator & Warnings (Only for active players)
        if (gameState && gameState.key.carrierId && !isSpectating) {
          const carrier = gameState.players.find(p => p.id === gameState.key.carrierId);
          const isMe = gameState.key.carrierId === socket.id;

          if (carrier && !isMe) {
            // Draw Compass Arrow
            const dx = carrier.x - curX;
            const dy = carrier.y - curY;
            const angle = Math.atan2(dy, dx);
            const dist = Math.sqrt(dx*dx + dy*dy);

            // Only show arrow if carrier is off-screen (approx)
            if (dist > 400) {
              ctx.save();
              ctx.translate(width / 2, height / 2);
              ctx.rotate(angle);
              
              // Arrow Style
              ctx.beginPath();
              ctx.moveTo(100, -15);
              ctx.lineTo(130, 0);
              ctx.lineTo(100, 15);
              ctx.closePath();
              
              ctx.fillStyle = '#fbbf24';
              ctx.shadowBlur = 15;
              ctx.shadowColor = '#fbbf24';
              ctx.fill();
              
              ctx.fillStyle = '#fff';
              ctx.font = '900 12px Outfit';
              ctx.textAlign = 'center';
              ctx.rotate(-angle); // Keep text horizontal
              const labelX = Math.cos(angle) * 150;
              const labelY = Math.sin(angle) * 150;
              ctx.fillText(`${Math.round(dist/TILE_SIZE)}M`, labelX, labelY);
              ctx.restore();
            }

            // Health Drain Warning
            ctx.save();
            ctx.translate(width / 2, 100);
            ctx.fillStyle = 'rgba(244, 63, 94, 0.2)';
            ctx.beginPath(); ctx.roundRect(-150, -30, 300, 60, 10); ctx.fill();
            ctx.strokeStyle = '#f43f5e'; ctx.lineWidth = 2; ctx.stroke();
            
            ctx.fillStyle = '#f43f5e';
            ctx.font = '900 20px Outfit';
            ctx.textAlign = 'center';
            ctx.fillText('HEALTH DRAINING!', 0, -5);
            ctx.font = '700 12px Outfit';
            ctx.fillStyle = '#fff';
            ctx.fillText(`ELIMINATE ${carrier.name.toUpperCase()} TO STOP`, 0, 15);
            ctx.restore();
          } else if (isMe) {
            // "You have the treasure" message
            ctx.save();
            ctx.translate(width / 2, 100);
            ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
            ctx.beginPath(); ctx.roundRect(-150, -30, 300, 60, 10); ctx.fill();
            ctx.strokeStyle = '#10b981'; ctx.lineWidth = 2; ctx.stroke();
            
            ctx.fillStyle = '#10b981';
            ctx.font = '900 20px Outfit';
            ctx.textAlign = 'center';
            ctx.fillText('YOU HAVE MASTER KEY', 0, -5);
            ctx.font = '700 12px Outfit';
            ctx.fillStyle = '#fff';
            ctx.fillText('ESCAPE TO THE CORNERS TO WIN!', 0, 15);
            ctx.restore();
          }
        }

        if(gameState && !isSpectating){
          const lp = gameState.players.find(p=>p.id===socket.id);
          if(lp){
            const hW=280, hH=100; ctx.save(); ctx.translate(24, height-hH-24); drawPanel(0,0,hW,hH);
            ctx.fillStyle='#fff'; ctx.font='900 14px Outfit'; ctx.fillText(`ROOM: ${roomData.id}`, 20, 30);
            ctx.fillStyle='rgba(255,255,255,0.05)'; ctx.fillRect(20,45,hW-40,10);
            ctx.fillStyle=lp.hp>30?'#10b981':'#f43f5e'; ctx.fillRect(20,45,(lp.hp/100)*(hW-40),10);
            ctx.fillStyle='#94a3b8'; ctx.font='700 12px Outfit'; ctx.fillText(`KILLS: ${lp.score}`, 20, 80); ctx.fillText(`RANGE: ${lp.range} TILE`, 120, 80); ctx.fillText(`HP: ${Math.ceil(lp.hp)}`, 220, 80);
            
            // Dash Cooldown in HUD
            const dashCD = Math.max(0, 3000 - (Date.now() - dashCooldownRef.current));
            if (dashCD > 0) {
              ctx.fillStyle = 'rgba(99, 102, 241, 0.2)';
              ctx.fillRect(20, 90, hW - 40, 4);
              ctx.fillStyle = '#6366f1';
              ctx.fillRect(20, 90, (1 - dashCD / 3000) * (hW - 40), 4);
            }
            ctx.restore();
          }
        }




        if(gameOver){
          ctx.fillStyle='rgba(2,6,23,0.9)'; ctx.fillRect(0,0,width,height);
          ctx.fillStyle='#fff'; ctx.font='900 64px Outfit'; ctx.textAlign='center';
          ctx.fillText('MATCH TERMINATED', width/2, height/2-20);
          ctx.font='700 32px Outfit'; ctx.fillStyle='#10b981'; ctx.fillText(`WINNER: ${gameOver.winner.toUpperCase()}`, width/2, height/2+40);
          ctx.font='400 18px Outfit'; ctx.fillStyle='#94a3b8'; ctx.fillText('REFRESH TO RE-INITIALIZE', width/2, height/2+100);
        }
      }

      loopId = requestAnimationFrame(gameLoop);
    };

    loopId = requestAnimationFrame(gameLoop);

    socket.on('player-moved', ({ id, x, y }) => {
      if (id === socket.id) {
        const dist = Math.sqrt((posRef.current.x - x)**2 + (posRef.current.y - y)**2);
        if (dist > 50) posRef.current = { x, y };
      }
    });

    socket.on('game-state', (state) => {
      setGameState(state);
      
      // Sync local bullets with server state
      const serverBulletIds = new Set(state.bullets.map(b => b.id));
      
      // Remove dead bullets
      localBulletsRef.current = localBulletsRef.current.filter(b => serverBulletIds.has(b.id));
      
      // Update/Add bullets
      state.bullets.forEach(sb => {
        const lb = localBulletsRef.current.find(b => b.id === sb.id);
        if (lb) {
          // Snap to server if too far, otherwise keep local for smoothness
          const dist = Math.sqrt((lb.x - sb.x)**2 + (lb.y - sb.y)**2);
          if (dist > 30) {
            lb.x = sb.x;
            lb.y = sb.y;
          }
          lb.vx = sb.vx;
          lb.vy = sb.vy;
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
      socket.off('player-moved');
      socket.off('game-state');
      socket.off('game-over');
    };
  }, [gameState, gameOver, muzzleFlash]);

  const localPlayer = gameState?.players.find(p => p.id === socket.id);
  const isEliminated = localPlayer && localPlayer.hp <= 0;

  return (
    <div className="game-wrapper">
      <canvas ref={canvasRef} width={window.innerWidth} height={window.innerHeight} style={{ display: 'block' }} />
      
      {/* Elimination Overlay */}
      {isEliminated && !isSpectating && !gameOver && (
        <div className="elimination-overlay">
          <div className="overlay-content">
            <h1 className="glitch-text">YOU GOT ELIMINATED</h1>
            <p>Killed by: {localPlayer.killedBy === 'ZONE' ? 'THE ZONE' : (gameState?.players.find(p=>p.id===localPlayer.killedBy)?.name || 'Unknown Agent')}</p>
            <div className="overlay-buttons">
              <button onClick={() => setIsSpectating(true)}>SPECTATE KILLER</button>
              <button onClick={() => window.location.reload()}>EXIT TO MENU</button>
            </div>
          </div>
        </div>
      )}

      {/* Spectate Label */}
      {isSpectating && !gameOver && (
        <div className="spectate-label">
          SPECTATING: {
            (() => {
              let sId = localPlayer?.killedBy;
              let target = gameState?.players.find(p => p.id === sId);
              while (target && target.hp <= 0 && target.killedBy && target.killedBy !== 'ZONE') {
                target = gameState?.players.find(p => p.id === target.killedBy);
              }
              return target ? target.name.toUpperCase() : 'MAP OVERVIEW';
            })()
          }
          <button className="spectate-exit-btn" onClick={() => window.location.reload()}>EXIT</button>
        </div>
      )}

      {/* Game Over Overlay */}
      {gameOver && (
        <div className="elimination-overlay game-over">
          <div className="overlay-content summary-box">
            <h1 className="winner-text">MISSION ACCOMPLISHED</h1>
            <p className="winner-name">WINNER: {gameOver.winner.toUpperCase()}</p>
            
            <div className="match-stats">
              <table>
                <thead>
                  <tr>
                    <th>AGENT</th>
                    <th>KILLS</th>
                    <th>HOLD TIME</th>
                  </tr>
                </thead>
                <tbody>
                  {gameOver.stats?.sort((a,b) => b.score - a.score).map((s, i) => (
                    <tr key={i} className={s.isWinner ? 'winner-row' : ''}>
                      <td>{s.name.toUpperCase()} {s.isWinner ? '🏆' : ''}</td>
                      <td>{s.score}</td>
                      <td>{s.holdTime}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="overlay-buttons">
              <button onClick={() => window.location.reload()}>REDEPLOY</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Game;
