// ゲームで使うHTML要素を最初にまとめて取得します。
const gameArea = document.getElementById("gameArea");
const player = document.getElementById("player");
const scoreText = document.getElementById("score");
const timeText = document.getElementById("time");
const livesText = document.getElementById("lives");
const comboText = document.getElementById("combo");
const effectBadge = document.getElementById("effectBadge");
const comboGaugeFill = document.getElementById("comboGaugeFill");
const messagePanel = document.getElementById("messagePanel");
const messageTitle = document.getElementById("messageTitle");
const messageText = document.getElementById("messageText");
const guideContent = document.getElementById("guideContent");
const difficultyContent = document.getElementById("difficultyContent");
const guidePages = document.querySelectorAll(".guide-page");
const guidePrevButton = document.getElementById("guidePrevButton");
const guideNextButton = document.getElementById("guideNextButton");
const startButton = document.getElementById("startButton");
const leftButton = document.getElementById("leftButton");
const rightButton = document.getElementById("rightButton");
const difficultyButtons = document.querySelectorAll(".difficulty-button");

// ルールを変えたいときは、この数字を直すだけで調整できます。
const GAME_SECONDS = 30;
const START_LIVES = 3;
const MAX_LIVES = 5;
const PLAYER_SPEED = 7;
const ITEM_SIZE = 44;
const INVINCIBLE_SECONDS = 6;
const COMBO_GRACE_SECONDS = 3;

// 難易度ごとの落ちる速さ、雪玉の出やすさ、出現間隔です。
const DIFFICULTIES = {
  easy: {
    label: "やさしい",
    speedMin: 85,
    speedRange: 55,
    snowballChance: 0.1,
    spawnInterval: 0.84
  },
  normal: {
    label: "ふつう",
    speedMin: 125,
    speedRange: 80,
    snowballChance: 0.16,
    spawnInterval: 0.72
  },
  hard: {
    label: "むずかしい",
    speedMin: 165,
    speedRange: 105,
    snowballChance: 0.26,
    spawnInterval: 0.58
  }
};

// 雪玉ではない落下物の出現割合です。数字が大きいほど出やすくなります。
const NUT_WEIGHTS = [
  { type: "acorn", weight: 62 },
  { type: "golden", weight: 14 },
  { type: "rainbow", weight: 6 },
  { type: "heart", weight: 6 },
  { type: "clock", weight: 6 },
  { type: "fluffy", weight: 6 }
];

const GUIDE_PAGES = [
  {
    title: "遊び方",
    text: "30秒で木の実を集めて高得点を狙おう。"
  },
  {
    title: "アイテムの種類",
    text: "木の実と雪玉には、それぞれ違う効果があります。"
  },
  {
    title: "評価ランク",
    text: "ゲーム終了時、スコアに合わせて称号が出ます。"
  },
  {
    title: "高得点のコツ",
    text: "コンボをつなげるほど、ボーナス点が増えます。"
  }
];

// ゲーム中に変わる値をまとめておきます。
let score = 0;
let timeLeft = GAME_SECONDS;
let lives = START_LIVES;
let combo = 0;
let bestCombo = 0;
let comboTimer = 0;
let playerX = 0;
let isPlaying = false;
let guidePageIndex = 0;
let selectedDifficulty = "normal";
let lastTime = 0;
let spawnTimer = 0;
let secondTimer = 0;
let invincibleTimer = 0;
let animationId = null;
let audioContext = null;
let items = [];

// 押されているキーやボタンを記録します。
const controls = {
  left: false,
  right: false
};

let isDraggingPlayer = false;

// ブラウザの効果音機能を、スタート操作のあとで使えるようにします。
function setupAudio() {
  if (audioContext !== null) {
    return;
  }

  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    return;
  }

  audioContext = new AudioContext();
}

