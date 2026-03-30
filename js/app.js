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
  scene.background = new THREE.Color(0xA8A6A4);

  // Background wall — invisible, only catches shadow
  const wallMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.ShadowMaterial({ opacity: 0.08 }) // Reduced opacity for subtle shadow
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

  // Model-based rotation state
  let modelAutoRotate = true;
  const modelRotateSpeed = 0.003;

  // ─────────────────────────────────────────────────────────
  // Lighting — strong key from top-left, casting shadow down-right onto wall
  // ─────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xE4E4E4, 0.35));

  // Key — top-left, casting shadow
  const keyLight = new THREE.DirectionalLight(0xfff8f0, 0.95); // Balanced low
  keyLight.position.set(-5, 6, 6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 40;
  keyLight.shadow.camera.left = -12;
  keyLight.shadow.camera.right = 12;
  keyLight.shadow.camera.top = 12;
  keyLight.shadow.camera.bottom = -12;
  keyLight.shadow.radius = 290; // Heavily blurred spread
  keyLight.shadow.bias = -0.0005;
  scene.add(keyLight);

  // Secondary Key — top-right, opposite side
  const keyLightOpposite = new THREE.DirectionalLight(0xfff8f0, 0.82); 
  keyLightOpposite.position.set(5, 6, 6);
  scene.add(keyLightOpposite);

  // Fill — bottom-right, very subtle cool
  const fillLight = new THREE.DirectionalLight(0xe0e4e8, 0.25);
  fillLight.position.set(5, -2, 3);
  scene.add(fillLight);

  // Rim — from behind, faint separation
  const rimLight = new THREE.DirectionalLight(0xffffff, 0.15);
  rimLight.position.set(1, 0, -6);
  scene.add(rimLight);

  // Background-only spotlight — soft glow from top-left on wall
  // Uses layers so it only affects the wall, not the model
  const bgSpot = new THREE.SpotLight(0xffffff, 25, 140, Math.PI / 3, 80.0, 0.5);
  bgSpot.position.set(-4, 10, 3);
  bgSpot.target.position.set(2, -2, -4);
  bgSpot.layers.set(1);
  scene.add(bgSpot);
  scene.add(bgSpot.target);
  wallMesh.layers.enable(1);

  // Background-only spotlight — soft glow from top-right on wall
  const bgSpotRight = new THREE.SpotLight(0xffffff, 8, 140, Math.PI / 3, 100.0, 1);
  bgSpotRight.position.set(8, 10, 2);
  bgSpotRight.target.position.set(-2, -2, -4);
  bgSpotRight.layers.set(1);
  scene.add(bgSpotRight);
  scene.add(bgSpotRight.target);

  // ─────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────
  let headMeshes = [];
  let headGroup = null;
  let placedStickers = [];   // { mesh, key, label }
  let activeDragKey = null;
  let autoRotTimer = null;

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
  // Load GLB
  // ─────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────
  // 1. Setup the Concrete Material (Rough, Matte Gray)
  const marbleMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x555555,            // Concrete gray
    roughness: 1.0,             // Maximum matte for concrete
    metalness: 0.05,            // Slight grit
    reflectivity: 0.1,          // Low reflectivity
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
      model.position.y = 0; // Centered vertically
      model.position.z += 6.5; 

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
      roughness: 0.7, // Paper/vinyl feel
      metalness: 0.1,
      polygonOffset: true,
      polygonOffsetFactor: -4.5, // Slightly lifted for "depth"
      polygonOffsetUnits: -4.5,
    });

    const mesh = new THREE.Mesh(geo, mat);

    // Start at scale 0 for animation
    mesh.scale.setScalar(0.001);
    mesh.renderOrder = 1;

    headGroup.add(mesh);
    placedStickers.push({ mesh, key, label: data.label });
    updateCount();

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
        startY * (1 - e),
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
    const n = placedStickers.length;
    stickerCount.textContent =
      n === 0 ? '0 stickers placed' :
        n === 1 ? '1 sticker placed' :
          `${n} stickers placed`;
  }

  // ─────────────────────────────────────────────────────────
  // Drag system
  // ─────────────────────────────────────────────────────────
  function startDrag(key, cx, cy) {
    if (!headMeshes.length) return;
    activeDragKey = key;

    ghostImg.src = STICKER_DATA[key].src;
    dragGhost.style.display = 'block';
    dragGhost.style.opacity = '1';
    dragGhost.style.transition = '';
    moveDragGhost(cx, cy);

    document.querySelectorAll('.sticker-btn').forEach(b => {
      if (b.dataset.key === key) b.classList.add('dragging-item');
    });

    dropHint.classList.add('visible');
    modelAutoRotate = false;
    controls.enabled = false;
    clearTimeout(autoRotTimer);
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
  canvas.addEventListener('mousedown', e => {
    if (activeDragKey) return;
    isRotatingModel = true;
    prevMousePos = { x: e.clientX, y: e.clientY };
    
    modelAutoRotate = false;
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

    // 2. Handle model rotation
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

    // 3. Hover: show tooltip on placed stickers
    setNDC(e.clientX, e.clientY);
    if (placedStickers.length) {
      raycaster.setFromCamera(ndcMouse, camera);
      const hits = raycaster.intersectObjects(
        placedStickers.map(s => s.mesh), false
      );
      if (hits.length) {
        const found = placedStickers.find(s => s.mesh === hits[0].object);
        if (found) {
          tooltip.textContent = found.label;
          tooltip.style.left = (e.clientX + 14) + 'px';
          tooltip.style.top = (e.clientY - 30) + 'px';
          tooltip.classList.add('visible');
          return;
        }
      }
    }
    tooltip.classList.remove('visible');
  });

  window.addEventListener('mouseup', e => {
    if (activeDragKey) {
      endDrag(e.clientX, e.clientY);
      // Also trigger reset after placing sticker if not dragging
      clearTimeout(autoRotTimer);
      autoRotTimer = setTimeout(() => {
        smoothReset();
      }, 3000);
    }
    
    if (isRotatingModel) {
      isRotatingModel = false;
      clearTimeout(autoRotTimer);
      autoRotTimer = setTimeout(() => {
        smoothReset();
      }, 3000);
    }
    isRotatingModel = false;
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
      const list = document.getElementById('prompt-list');
      data.forEach(item => {
        const btn = document.createElement('button');
        btn.className = 'prompt-btn sticker-btn';
        btn.dataset.key = item.stickerKey;
        btn.textContent = item.question;

        btn.addEventListener('mousedown', e => {
          e.preventDefault();
          startDrag(btn.dataset.key, e.clientX, e.clientY);
        });
        btn.addEventListener('touchstart', e => {
          e.preventDefault();
          const t = e.touches[0];
          startDrag(btn.dataset.key, t.clientX, t.clientY);
        }, { passive: false });

        list.appendChild(btn);
      });
    })
    .catch(err => console.error("Error loading prompts:", err));

  // ─────────────────────────────────────────────────────────
  // Render loop
  // ─────────────────────────────────────────────────────────
  (function animate() {
    requestAnimationFrame(animate);
    // Rotate the model (not the camera) so shadow stays fixed
    if (modelAutoRotate && headGroup) {
      headGroup.rotation.y += modelRotateSpeed;
    }
    renderer.render(scene, camera);
  })();

})();
