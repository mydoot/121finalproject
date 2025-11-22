import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";

// 1. Define the async starter
async function runGame() {
  // --- CRITICAL STEP ---
  // You must wait for this promise to resolve before doing ANYTHING else.
  await RAPIER.init();
  // ---------------------

  console.log("Rapier is ready. Starting game...");

  // 2. NOW it is safe to create the world
  const gravity = { x: 0.0, y: -9.81, z: 0.0 };
  const world = new RAPIER.World(gravity);

  // 3. Setup Three.js Scene
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    75,
    globalThis.innerWidth / globalThis.innerHeight,
    0.1,
    1000,
  );
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(globalThis.innerWidth, globalThis.innerHeight);
  document.body.appendChild(renderer.domElement);

  // 4. Start your loop ONLY after everything is ready
  function animate() {
    requestAnimationFrame(animate);
    world.step(); // Physics step
    renderer.render(scene, camera);
  }

  animate();
}

// 5. Execute the function
runGame();