// 短い電子音を鳴らします。画像や音声ファイルは使いません。
function playTone(frequency, duration, type = "sine", volume = 0.08) {
  if (!audioContext) {
    return;
  }

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const now = audioContext.currentTime;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

function playSound(name) {
  if (name === "catch") {
    playTone(760, 0.08, "triangle", 0.07);
  } else if (name === "rare") {
    playTone(880, 0.08, "triangle", 0.07);
    setTimeout(() => playTone(1180, 0.11, "triangle", 0.06), 70);
  } else if (name === "heart") {
    playTone(640, 0.1, "sine", 0.07);
    setTimeout(() => playTone(820, 0.12, "sine", 0.06), 80);
  } else if (name === "hit") {
    playTone(180, 0.18, "sawtooth", 0.05);
  } else if (name === "start") {
    playTone(520, 0.08, "triangle", 0.06);
    setTimeout(() => playTone(700, 0.1, "triangle", 0.06), 80);
  } else if (name === "end") {
    playTone(620, 0.1, "sine", 0.06);
    setTimeout(() => playTone(470, 0.16, "sine", 0.05), 110);
  }
}

// 画面の幅から、シマエナガが動ける範囲を計算します。
function getPlayerLimits() {
  const areaWidth = gameArea.clientWidth;
  const playerWidth = player.offsetWidth;

  return {
    min: playerWidth / 2,
    max: areaWidth - playerWidth / 2
  };
}

// シマエナガの位置を画面に反映します。
function drawPlayer() {
  player.style.left = `${playerX}px`;
}

// スマホでは、ゲーム画面を触った位置へシマエナガが追従します。
function movePlayerToClientX(clientX) {
  const areaRect = gameArea.getBoundingClientRect();
  const limits = getPlayerLimits();

  playerX = clientX - areaRect.left;
  playerX = Math.max(limits.min, Math.min(limits.max, playerX));
  drawPlayer();
}

// スコア、時間、ライフ、コンボを表示します。
function updateStatus() {
  const comboBonus = getComboBonus(combo);

  scoreText.textContent = score;
  timeText.textContent = timeLeft;
  livesText.textContent = "♥".repeat(lives) + "♡".repeat(Math.max(0, START_LIVES - lives));
  comboText.textContent = comboBonus > 0 ? `${combo} +${comboBonus}` : combo;
}

function updateComboGauge() {
  const gaugePercent = combo > 0 ? (comboTimer / COMBO_GRACE_SECONDS) * 100 : 0;
  comboGaugeFill.style.width = `${Math.max(0, Math.min(100, gaugePercent))}%`;
}

function resetCombo() {
  combo = 0;
  comboTimer = 0;
  updateStatus();
  updateComboGauge();
}

// 無敵中だけ、画面左上に残り時間を表示します。
function updateEffectBadge() {
  if (invincibleTimer > 0) {
    effectBadge.textContent = `ふわふわ無敵 ${Math.ceil(invincibleTimer)}秒`;
    effectBadge.classList.remove("hidden");
    player.classList.add("invincible");
  } else {
    effectBadge.classList.add("hidden");
    player.classList.remove("invincible");
  }
}

function updateDifficultyButtons() {
  difficultyButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.difficulty === selectedDifficulty);
  });
}

function updateGuidePage() {
  guidePages.forEach((page, index) => {
    page.classList.toggle("hidden", index !== guidePageIndex);
  });

  messageTitle.textContent = GUIDE_PAGES[guidePageIndex].title;
  messageText.textContent = GUIDE_PAGES[guidePageIndex].text;
  guidePrevButton.disabled = guidePageIndex === 0;
  guideNextButton.textContent = guidePageIndex === guidePages.length - 1 ? "難易度を選ぶ" : "次へ";
}

function showGuideScreen() {
  startButton.textContent = "スタート";
  messagePanel.classList.remove("result", "hidden");
  guideContent.classList.remove("hidden");
  difficultyContent.classList.add("hidden");
  guidePageIndex = 0;
  updateGuidePage();
}

function showDifficultyScreen() {
  messageTitle.textContent = "難易度を選ぼう";
  messageText.textContent = "遊びやすさに合わせて選んでからスタートしてね。";
  startButton.textContent = "スタート";
  messagePanel.classList.remove("result", "hidden");
  guideContent.classList.add("hidden");
  difficultyContent.classList.remove("hidden");
  updateDifficultyButtons();
}

