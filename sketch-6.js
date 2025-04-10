let scene, camera, renderer;
let image, material;
let mouseX = 0,
  mouseY = 0;

// Parametri controllati dagli slider
let params = {
  threshold: 0.5,
  noiseAmount: 0.05,
  noiseScale: 5.0,
  noiseSpeed: 0.005,
  blurAmount: 0.01,
  maxBlurAmount: 0.05,
  brightNoiseAmount: 0.1,
  brightNoiseScale: 10.0,
  lightIntensity: 0.2,
  lightRadius: 0.2,
  // Layer visibility - tutti disattivati di default
  blurLayer: true, // Manteniamo il blur layer attivo per l'effetto mouse
  noiseLayer: false,
  brightNoiseLayer: false,
  mouseLightLayer: false,
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
  uniform float brightNoiseAmount;
  uniform float brightNoiseScale;
  uniform float lightIntensity;
  uniform float lightRadius;
  uniform vec2 mousePos;
  uniform bool blurLayer;
  uniform bool noiseLayer;
  uniform bool brightNoiseLayer;
  uniform bool mouseLightLayer;
  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;
    vec4 color = vec4(0.0);
    float total = 0.0;
    
    // Calcola la distanza dal mouse
    float distToMouse = length(uv - mousePos);
    
    // Calcola l'intensità del blur in base alla distanza dal mouse
    // Se amount è 0, non c'è blur base, ma c'è ancora il blur massimo quando il mouse passa sopra
    float blurIntensity = 0.0;
    
    // Se il layer blur è attivo
    if (blurLayer) {
      // Se amount è 0, non c'è blur base
      if (amount > 0.0) {
        // Aggiungi il blur base
        blurIntensity = amount;
      }
      
      // Aggiungi il blur massimo quando il mouse passa sopra
      float mouseBlur = maxBlurAmount * (1.0 - smoothstep(0.0, lightRadius, distToMouse));
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
    
    // Aggiungi il noise chiaro se il layer è attivo
    if (brightNoiseLayer) {
      float brightNoise = snoise(uv * brightNoiseScale + time * 2.0) * brightNoiseAmount;
      color.rgb += brightNoise;
    }
    
    // Aggiungi l'effetto di luce radiale se il layer è attivo
    if (mouseLightLayer) {
      float light = smoothstep(lightRadius, 0.0, distToMouse) * lightIntensity;
      color.rgb += light;
    }
    
    // Applica il threshold
    float brightness = (color.r + color.g + color.b) / 3.0;
    float t = step(threshold, brightness);
    gl_FragColor = vec4(vec3(t), 1.0);
  }
`;

function init() {
  // Setup scene
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 1;

  // Setup renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Carica l'immagine
  const textureLoader = new THREE.TextureLoader();
  textureLoader.load("assets/type.jpg", function (texture) {
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
        brightNoiseAmount: { value: params.brightNoiseAmount },
        brightNoiseScale: { value: params.brightNoiseScale },
        lightIntensity: { value: params.lightIntensity },
        lightRadius: { value: params.lightRadius },
        mousePos: { value: new THREE.Vector2(0.5, 0.5) },
        blurLayer: { value: params.blurLayer },
        noiseLayer: { value: params.noiseLayer },
        brightNoiseLayer: { value: params.brightNoiseLayer },
        mouseLightLayer: { value: params.mouseLightLayer },
      },
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
    });

    // Crea la geometria e la mesh
    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
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

  // Bright Noise Layer control
  const brightNoiseLayerCheckbox =
    document.getElementById("bright-noise-layer");
  brightNoiseLayerCheckbox.addEventListener("change", (e) => {
    params.brightNoiseLayer = e.target.checked;
    if (material)
      material.uniforms.brightNoiseLayer.value = params.brightNoiseLayer;
  });

  // Bright Noise Amount control
  const brightNoiseAmountSlider = document.getElementById(
    "bright-noise-amount"
  );
  const brightNoiseAmountValue = document.getElementById(
    "bright-noise-amount-value"
  );
  brightNoiseAmountSlider.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById("bright-noise-amount-value").textContent =
      value.toFixed(2);
    material.uniforms.brightNoiseAmount.value = value;
  });

  // Bright Noise Scale control
  const brightNoiseScaleSlider = document.getElementById("bright-noise-scale");
  const brightNoiseScaleValue = document.getElementById(
    "bright-noise-scale-value"
  );
  brightNoiseScaleSlider.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById("bright-noise-scale-value").textContent =
      value.toFixed(0);
    material.uniforms.brightNoiseScale.value = value;
  });

  // Mouse Light Layer control
  const mouseLightLayerCheckbox = document.getElementById("mouse-light-layer");
  mouseLightLayerCheckbox.addEventListener("change", (e) => {
    params.mouseLightLayer = e.target.checked;
    if (material)
      material.uniforms.mouseLightLayer.value = params.mouseLightLayer;
  });

  // Light Intensity control
  const lightIntensitySlider = document.getElementById("light-intensity");
  const lightIntensityValue = document.getElementById("light-intensity-value");
  lightIntensitySlider.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById("light-intensity-value").textContent =
      value.toFixed(2);
    material.uniforms.lightIntensity.value = value;
  });

  // Light Radius control
  const lightRadiusSlider = document.getElementById("light-radius");
  const lightRadiusValue = document.getElementById("light-radius-value");
  lightRadiusSlider.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    document.getElementById("light-radius-value").textContent =
      value.toFixed(2);
    material.uniforms.lightRadius.value = value;
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

init();
animate();
