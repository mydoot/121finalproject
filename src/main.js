import RAPIER from "@dimforge/rapier3d-compat";
import nipplejs from "nipplejs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// External DSL: Import level configuration from JSON
import levelsConfig from "./levels.json" with { type: "json" };

// Static GLB imports for Vite (explicit imports are more reliable)
import levelUrl from "./level.glb?url";
import room2Url from "./room2.glb?url";

// Map filenames to their resolved URLs
const glbUrlMap = {
  "level.glb": levelUrl,
  "room2.glb": room2Url,
};

// Build scenes object from JSON config
function getGlbUrl(filename) {
  return glbUrlMap[filename] || null;
}

// Scene Management
let currentScene = levelsConfig.defaultScene;
const scenes = {};
for (const [sceneName, sceneData] of Object.entries(levelsConfig.scenes)) {
  scenes[sceneName] = {
    url: getGlbUrl(sceneData.file),
    startPos: sceneData.startPos,
  };
}

// --- i18n: Language Manager ---
import langAr from "./lang/ar.json" with { type: "json" };
import langEn from "./lang/en.json" with { type: "json" };
import langJa from "./lang/ja.json" with { type: "json" };

const translations = {
  en: langEn,
  ja: langJa,
  ar: langAr,
};

class LanguageManager {
  constructor() {
    this.currentLang = this.detectLanguage();
    this.strings = translations[this.currentLang] || translations.en;
    this.applyDirection();
  }

  detectLanguage() {
    const browserLang = navigator.language.split("-")[0];
    if (translations[browserLang]) {
      return browserLang;
    }
    return "en";
  }

  applyDirection() {
    // Store RTL flag for use by UI elements
    // Don't set document.body.dir as it affects flexbox layout
    this.isRTL = this.currentLang === "ar";
  }

  t(key, replacements = {}) {
    const keys = key.split(".");
    let value = this.strings;
    for (const k of keys) {
      value = value?.[k];
    }
    if (typeof value !== "string") {
      return key; // Fallback to key if not found
    }
    // Replace placeholders like {item}
    for (const [placeholder, replacement] of Object.entries(replacements)) {
      value = value.replace(`{${placeholder}}`, replacement);
    }
    return value;
  }
}

const lang = new LanguageManager();
// --- End i18n ---

// Interactable objects registry
let interactableObjects = [];

// Inventory system
const inventory = [];