function goToNextGuidePage() {
  if (guidePageIndex >= guidePages.length - 1) {
    showDifficultyScreen();
    return;
  }

  guidePageIndex += 1;
  updateGuidePage();
}

function goToPreviousGuidePage() {
  guidePageIndex = Math.max(0, guidePageIndex - 1);
  updateGuidePage();
}

// コンボが伸びるほど、スコアが入る木の実に追加点を付けます。
function getComboBonus(currentCombo) {
  if (currentCombo >= 20) {
    return 5;
  }

  if (currentCombo >= 15) {
    return 3;
  }

  if (currentCombo >= 10) {
    return 2;
  }

  if (currentCombo >= 5) {
    return 1;
  }

  return 0;
}

// 木の実を取った場所に、小さなキラッとした光を出します。
function createSparkle(x, y, rare = false) {
  const sparkle = document.createElement("div");

  sparkle.className = `sparkle-pop ${rare ? "rare-sparkle" : ""}`;
  sparkle.style.left = `${x}px`;
  sparkle.style.top = `${y}px`;
  gameArea.appendChild(sparkle);

  // アニメーションが終わったら消して、画面内の要素を増やしすぎないようにします。
  sparkle.addEventListener("animationend", () => {
    sparkle.remove();
  });
}

// コンボが続いたときに、シマエナガの近くへ短い文字を出します。
function showComboPop(points) {
  if (combo < 2) {
    return;
  }

  const comboPop = document.createElement("div");
  comboPop.className = "combo-pop";
  comboPop.textContent = points > 0 ? `+${points} / ${combo}コンボ` : `${combo}コンボ`;
  comboPop.style.left = `${playerX}px`;
  comboPop.style.top = `${gameArea.clientHeight - 155}px`;
  gameArea.appendChild(comboPop);

  comboPop.addEventListener("animationend", () => {
    comboPop.remove();
  });
}

// 重みつき抽選で、雪玉ではない木の実の種類を選びます。
function chooseNutType() {
  const totalWeight = NUT_WEIGHTS.reduce((total, nut) => total + nut.weight, 0);
  let randomWeight = Math.random() * totalWeight;

  for (const nut of NUT_WEIGHTS) {
    randomWeight -= nut.weight;
    if (randomWeight <= 0) {
      return nut.type;
    }
  }

  return "acorn";
}

// ランダムな落下物を1つ作ります。
function createItem() {
  const areaWidth = gameArea.clientWidth;
  const difficulty = DIFFICULTIES[selectedDifficulty];
  const element = document.createElement("div");
  const type = Math.random() < difficulty.snowballChance ? "snowball" : chooseNutType();
  const itemClass = type === "snowball" ? "snowball" : `acorn ${type}`;

  element.className = `item ${itemClass}`;
  gameArea.appendChild(element);

  items.push({
    element,
    type,
    x: 28 + Math.random() * (areaWidth - 56),
    y: -44,
    speed: difficulty.speedMin + Math.random() * difficulty.speedRange
  });
}

// 2つの四角形が重なっているか調べます。
function isHit(rectA, rectB) {
  return (
    rectA.left < rectB.right &&
    rectA.right > rectB.left &&
    rectA.top < rectB.bottom &&
    rectA.bottom > rectB.top
  );
}

// 点数に応じた評価コメントを返します。
function getResultComment() {
  if (score <= 50) {
    return "おねむシマエナガ";
  }

  if (score <= 99) {
    return "並シマエナガ";
  }

  if (score <= 149) {
    return "木の実見習い";
  }

  if (score <= 179) {
    return "木の実集め名人";
  }

  if (score <= 199) {
    return "森の人気者";
  }

  if (score <= 249) {
    return "伝説のもふもふ";
  }

  return "神シマエナガ";
}

// 画面上の落下物や演出をすべて消します。
function clearItems() {
  items.forEach((item) => item.element.remove());
  items = [];
  gameArea.querySelectorAll(".sparkle-pop, .combo-pop").forEach((effect) => effect.remove());
}

