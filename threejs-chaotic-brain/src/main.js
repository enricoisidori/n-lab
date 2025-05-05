import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
camera.position.z = 150;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);
const finalScene = new THREE.Scene();
const finalCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const shaderMaterial = new THREE.ShaderMaterial({
  uniforms: {
    tDiffuse: { value: renderTarget.texture },
    uThreshold: { value: false },
    uMosaic: { value: false },
    uTime: { value: 0.0 }
  },
  vertexShader: \`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  \`,
  fragmentShader: \`
    uniform sampler2D tDiffuse;
    uniform bool uThreshold;
    uniform bool uMosaic;
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      vec4 color = texture2D(tDiffuse, uv);

      if (uMosaic) {
        float size = 0.01 + 0.02 * abs(sin(uTime * 0.5));
        uv = floor(uv / size) * size;
        color = texture2D(tDiffuse, uv);
      }

      if (uThreshold) {
        float avg = (color.r + color.g + color.b) / 3.0;
        color = avg > 0.5 ? vec4(1.0) : vec4(0.0);
      }

      gl_FragColor = color;
    }
  \`
});

const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), shaderMaterial);
finalScene.add(quad);

// Elementi dinamici
const textGroup = new THREE.Group();
scene.add(textGroup);

const baseObjects = [];
const loader = new FontLoader();
loader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', font => {
  for (let i = 0; i < 80; i++) {
    const number = (Math.random() * 5).toFixed(4);
    const phrase = "Brain Computation Power extracted: " + number + " exaFLOPs";
    const textGeo = new TextGeometry(phrase, {
      font,
      size: 2 + Math.random(),
      height: 0.2,
    });
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const mesh = new THREE.Mesh(textGeo, mat);
    mesh.position.set(
      (Math.random() - 0.5) * 100,
      (Math.random() - 0.5) * 100,
      (Math.random() - 0.5) * 100
    );
    mesh.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    textGroup.add(mesh);
    baseObjects.push(mesh);
  }
});

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  // Ritmo pulsante + caos crescente
  const scaleFactor = 1 + 0.5 * Math.sin(t * Math.PI * 2 / 30);
  textGroup.scale.set(scaleFactor, scaleFactor, scaleFactor);

  baseObjects.forEach((obj, i) => {
    if (Math.random() < 0.01 * Math.min(10, t)) {
      obj.visible = Math.random() > 0.5;
    }
    obj.rotation.x += 0.001 + 0.002 * Math.sin(t + i);
    obj.rotation.y += 0.002 + 0.002 * Math.cos(t + i);
  });

  // Shader update
  shaderMaterial.uniforms.uTime.value = t;

  // Render pass 1: scene
  renderer.setRenderTarget(renderTarget);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);

  // Render pass 2: post-processing
  renderer.render(finalScene, finalCamera);
}

animate();

// UI toggle
document.getElementById("thresholdToggle").addEventListener("change", (e) => {
  shaderMaterial.uniforms.uThreshold.value = e.target.checked;
});
document.getElementById("mosaicToggle").addEventListener("change", (e) => {
  shaderMaterial.uniforms.uMosaic.value = e.target.checked;
});

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  shaderMaterial.uniforms.tDiffuse.value = renderTarget.texture;
});
