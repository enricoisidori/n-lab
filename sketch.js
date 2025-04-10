let scene, camera, renderer;
let image, material;
let backgroundImage, backgroundMaterial;
let mouseX = 0,
  mouseY = 0;

// Parametri controllati dagli slider
let params = {
  threshold: 0.5,
  noiseAmount: 0.05,
  noiseScale: 5.0,
  noiseSpeed: 0.005,
  blurAmount: 0.0,
  maxBlurAmount: 0.11,
  // Layer visibility - tutti disattivati di default
  blurLayer: true, // Manteniamo il blur layer attivo per l'effetto mouse
  noiseLayer: false,
  backgroundLayer: false, // Nuovo controllo per l'immagine di sfondo
  // Nuovi parametri per il brush del mouse
  brushHardness: 0.5, // Durezza del bordo del brush (0 = sfumato, 1 = netto)
  brushIntensity: 1.0, // Intensità complessiva dell'effetto brush
  brushScale: 2.6, // Scala del brush
  brushType: 0, // Tipo di brush (0 = circolare, 1 = quadrato, 2 = noise)
  brushSpeed: 0.5, // Velocità di animazione del brush
  brushPulse: 0.0, // Pulsazione del brush (0 = nessuna, 1 = massima)
  brushTrail: 0.0, // Scia del brush (0 = nessuna, 1 = massima)
  brushRotation: 0.0, // Rotazione del brush
  brushColor: 1.0, // Colore del brush (0 = nero, 1 = bianco)
  brushBlendMode: 0, // Modalità di fusione (0 = normale, 1 = additivo, 2 = sottrattivo)
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
  uniform float threshold;
  uniform float noiseAmount;
  uniform float noiseScale;
  uniform float time;
  uniform vec2 mousePos;
  uniform bool blurLayer;
  uniform bool noiseLayer;
  // Nuovi uniform per il brush
  uniform float brushHardness;
  uniform float brushIntensity;
  uniform float brushScale;
  uniform int brushType;
  uniform float brushSpeed;
  uniform float brushPulse;
  uniform float brushTrail;
  uniform float brushRotation;
  uniform float brushColor;
  uniform int brushBlendMode;
  varying vec2 vUv;

  // Funzione per ruotare un punto
  vec2 rotatePoint(vec2 point, vec2 center, float angle) {
    float s = sin(angle);
    float c = cos(angle);
    vec2 p = point - center;
    return vec2(
      p.x * c - p.y * s,
      p.x * s + p.y * c
    ) + center;
  }

  // Funzione per calcolare la distanza dal mouse con effetti
  float getBrushDistance(vec2 uv, vec2 mousePos) {
    // Applica la rotazione
    vec2 rotatedUV = rotatePoint(uv, mousePos, brushRotation);
    vec2 rotatedMouse = mousePos;
    
    // Calcola la distanza base
    float dist = length(rotatedUV - rotatedMouse);
    
    // Applica la scala
    dist = dist / brushScale;
    
    // Applica il tipo di brush
    if (brushType == 1) { // Quadrato
      vec2 diff = abs(rotatedUV - rotatedMouse);
      dist = max(diff.x, diff.y) / brushScale;
    } else if (brushType == 2) { // Noise
      float noise = snoise(rotatedUV * 10.0 + time * brushSpeed) * 0.5 + 0.5;
      dist = dist - noise * 0.2;
    }
    
    // Applica la pulsazione
    float pulse = sin(time * brushSpeed * 5.0) * 0.5 + 0.5;
    dist = dist - pulse * brushPulse * 0.1;
    
    // Applica la scia
    if (brushTrail > 0.0) {
      float trail = snoise(vec2(time * brushSpeed, dist * 10.0)) * brushTrail;
      dist = dist - trail * 0.1;
    }
    
    return dist;
  }

  void main() {
    vec2 uv = vUv;
    vec4 color = vec4(0.0);
    float total = 0.0;
    
    // Calcola la distanza dal mouse con gli effetti del brush
    float distToMouse = getBrushDistance(uv, mousePos);
    
    // Calcola l'intensità del brush con durezza
    float brushIntensityFactor = 1.0 - smoothstep(0.0, 0.2 * (1.0 - brushHardness * 0.9), distToMouse);
    brushIntensityFactor = pow(brushIntensityFactor, 1.0 + brushHardness * 2.0);
    brushIntensityFactor *= brushIntensity;
    
    // Calcola l'intensità del blur in base alla distanza dal mouse
    float blurIntensity = 0.0;
    
    // Se il layer blur è attivo
    if (blurLayer) {
      // Se amount è 0, non c'è blur base
      if (amount > 0.0) {
        // Aggiungi il blur base
        blurIntensity = amount;
      }
      
      // Aggiungi il blur massimo quando il mouse passa sopra
      float mouseBlur = maxBlurAmount * brushIntensityFactor;
      blurIntensity = max(blurIntensity, mouseBlur);
    }
    
    // Applica il blur orizzontale se l'intensità è maggiore di 0
    if (blurIntensity > 0.0) {
      for(float i = -4.0; i <= 4.0; i++) {
        float weight = 1.0 - abs(i) / 4.0;
        vec2 offset = vec2(i * blurIntensity, 0.0);
        color += texture2D(tDiffuse, uv + offset) * weight;
        total += weight;
      }
      color = color / total;
    } else {
      color = texture2D(tDiffuse, uv);
    }
    
    // Aggiungi il noise base se il layer è attivo
    if (noiseLayer) {
      float noise = snoise(uv * noiseScale + time) * noiseAmount;
      color.rgb += noise;
    }

  // Applica il threshold
    float brightness = (color.r + color.g + color.b) / 3.0;
    float t = step(threshold, brightness);
    
    // Imposta l'alpha in base al threshold
    // I pixel neri (sotto la soglia) diventano trasparenti
    float alpha = t;
    
    // Output finale con alpha
    gl_FragColor = vec4(vec3(t), alpha);
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
  textureLoader.load("assets/type.jpg", function (texture) {
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
        threshold: { value: params.threshold },
        noiseAmount: { value: params.noiseAmount },
        noiseScale: { value: params.noiseScale },
        time: { value: 0.0 },
        mousePos: { value: new THREE.Vector2(0.5, 0.5) },
        blurLayer: { value: params.blurLayer },
        noiseLayer: { value: params.noiseLayer },
        // Nuovi uniform per il brush
        brushHardness: { value: params.brushHardness },
        brushIntensity: { value: params.brushIntensity },
        brushScale: { value: params.brushScale },
        brushType: { value: params.brushType },
        brushSpeed: { value: params.brushSpeed },
        brushPulse: { value: params.brushPulse },
        brushTrail: { value: params.brushTrail },
        brushRotation: { value: params.brushRotation },
        brushColor: { value: params.brushColor },
        brushBlendMode: { value: params.brushBlendMode },
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
  // Threshold control
  const thresholdSlider = document.getElementById("threshold");
  const thresholdValue = document.getElementById("threshold-value");
  thresholdSlider.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById("threshold-value").textContent = value.toFixed(2);
    material.uniforms.threshold.value = value;
  });

  // Blur Layer control
  const blurLayerCheckbox = document.getElementById("blur-layer");
  blurLayerCheckbox.addEventListener("change", (e) => {
    params.blurLayer = e.target.checked;
    if (material) material.uniforms.blurLayer.value = params.blurLayer;
  });

  // Blur Amount control
  const blurAmountSlider = document.getElementById("blur-amount");
  const blurAmountValue = document.getElementById("blur-amount-value");
  blurAmountSlider.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById("blur-amount-value").textContent = value.toFixed(3);
    material.uniforms.amount.value = value;
  });

  // Max Blur Amount control
  const maxBlurAmountSlider = document.getElementById("max-blur-amount");
  const maxBlurAmountValue = document.getElementById("max-blur-amount-value");
  maxBlurAmountSlider.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById("max-blur-amount-value").textContent =
      value.toFixed(2);
    material.uniforms.maxBlurAmount.value = value;
  });

  // Noise Layer control
  const noiseLayerCheckbox = document.getElementById("noise-layer");
  noiseLayerCheckbox.addEventListener("change", (e) => {
    params.noiseLayer = e.target.checked;
    if (material) material.uniforms.noiseLayer.value = params.noiseLayer;
  });

  // Noise Amount control
  const noiseAmountSlider = document.getElementById("noise-amount");
  const noiseAmountValue = document.getElementById("noise-amount-value");
  noiseAmountSlider.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById("noise-amount-value").textContent =
      value.toFixed(2);
    material.uniforms.noiseAmount.value = value;
  });

  // Noise Scale control
  const noiseScaleSlider = document.getElementById("noise-scale");
  const noiseScaleValue = document.getElementById("noise-scale-value");
  noiseScaleSlider.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById("noise-scale-value").textContent = value.toFixed(0);
    material.uniforms.noiseScale.value = value;
  });

  // Noise Speed control
  const noiseSpeedSlider = document.getElementById("noise-speed");
  const noiseSpeedValue = document.getElementById("noise-speed-value");
  noiseSpeedSlider.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById("noise-speed-value").textContent = value.toFixed(3);
    params.noiseSpeed = value;
  });

  // Background Layer control
  const backgroundLayerCheckbox = document.getElementById("background-layer");
  backgroundLayerCheckbox.addEventListener("change", (e) => {
    params.backgroundLayer = e.target.checked;
    if (backgroundImage) {
      backgroundImage.visible = params.backgroundLayer;
    }
  });

  // Brush Hardness control
  const brushHardnessSlider = document.getElementById("brush-hardness");
  const brushHardnessValue = document.getElementById("brush-hardness-value");
  brushHardnessSlider.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById("brush-hardness-value").textContent =
      value.toFixed(2);
    material.uniforms.brushHardness.value = value;
  });

  // Brush Intensity control
  const brushIntensitySlider = document.getElementById("brush-intensity");
  const brushIntensityValue = document.getElementById("brush-intensity-value");
  brushIntensitySlider.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById("brush-intensity-value").textContent =
      value.toFixed(2);
    material.uniforms.brushIntensity.value = value;
  });

  // Brush Scale control
  const brushScaleSlider = document.getElementById("brush-scale");
  const brushScaleValue = document.getElementById("brush-scale-value");
  brushScaleSlider.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById("brush-scale-value").textContent = value.toFixed(2);
    material.uniforms.brushScale.value = value;
  });

  // Brush Type control
  const brushTypeSelect = document.getElementById("brush-type");
  brushTypeSelect.addEventListener("change", (e) => {
    const value = parseInt(e.target.value);
    material.uniforms.brushType.value = value;
  });

  // Brush Speed control
  const brushSpeedSlider = document.getElementById("brush-speed");
  const brushSpeedValue = document.getElementById("brush-speed-value");
  brushSpeedSlider.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById("brush-speed-value").textContent = value.toFixed(2);
    material.uniforms.brushSpeed.value = value;
  });

  // Brush Pulse control
  const brushPulseSlider = document.getElementById("brush-pulse");
  const brushPulseValue = document.getElementById("brush-pulse-value");
  brushPulseSlider.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById("brush-pulse-value").textContent = value.toFixed(2);
    material.uniforms.brushPulse.value = value;
  });

  // Brush Trail control
  const brushTrailSlider = document.getElementById("brush-trail");
  const brushTrailValue = document.getElementById("brush-trail-value");
  brushTrailSlider.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById("brush-trail-value").textContent = value.toFixed(2);
    material.uniforms.brushTrail.value = value;
  });

  // Brush Rotation control
  const brushRotationSlider = document.getElementById("brush-rotation");
  const brushRotationValue = document.getElementById("brush-rotation-value");
  brushRotationSlider.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById("brush-rotation-value").textContent =
      value.toFixed(2);
    material.uniforms.brushRotation.value = value;
  });

  // Brush Color control
  const brushColorSlider = document.getElementById("brush-color");
  const brushColorValue = document.getElementById("brush-color-value");
  brushColorSlider.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById("brush-color-value").textContent = value.toFixed(2);
    material.uniforms.brushColor.value = value;
  });

  // Brush Blend Mode control
  const brushBlendModeSelect = document.getElementById("brush-blend-mode");
  brushBlendModeSelect.addEventListener("change", (e) => {
    const value = parseInt(e.target.value);
    material.uniforms.brushBlendMode.value = value;
  });
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
    material.uniforms.time.value += params.noiseSpeed;
    material.uniforms.mousePos.value.set(mouseX, mouseY);
  }

  renderer.render(scene, camera);
}

setup();
animate();
