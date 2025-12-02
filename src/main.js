import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import levelUrl from "./level.glb?url";
import room2Url from "./room2.glb?url";

import { loadLevel } from "./loadlevel.js";

import { createGameUI } from "./UI.js";

// Scene Management/ second commit
let currentScene = "room1";
const scenes = {
  room1: {
    url: levelUrl,
    startPos: { x: -3, y: 5, z: 10 }, // In front of Door_room2
  },
  room2: {
    url: room2Url, // Different room file
    startPos: { x: -3, y: 5, z: 10 }, // In front of Door_room1
  },
}; //second commit

// Interactable objects registry
let interactableObjects = [];

// Inventory system
const inventory = [];

// flag for game end state
let gameEnded = false;

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
    /* if (this.keys.has("Space")) {
      return new JumpCommand();
    } */

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

// Global game state for scene switching // second commit - scene switching function
let gameState = null;

// Message display function // fifth commit - message display
function showMessage(text, duration = 2000) {
  const messageUI = gameState?.messageUI;
  if (!messageUI) return;

  messageUI.innerText = text;
  messageUI.style.display = "block";

  setTimeout(() => {
    messageUI.style.display = "none";
  }, duration);
} // fifth commit - message display

// Inventory functions // fourth commit - inventory functions
function addToInventory(itemType) {
  inventory.push(itemType);
  updateInventoryUI();
  console.log(
    `Added ${itemType} to inventory. Total items: ${inventory.length}`,
  );
}

function hasItem(itemType) {
  return inventory.includes(itemType);
}

function removeFromInventory(itemType) {
  const index = inventory.indexOf(itemType);
  if (index > -1) {
    inventory.splice(index, 1);
    updateInventoryUI();
  }
}

function updateInventoryUI() {
  const inventoryItemsSpan = document.getElementById("inventory-items");
  if (inventoryItemsSpan) {
    if (inventory.length === 0) {
      inventoryItemsSpan.innerText = "Empty";
    } else {
      inventoryItemsSpan.innerText = inventory.join(", ");
    }
  }
} // fourth commit - inventory functions

// Function to switch scenes
async function switchScene(destination) {
  if (!gameState) return;

  console.log(`Switching to ${destination}`);
  currentScene = destination;

  // Clear interactable objects // third commit - clear interactables on scene switch
  interactableObjects = []; // third commit - clear interactables on scene switch

  // Clear current scene (but keep player and lights)
  const toRemove = [];
  gameState.scene.children.forEach((child) => {
    if (child !== gameState.player && !child.isLight) {
      toRemove.push(child);
    }
  });
  toRemove.forEach((child) => gameState.scene.remove(child));

  // Clear physics world (but keep player's body)
  gameState.world.bodies.forEach((body) => {
    if (body !== gameState.player.body) {
      gameState.world.removeRigidBody(body);
    }
  });

  // Load new scene first
  await loadLevel(gameState.scene, gameState.world, scenes[destination].url);

  // Reset player position AFTER level is loaded
  const newStartPos = scenes[destination].startPos;
  gameState.player.body.setTranslation(newStartPos, true);
  gameState.player.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  gameState.player.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
} // second commit - scene switching function

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
  ui.levelFinishUI.style.display = "none";

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

  // Initialize global game state for scene switching // second commit - initialize gameState
  gameState = {
    scene: scene,
    world: world,
    player: player,
    camera: camera,
    renderer: renderer,
    messageUI: ui.messageUI,
  }; // second commit - initialize gameState

  // Object interaction with raycasting // third commit - raycasting setup
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  function onObjectClick(event) {
    if (gameEnded) return; //functionality for the game end state

    // Calculate mouse position in normalized device coordinates (-1 to +1)
    mouse.x = (event.clientX / globalThis.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / globalThis.innerHeight) * 2 + 1;

    // Update the raycaster with camera and mouse position
    raycaster.setFromCamera(mouse, camera);

    // Check for intersections with interactable objects
    const intersects = raycaster.intersectObjects(interactableObjects, true);

    if (intersects.length > 0) {
      // Find the first interactable object in the hierarchy
      let clickedObject = intersects[0].object;
      while (clickedObject && !clickedObject.userData.interactable) {
        clickedObject = clickedObject.parent;
      }

      if (clickedObject && clickedObject.userData.interactable) {
        handleObjectInteraction(clickedObject);
      }
    }
  }

  function handleObjectInteraction(object) { // fourth commit - pick up items
    console.log(`Interacted with: ${object.userData.itemType}`);

    // Add to inventory
    addToInventory(object.userData.itemType);

    // Remove from scene
    if (object.parent) {
      object.parent.remove(object);
    }

    // Remove from interactable objects array
    const index = interactableObjects.indexOf(object);
    if (index > -1) {
      interactableObjects.splice(index, 1);
    }
  } // fourth commit - pick up items

  globalThis.addEventListener("click", onObjectClick);
  //raycasting setup

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
      } // Check if Col2 is the player
      else if (col2.parent() === player.body) {
        playerCollider = col2;
        otherCollider = col1;
      }

      // If the player wasn't involved in this collision, ignore it.
      // (e.g., an enemy hitting a wall)
      if (!playerCollider) return;

      // We check the custom string we added to the 'other' collider
      switch (otherCollider.interactionType) {
        case "jumppad": {
          console.log("BOING!");
          const vel = player.body.linvel();
          player.body.setLinvel({ x: vel.x, y: 0, z: vel.z }, true);
          player.body.applyImpulse({ x: 0, y: 100, z: 0 }, true);
          break;
        }

        case "goal": {
          console.log("GAME COMPLETE - YOU WIN!");
          gameEnded = true;
          ui.levelFinishUI.style.display = "block";

          // Stop the player
          player.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          player.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          break;
        }

        case "door": { // second commit - door collision handling
          console.log(`Entering door to ${otherCollider.destination}`);
          switchScene(otherCollider.destination);
          break;
        } // second commit - door collision handling

        case "lockeddoor": { // fifth commit - locked door collision (puzzle)
          const requiredItem = otherCollider.requiredItem;

          if (hasItem(requiredItem)) {
            console.log(`Unlocked door with ${requiredItem}! Door removed.`);
            showMessage(`Door unlocked with ${requiredItem}!`, 1500);
            removeFromInventory(requiredItem); // Use up the item

            // Find and remove the door from the scene
            const doorBody = otherCollider.parent();
            world.removeRigidBody(doorBody);

            // Find the visual mesh and remove it
            scene.traverse((obj) => {
              if (obj.name && obj.name.startsWith("LockedDoor_")) {
                if (obj.parent) {
                  obj.parent.remove(obj);
                }
              }
            });
          } else {
            console.log(`Door locked! Need: ${requiredItem}`);
            showMessage(`Locked! Need: ${requiredItem}`, 2000);
          }
          break;
        } // fifth commit - locked door collision (puzzle)

        default: {
          // Hit a normal wall or floor
          // Do nothing (or play a 'thud' sound)
          break;
        }
      }
    });

    // Player Input // sixth commit - disable input when game ends
    if (!gameEnded) {
      const command = inputHandler.Input();
      if (command) {
        command.execute(player);
      }
    } // sixth commit - disable input when game ends

    renderer.render(scene, camera);
  }

  animate();
}

runGame();
