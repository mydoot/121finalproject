import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import levelUrl from "./level.glb?url";

// Function to load a GLB Level
async function loadLevel(scene, world, url) {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  const levelMesh = gltf.scene;

  // 1. Add Visuals to Scene
  scene.add(levelMesh);

  // 2. FORCE Three.js to calculate the final positions/scales of everything right now
  levelMesh.updateMatrixWorld(true);

  // 1. Find the object by the exact name you used in Blender
  const jumpPad = levelMesh.getObjectByName("JumpPad");
  const goal = levelMesh.getObjectByName("Goal");

  if (jumpPad) {
    // 1. Create Body & Collider
    const targetPos = new THREE.Vector3();
    jumpPad.getWorldPosition(targetPos);

    const padBodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(targetPos.x, targetPos.y, targetPos.z);
    const padBody = world.createRigidBody(padBodyDesc);


    const padColliderDesc = RAPIER.ColliderDesc.cylinder(0.5, 2)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);


    const padCollider = world.createCollider(padColliderDesc, padBody);

    // 2. "Tag" the collider so we can recognize it later
    // We can attach custom properties directly to the Rapier object in JS
    padCollider.interactionType = 'jumppad';
  } else {
    console.log("doesn't exist!");
  }

  if (goal) {
    // 1. Create Body & Collider
    const targetPos = new THREE.Vector3();
    goal.getWorldPosition(targetPos);

    const goalBodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(targetPos.x, targetPos.y, targetPos.z);
    const goalBody = world.createRigidBody(goalBodyDesc);


    const goalCollsiderDesc = RAPIER.ColliderDesc.cylinder(0.5, 2)
      .setSensor(true)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);


    const goalCollider = world.createCollider(goalCollsiderDesc, goalBody);

    // 2. "Tag" the collider so we can recognize it later
    // We can attach custom properties directly to the Rapier object in JS
    goalCollider.interactionType = 'goal';
  } else {
    console.log("doesn't exist!");
  }

  levelMesh.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;

      if (child.name === "JumpPad") return;

      // --- PHYSICS GENERATION (FIXED) ---

      // A. Create a Fixed Body at (0,0,0)
      // Since we are baking coordinates into World Space, the body stays at 0.
      const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed();
      const rigidBody = world.createRigidBody(rigidBodyDesc);

      // B. Clone the geometry so we don't mess up the visual mesh
      const clonedGeometry = child.geometry.clone();

      // C. BAKE the transformations (Scale, Rotation, Position)
      // This turns local coordinates (relative to parent) into World Coordinates (absolute)
      clonedGeometry.applyMatrix4(child.matrixWorld);

      // D. Extract the transformed vertices
      const vertices = clonedGeometry.attributes.position.array;

      // E. Handle Indices (Safety Check from before)
      let indices;
      if (clonedGeometry.index) {
        indices = clonedGeometry.index.array;
      } else {
        const vertexCount = clonedGeometry.attributes.position.count;
        indices = new Uint32Array(vertexCount);
        for (let i = 0; i < vertexCount; i++) indices[i] = i;
      }

      // F. Create the Collider
      const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices);
      world.createCollider(colliderDesc, rigidBody);
    }
  });
}

