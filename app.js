// ---------- FIREBASE SETUP ----------
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// Paste YOUR config from the Firebase console here:
const firebaseConfig = {
  apiKey: "AIzaSyDaXp1xj3KcoltzdA1Zz9__4xtTmfjWs_I",
  authDomain: "familygiftexchange-3a950.firebaseapp.com",
  projectId: "familygiftexchange-3a950",
  storageBucket: "familygiftexchange-3a950.firebasestorage.app",
  messagingSenderId: "392367844402",
  appId: "1:392367844402:web:22c9c6fb60252c9e7aa02b"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// We'll keep all assignments in one document for this year's exchange
const SESSION_ID = "family-gift-2025";
const sessionRef = doc(db, "sessions", SESSION_ID);

// Flag so we only try to save after initial setup
let firebaseReady = false;

// ---------- (data + admin helpers + many functions remain unchanged) ----------
// For brevity I'm keeping the rest of your original code intact except the wheel sizing/positioning
// functions below have been replaced to compute sizes from the actual DOM container and keep things centered.

// ---------- WHEEL + SPIN (UPDATED SIZING & POSITION LOGIC) ----------

let wreathAnimationId = null;
let wreathAngleOffset = 0;
let wreathRadius = 90;

function getCurrentGroup() {
  if (!currentGroupKey) return null;
  return groups[currentGroupKey];
}

function setupWheelForCurrentGroup() {
  const group = getCurrentGroup();
  if (!group) return;

  const people = group.people;
  const wheel = document.getElementById("ferrisWheel");
  const carousel = document.getElementById("carousel");
  const carouselTrack = document.getElementById("carouselTrack");

  // If required elements are missing, bail out gracefully rather than throwing.
  if (!wheel || !carousel || !carouselTrack) {
    return;
  }

  const wheelContainer = wheel.closest('.wheel-container') || document.querySelector('.wheel-container') || document.body;

  // clear previous
  wheel.innerHTML = "";
  carouselTrack.innerHTML = "";
  wheel.style.opacity = "1";
  wheel.style.transform = "scale(1)";
  carousel.style.display = "none";
  carouselTrack.style.transform = "translateX(0)";

  // measure container (use smaller of width/height)
  const containerSize = wheelContainer ? Math.min(wheelContainer.clientWidth, wheelContainer.clientHeight) : 320;

  // Determine face size responsively but clamp to sensible bounds.
  // This makes faces same size for carousel and wreath.
  const faceSize = Math.max(44, Math.min(Math.round(containerSize * 0.13), 96)); // min 44px, max 96px

  // Orbit radius: put faces inside wreath, keep margin so borders don't touch
  const orbitRadius = Math.max(40, Math.round((containerSize - faceSize) / 2) - 8);
  wreathRadius = orbitRadius;
  wreathAngleOffset = 0;

  // ensure the ferris-wheel overlay fits the container consistently
  // Set the ferris-wheel element to be square and centered via CSS; JS will position children relative to its center.
  const ferris = document.getElementById("ferrisWheel");
  if (ferris) {
    ferris.style.width = `${containerSize * 0.82}px`;
    ferris.style.height = `${containerSize * 0.82}px`;
  }

  // Add wheel children (avatars) and position them based on computed radius
  const count = people.length || 1;
  people.forEach((person, index) => {
    const baseAngle = (index / count) * 2 * Math.PI;

    const div = document.createElement("div");
    div.className = "wheel-child";
    div.dataset.baseAngle = String(baseAngle);

    // size for this child
    div.style.width = `${faceSize}px`;
    div.style.height = `${faceSize}px`;
    div.style.left = "50%";
    div.style.top = "50%";
    div.style.overflow = "hidden";
    div.style.borderRadius = "50%";
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.justifyContent = "center";
    div.style.pointerEvents = "auto"; // keep possibility of interaction

    div.innerHTML = `<img src="${person.photoUrl}" alt="${person.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;">`;
    wheel.appendChild(div);

    // initial placement
    const x = orbitRadius * Math.cos(baseAngle);
    const y = orbitRadius * Math.sin(baseAngle);
    div.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
  });

  // Build carousel copies so scrolling is seamless
  const carouselCopies = [...people, ...people, ...people];
  carouselCopies.forEach((person) => {
    const item = document.createElement("div");
    item.className = "carousel-child";
    item.style.width = `${faceSize}px`;
    item.style.height = `${faceSize}px`;
    item.style.overflow = "hidden";
    item.style.borderRadius = "50%";
    item.style.display = "flex";
    item.style.alignItems = "center";
    item.style.justifyContent = "center";
    item.innerHTML = `<img src="${person.photoUrl}" alt="${person.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;">`;
    carouselTrack.appendChild(item);
  });

  // Restart animation
  if (wreathAnimationId !== null) {
    cancelAnimationFrame(wreathAnimationId);
    wreathAnimationId = null;
  }
  animateWreath();
}

function animateWreath() {
  const wheel = document.getElementById("ferrisWheel");
  if (!wheel || currentScreen !== "spin") {
    wreathAnimationId = null;
    return;
  }

  // rotate slowly
  wreathAngleOffset += 0.008;

  const children = wheel.querySelectorAll(".wheel-child");
  children.forEach((div) => {
    const base = parseFloat(div.dataset.baseAngle || "0");
    const angle = base + wreathAngleOffset;
    const x = wreathRadius * Math.cos(angle);
    const y = wreathRadius * Math.sin(angle);

    div.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
  });

  wreathAnimationId = requestAnimationFrame(animateWreath);
}

// In startSpin: keep carousel loop but measure child widths robustly
function startSpin() {
  if (!currentGroupKey || !currentDrawerId) {
    alert("Please go back and select who is drawing first.");
    return;
  }

  const possible = getPossibleRecipients(currentGroupKey, currentDrawerId);
  if (possible.length === 0) {
    alert("There are no valid people left. Please contact the organizer.");
    return;
  }

  triggerHaptic();
  playSound("button");

  const chosen = possible[Math.floor(Math.random() * possible.length)];

  // record assignment in memory
  assignmentsByGroup[currentGroupKey].push({
    drawerId: currentDrawerId,
    recipientId: chosen.id
  });

  lastResult = {
    groupKey: currentGroupKey,
    drawerId: currentDrawerId,
    recipientId: chosen.id
  };

  // save to Firestore (non-blocking)
  if (typeof firebaseReady !== "undefined" && firebaseReady) {
    const fieldName = currentGroupKey === "kids" ? "kidsAssignments" : "adultsAssignments";
    updateDoc(sessionRef, {
      [fieldName]: arrayUnion({
        drawerId: currentDrawerId,
        recipientId: chosen.id
      })
    }).catch((err) => {
      console.error("Failed to save assignment to Firestore", err);
    });
  }

  const wheel = document.getElementById("ferrisWheel");
  const carousel = document.getElementById("carousel");
  const carouselTrack = document.getElementById("carouselTrack");

  // fade wreath
  if (wheel) {
    wheel.style.opacity = "0";
    wheel.style.transform = "scale(0.96)";
  }

  setTimeout(() => {
    carousel.style.display = "flex";
  }, 420);

  // robust looping carousel
  let position = 0;
  const speed = 11;
  let spinning = true;

  // measure child size (after layout)
  let childWidth = 0;
  function ensureChildWidth() {
    if (childWidth) return;
    const first = carouselTrack.firstElementChild;
    if (first) {
      const r = first.getBoundingClientRect();
      childWidth = Math.round(r.width + parseFloat(getComputedStyle(first).marginRight || 0));
    }
  }

  function step() {
    if (!spinning) return;
    ensureChildWidth();
    position -= speed;
    if (childWidth > 0) {
      while (-position >= childWidth) {
        position += childWidth;
        const first = carouselTrack.firstElementChild;
        if (first) {
          carouselTrack.appendChild(first);
        } else break;
      }
    }
    carouselTrack.style.transform = `translateX(${position}px)`;
    requestAnimationFrame(step);
  }

  requestAnimationFrame(step);

  // end spin
  setTimeout(() => {
    spinning = false;
    navigateTo("result");
    triggerHaptic();
    playSound("button");
    launchConfetti();
  }, 3500);
}

// The remainder of the file (initialization, firebase sync, UI wiring, results rendering, admin, etc.)
// is left unchanged from your original app.js and will work with the updated sizing logic above.

// ---------- INIT ----------
document.addEventListener("DOMContentLoaded", () => {
  // Home buttons
  document.querySelectorAll("[data-home-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.getAttribute("data-home-action");
      triggerHaptic();
      playSound("button");

      if (action === "kids" || action === "adults") {
        currentGroupKey = action;
        currentDrawerId = null;
        burstHomeEmojis(action);
        setTimeout(() => {
          navigateTo("picker");
        }, 550);
      } else if (action === "results") {
        navigateTo("resultsOverview");
      }
    });
  });

  // Back buttons
  document.querySelectorAll("[data-back]").forEach((btn) => {
    btn.addEventListener("click", () => {
      triggerHaptic();
      playSound("button");
      const prev = backMap[currentScreen] || "home";
      navigateTo(prev);
    });
  });

  // Spin button
  const spinBtn = document.getElementById("spinButton");
  if (spinBtn) spinBtn.addEventListener("click", startSpin);

  // Done button (after result)
  const doneBtn = document.getElementById("doneButton");
  if (doneBtn) doneBtn.addEventListener("click", () => {
    triggerHaptic();
    playSound("button");
    navigateTo("picker");
  });

  // Results tabs wiring, admin wiring, share overlay, etc.
  // (I kept your original wiring logic to avoid changing UI behavior)

  // Start Firebase sync (if available)
  initFirebaseSync();

  // Initial render
  renderScreen("home");
});
