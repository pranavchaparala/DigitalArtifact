// ═══════════════════════════════════════════════════════════
// PRANAV.EXE — Head Sticker Experience
// Flat stickers placed on surface — like real physical stickers
// ═══════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────
  // DOM
  // ─────────────────────────────────────────────────────────
  const canvas = document.getElementById('canvas');
  const loadingEl = document.getElementById('loading');
  const loadingText = document.getElementById('loading-text');
  const stickerCount = document.getElementById('sticker-count');
  const dragGhost = document.getElementById('drag-ghost');
  const ghostImg = document.getElementById('ghost-img');
  const dropHint = document.getElementById('drop-hint');
  const tooltip = document.getElementById('tooltip');
  const cursorRing = document.getElementById('cursor-ring');

  // ─────────────────────────────────────────────────────────
  // Renderer
  // ─────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0; // Reduced from 1.5 to darken overall scene

  // ─────────────────────────────────────────────────────────
  // Scene
  // ─────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8E8C8A);

  // Background wall — invisible, only catches shadow
  const wallMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.ShadowMaterial({ opacity: 0.12 }) // Slightly increased for better grounding
  );
  wallMesh.position.z = -6; // Brought a little closer
  wallMesh.rotation.x = -0.15;
  wallMesh.receiveShadow = true;
  scene.add(wallMesh);

  // ─────────────────────────────────────────────────────────
  // Camera
  // ─────────────────────────────────────────────────────────
  const camera = new THREE.PerspectiveCamera(
    36, window.innerWidth / window.innerHeight, 0.01, 100
  );
  camera.position.set(0, 0, 20.5);
  camera.lookAt(0, 0, 0);

  // Fixed camera position
  camera.position.set(0, 0, 20.5);
  camera.lookAt(0, 0, 0);

  // Manual zoom via scroll wheel
  window.addEventListener('wheel', e => {
    // Only zoom if not dragging a sticker
    if (activeDragKey) return;

    // Smooth zoom adjustment
    const zoomAmount = e.deltaY * 0.02;
    camera.position.z += zoomAmount;

    // Strict Zoom Limits
    const minZ = 12;
    const maxZ = 38;
    camera.position.z = Math.max(minZ, Math.min(maxZ, camera.position.z));

    // Prevent page scroll
    if (e.cancelable) e.preventDefault();
  }, { passive: false });

  // Main Light
  scene.add(new THREE.AmbientLight(0xE4E4E4, 0.35));

  // Main Light — from upper-left, strong (matching ref image)
  const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.1);
  dirLight1.position.set(-15, 20, 15);
  dirLight1.castShadow = true;
  dirLight1.shadow.mapSize.width = 1024;
  dirLight1.shadow.mapSize.height = 1024;
  dirLight1.shadow.camera.near = 0.5;
  dirLight1.shadow.camera.far = 100;
  dirLight1.shadow.camera.left = -20;
  dirLight1.shadow.camera.right = 20;
  dirLight1.shadow.camera.top = 20;
  dirLight1.shadow.camera.bottom = -20;
  dirLight1.shadow.radius = 48; // Significantly blurred for soft contact look
  scene.add(dirLight1);

  // Fill Light — from right, very subtle
  const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.15);
  dirLight2.position.set(20, 5, 10);
  scene.add(dirLight2);

  // Background-only gradient — strong top-left (matching ref image)
  const bgSpot = new THREE.SpotLight(0xffffff, 35, 100, Math.PI / 4, 0.8, 0.4);
  bgSpot.position.set(-15, 15, -2);
  bgSpot.target.position.set(5, -5, -6);
  bgSpot.layers.set(1);
  scene.add(bgSpot);
  scene.add(bgSpot.target);

  // Background-only fill — very subtle across wall
  const bgSpotRight = new THREE.SpotLight(0xffffff, 5, 150, Math.PI / 2, 1, 1);
  bgSpotRight.position.set(10, 5, 0);
  bgSpotRight.target.position.set(0, 0, -6);
  bgSpotRight.layers.set(1);
  scene.add(bgSpotRight);
  scene.add(bgSpotRight.target);

  // Combine/Reposition for a strong white gradient from top-left
  const bgSpotTopLeft = new THREE.SpotLight(0xffffff, 85, 150, Math.PI / 3, 0.8, 0.4);
  bgSpotTopLeft.position.set(-20, 18, -2);
  bgSpotTopLeft.target.position.set(5, -5, -6);
  bgSpotTopLeft.layers.set(1);
  scene.add(bgSpotTopLeft);
  scene.add(bgSpotTopLeft.target);

  // NEW: Shadow Plane — invisible but receives a SINGLE soft shadow from dirLight1
  const shadowPlaneGeo = new THREE.PlaneGeometry(50, 50);
  const shadowPlaneMat = new THREE.ShadowMaterial({ opacity: 0.12 });
  const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = -2.8; // Closer to the head
  shadowPlane.receiveShadow = true;
  scene.add(shadowPlane);

  // Holographic Point Light — localized hover shimmer
  const holoLight = new THREE.PointLight(0x00ffff, 0, 2);
  scene.add(holoLight);

  // ─────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────
  // State
  let modelAutoRotate = true;
  let modelRotateSpeed = 0.002;
  const ROTATE_SPEED_NORMAL = 0.002;
  const ROTATE_SPEED_SLOW = 0.0012;

  // Suggestions logic
  const suggestions = [
    "CHOOSE AN INSIGHT TO BEGIN",
    "CLICK ON STICKERS TO GET MORE INSIGHTS",
    "SCROLL TO ZOOM",
    "DRAG TO ROTATE"
  ];
  let currentSugIdx = 0;
  let suggestionTimer = 0;
  const tooltipContainer = document.getElementById('drop-hint');

  // Audio — background ambient
  const bgAudio = new Audio('Music_fx_generative_ambient_texture_no_melod.wav');
  bgAudio.loop = true;
  bgAudio.volume = 0.08;

  // Web Audio Context for procedural "tap" sound
  let audioContext = null;
  function initAudio() {
    if (audioContext) {
      if (audioContext.state === 'suspended') audioContext.resume();
      return;
    }
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    bgAudio.play().catch(() => { });
  }

  function playTapSound(isDrop = false) {
    if (!audioContext || audioContext.state === 'suspended') return;
    const now = audioContext.currentTime;

    // Impact: Low-freq sine for the "stone" thud
    const osc = audioContext.createOscillator();
    const oscGain = audioContext.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isDrop ? 180 : 240, now);
    osc.frequency.exponentialRampToValueAtTime(isDrop ? 90 : 120, now + 0.1);
    oscGain.gain.setValueAtTime(isDrop ? 0.08 : 0.04, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(oscGain);
    oscGain.connect(audioContext.destination);

    // Friction: Filtered noise for the "adhesive/paper" press
    const bufferSize = audioContext.sampleRate * 0.1;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = audioContext.createBufferSource();
    noise.buffer = buffer;
    const noiseFilter = audioContext.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(800, now);

    const noiseGain = audioContext.createGain();
    noiseGain.gain.setValueAtTime(isDrop ? 0.06 : 0.03, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(audioContext.destination);

    osc.start(now);
    osc.stop(now + 0.1);
    noise.start(now);
    noise.stop(now + 0.1);
  }
  let headMeshes = [];
  let headGroup = null;
  let placedStickers = [];   // { mesh, key, label }
  let activeDragKey = null;
  let autoRotTimer = null;
  let hoveredSticker = null; // Track current holographic hover

  // Manual model rotation state
  let isRotatingModel = false;
  let prevMousePos = { x: 0, y: 0 };
  let resetAnimActive = false;

  // Global scale for stickers - increase this for uniform scaling
  const STICKER_SCALE = 2;

  const raycaster = new THREE.Raycaster();
  const ndcMouse = new THREE.Vector2();

  // Texture cache
  const texCache = {};
  const texLoader = new THREE.TextureLoader();

  function getTex(key) {
    if (texCache[key]) return texCache[key];
    const d = STICKER_DATA[key];
    if (!d) return null;
    const t = texLoader.load(d.src);
    t.encoding = THREE.sRGBEncoding;
    t.premultiplyAlpha = false;
    texCache[key] = t;
    return t;
  }
  // ─────────────────────────────────────────────────────────
  // Sticker Effects
  // ─────────────────────────────────────────────────────────
  function applyHolographic(mesh, hitPoint) {
    if (!mesh || !mesh.material) return;
    holoLight.position.copy(hitPoint);
    holoLight.intensity = 3.5;
    
    // Cycle color for holographic feel
    const time = performance.now() * 0.002;
    holoLight.color.setHSL((time % 1), 0.7, 0.6);
  }
  function resetHolographic() {
    holoLight.intensity = 0;
  }

  function showPopup(sticker) {
    const overlay = document.getElementById('sticker-popup-overlay');
    const img = document.getElementById('popup-img');
    const desc = document.getElementById('popup-desc');
    if (!overlay || !img || !desc) return;
    
    img.src = STICKER_DATA[sticker.key].src;
    desc.textContent = sticker.description;
    overlay.classList.add('visible');
    playTapSound(true);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('sticker-popup-overlay');
    if (overlay) {
      overlay.addEventListener('click', () => {
        overlay.classList.remove('visible');
      });
    }
  });


  // ─────────────────────────────────────────────────────────
  // Load GLB
  // ─────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────
  // 1. Setup the Concrete Material (Rough, Matte Gray)
  const marbleMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xe0e0e0,            // Lighter plaster/marble
    roughness: 0.9,             // Slightly more reflective than concrete
    metalness: 0.0,
    reflectivity: 0.2,
    clearcoat: 0.0,
    flatShading: false
  });

  // ─────────────────────────────────────────────────────────
  // 2. The GLB Loader
  // ─────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────
  // 3. The GLB Loader
  // ─────────────────────────────────────────────────────────
  const gltfLoader = new THREE.GLTFLoader();

  gltfLoader.load(
    'models/head_pranav.glb',
    (gltf) => {
      const model = gltf.scene;
      headGroup = model;

      // Scale & Center
      const bbox = new THREE.Box3().setFromObject(model);
      const bsz = new THREE.Vector3();
      bbox.getSize(bsz);
      const scale = 4.4 / Math.max(bsz.x, bsz.y, bsz.z);
      model.scale.setScalar(scale);
      bbox.setFromObject(model);
      const center = new THREE.Vector3();
      bbox.getCenter(center);
      model.position.sub(center);
      model.position.z += 6.5;

      // Set default orientation: 90 degrees clockwise (-PI/2)
      model.rotation.y = -Math.PI / 2;

      model.traverse(child => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
        child.material = marbleMaterial;
        headMeshes.push(child);
      });

      scene.add(model);

      // Preload thumbnails
      Object.keys(STICKER_DATA).forEach(k => getTex(k));
      Object.entries(STICKER_DATA).forEach(([k, d]) => {
        const el = document.getElementById(`thumb-${k}`);
        if (el) el.style.backgroundImage = `url("${d.src}")`;
      });

      loadingEl.classList.add('hidden');
      setTimeout(() => { loadingEl.style.display = 'none'; }, 700);
    },
    xhr => {
      if (xhr.total) loadingText.textContent = `Loading… ${Math.round(xhr.loaded / xhr.total * 100)}%`;
    },
    err => {
      console.error('GLTF error:', err);
      loadingText.textContent = 'Model Load Error';
    }
  );

  // ─────────────────────────────────────────────────────────
  // Raycast helpers
  // ─────────────────────────────────────────────────────────
  function setNDC(cx, cy) {
    ndcMouse.x = (cx / window.innerWidth) * 2 - 1;
    ndcMouse.y = -(cy / window.innerHeight) * 2 + 1;
  }

  function castHead() {
    if (!headMeshes.length) return null;
    raycaster.setFromCamera(ndcMouse, camera);
    const hits = raycaster.intersectObjects(headMeshes, false);
    return hits.length ? hits[0] : null;
  }

  function worldToScreen(pt) {
    const v = pt.clone().project(camera);
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Place sticker — flat plane oriented to surface normal
  //
  // Key insight from the reference image:
  //   Stickers are FLAT. They don't wrap the surface.
  //   They sit ON the surface, oriented so they're
  //   tangent to it at the hit point.
  //   polygonOffset keeps them from z-fighting.
  //   depthTest:true means they hide correctly behind the head.
  // ─────────────────────────────────────────────────────────
  function placeSticker(key, hitPoint, faceNormal, hitObject) {
    const data = STICKER_DATA[key];
    if (!data) return;
    window.lastPlacementTime = performance.now();

    const tex = getTex(key);

    // Transform face normal to world space
    const worldNormal = faceNormal.clone()
      .transformDirection(hitObject.matrixWorld)
      .normalize();

    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), worldNormal);

    // Random roll around the normal axis
    const roll = new THREE.Quaternion().setFromAxisAngle(
      worldNormal,
      (Math.random() - 0.5) * Math.PI * 0.5
    );
    q.premultiply(roll);

    const orientation = new THREE.Euler().setFromQuaternion(q);

    // Random size modified by uniform STICKER_SCALE constant
    playTapSound(true); // Play feedback sound immediately on drop
    const s = (0.42 + Math.random() * 0.26) * STICKER_SCALE;

    // Use DecalGeometry to wrap around the mesh surface
    // Depth (s * 0.6) for reliable projection
    const geo = new THREE.DecalGeometry(
      hitObject,
      hitPoint,
      orientation,
      new THREE.Vector3(s, s, s * 0.6)
    );

    // Transform decal geometry from world space into headGroup local space
    // so it conforms to the surface AND rotates with the model
    const inverseMatrix = new THREE.Matrix4();
    inverseMatrix.copy(headGroup.matrixWorld).invert();
    geo.applyMatrix4(inverseMatrix);

    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.04,
      depthWrite: false,
      depthTest: true,
      side: THREE.FrontSide,
      roughness: 0.45, // More receptive to light for holo shimmer
      metalness: 0.2,
      polygonOffset: true,
      polygonOffsetFactor: -4.5, // Slightly lifted for "depth"
      polygonOffsetUnits: -4.5,
    });

    const mesh = new THREE.Mesh(geo, mat);

    // Start at scale 0 for animation
    mesh.scale.setScalar(0.001);
    mesh.renderOrder = 1;

    headGroup.add(mesh);
    placedStickers.push({ 
      mesh, 
      key, 
      label: data.label, 
      description: data.description || "" 
    });
    updateCount();

    // Show insight summary in bottom-right on placement
    const insightTooltip = document.getElementById('insight-tooltip');
    const insightImg = document.getElementById('insight-img');
    const insightText = document.getElementById('insight-text');
    
    if (insightTooltip && insightImg && insightText && data.description) {
      insightImg.src = data.src;
      insightText.textContent = data.description;
      insightTooltip.style.opacity = '1';
      
      // Auto-hide after 5 seconds
      clearTimeout(window.insightTimer);
      window.insightTimer = setTimeout(() => {
        insightTooltip.style.opacity = '0';
      }, 5000);
    }

    // Elastic pop-in
    elasticIn(mesh, 1.0);
  }

  // ─────────────────────────────────────────────────────────
  // Elastic spring animation
  // ─────────────────────────────────────────────────────────
  function elasticIn(mesh, targetScale) {
    const start = performance.now();
    const duration = 520;

    // Elastic ease-out with overshoot
    function ease(t) {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      const p = 0.35;
      return Math.pow(2, -10 * t) *
        Math.sin((t - p / 4) * (Math.PI * 2) / p) + 1;
    }

    function tick(now) {
      const t = Math.min((now - start) / duration, 1.0);
      const s = Math.max(0.001, ease(t) * targetScale);
      mesh.scale.setScalar(s);
      if (t < 1.0) requestAnimationFrame(tick);
      else mesh.scale.setScalar(targetScale);
    }
    requestAnimationFrame(tick);
  }

  // Smoothly return model to default orientation
  function smoothReset() {
    if (!headGroup || resetAnimActive) return;
    resetAnimActive = true;

    const startX = headGroup.rotation.x;
    const startY = headGroup.rotation.y % (Math.PI * 2);
    const startZ = headGroup.rotation.z;

    const start = performance.now();
    const duration = 1200;

    function ease(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

    function tick(now) {
      if (isRotatingModel) { // Abort if user starts dragging again
        resetAnimActive = false;
        return;
      }

      const t = Math.min((now - start) / duration, 1.0);
      const e = ease(t);

      headGroup.rotation.set(
        startX * (1 - e),
        headGroup.rotation.y, // Leave Y to auto-rotation
        startZ * (1 - e)
      );

      if (t < 1.0) {
        requestAnimationFrame(tick);
      } else {
        resetAnimActive = false;
        modelAutoRotate = true;
      }
    }
    requestAnimationFrame(tick);
  }

  function updateCount() {
    // Legacy count removed from UI
  }

  // ─────────────────────────────────────────────────────────
  // Drag system
  // ─────────────────────────────────────────────────────────
  function startDrag(key, cx, cy) {
    if (activeDragKey) cleanupDrag();
    activeDragKey = key;
    modelRotateSpeed = ROTATE_SPEED_SLOW;
    
    tooltipContainer.textContent = "DROP ON THE HEAD TO PLACE THE STICKER";

    ghostImg.src = STICKER_DATA[key].src;
    dragGhost.style.display = 'block';
    dragGhost.style.opacity = '1';
    dragGhost.style.transition = '';
    moveDragGhost(cx, cy);

    document.querySelectorAll('.sticker-btn').forEach(b => {
      if (b.dataset.key === key) b.classList.add('dragging-item');
    });

    dropHint.classList.add('visible');
    // modelAutoRotate = false; // REMOVED: Keep it rotating
    // clearTimeout(autoRotTimer); // REMOVED: Keep it rotating
  }

  function moveDragGhost(cx, cy) {
    dragGhost.style.left = cx + 'px';
    dragGhost.style.top = cy + 'px';

    setNDC(cx, cy);
    const hit = castHead();
    const over = !!hit;

    if (over) {
      // Shrink slightly when over head — feels like it's being pressed on
      dragGhost.style.transform =
        'translate(-50%,-50%) rotate(-5deg) scale(0.75)';
      canvas.style.cursor = 'none';
      cursorRing.style.left = cx + 'px';
      cursorRing.style.top = cy + 'px';
      cursorRing.classList.add('visible', 'active');
    } else {
      dragGhost.style.transform =
        'translate(-50%,-50%) rotate(-10deg) scale(1.08)';
      canvas.style.cursor = 'crosshair';
      cursorRing.classList.remove('visible', 'active');
    }
  }

  function endDrag(cx, cy) {
    if (!activeDragKey) return;

    setNDC(cx, cy);
    const hit = castHead();

    if (hit) {
      // Ghost snaps toward hit point on surface, then vanishes
      const sp = worldToScreen(hit.point);

      dragGhost.style.transition =
        'left 0.13s cubic-bezier(0.22,1,0.36,1),' +
        'top  0.13s cubic-bezier(0.22,1,0.36,1),' +
        'transform 0.13s cubic-bezier(0.22,1,0.36,1),' +
        'opacity 0.15s ease';
      dragGhost.style.left = sp.x + 'px';
      dragGhost.style.top = sp.y + 'px';
      dragGhost.style.transform = 'translate(-50%,-50%) rotate(0deg) scale(0.15)';
      dragGhost.style.opacity = '0';

      const key = activeDragKey;
      const point = hit.point.clone();
      const normal = hit.face.normal.clone();
      const obj = hit.object;

      setTimeout(() => {
        placeSticker(key, point, normal, obj);
        cleanupDrag();
      }, 0);

    } else {
      // Missed — spring back and disappear
      dragGhost.style.transition =
        'transform 0.25s cubic-bezier(0.34,1.56,0.64,1),' +
        'opacity 0.2s ease';
      dragGhost.style.transform =
        'translate(-50%,-50%) rotate(-18deg) scale(0)';
      dragGhost.style.opacity = '0';
      setTimeout(cleanupDrag, 50);
    }

    clearTimeout(autoRotTimer);
    autoRotTimer = setTimeout(() => {
      smoothReset();
    }, 1000);
  }

  function cleanupDrag() {
    activeDragKey = null;
    modelRotateSpeed = ROTATE_SPEED_NORMAL;
    
    // Instruction will revert after the tooltip grace period (see mousemove)
    
    dragGhost.style.display = 'none';
    dragGhost.style.transition = '';
    dragGhost.style.opacity = '1';
    ghostImg.src = '';
    dropHint.classList.remove('visible');
    canvas.style.cursor = 'default';
    cursorRing.classList.remove('visible', 'active');
    document.querySelectorAll('.sticker-btn').forEach(b =>
      b.classList.remove('dragging-item')
    );
  }

  // ─────────────────────────────────────────────────────────
  // Mouse events
  // ─────────────────────────────────────────────────────────
  // Model Rotation Logic
  const clickStartPos = { x: 0, y: 0 };
  canvas.addEventListener('mousedown', e => {
    initAudio(); // Initialize audio on first click
    if (activeDragKey) return;
    isRotatingModel = true;
    prevMousePos = { x: e.clientX, y: e.clientY };
    clickStartPos.x = e.clientX;
    clickStartPos.y = e.clientY;

    // We no longer set modelAutoRotate = false, we just let it keep spinning
    resetAnimActive = false; // Interrupt any ongoing reset
    clearTimeout(autoRotTimer);
  });

  window.addEventListener('mousemove', e => {
    // 1. Handle sticker drag ghost
    cursorRing.style.left = e.clientX + 'px';
    cursorRing.style.top = e.clientY + 'px';

    if (activeDragKey) {
      moveDragGhost(e.clientX, e.clientY);
      return;
    }

    // 2. Handle holographic hover on stickers
    setNDC(e.clientX, e.clientY);
    const tooltipContainer = document.getElementById('drop-hint');
    let hitSticker = null;

    if (placedStickers.length) {
      raycaster.setFromCamera(ndcMouse, camera);
      const hits = raycaster.intersectObjects(placedStickers.map(s => s.mesh), false);
      if (hits.length) {
        hitSticker = placedStickers.find(s => s.mesh === hits[0].object);
      }
    }

    if (hitSticker) {
      if (hoveredSticker !== hitSticker) {
        if (hoveredSticker) resetHolographic(hoveredSticker.mesh);
        hoveredSticker = hitSticker;
        applyHolographic(hitSticker.mesh, hits[0].point);
        
        // Tooltip text hidden on hover as requested
        tooltip.textContent = hitSticker.label;
        tooltip.style.left = (e.clientX + 14) + 'px';
        tooltip.style.top = (e.clientY - 30) + 'px';
        tooltip.classList.add('visible');
      }
    } else {
      if (hoveredSticker) {
        resetHolographic();
        hoveredSticker = null;
      }
      tooltip.classList.remove('visible');
      // Dynamic suggestions logic handled by interval/state in bottom-center
      if (activeDragKey) {
        tooltipContainer.textContent = "DROP ON THE HEAD TO PLACE THE STICKER";
        tooltipContainer.style.opacity = '1';
      }
    }

    // 3. Handle model rotation
    if (isRotatingModel && headGroup) {
      const deltaX = e.clientX - prevMousePos.x;
      const deltaY = e.clientY - prevMousePos.y;

      headGroup.rotation.y += deltaX * 0.005;
      headGroup.rotation.x += deltaY * 0.005;

      // Limit vertical rotation to avoid flipping
      headGroup.rotation.x = Math.max(-Math.PI * 0.25, Math.min(Math.PI * 0.25, headGroup.rotation.x));

      prevMousePos = { x: e.clientX, y: e.clientY };
      return;
    }

    // Remove old hover block replaced above
  });

  window.addEventListener('mouseup', e => {
    if (activeDragKey) {
      endDrag(e.clientX, e.clientY);
      clearTimeout(autoRotTimer);
      autoRotTimer = setTimeout(() => { smoothReset(); }, 3000);
      return;
    }

    if (isRotatingModel) {
      isRotatingModel = false;
      
      // Click detection
      const dist = Math.hypot(e.clientX - clickStartPos.x, e.clientY - clickStartPos.y);
      if (dist < 5) {
        setNDC(e.clientX, e.clientY);
        raycaster.setFromCamera(ndcMouse, camera);
        const hits = raycaster.intersectObjects(placedStickers.map(s => s.mesh), false);
        if (hits.length) {
          const s = placedStickers.find(st => st.mesh === hits[0].object);
          if (s) showPopup(s);
        }
      }

      clearTimeout(autoRotTimer);
      autoRotTimer = setTimeout(() => {
        smoothReset();
      }, 3000);
    }
  });

  // ─────────────────────────────────────────────────────────
  // Touch events
  // ─────────────────────────────────────────────────────────
  window.addEventListener('touchmove', e => {
    if (!activeDragKey) return;
    e.preventDefault();
    const t = e.touches[0];
    moveDragGhost(t.clientX, t.clientY);
  }, { passive: false });

  window.addEventListener('touchend', e => {
    if (!activeDragKey) return;
    const t = e.changedTouches[0];
    endDrag(t.clientX, t.clientY);
  });

  // ─────────────────────────────────────────────────────────
  // Resize
  // ─────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ─────────────────────────────────────────────────────────
  // Dynamic Prompts
  // ─────────────────────────────────────────────────────────
  fetch('prompts.json')
    .then(res => res.json())
    .then(data => {
      // Merge descriptions into STICKER_DATA
      data.forEach(item => {
        if (STICKER_DATA[item.stickerKey]) {
          STICKER_DATA[item.stickerKey].description = item.description;
        }
      });

      const list = document.getElementById('prompt-list');
      data.forEach(item => {
        const btn = document.createElement('button');
        btn.className = 'prompt-btn sticker-btn';
        btn.dataset.key = item.stickerKey;
        btn.textContent = item.question;

        btn.addEventListener('click', e => {
          e.preventDefault();
          initAudio();
          playTapSound();
          if (activeDragKey === item.stickerKey) {
            cleanupDrag();
          } else {
            startDrag(item.stickerKey, e.clientX, e.clientY);
          }
        });
        btn.addEventListener('touchstart', e => {
          e.preventDefault();
          const t = e.touches[0];
          initAudio();
          playTapSound();
          startDrag(btn.dataset.key, t.clientX, t.clientY);
        }, { passive: false });

        list.appendChild(btn);
      });
    })
    .catch(err => console.error("Error loading prompts:", err));

  // ─────────────────────────────────────────────────────────
  // Splash & Utility Interactions
  // ─────────────────────────────────────────────────────────
  if (splash) {
    splash.addEventListener('click', () => {
      initAudio();
      splash.classList.add('hidden');
      
      // Delay rotation until logo lands (2.4s transition)
      setTimeout(() => {
        modelAutoRotate = true;
      }, 2400);

      // Staggered prompt entrance: bottom to top
      const btns = Array.from(document.querySelectorAll('.prompt-btn'));
      btns.reverse().forEach((btn, i) => {
        setTimeout(() => {
          btn.classList.add('v-shown');
        }, 400 + (i * 60)); // Faster staggered entrance
      });

      // Start suggestion cycle for bottom-center tooltip
      suggestionTimer = setInterval(() => {
        // Only cycle if we aren't currently carrying a sticker
        if (!activeDragKey) {
          tooltipContainer.style.opacity = '0';
          setTimeout(() => {
            currentSugIdx = (currentSugIdx + 1) % suggestions.length;
            tooltipContainer.textContent = suggestions[currentSugIdx];
            tooltipContainer.style.opacity = '1';
          }, 500);
        }
      }, 6000);
    });
  }

  // Mute Toggle
  const muteBtn = document.getElementById('mute-btn');
  let isMuted = false;
  muteBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    bgAudio.muted = isMuted;
    muteBtn.innerHTML = isMuted ? 
      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>` : 
      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
  });

  // Info Handler
  const infoBtn = document.getElementById('info-btn');
  const infoOverlay = document.getElementById('info-popup-overlay');
  infoBtn.addEventListener('click', () => {
    infoOverlay.classList.add('visible');
    playTapSound(true);
  });
  infoOverlay.addEventListener('click', () => {
    infoOverlay.classList.remove('visible');
  });

  // ─────────────────────────────────────────────────────────
  // Render loop
  // ─────────────────────────────────────────────────────────
  (function animate() {
    requestAnimationFrame(animate);

    // Constant shimmering pulse for holographic light
    if (holoLight && holoLight.intensity > 0) {
      const time = performance.now() * 0.001;
      holoLight.color.setHSL((time % 1), 0.65, 0.55);
    }

    // Rotate the model (not the camera) so shadow stays fixed - ALWAYS rotating as requested
    if (headGroup) {
      headGroup.rotation.y += modelRotateSpeed;
    }
    renderer.render(scene, camera);
  })();

})();
