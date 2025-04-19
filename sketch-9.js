let scene, camera, renderer;
let image, material;
let backgroundImage, backgroundMaterial;
let mouseX = 0,
  mouseY = 0;

// Parametri controllati dagli slider
let params = {
  blurAmount: 0.001,
  maxBlurAmount: 0.21,
  // Layer visibility - tutti disattivati di default
  blurLayer: true, // Manteniamo il blur layer attivo per l'effetto mouse

  // Parametri per il brush interattivo
  brushSize: 0.2,
  brushSpread: 0.5,
  brushIntensity: 0.8,
  brushBlurAmount: 0.01,
  brushShape: 0, // 0 = circolare, 1 = quadrato, 2 = noise
  brushNoiseScale: 5.0,
  brushNoiseAmount: 0.3,
  brushGlowIntensity: 0.7,
  brushGlowColor: new THREE.Color(1, 1, 1),
  brushActive: true,
};

// Funzione per il Simplex noise
const simplexNoise = `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
             -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
      + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
      dot(x12.zw,x12.zw)), 0.0);
    m = m*m;
    m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }
`;

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  ${simplexNoise}
  
  uniform sampler2D tDiffuse;
  uniform float amount;
  uniform float maxBlurAmount;
  uniform float time;
  uniform vec2 mousePos;
  uniform bool blurLayer;
  
  // Parametri per il brush interattivo
  uniform float brushSize;
  uniform float brushSpread;
  uniform float brushIntensity;
  uniform float brushBlurAmount;
  uniform int brushShape;
  uniform float brushNoiseScale;
  uniform float brushNoiseAmount;
  uniform float brushGlowIntensity;
  uniform vec3 brushGlowColor;
  uniform bool brushActive;
  
  varying vec2 vUv;

  // Funzione per calcolare la distanza dal mouse con effetti del brush
  float getBrushDistance(vec2 uv, vec2 mousePos) {
    float dist = length(uv - mousePos);
    
    // Applica la forma del brush
    if (brushShape == 1) { // Quadrato
      vec2 diff = abs(uv - mousePos);
      dist = max(diff.x, diff.y);
    } else if (brushShape == 2) { // Noise
      float noise = snoise(uv * brushNoiseScale + time * 0.1) * 0.5 + 0.5;
      dist = dist - noise * brushNoiseAmount;
    }
    
    // Normalizza la distanza in base alla dimensione del brush
    return dist / brushSize;
  }

  // Funzione per applicare l'effetto glow
  vec4 applyGlow(vec4 color, float dist) {
    float glowFactor = 1.0 - smoothstep(0.0, brushSpread, dist);
    glowFactor = pow(glowFactor, 2.0);
    
    // Applica il colore del glow
    vec3 glowColor = mix(color.rgb, brushGlowColor, glowFactor * brushGlowIntensity);
    
    return vec4(glowColor, color.a);
  }

  void main() {
    vec2 uv = vUv;
    vec4 color = texture2D(tDiffuse, uv);
    
    // Calcola la distanza dal mouse
    float distToMouse = getBrushDistance(uv, mousePos);
    
    // Applica l'effetto brush se attivo
    if (brushActive && distToMouse < brushSpread) {
      // Calcola l'intensità del brush in base alla distanza
      float brushFactor = 1.0 - smoothstep(0.0, brushSpread, distToMouse);
      brushFactor = pow(brushFactor, 2.0) * brushIntensity;
      
      // Applica l'effetto glow
      color = applyGlow(color, distToMouse);
      
      // Applica il blur locale se l'intensità è sufficiente
      if (brushFactor > 0.01) {
        vec4 blurredColor = vec4(0.0);
        float total = 0.0;
        
        // Calcola il blur locale
        for(float i = -4.0; i <= 4.0; i++) {
          for(float j = -4.0; j <= 4.0; j++) {
            float weight = 1.0 - length(vec2(i, j)) / 5.0;
            if (weight > 0.0) {
              vec2 offset = vec2(i, j) * brushBlurAmount * brushFactor;
              blurredColor += texture2D(tDiffuse, uv + offset) * weight;
              total += weight;
            }
          }
        }
        
        blurredColor = blurredColor / total;
        
        // Miscela il colore originale con quello sfocato
        color = mix(color, blurredColor, brushFactor);
      }
    }
    
    // Applica il directional blur globale se attivo
    if (blurLayer && amount > 0.0) {
      vec4 blurredColor = vec4(0.0);
      float total = 0.0;
      
      for(float i = -4.0; i <= 4.0; i++) {
        float weight = 1.0 - abs(i) / 4.0;
        vec2 offset = vec2(i * amount, 0.0);
        blurredColor += texture2D(tDiffuse, uv + offset) * weight;
        total += weight;
      }
      
      blurredColor = blurredColor / total;
      color = blurredColor;
    }
    
    gl_FragColor = color;
  }