// ゲーム開始前の状態に戻します。
function resetGame() {
  const limits = getPlayerLimits();

  score = 0;
  timeLeft = GAME_SECONDS;
  lives = START_LIVES;
  combo = 0;
  bestCombo = 0;
  comboTimer = 0;
  invincibleTimer = 0;
  playerX = (limits.min + limits.max) / 2;
  spawnTimer = 0;
  secondTimer = 0;
  lastTime = 0;

  clearItems();
  updateStatus();
  updateComboGauge();
  updateEffectBadge();
  drawPlayer();
}

// ゲームを始めます。
function startGame() {
  setupAudio();
  if (audioContext && audioContext.state === "suspended") {
    audioContext.resume();
  }

  resetGame();
  isPlaying = true;
  messagePanel.classList.remove("result");
  messagePanel.classList.add("hidden");
  playSound("start");

  if (animationId !== null) {
    cancelAnimationFrame(animationId);
  }

  animationId = requestAnimationFrame(gameLoop);
}

// ゲームを終了して、結果を表示します。
function endGame() {
  isPlaying = false;
  cancelAnimationFrame(animationId);
  animationId = null;
  comboTimer = 0;
  updateComboGauge();
  playSound("end");

  messageTitle.textContent = getResultComment();
  messageText.textContent = `難易度は「${DIFFICULTIES[selectedDifficulty].label}」。スコアは ${score} 点、最高コンボは ${bestCombo}。`;
  startButton.textContent = "もう一度遊ぶ";
  messagePanel.classList.add("result");
  guideContent.classList.add("hidden");
  difficultyContent.classList.remove("hidden");
  messagePanel.classList.remove("hidden");
}

// キーやボタンに合わせてシマエナガを移動します。
function movePlayer(deltaTime) {
  const limits = getPlayerLimits();
  const moveAmount = PLAYER_SPEED * deltaTime * 60;

  if (controls.left) {
    playerX -= moveAmount;
  }

  if (controls.right) {
    playerX += moveAmount;
  }

  playerX = Math.max(limits.min, Math.min(limits.max, playerX));
  drawPlayer();
}

function catchNut(item) {
  combo += 1;
  bestCombo = Math.max(bestCombo, combo);
  comboTimer = COMBO_GRACE_SECONDS;
  const comboBonus = getComboBonus(combo);
  let earnedPoints = 0;

  if (item.type === "golden") {
    earnedPoints = 5 + comboBonus;
    score += earnedPoints;
    createSparkle(item.x, item.y, true);
    playSound("rare");
  } else if (item.type === "rainbow") {
    earnedPoints = 10 + comboBonus;
    score += earnedPoints;
    createSparkle(item.x, item.y, true);
    playSound("rare");
  } else if (item.type === "heart") {
    lives = Math.min(MAX_LIVES, lives + 1);
    createSparkle(item.x, item.y, true);
    playSound("heart");
  } else if (item.type === "clock") {
    timeLeft += 5;
    createSparkle(item.x, item.y, true);
    playSound("rare");
  } else if (item.type === "fluffy") {
    invincibleTimer = INVINCIBLE_SECONDS;
    createSparkle(item.x, item.y, true);
    playSound("rare");
  } else {
    earnedPoints = 1 + comboBonus;
    score += earnedPoints;
    createSparkle(item.x, item.y);
    playSound("catch");
  }

  showComboPop(earnedPoints);
  updateComboGauge();
}

function hitSnowball() {
  if (invincibleTimer > 0) {
    createSparkle(playerX, gameArea.clientHeight - 120, true);
    playSound("rare");
    return;
  }

  lives -= 1;
  resetCombo();
  player.classList.remove("hit");
  // アニメーションを毎回再生するために、少しだけ時間を空けます。
  setTimeout(() => player.classList.add("hit"), 0);
  playSound("hit");
}