function createGameUI(renderer) {
  // 1. Create a "Wrapper" to hold everything
  // We attach this to the body, and move the renderer inside it
  const gameContainer = document.createElement('div');
  gameContainer.style.position = 'relative';
  gameContainer.style.width = '100%';
  gameContainer.style.height = '100%';
  document.body.appendChild(gameContainer);

  // Move the existing 3D Canvas into this wrapper
  gameContainer.appendChild(renderer.domElement);

  // 2. Create the UI Overlay Layer
  const uiLayer = document.createElement('div');
  Object.assign(uiLayer.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none', // CRITICAL: Lets clicks pass through to the game
    display: 'flex',
    justifyContent: 'space-between', // Spreads items (Score Left, Button Right)
    alignItems: 'flex-start',
    padding: '20px',
    boxSizing: 'border-box'

  });
  gameContainer.appendChild(uiLayer);


  // 4. Create the Restart Button
  const restartBtn = document.createElement('button');
  restartBtn.innerText = "Restart Level";
  Object.assign(restartBtn.style, {
    pointerEvents: 'auto',
    cursor: 'pointer',
    padding: '10px 10px',
    fontSize: '20px',
    fontWeight: 'bold',
    backgroundColor: '#6de9ffff',
    color: 'white',
    border: '2px solid white',
    borderRadius: '8px',
    boxShadow: '2px 2px 5px rgba(0,0,0,0.5)'
  });

  // Add Hover Effect logic
  restartBtn.onmouseover = () => restartBtn.style.backgroundColor = '#0067acff';
  restartBtn.onmouseout = () => restartBtn.style.backgroundColor = '#6de9ffff';

  // Add Click Logic
  restartBtn.onclick = () => {
    console.log("Restart Clicked!");
    globalThis.location.reload(); // Simple way to restart
  };

  uiLayer.appendChild(restartBtn);

  const levelFinishUI = document.createElement('div');
  levelFinishUI.innerText = "Completed Level";
  Object.assign(levelFinishUI.style, {
    position: 'relative',
    right: '500px',
    top: '345px',
    color: 'white',
    fontFamily: 'Arial, sans-serif',
    fontSize: '100px',
    fontWeight: 'bold',
    backgroundColor: '#2afde19f',
    textShadow: '2px 2px 0 #000', // Black outline for readability
    userSelect: 'none' // Don't let user highlight the text
  });
  uiLayer.appendChild(levelFinishUI);

  // 5. Return references so we can update them later
  return {
    levelFinishUI,
    restartBtn
  };
}

// Classes
class Sphere extends THREE.Mesh {
  constructor({ width, height, depth }) {
    super(
      new THREE.SphereGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({ color: 0xffff00 }),
    );
    this.height = 3;
  }
}

class Player extends Sphere {
  #movementSpeed;

  constructor({ width, height, depth, speed, rigidBody, world }) {
    super(width, height, depth);
    this.world = world;
    this.#movementSpeed = speed;
    this.body = rigidBody;
  }

  move(x, z) {
    const impulse = {
      x: x * this.#movementSpeed,
      y: 0,
      z: z * this.#movementSpeed,
    };

    this.body.setLinearDamping(2.0);
    this.body.applyImpulse(impulse, true);
  }

  jump() {
    // Jump is using raycasts
    const translation = this.body.translation();
    const origin = { x: translation.x, y: translation.y, z: translation.z };

    const direction = { x: 0, y: -1, z: 0 };
    const ray = new RAPIER.Ray(origin, direction);

    const maxToi = 1.1;
    const solid = true;

    const hit = this.world.castRay(
      ray,
      maxToi,
      solid,
      0xffffffff, // Default groups (hit everything)
      null,
      null,
      this.body, // ray ignores player body
    );

    if (hit) {
      this.body.setLinearDamping(0.1);
      this.body.applyImpulse({ x: 0, y: 35, z: 0 }, true);
    }
  }
}

class Command {
  execute(actor) {
    return actor;
  }
}

class JumpCommand extends Command {
  execute(actor) {
    actor.jump();
  }
}

class MoveCommand extends Command {
  constructor(x, z) {
    super();
    this.x = x;
    this.z = z;
  }
  execute(actor) {
    actor.move(this.x, this.z);
  }
}

class InputHandler {
  constructor() {
    this.keys = new Set(); // Stores 'w', 'a', 's', 'd'

    //These event listeners are always listening once InputHandler object is created in runGame()
    //Whenever a key is pressed, add it to this.keys
    globalThis.addEventListener("keydown", (e) => this.keys.add(e.code));
    globalThis.addEventListener("keyup", (e) => this.keys.delete(e.code));
  }

  isPressed(key, check) {
    return (key == check) ? true : false;
  }

  //Below is ran every frame in animate(). If this.keys has a keycode when Input() is ran, performs a command
  Input() {
    let x = 0;
    let z = 0;

    if (this.keys.has("KeyW")) {
      z -= 1;
    }
    if (this.keys.has("KeyA")) {
      x -= 1;
    }
    if (this.keys.has("KeyS")) {
      z += 1;
    }
    if (this.keys.has("KeyD")) {
      x += 1;
    }
    if (this.keys.has("Space")) {
      return new JumpCommand();
    }

    if (x !== 0 || z !== 0) {
      return new MoveCommand(x, z);
    }

    return null;
  }
}

// Event caller function
function notify(name) {
  observer.dispatchEvent(new Event(name));
}