`;

// Setup
function setup() {
  // Setup scene
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 1;

  // Crea il renderer WebGL
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  });
  renderer.setSize(1920, 1080);
  renderer.setPixelRatio(window.devicePixelRatio);
  document.body.appendChild(renderer.domElement);

  // Carica l'immagine di sfondo
  const backgroundTextureLoader = new THREE.TextureLoader();
  backgroundTextureLoader.load("assets/img.png", function (texture) {
    // Crea il materiale per lo sfondo con trasparenza
    backgroundMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
      depthTest: false,
    });

    // Crea la geometria e la mesh per lo sfondo
    const backgroundGeometry = new THREE.PlaneGeometry(2, 2);
    backgroundImage = new THREE.Mesh(backgroundGeometry, backgroundMaterial);
    backgroundImage.position.z = -0.1; // Posiziona lo sfondo dietro l'immagine principale
    backgroundImage.visible = params.backgroundLayer; // Imposta la visibilità iniziale
    scene.add(backgroundImage);
  });

  // Carica l'immagine principale
  const textureLoader = new THREE.TextureLoader();
  textureLoader.load("assets/TYPES.jpg", function (texture) {
    // Assicurati che la texture sia caricata alla massima risoluzione
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    // Crea il materiale con gli shader
    material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: texture },
        amount: { value: params.blurAmount },
        maxBlurAmount: { value: params.maxBlurAmount },
        time: { value: 0.0 },
        mousePos: { value: new THREE.Vector2(0.5, 0.5) },
        blurLayer: { value: params.blurLayer },

        // Uniform per il brush interattivo
        brushSize: { value: params.brushSize },
        brushSpread: { value: params.brushSpread },
        brushIntensity: { value: params.brushIntensity },
        brushBlurAmount: { value: params.brushBlurAmount },
        brushShape: { value: params.brushShape },
        brushNoiseScale: { value: params.brushNoiseScale },
        brushNoiseAmount: { value: params.brushNoiseAmount },
        brushGlowIntensity: { value: params.brushGlowIntensity },
        brushGlowColor: { value: params.brushGlowColor },
        brushActive: { value: params.brushActive },
      },
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      transparent: true,
      blending: THREE.NormalBlending,
    });

    // Crea la geometria e la mesh
    const geometry = new THREE.PlaneGeometry(2, 2);
    image = new THREE.Mesh(geometry, material);
    scene.add(image);
  });

  // Event listeners
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("resize", onWindowResize);
  setupControls();
}

function setupControls() {
  // Blur Layer control
  const blurLayerCheckbox = document.getElementById("blur-layer");
  if (blurLayerCheckbox) {
    blurLayerCheckbox.addEventListener("change", (e) => {
      params.blurLayer = e.target.checked;
      if (material) material.uniforms.blurLayer.value = params.blurLayer;
    });
  }

  // Blur Amount control
  const blurAmountSlider = document.getElementById("blur-amount");
  const blurAmountValue = document.getElementById("blur-amount-value");
  if (blurAmountSlider && blurAmountValue) {
    blurAmountSlider.value = params.blurAmount;
    blurAmountValue.textContent = params.blurAmount.toFixed(3);
    blurAmountSlider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      document.getElementById("blur-amount-value").textContent =
        value.toFixed(3);
      material.uniforms.amount.value = value;
    });
  }

  // Aggiungi i controlli per il brush interattivo
  addBrushControls();
}

function addBrushControls() {
  // Crea un container per i controlli del brush
  const brushControlsContainer = document.createElement("div");
  brushControlsContainer.className = "brush-controls";
  brushControlsContainer.style.marginTop = "20px";
  brushControlsContainer.style.borderTop = "1px solid rgba(255,255,255,0.2)";
  brushControlsContainer.style.paddingTop = "10px";

  // Titolo per la sezione brush
  const brushTitle = document.createElement("h3");
  brushTitle.textContent = "Brush Controls";
  brushTitle.style.margin = "0 0 10px 0";
  brushTitle.style.fontSize = "14px";
  brushControlsContainer.appendChild(brushTitle);

  // Brush Active
  const brushActiveGroup = createControlGroup(
    "brush-active",
    "Brush Active",
    "checkbox"
  );
  brushActiveGroup.querySelector("input").checked = params.brushActive;
  brushActiveGroup.querySelector("input").addEventListener("change", (e) => {
    params.brushActive = e.target.checked;
    if (material) material.uniforms.brushActive.value = params.brushActive;
  });
  brushControlsContainer.appendChild(brushActiveGroup);

  // Brush Size
  const brushSizeGroup = createControlGroup(
    "brush-size",
    "Brush Size",
    "range",
    0.01,
    1,
    0.01,
    params.brushSize
  );
  brushSizeGroup.querySelector("input").addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById("brush-size-value").textContent = value.toFixed(2);
    params.brushSize = value;
    if (material) material.uniforms.brushSize.value = value;
  });
  brushControlsContainer.appendChild(brushSizeGroup);

  // Brush Spread
  const brushSpreadGroup = createControlGroup(
    "brush-spread",
    "Brush Spread",
    "range",
    0.1,
    2,
    0.1,
    params.brushSpread
  );
  brushSpreadGroup.querySelector("input").addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById("brush-spread-value").textContent =
      value.toFixed(2);
    params.brushSpread = value;
    if (material) material.uniforms.brushSpread.value = value;
  });
  brushControlsContainer.appendChild(brushSpreadGroup);

  // Brush Intensity
  const brushIntensityGroup = createControlGroup(
    "brush-intensity",
    "Brush Intensity",
    "range",
    0,
    1,
    0.01,
    params.brushIntensity
  );
  brushIntensityGroup.querySelector("input").addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById("brush-intensity-value").textContent =
      value.toFixed(2);
    params.brushIntensity = value;
    if (material) material.uniforms.brushIntensity.value = value;
  });
  brushControlsContainer.appendChild(brushIntensityGroup);

  // Brush Blur Amount
  const brushBlurAmountGroup = createControlGroup(
    "brush-blur-amount",
    "Brush Blur Amount",
    "range",
    0,
    0.05,
    0.001,
    params.brushBlurAmount
  );
  brushBlurAmountGroup.querySelector("input").addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById("brush-blur-amount-value").textContent =
      value.toFixed(3);
    params.brushBlurAmount = value;
    if (material) material.uniforms.brushBlurAmount.value = value;
  });
  brushControlsContainer.appendChild(brushBlurAmountGroup);

  // Brush Shape
  const brushShapeGroup = document.createElement("div");
  brushShapeGroup.className = "control-group";

  const brushShapeLabel = document.createElement("label");
  brushShapeLabel.htmlFor = "brush-shape";
  brushShapeLabel.textContent = "Brush Shape";
  brushShapeGroup.appendChild(brushShapeLabel);

  const brushShapeSelect = document.createElement("select");
  brushShapeSelect.id = "brush-shape";

  const shapeOptions = [
    { value: 0, text: "Circolare" },
    { value: 1, text: "Quadrato" },
    { value: 2, text: "Noise" },
  ];

  shapeOptions.forEach((option) => {
    const optionElement = document.createElement("option");
    optionElement.value = option.value;
    optionElement.textContent = option.text;
    if (parseInt(option.value) === params.brushShape) {
      optionElement.selected = true;
    }
    brushShapeSelect.appendChild(optionElement);
  });

  brushShapeSelect.addEventListener("change", (e) => {
    const value = parseInt(e.target.value);
    params.brushShape = value;
    if (material) material.uniforms.brushShape.value = value;
  });

  brushShapeGroup.appendChild(brushShapeSelect);
  brushControlsContainer.appendChild(brushShapeGroup);

  // Brush Noise Scale
  const brushNoiseScaleGroup = createControlGroup(
    "brush-noise-scale",
    "Noise Scale",
    "range",
    1,
    20,
    0.5,
    params.brushNoiseScale
  );
  brushNoiseScaleGroup.querySelector("input").addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById("brush-noise-scale-value").textContent =
      value.toFixed(1);
    params.brushNoiseScale = value;
    if (material) material.uniforms.brushNoiseScale.value = value;
  });
  brushControlsContainer.appendChild(brushNoiseScaleGroup);

  // Brush Noise Amount
  const brushNoiseAmountGroup = createControlGroup(
    "brush-noise-amount",
    "Noise Amount",
    "range",
    0,
    1,
    0.01,
    params.brushNoiseAmount
  );
  brushNoiseAmountGroup
    .querySelector("input")
    .addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      document.getElementById("brush-noise-amount-value").textContent =
        value.toFixed(2);
      params.brushNoiseAmount = value;
      if (material) material.uniforms.brushNoiseAmount.value = value;
    });
  brushControlsContainer.appendChild(brushNoiseAmountGroup);

  // Brush Glow Intensity
  const brushGlowIntensityGroup = createControlGroup(
    "brush-glow-intensity",
    "Glow Intensity",
    "range",
    0,
    1,
    0.01,
    params.brushGlowIntensity
  );
  brushGlowIntensityGroup
    .querySelector("input")
    .addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      document.getElementById("brush-glow-intensity-value").textContent =
        value.toFixed(2);
      params.brushGlowIntensity = value;
      if (material) material.uniforms.brushGlowIntensity.value = value;
    });
  brushControlsContainer.appendChild(brushGlowIntensityGroup);

  // Aggiungi il container dei controlli del brush al container principale
  const controlsContainer = document.getElementById("controls");
  if (controlsContainer) {
    controlsContainer.appendChild(brushControlsContainer);
  }
}

function createControlGroup(id, label, type, min, max, step, value) {
  const group = document.createElement("div");
  group.className = "control-group";

  const labelElement = document.createElement("label");
  labelElement.htmlFor = id;
  labelElement.textContent = label;
  group.appendChild(labelElement);

  if (type === "checkbox") {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = id;
    group.appendChild(checkbox);
  } else if (type === "range") {
    const input = document.createElement("input");
    input.type = "range";
    input.id = id;
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = value;
    group.appendChild(input);

    const valueSpan = document.createElement("span");
    valueSpan.className = "value";
    valueSpan.id = id + "-value";
    valueSpan.textContent = value.toFixed(step < 0.01 ? 3 : 2);
    group.appendChild(valueSpan);
  }

  return group;
}

function onMouseMove(event) {
  // Converti le coordinate del mouse in coordinate UV (0-1)
  mouseX = event.clientX / window.innerWidth;
  mouseY = 1.0 - event.clientY / window.innerHeight; // Inverti Y per corrispondere alle coordinate UV
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  if (material) {
    material.uniforms.time.value += 0.01;
    material.uniforms.mousePos.value.set(mouseX, mouseY);
  }

  renderer.render(scene, camera);
}

setup();
animate();
