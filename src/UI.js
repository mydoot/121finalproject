export function createGameUI(renderer) {
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
  restartBtn.innerText = "Restart Level";
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

  //updated ending screen
  const levelFinishUI = document.createElement("div");
  levelFinishUI.innerHTML = `
    <div style="text-align: center;">
      <div style="font-size: 80px; margin-bottom: 20px;">🎉 Victory! 🎉</div>
      <div style="font-size: 40px; margin-bottom: 30px;">You completed the game!</div>
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
      ">Play Again</button>
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
  });
  inventoryUI.innerHTML =
    "<strong>Inventory:</strong><br><span id='inventory-items'>Empty</span>";
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

  // 5. Return references so we can update them later
  return {
    levelFinishUI,
    restartBtn,
    inventoryUI,
    messageUI,
  };
}
