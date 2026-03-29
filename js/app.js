// ═══════════════════════════════════════════════════════════
// PRANAV.EXE — Head Sticker Experience
// Flat stickers placed on surface — like real physical stickers
// ═══════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────
  // DOM
  // ─────────────────────────────────────────────────────────
  const canvas       = document.getElementById('canvas');
  const loadingEl    = document.getElementById('loading');
  const loadingText  = document.getElementById('loading-text');
  const stickerCount = document.getElementById('sticker-count');
  const dragGhost    = document.getElementById('drag-ghost');
  const ghostImg     = document.getElementById('ghost-img');
  const dropHint     = document.getElementById('drop-hint');
  const tooltip      = document.getElementById('tooltip');
  const cursorRing   = document.getElementById('cursor-ring');

  // ─────────────────────────────────────────────────────────
  // Renderer
  // ─────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
  renderer.outputEncoding    = THREE.sRGBEncoding;
  renderer.toneMapping       = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  // ─────────────────────────────────────────────────────────
  // Scene
  // ─────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xA8A6A4);

  // Background wall — invisible, only catches shadow
  const wallMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.ShadowMaterial({ opacity: 0.2 })
  );
  wallMesh.position.z = -4;
  wallMesh.rotation.x = -0.15;
  wallMesh.receiveShadow = true;
  scene.add(wallMesh);

  // ─────────────────────────────────────────────────────────
  // Camera
  // ─────────────────────────────────────────────────────────
  const camera = new THREE.PerspectiveCamera(
    36, window.innerWidth / window.innerHeight, 0.01, 100
  );
  camera.position.set(0, 8.8, 20.5);

  // ─────────────────────────────────────────────────────────
  // Orbit controls
  // ─────────────────────────────────────────────────────────
  const controls = new THREE.OrbitControls(camera, canvas);
  controls.enableDamping   = true;
  controls.dampingFactor   = 0.055;
  controls.enablePan       = false;
  controls.minDistance     = 3.5;
  controls.maxDistance     = 13;
  controls.minPolarAngle   = Math.PI * 0.12;
  controls.maxPolarAngle   = Math.PI * 0.82;
  controls.target.set(0, 0.6, 0);
  controls.autoRotate      = false;
  controls.autoRotateSpeed = 0;

  // Model-based rotation state
  let modelAutoRotate = true;
  const modelRotateSpeed = 0.003;

  // ─────────────────────────────────────────────────────────
  // Lighting — strong key from top-left, casting shadow down-right onto wall
  // ─────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xE4E4E4, 0.85));

  // Key — top-left, casting shadow close to the left of the model
  const keyLight = new THREE.DirectionalLight(0xfff8f0, 2.2);
  keyLight.position.set(2, 6, 6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near   = 0.5;
  keyLight.shadow.camera.far    = 40;
  keyLight.shadow.camera.left   = -12;
  keyLight.shadow.camera.right  =  12;
  keyLight.shadow.camera.top    =  12;
  keyLight.shadow.camera.bottom = -12;
  keyLight.shadow.radius        = 30;
  keyLight.shadow.bias          = -0.001;
  scene.add(keyLight);

  // Fill — right, very subtle cool
  const fillLight = new THREE.DirectionalLight(0xe0e4e8, 0.4);
  fillLight.position.set(5, 2, 3);
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
  let headMeshes    = [];
  let headGroup     = null;
  let placedStickers = [];   // { mesh, key, label }
  let activeDragKey  = null;
  let autoRotTimer   = null;

  const raycaster = new THREE.Raycaster();
  const ndcMouse  = new THREE.Vector2();

  // Texture cache
  const texCache  = {};
  const texLoader = new THREE.TextureLoader();

  function getTex(key) {
    if (texCache[key]) return texCache[key];
    const d = STICKER_DATA[key];
    if (!d) return null;
    const t = texLoader.load(d.src);
    t.encoding         = THREE.sRGBEncoding;
    t.premultiplyAlpha = false;
    texCache[key] = t;
    return t;
  }

  // ─────────────────────────────────────────────────────────
  // Load GLB
  // ─────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────
// 1. Setup the Marble Material (Physical-based for SSS feel)
// ─────────────────────────────────────────────────────────
const marbleMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xc5c2be,        // Cool gray plaster tone
  roughness: 0.72,        // Matte plaster finish
  metalness: 0.0,
  clearcoat: 0.05,        // Very faint sheen
  clearcoatRoughness: 0.4,
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
    const bsz  = new THREE.Vector3();
    bbox.getSize(bsz);
    const scale = 4.4 / Math.max(bsz.x, bsz.y, bsz.z);
    model.scale.setScalar(scale);
    bbox.setFromObject(model);
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    model.position.sub(center);
    model.position.y += 1.05;

    model.traverse(child => {
      if (!child.isMesh) return;
      child.castShadow    = true;
      child.receiveShadow = true;
      child.material      = marbleMaterial;
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
    ndcMouse.x =  (cx / window.innerWidth)  * 2 - 1;
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
      x: ( v.x * 0.5 + 0.5) * window.innerWidth,
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

    // Random size
    const s = 0.42 + Math.random() * 0.26;

    // Use DecalGeometry to wrap around the mesh surface
    const geo = new THREE.DecalGeometry(
      hitObject, 
      hitPoint, 
      orientation, 
      new THREE.Vector3(s, s, s * 0.5)
    );

    // Transform decal geometry from world space into headGroup local space
    // so it conforms to the surface AND rotates with the model
    const inverseMatrix = new THREE.Matrix4();
    inverseMatrix.copy(headGroup.matrixWorld).invert();
    geo.applyMatrix4(inverseMatrix);

    const mat = new THREE.MeshBasicMaterial({
      map:           tex,
      transparent:   true,
      alphaTest:     0.04,
      depthWrite:    false,
      depthTest:     true,
      side:          THREE.FrontSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits:  -4,
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
    const start    = performance.now();
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

    ghostImg.src               = STICKER_DATA[key].src;
    dragGhost.style.display    = 'block';
    dragGhost.style.opacity    = '1';
    dragGhost.style.transition = '';
    moveDragGhost(cx, cy);

    document.querySelectorAll('.sticker-btn').forEach(b => {
      if (b.dataset.key === key) b.classList.add('dragging-item');
    });

    dropHint.classList.add('visible');
    modelAutoRotate = false;
    controls.enabled    = false;
    clearTimeout(autoRotTimer);
  }

  function moveDragGhost(cx, cy) {
    dragGhost.style.left = cx + 'px';
    dragGhost.style.top  = cy + 'px';

    setNDC(cx, cy);
    const hit  = castHead();
    const over = !!hit;

    if (over) {
      // Shrink slightly when over head — feels like it's being pressed on
      dragGhost.style.transform =
        'translate(-50%,-50%) rotate(-5deg) scale(0.75)';
      canvas.style.cursor = 'none';
      cursorRing.style.left = cx + 'px';
      cursorRing.style.top  = cy + 'px';
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
      dragGhost.style.left      = sp.x + 'px';
      dragGhost.style.top       = sp.y + 'px';
      dragGhost.style.transform = 'translate(-50%,-50%) rotate(0deg) scale(0.15)';
      dragGhost.style.opacity   = '0';

      const key    = activeDragKey;
      const point  = hit.point.clone();
      const normal = hit.face.normal.clone();
      const obj    = hit.object;

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

    controls.enabled = true;
    clearTimeout(autoRotTimer);
    autoRotTimer = setTimeout(() => {
      modelAutoRotate = true;
    }, 400);
  }

  function cleanupDrag() {
    activeDragKey              = null;
    dragGhost.style.display    = 'none';
    dragGhost.style.transition = '';
    dragGhost.style.opacity    = '1';
    ghostImg.src               = '';
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
  window.addEventListener('mousemove', e => {
    cursorRing.style.left = e.clientX + 'px';
    cursorRing.style.top  = e.clientY + 'px';

    if (activeDragKey) {
      moveDragGhost(e.clientX, e.clientY);
      return;
    }

    // Hover: show tooltip on placed stickers
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
          tooltip.style.left  = (e.clientX + 14) + 'px';
          tooltip.style.top   = (e.clientY - 30) + 'px';
          tooltip.classList.add('visible');
          return;
        }
      }
    }
    tooltip.classList.remove('visible');
  });

  window.addEventListener('mouseup', e => {
    if (activeDragKey) endDrag(e.clientX, e.clientY);
  });

  // Pause auto-rotate on manual orbit
  canvas.addEventListener('mousedown', () => {
    if (activeDragKey) return;
    modelAutoRotate = false;
    clearTimeout(autoRotTimer);
    autoRotTimer = setTimeout(() => {
      modelAutoRotate = true;
    }, 3500);
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
    controls.update();
    // Rotate the model (not the camera) so shadow stays fixed
    if (modelAutoRotate && headGroup) {
      headGroup.rotation.y += modelRotateSpeed;
    }
    renderer.render(scene, camera);
  })();

})();