// 落下物を動かし、キャッチや衝突を判定します。
function updateItems(deltaTime) {
  const areaRect = gameArea.getBoundingClientRect();
  const playerRect = player.getBoundingClientRect();

  items = items.filter((item) => {
    item.y += item.speed * deltaTime;
    item.element.style.left = `${item.x}px`;
    item.element.style.top = `${item.y}px`;

    const itemRect = item.element.getBoundingClientRect();

    if (isHit(playerRect, itemRect)) {
      if (item.type === "snowball") {
        hitSnowball();
      } else {
        catchNut(item);
      }

      item.element.remove();
      updateStatus();
      updateEffectBadge();

      if (lives <= 0) {
        endGame();
      }

      return false;
    }

    if (item.y > areaRect.height + ITEM_SIZE) {
      item.element.remove();
      return false;
    }

    return true;
  });
}

// ゲーム全体を毎フレーム更新します。
function gameLoop(currentTime) {
  if (!isPlaying) {
    return;
  }

  if (lastTime === 0) {
    lastTime = currentTime;
  }

  const difficulty = DIFFICULTIES[selectedDifficulty];
  const deltaTime = (currentTime - lastTime) / 1000;
  lastTime = currentTime;
  spawnTimer += deltaTime;
  secondTimer += deltaTime;

  if (invincibleTimer > 0) {
    invincibleTimer = Math.max(0, invincibleTimer - deltaTime);
    updateEffectBadge();
  }

  if (comboTimer > 0) {
    comboTimer = Math.max(0, comboTimer - deltaTime);
    if (comboTimer === 0) {
      combo = 0;
      updateStatus();
    }
    updateComboGauge();
  }

  movePlayer(deltaTime);

  if (spawnTimer >= difficulty.spawnInterval) {
    createItem();
    spawnTimer = 0;
  }

  if (secondTimer >= 1) {
    timeLeft -= 1;
    secondTimer -= 1;
    updateStatus();

    if (timeLeft <= 0) {
      timeLeft = 0;
      updateStatus();
      endGame();
      return;
    }
  }

  updateItems(deltaTime);

  // 衝突判定の中でゲーム終了した場合は、次のフレームを予約しません。
  if (isPlaying) {
    animationId = requestAnimationFrame(gameLoop);
  }
}

// PCの左右キーで移動します。
window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    controls.left = true;
  }

  if (event.key === "ArrowRight") {
    controls.right = true;
  }
});

window.addEventListener("keyup", (event) => {
  if (event.key === "ArrowLeft") {
    controls.left = false;
  }

  if (event.key === "ArrowRight") {
    controls.right = false;
  }
});

// スマホのボタンは、押している間だけ移動します。
function bindHoldButton(button, direction) {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    controls[direction] = true;
    button.setPointerCapture(event.pointerId);
  });

  button.addEventListener("pointerup", () => {
    controls[direction] = false;
  });

  button.addEventListener("pointercancel", () => {
    controls[direction] = false;
  });

  button.addEventListener("pointerleave", () => {
    controls[direction] = false;
  });
}

bindHoldButton(leftButton, "left");
bindHoldButton(rightButton, "right");

gameArea.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".message-panel")) {
    return;
  }

  event.preventDefault();
  isDraggingPlayer = true;
  controls.left = false;
  controls.right = false;
  movePlayerToClientX(event.clientX);
  gameArea.setPointerCapture(event.pointerId);
});

gameArea.addEventListener("pointermove", (event) => {
  if (!isDraggingPlayer) {
    return;
  }

  event.preventDefault();
  movePlayerToClientX(event.clientX);
});

function stopDraggingPlayer() {
  isDraggingPlayer = false;
}

gameArea.addEventListener("pointerup", stopDraggingPlayer);
gameArea.addEventListener("pointercancel", stopDraggingPlayer);

difficultyButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectedDifficulty = button.dataset.difficulty;
    updateDifficultyButtons();
  });
});

guidePrevButton.addEventListener("click", goToPreviousGuidePage);
guideNextButton.addEventListener("click", goToNextGuidePage);
startButton.addEventListener("click", startGame);

// 画面サイズが変わっても、シマエナガが外に出ないようにします。
window.addEventListener("resize", () => {
  const limits = getPlayerLimits();
  playerX = Math.max(limits.min, Math.min(limits.max, playerX));
  drawPlayer();
});

updateDifficultyButtons();
resetGame();
showGuideScreen();