// flag for game end state
let gameEnded = false;

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

    padCollider.interactionType = "jumppad";
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

    goalCollider.interactionType = "goal";
  } else {
    console.log("doesn't exist!");
  }

  // Find all doors in the level // second commit - door detection
  const doors = [];
  const lockedDoors = []; // fifth commit - locked doors
  levelMesh.traverse((obj) => {
    if (obj.name && obj.name.startsWith("Door_")) {
      doors.push(obj);
    }
    if (obj.name && obj.name.startsWith("LockedDoor_")) { // fifth commit - locked doors
      lockedDoors.push(obj);
    }
  });

  // Create door colliders
  doors.forEach((door) => {
    const targetPos = new THREE.Vector3();
    door.getWorldPosition(targetPos);

    const doorBodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(targetPos.x, targetPos.y, targetPos.z);
    const doorBody = world.createRigidBody(doorBodyDesc);

    const doorColliderDesc = RAPIER.ColliderDesc.cuboid(2, 3, 0.5)
      .setSensor(true)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

    const doorCollider = world.createCollider(doorColliderDesc, doorBody);

    // Extract destination from door name (e.g., "Door_room2" -> "room2")
    const destination = door.name.split("_")[1] || "room2";
    doorCollider.interactionType = "door";
    doorCollider.destination = destination;
  }); // second commit - door detection

  // Create locked door colliders // fifth commit - locked door setup
  lockedDoors.forEach((door) => {
    const targetPos = new THREE.Vector3();
    door.getWorldPosition(targetPos);

    const targetRot = new THREE.Quaternion();
    door.getWorldQuaternion(targetRot);

    const targetScale = new THREE.Vector3();
    door.getWorldScale(targetScale);

    const doorBodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(targetPos.x, targetPos.y, targetPos.z)
      .setRotation({
        x: targetRot.x,
        y: targetRot.y,
        z: targetRot.z,
        w: targetRot.w,
      });
    const doorBody = world.createRigidBody(doorBodyDesc);

    // Use the door's actual scale for the collider
    const doorColliderDesc = RAPIER.ColliderDesc.cuboid(
      targetScale.x,
      targetScale.y,
      targetScale.z,
    ).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    // Solid door - blocks player until unlocked

    const doorCollider = world.createCollider(doorColliderDesc, doorBody);

    // Extract required item and destination from door name
    // Format: "LockedDoor_key_room2" -> requires "key", leads to "room2"
    const parts = door.name.split("_");
    const requiredItem = parts[1] || "key";
    const destination = parts[2] || "room2";

    doorCollider.interactionType = "lockeddoor";
    doorCollider.requiredItem = requiredItem;
    doorCollider.destination = destination;
  }); // fifth commit - locked door setup

  // Find all interactable items // third commit - find interactable objects
  interactableObjects = [];
  levelMesh.traverse((obj) => {
    if (obj.name && obj.name.startsWith("Item_")) {
      obj.userData.itemType = obj.name.split("_")[1] || "unknown";
      obj.userData.interactable = true;
      interactableObjects.push(obj);

      // Set key color
      if (obj.userData.itemType === "key") {
        if (obj.material) {
          obj.material.color.setHex(0xffb703); // yellow
        }
      }
    }
  }); // third commit - find interactable objects

  levelMesh.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;

      if (child.name === "JumpPad") return;

      if (child.name === "Goal") return;

      if (child.name && child.name.startsWith("Door")) return; // second commit - skip doors in physics

      if (child.name && child.name.startsWith("LockedDoor")) return; // fifth commit - skip locked doors in physics

      // --- PHYSICS GENERATION (FIXED) ---

      const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed();
      const rigidBody = world.createRigidBody(rigidBodyDesc);

      const clonedGeometry = child.geometry.clone();

      clonedGeometry.applyMatrix4(child.matrixWorld);

      const vertices = clonedGeometry.attributes.position.array;

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
  const gameContainer = document.createElement("div");
  gameContainer.style.position = "relative";
  gameContainer.style.width = "100%";
  gameContainer.style.height = "100%";
  document.body.appendChild(gameContainer);

  // Move the existing 3D Canvas into this wrapper
  gameContainer.appendChild(renderer.domElement);

  // 2. Create the UI Overlay Layer
  const uiLayer = document.createElement("div");
  Object.assign(uiLayer.style, {
    position: "absolute",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "20px",
    boxSizing: "border-box",
  });
  gameContainer.appendChild(uiLayer);

  // 4. Create the Restart Button
  const restartBtn = document.createElement("button");
  restartBtn.innerText = lang.t("ui.restart");
  Object.assign(restartBtn.style, {
    pointerEvents: "auto",
    cursor: "pointer",
    padding: "10px 10px",
    fontSize: "20px",
    fontWeight: "bold",
    backgroundColor: "#6de9ffff",
    color: "white",
    border: "2px solid white",
    borderRadius: "8px",
    boxShadow: "2px 2px 5px rgba(0,0,0,0.5)",
  });

  // Add Hover Effect logic
  restartBtn.onmouseover = () => restartBtn.style.backgroundColor = "#0067acff";
  restartBtn.onmouseout = () => restartBtn.style.backgroundColor = "#6de9ffff";

  // Add Click Logic
  restartBtn.onclick = () => {
    console.log("Restart Clicked!");
    globalThis.location.reload();
  };

  uiLayer.appendChild(restartBtn);

  /*
    const hidejoystickBtn = document.createElement("button");
    hidejoystickBtn.innerText = "Show Joystick";
    Object.assign(hidejoystickBtn.style, {
      pointerEvents: "auto",
      cursor: "pointer",
      padding: "10px 10px",
      fontSize: "20px",
      fontWeight: "bold",
      backgroundColor: "#6de9ffff",
      color: "white",
      border: "2px solid white",
      borderRadius: "8px",
      boxShadow: "2px 2px 5px rgba(0,0,0,0.5)",
      top: "50%",
      left: "50%",
      transform: "translate(-1100%, 700%)",
    });

    // Add Hover Effect logic
    hidejoystickBtn.onmouseover = () => hidejoystickBtn.style.backgroundColor = "#0067acff";
    hidejoystickBtn.onmouseout = () => hidejoystickBtn.style.backgroundColor = "#6de9ffff";

    // Add Click Logic
    hidejoystickBtn.onclick = () => {
      console.log("Hide button");
      //globalThis.location.reload();
    };

    uiLayer.appendChild(hidejoystickBtn); */

  //updated ending screen
  const levelFinishUI = document.createElement("div");
  levelFinishUI.innerHTML = `
    <div style="text-align: center;">
      <div style="font-size: 80px; margin-bottom: 20px;">🎉 ${
    lang.t("ui.victory")
  } 🎉</div>
      <div style="font-size: 40px; margin-bottom: 30px;">${
    lang.t("ui.victoryMessage")
  }</div>
      <button id="play-again-btn" style="
        padding: 15px 40px;
        font-size: 24px;
        font-weight: bold;
        background-color: #6de9ffff;
        color: white;
        border: 3px solid white;
        border-radius: 10px;
        cursor: pointer;
        box-shadow: 3px 3px 10px rgba(0,0,0,0.5);
      ">${lang.t("ui.playAgain")}</button>
    </div>
  `;
  Object.assign(levelFinishUI.style, {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    color: "white",
    fontFamily: "Arial, sans-serif",
    fontWeight: "bold",
    backgroundColor: "rgba(46, 253, 225, 0.95)",
    textShadow: "2px 2px 0 #000",
    userSelect: "none",
    padding: "50px",
    borderRadius: "20px",
    border: "5px solid white",
    pointerEvents: "auto",
    zIndex: "1000",
  });
  uiLayer.appendChild(levelFinishUI);

  // Play Again button handler // sixth commit - play again button
  setTimeout(() => {
    const playAgainBtn = document.getElementById("play-again-btn");
    if (playAgainBtn) {
      playAgainBtn.onmouseover = () =>
        playAgainBtn.style.backgroundColor = "#0067acff";
      playAgainBtn.onmouseout = () =>
        playAgainBtn.style.backgroundColor = "#6de9ffff";
      playAgainBtn.onclick = () => {
        console.log("Play Again Clicked!");
        globalThis.location.reload();
      };
    }
  }, 100); // sixth commit - play again button

  // Inventory UI // fourth commit - inventory UI
  const inventoryUI = document.createElement("div");
  Object.assign(inventoryUI.style, {
    position: "absolute",
    top: "20px",
    right: "20px",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    color: "white",
    padding: "15px",
    borderRadius: "8px",
    fontFamily: "Arial, sans-serif",
    fontSize: "16px",
    minWidth: "150px",
    pointerEvents: "none",
    textAlign: lang.isRTL ? "right" : "left",
  });
  inventoryUI.dir = lang.isRTL ? "rtl" : "ltr";
  inventoryUI.innerHTML = `<strong>${
    lang.t("ui.inventory")
  }:</strong><br><span id='inventory-items'>${lang.t("ui.empty")}</span>`;
  gameContainer.appendChild(inventoryUI); // fourth commit - inventory UI

  // Message UI for locked doors // fifth commit - locked door message UI
  const messageUI = document.createElement("div");
  Object.assign(messageUI.style, {
    position: "absolute",
    bottom: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    backgroundColor: "rgba(255, 0, 0, 0.8)",
    color: "white",
    padding: "15px 30px",
    borderRadius: "8px",
    fontFamily: "Arial, sans-serif",
    fontSize: "18px",
    fontWeight: "bold",
    display: "none",
    pointerEvents: "none",
  });
  gameContainer.appendChild(messageUI); // fifth commit - locked door message UI

  const joystickUI = document.createElement("div");
  Object.assign(joystickUI.style, {
    position: "absolute",
    bottom: "0",
    left: "0",
    width: "50%",
    height: "50%",
  });
  gameContainer.appendChild(joystickUI);

  const joystickOptions = {
    zone: joystickUI, // The HTML element defined above
    mode: "static", // 'static', 'semi', or 'dynamic'
    position: { left: "15.5%", top: "60%" }, // Center it within the zone
    color: "white",
    size: 200,
  };

  const joystickManager = nipplejs.create(joystickOptions);

  // 5. Return references so we can update them later
  return {
    levelFinishUI,
    restartBtn,
    inventoryUI,
    messageUI,
    joystickUI,
    joystickManager,
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

    this.joystickVector = { x: 0, y: 0 };
    //These event listeners are always listening once InputHandler object is created in runGame()
    //Whenever a key is pressed, add it to this.keys
    globalThis.addEventListener("keydown", (e) => this.keys.add(e.code));
    globalThis.addEventListener("keyup", (e) => this.keys.delete(e.code));
  }

  isPressed(key, check) {
    return (key == check) ? true : false;
  }

  joystickInputs(x, y) {
    this.joystickVector.x = x;
    this.joystickVector.y = y;
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

    x += this.joystickVector.x;

    z -= this.joystickVector.y;

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
      inventoryItemsSpan.innerText = lang.t("ui.empty");
    } else {
      // Translate item names
      const translatedItems = inventory.map((item) =>
        lang.t(`items.${item}`) || item
      );
      inventoryItemsSpan.innerText = translatedItems.join(", ");
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

// JOYSTICK

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

  ui.joystickManager.on("move", (evt, data) => {
    const joyX = data.vector ? data.vector.x : 0;
    const joyY = data.vector ? data.vector.y : 0;

    // Send data to your InputHandler
    inputHandler.joystickInputs(joyX, joyY);
  }).on("end", () => {
    // This event fires when the user lifts their finger
    inputHandler.joystickInputs(0, 0);
  });

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

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
  scene.add(ambientLight);

  //New Camer Pos
  camera.position.set(1000, 50, 10);
  camera.lookAt(0, 0, 0);

  function animate() {
    requestAnimationFrame(animate);
    world.step(eventQueue);

    const position = rigidBody.translation();
    const rotation = rigidBody.rotation();

    player.position.set(position.x, position.y, position.z);
    player.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

    // FOLLOW CAMERA
    camera.position.lerp(
      new THREE.Vector3(
        player.position.x,
        player.position.y + 5, // height above the player
        player.position.z + 12, // distance behind the player
      ),
      0.1,
    );

    camera.lookAt(player.position);

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
            const translatedItem = lang.t(`items.${requiredItem}`) ||
              requiredItem;
            console.log(`Unlocked door with ${requiredItem}! Door removed.`);
            showMessage(
              lang.t("messages.doorUnlocked", { item: translatedItem }),
              1500,
            );
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
            const translatedItem = lang.t(`items.${requiredItem}`) ||
              requiredItem;
            console.log(`Door locked! Need: ${requiredItem}`);
            showMessage(
              lang.t("messages.doorLocked", { item: translatedItem }),
              2000,
            );
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

  // themes + manager
  const themeManager = new ThemeManager(
    scene,
    directionalLight,
    ambientLight,
    ui,
  ); // seventh commit - themes + ambient lighting

  animate();
}

const THEMES = {
  light: {
    background: 0x87CEEB, // Sky Blue
    lightIntensity: 1.0,
    ambientIntensity: 0.6,
    ui: {
      restartBtn: {
        bg: "#6de9ffff",
        hover: "#0067acff",
        text: "white",
        border: "white",
      },
      inventory: {
        bg: "rgba(0, 0, 0, 0.7)",
        text: "white",
      },
      message: {
        bg: "rgba(255, 0, 0, 0.8)",
        text: "white",
      },
      victory: {
        bg: "rgba(46, 253, 225, 0.95)",
        text: "white",
        btnBg: "#6de9ffff",
        btnHover: "#0067acff",
      },
    },
  },
  dark: {
    background: 0x0a0a2a, // Deep Space Blue
    lightIntensity: 0.75,
    ambientIntensity: 0.1,
    ui: {
      restartBtn: {
        bg: "#2a2a2aff",
        hover: "#555555ff",
        text: "#e0e0e0",
        border: "#444",
      },
      inventory: {
        bg: "rgba(255, 255, 255, 0.1)",
        text: "#e0e0e0",
      },
      message: {
        bg: "rgba(100, 0, 0, 0.9)",
        text: "#ffcccc",
      },
      victory: {
        bg: "rgba(20, 20, 40, 0.95)",
        text: "#e0e0e0",
        btnBg: "#444488ff",
        btnHover: "#6666aaff",
      },
    },
  },
};

class ThemeManager {
  constructor(scene, directionalLight, ambientLight, ui) {
    this.scene = scene;
    this.directionalLight = directionalLight;
    this.ambientLight = ambientLight;
    this.ui = ui;

    this.mediaQuery = globalThis.matchMedia("(prefers-color-scheme: dark)");
    this.handleThemeChange = this.handleThemeChange.bind(this);

    // Listen for changes
    this.mediaQuery.addEventListener("change", this.handleThemeChange);

    // Initial set
    this.handleThemeChange(this.mediaQuery);
  }

  handleThemeChange(e) {
    const themeName = e.matches ? "dark" : "light";
    this.applyTheme(themeName);
  }

  applyTheme(themeName) {
    console.log(`Applying theme: ${themeName}`);
    const theme = THEMES[themeName];

    // 1. Update 3D Scene
    this.scene.background = new THREE.Color(theme.background);
    this.directionalLight.intensity = theme.lightIntensity;
    this.ambientLight.intensity = theme.ambientIntensity;

    // 2. Update UI
    // Restart Button
    const restartBtn = this.ui.restartBtn;
    restartBtn.style.backgroundColor = theme.ui.restartBtn.bg;
    restartBtn.style.color = theme.ui.restartBtn.text;
    restartBtn.style.borderColor = theme.ui.restartBtn.border;

    // Update hover listeners for restart button to use new theme colors
    restartBtn.onmouseover = () =>
      restartBtn.style.backgroundColor = theme.ui.restartBtn.hover;
    restartBtn.onmouseout = () =>
      restartBtn.style.backgroundColor = theme.ui.restartBtn.bg;

    // Inventory
    const inventoryUI = this.ui.inventoryUI;
    inventoryUI.style.backgroundColor = theme.ui.inventory.bg;
    inventoryUI.style.color = theme.ui.inventory.text;

    // Message UI
    const messageUI = this.ui.messageUI;
    messageUI.style.backgroundColor = theme.ui.message.bg;
    messageUI.style.color = theme.ui.message.text;

    // Victory Screen (if visible, or for future visibility)
    const victoryUI = this.ui.levelFinishUI;
    victoryUI.style.backgroundColor = theme.ui.victory.bg;
    victoryUI.style.color = theme.ui.victory.text;

    // We need to find the button inside the victory UI string/element
    // Since it's created with innerHTML, we can query it from the container
    const playAgainBtn = document.getElementById("play-again-btn");
    if (playAgainBtn) {
      playAgainBtn.style.backgroundColor = theme.ui.victory.btnBg;
      playAgainBtn.onmouseover = () =>
        playAgainBtn.style.backgroundColor = theme.ui.victory.btnHover;
      playAgainBtn.onmouseout = () =>
        playAgainBtn.style.backgroundColor = theme.ui.victory.btnBg;
    }
  }
}

runGame();
