let scene, camera, renderer;
let image, material;
let mouseX = 0,
  mouseY = 0;
let targetX = 0,
  targetY = 0;

// Shader per l'effetto blur e threshold
const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D tDiffuse;
  uniform float amount;
  uniform vec2 direction;
  uniform float threshold;
  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;
    vec4 color = vec4(0.0);
    float total = 0.0;
    
    // Applica il blur in entrambe le direzioni
    for(float i = -4.0; i <= 4.0; i++) {
      float weight = 1.0 - abs(i) / 4.0;
      vec2 offset = vec2(
        i * amount * direction.x,
        i * amount * direction.y
      );
      color += texture2D(tDiffuse, uv + offset) * weight;
      total += weight;
    }
    
    color = color / total;
    
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
        amount: { value: 0.0 },
        direction: { value: new THREE.Vector2(0.0, 0.0) },
        threshold: { value: 0.5 }, // Valore iniziale del threshold
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
}

function onMouseMove(event) {
  mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  mouseY = -((event.clientY / window.innerHeight) * 2 - 1); // Inverti Y per corrispondere alle coordinate OpenGL
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  // Smooth mouse movement
  targetX = mouseX;
  targetY = mouseY;
  if (material) {
    material.uniforms.direction.value.set(targetX, targetY);
    material.uniforms.amount.value =
      Math.max(Math.abs(targetX), Math.abs(targetY)) * 0.02;
  }

  renderer.render(scene, camera);
}

init();
animate();