async function runGame() {
  // Must wait for rapier physics engine first
  await RAPIER.init();
  console.log("Rapier is ready. Starting game...");

  const scene = new THREE.Scene();
  const gravity = { x: 0.0, y: -9.81, z: 0.0 };
  const world = new RAPIER.World(gravity);

  const observer = new EventTarget();

  const inputHandler = new InputHandler();

  await loadLevel(scene, world, levelUrl);

  const eventQueue = new RAPIER.EventQueue(true);

  const camera = new THREE.PerspectiveCamera(
    75,
    globalThis.innerWidth / globalThis.innerHeight,
    0.1,
    1000,
  );
  const renderer = new THREE.WebGLRenderer();
  renderer.shadowMap.enabled = true;
  renderer.setSize(globalThis.innerWidth, globalThis.innerHeight);
  document.body.appendChild(renderer.domElement);

  const ui = createGameUI(renderer);
  ui.levelFinishUI.style.display = 'none';

  // Temp camera
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; // Adds momentum/smoothness to the movement
  controls.dampingFactor = 0.05; // How quickly it slows down
  controls.minDistance = 5; // Don't let user zoom inside the ball
  controls.maxDistance = 50; // Don't let user zoom too far away

  // Player rigid body and physics
  const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0.0, 5.0, 0.0)
    .setLinearDamping(2.0); // Start 5 units up
  const rigidBody = world.createRigidBody(rigidBodyDesc);

  const colliderDesc = RAPIER.ColliderDesc.ball(1.0); // Radius 1.0
  world.createCollider(colliderDesc, rigidBody);

  const player = new Player({
    width: 1,
    height: 32,
    depth: 16,
    speed: 1,
    rigidBody: rigidBody,
    world: world,
  });
  player.castShadow = true;
  scene.add(player);

  /* // Create the ground mesh and add rigidbody collider
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(50, 0.5, 40),
    new THREE.MeshStandardMaterial({ color: 0xF54927 }),
  );
  ground.receiveShadow = true;
  ground.position.y = -3;
  scene.add(ground);

  const box = new THREE.Box3().setFromObject(ground);
  const size = new THREE.Vector3();
  box.getSize(size);

  const groundBodyDesc = RAPIER.RigidBodyDesc.fixed()
    .setTranslation(ground.position.x, ground.position.y, ground.position.z);
  const groundBody = world.createRigidBody(groundBodyDesc);

  const groundCollider = RAPIER.ColliderDesc.cuboid(
    size.x / 2,
    size.y / 2,
    size.z / 2,
  );
  world.createCollider(groundCollider, groundBody); */

  // Simple lighting
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
  directionalLight.position.z = 1;
  directionalLight.castShadow = true;
  scene.add(directionalLight);

  camera.position.z = 10;

  function animate() {
    requestAnimationFrame(animate);
    world.step(eventQueue);

    const position = rigidBody.translation();
    const rotation = rigidBody.rotation();

    player.position.set(position.x, position.y, position.z);
    player.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

    eventQueue.drainCollisionEvents((handle1, handle2, started) => {
      if (!started) return;

      const col1 = world.getCollider(handle1);
      const col2 = world.getCollider(handle2);

      // --- 1. SORTING PHASE: Find Player & Other ---
      let playerCollider = null;
      let otherCollider = null;

      // Check if Col1 is the player
      if (col1.parent() === player.body) {
        playerCollider = col1;
        otherCollider = col2;
      }
      // Check if Col2 is the player
      else if (col2.parent() === player.body) {
        playerCollider = col2;
        otherCollider = col1;
      }

      // If the player wasn't involved in this collision, ignore it.
      // (e.g., an enemy hitting a wall)
      if (!playerCollider) return;


      // --- 2. ROUTING PHASE: Switch based on Type ---
      // We check the custom string we added to the 'other' collider
      switch (otherCollider.interactionType) {

        case 'jumppad':
          console.log("BOING!");
          const vel = player.body.linvel();
          player.body.setLinvel({ x: vel.x, y: 0, z: vel.z }, true);
          player.body.applyImpulse({ x: 0, y: 100, z: 0 }, true);
          break;

        case 'goal':
          console.log("LEVEL COMPLETE");
          ui.levelFinishUI.style.display = 'block';
          //loadNextLevel();
          break;

        default:
          // Hit a normal wall or floor
          // Do nothing (or play a 'thud' sound)
          break;
      }
    });

    // Player Input
    const command = inputHandler.Input();
    if (command) {
      command.execute(player);
    }

    renderer.render(scene, camera);
  }

  animate();
}

runGame();
