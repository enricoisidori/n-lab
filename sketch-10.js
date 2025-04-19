let scene, camera, renderer;
let image, material;
let guidesImage, guidesMaterial;
let mouseX = 0,
  mouseY = 0;
let imageAspectRatio = 1.0;
let guidesAspectRatio = 1.0;

// Parametri semplificati
let params = {
  brushSize: 0.1,
  brushHardness: 0.5,
  brushOpacity: 1.0,
  brushActive: true,
  threshold: 0.5,
  blurAmount: 0.01,
};

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Shader semplice per TYPES.jpg (sempre visibile)
const fragmentShader = `
  uniform sampler2D tDiffuse;
  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;
    vec4 color = texture2D(tDiffuse, uv);
    color.a = 1.0; // Sempre visibile
    gl_FragColor = color;
  }
`;

// Shader per guides.jpg (visibile solo con il brush)
const guidesFragmentShader = `
  uniform sampler2D tDiffuse;
  uniform vec2 mousePos;
  uniform float brushSize;
  uniform float brushHardness;
  uniform float brushOpacity;
  uniform bool brushActive;
  uniform float threshold;
  uniform float blurAmount;
  varying vec2 vUv;

  // Funzione per applicare il blur
  vec4 applyBlur(vec2 uv, float amount) {
    vec4 color = vec4(0.0);
    float total = 0.0;
    
    // Kernel 5x5 per il blur
    for (int i = -2; i <= 2; i++) {
      for (int j = -2; j <= 2; j++) {
        vec2 offset = vec2(float(i), float(j)) * amount;
        float weight = 1.0 / (1.0 + float(i*i + j*j));
        color += texture2D(tDiffuse, uv + offset) * weight;
        total += weight;
      }
    }
    
    return color / total;
  }

  void main() {
    vec2 uv = vUv;
    vec4 color = texture2D(tDiffuse, uv);
    
    // Applica il threshold
    float brightness = (color.r + color.g + color.b) / 3.0;
    if (brightness > threshold) {
      // Applica il blur sopra il threshold
      color = applyBlur(uv, blurAmount);
    }
    
    // Calcola la distanza dal mouse
    float dist = distance(uv, mousePos);
    
    // Crea la maschera del brush
    float mask = 0.0;
    if (brushActive && dist < brushSize) {
      // Calcola la transizione del brush
      float t = 1.0 - (dist / brushSize);
      // Applica la durezza del brush
      t = pow(t, brushHardness * 10.0);
      mask = t * brushOpacity;
    }
    
    // Applica la maschera all'immagine
    color.a = mask;
    
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
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  document.body.appendChild(renderer.domElement);

  // Carica l'immagine principale (TYPES.jpg)
  const textureLoader = new THREE.TextureLoader();
  textureLoader.load("assets/TYPES.jpg", function (texture) {
    // Assicurati che la texture sia caricata alla massima risoluzione
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    // Calcola il rapporto d'aspetto dell'immagine
    imageAspectRatio = texture.image.width / texture.image.height;

    // Crea il materiale con gli shader
    material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: texture },
      },
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      transparent: true,
      blending: THREE.NormalBlending,
    });

    // Crea la geometria e la mesh con dimensioni fisse basate sul rapporto d'aspetto
    const width = 2.0;
    const height = width / imageAspectRatio;
    const geometry = new THREE.PlaneGeometry(width, height);
    image = new THREE.Mesh(geometry, material);
    scene.add(image);
  });

  // Carica l'immagine guides
  const guidesTextureLoader = new THREE.TextureLoader();
  guidesTextureLoader.load("assets/guides.jpg", function (texture) {
    // Assicurati che la texture sia caricata alla massima risoluzione
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    // Calcola il rapporto d'aspetto dell'immagine
    guidesAspectRatio = texture.image.width / texture.image.height;

    // Crea il materiale con gli shader per la maschera
    guidesMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: texture },
        mousePos: { value: new THREE.Vector2(0.5, 0.5) },
        brushSize: { value: params.brushSize },
        brushHardness: { value: params.brushHardness },
        brushOpacity: { value: params.brushOpacity },
        brushActive: { value: params.brushActive },
        threshold: { value: params.threshold },
        blurAmount: { value: params.blurAmount },
      },
      vertexShader: vertexShader,
      fragmentShader: guidesFragmentShader,
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
      depthTest: false,
    });

    // Crea la geometria e la mesh con dimensioni fisse basate sul rapporto d'aspetto
    const width = 2.0;
    const height = width / guidesAspectRatio;
    const geometry = new THREE.PlaneGeometry(width, height);
    guidesImage = new THREE.Mesh(geometry, guidesMaterial);
    guidesImage.position.z = 0.05; // Posiziona l'immagine guides sopra TYPES.jpg
    scene.add(guidesImage);
  });

  // Event listeners
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("resize", onWindowResize);
  setupControls();
}

function setupControls() {
  // Aggiungi controlli per il brush
  const brushControls = document.createElement("div");
  brushControls.className = "control-group";
  brushControls.innerHTML = `
    <h3>Brush Controls</h3>
    <label>
      <input type="checkbox" id="brush-active" checked />
      Enable Brush
    </label>
    <label for="brush-size">Brush Size:</label>
    <input
      type="range"
      id="brush-size"
      min="0.01"
      max="0.5"
      step="0.01"
      value="0.1"
    />
    <div class="value-display">
      Value: <span id="brush-size-value">0.1</span>
    </div>
    <label for="brush-hardness">Brush Hardness:</label>
    <input
      type="range"
      id="brush-hardness"
      min="0.1"
      max="1.0"
      step="0.1"
      value="0.5"
    />
    <div class="value-display">
      Value: <span id="brush-hardness-value">0.5</span>
    </div>
    <label for="brush-opacity">Brush Opacity:</label>
    <input
      type="range"
      id="brush-opacity"
      min="0.1"
      max="1.0"
      step="0.1"
      value="1.0"
    />
    <div class="value-display">
      Value: <span id="brush-opacity-value">1.0</span>
    </div>
    <label for="threshold">Threshold:</label>
    <input
      type="range"
      id="threshold"
      min="0.0"
      max="1.0"
      step="0.05"
      value="0.5"
    />
    <div class="value-display">
      Value: <span id="threshold-value">0.5</span>
    </div>
    <label for="blur-amount">Blur Amount:</label>
    <input
      type="range"
      id="blur-amount"
      min="0.0"
      max="0.05"
      step="0.001"
      value="0.01"
    />
    <div class="value-display">
      Value: <span id="blur-amount-value">0.01</span>
    </div>
  `;

  document.getElementById("controls").appendChild(brushControls);

  // Brush Active control
  const brushActiveCheckbox = document.getElementById("brush-active");
  if (brushActiveCheckbox) {
    brushActiveCheckbox.checked = true; // Attiva il brush di default
    params.brushActive = true;
    brushActiveCheckbox.addEventListener("change", (e) => {
      params.brushActive = e.target.checked;
      if (guidesMaterial)
        guidesMaterial.uniforms.brushActive.value = params.brushActive;
    });
  }

  // Brush Size control
  const brushSizeSlider = document.getElementById("brush-size");
  const brushSizeValue = document.getElementById("brush-size-value");
  if (brushSizeSlider && brushSizeValue) {
    brushSizeSlider.value = params.brushSize;
    brushSizeValue.textContent = params.brushSize.toFixed(2);
    brushSizeSlider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      document.getElementById("brush-size-value").textContent =
        value.toFixed(2);
      params.brushSize = value;
      if (guidesMaterial) guidesMaterial.uniforms.brushSize.value = value;
    });
  }

  // Brush Hardness control
  const brushHardnessSlider = document.getElementById("brush-hardness");
  const brushHardnessValue = document.getElementById("brush-hardness-value");
  if (brushHardnessSlider && brushHardnessValue) {
    brushHardnessSlider.value = params.brushHardness;
    brushHardnessValue.textContent = params.brushHardness.toFixed(1);
    brushHardnessSlider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      document.getElementById("brush-hardness-value").textContent =
        value.toFixed(1);
      params.brushHardness = value;
      if (guidesMaterial) guidesMaterial.uniforms.brushHardness.value = value;
    });
  }

  // Brush Opacity control
  const brushOpacitySlider = document.getElementById("brush-opacity");
  const brushOpacityValue = document.getElementById("brush-opacity-value");
  if (brushOpacitySlider && brushOpacityValue) {
    brushOpacitySlider.value = params.brushOpacity;
    brushOpacityValue.textContent = params.brushOpacity.toFixed(1);
    brushOpacitySlider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      document.getElementById("brush-opacity-value").textContent =
        value.toFixed(1);
      params.brushOpacity = value;
      if (guidesMaterial) guidesMaterial.uniforms.brushOpacity.value = value;
    });
  }

  // Threshold control
  const thresholdSlider = document.getElementById("threshold");
  const thresholdValue = document.getElementById("threshold-value");
  if (thresholdSlider && thresholdValue) {
    thresholdSlider.value = params.threshold;
    thresholdValue.textContent = params.threshold.toFixed(2);
    thresholdSlider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      document.getElementById("threshold-value").textContent = value.toFixed(2);
      params.threshold = value;
      if (guidesMaterial) guidesMaterial.uniforms.threshold.value = value;
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
      params.blurAmount = value;
      if (guidesMaterial) guidesMaterial.uniforms.blurAmount.value = value;
    });
  }
}

function onMouseMove(event) {
  // Converti le coordinate del mouse in coordinate UV (0-1)
  mouseX = event.clientX / window.innerWidth;
  mouseY = 1.0 - event.clientY / window.innerHeight; // Inverti Y per corrispondere alle coordinate UV

  // Aggiorna la posizione del mouse per il brush
  if (guidesMaterial) {
    guidesMaterial.uniforms.mousePos.value.set(mouseX, mouseY);
  }
}

function onWindowResize() {
  // Aggiorna solo il renderer, non le dimensioni dell'immagine
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

setup();
animate();
