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

// ---------- DATA: your real kids + couples ----------

const groups = {
  kids: {
    label: "Kids",
    people: [
      { id: "Benson",  name: "Benson",  parentGroupId: "family1", photoUrl: "images/Benson.jpg" },
      { id: "Brooke",  name: "Brooke",  parentGroupId: "family1", photoUrl: "images/Brooke.jpg" },
      { id: "Dax",     name: "Dax",     parentGroupId: "family2", photoUrl: "images/Dax.jpg" },
      { id: "Lexi",    name: "Lexi",    parentGroupId: "family2", photoUrl: "images/Lexi.jpg" },
      { id: "Madison", name: "Madison", parentGroupId: "family1", photoUrl: "images/Madison.jpg" },
      { id: "Colton",  name: "Colton",  parentGroupId: "family3", photoUrl: "images/Colton.jpg" },
      { id: "CJ",      name: "CJ",      parentGroupId: "family4", photoUrl: "images/CJ.jpg" },
      { id: "Aubrey",  name: "Aubrey",  parentGroupId: "family4", photoUrl: "images/Aubrey.jpg" }
    ]
  },

  adults: {
    label: "Parents",
    people: [
      {
        id: "family1",
        name: "Greg & Sara",
        photoUrl: "images/Greg_Sara.jpg",
        phoneNumber: "" // e.g. "+1..."
      },
      {
        id: "family3",
        name: "Nick & Valerie",
        photoUrl: "images/Nick_Valerie.jpg",
        phoneNumber: ""
      },
      {
        id: "family2",
        name: "Mark & Lacee",
        photoUrl: "images/Mark_Lacee.jpg",
        phoneNumber: ""
      },
      {
        id: "family4",
        name: "Beth & Calvin",
        photoUrl: "images/Beth_Calvin.jpg",
        phoneNumber: ""
      }
    ]
  }
};

// Assignments stored separately per group
const assignmentsByGroup = {
  kids: [],
  adults: []
};

// Directed exclusions per group: drawerId -> [recipientIds]
// Kids: add entries like "Benson": ["Lexi"] if needed.
// Adults map left empty but ready for future use.
const disallowedPairsByGroup = {
  kids: {
    // "Benson": ["Lexi"]
  },
  adults: {
    // "family1": ["family2"]
  }
};

// ---------- ADMIN RESET HELPERS ----------

async function resetGroupAssignments(groupKey) {
  const fieldName = groupKey === "kids" ? "kidsAssignments" : "adultsAssignments";
  assignmentsByGroup[groupKey] = [];
  if (firebaseReady) {
    await updateDoc(sessionRef, { [fieldName]: [] });
  }
}

async function resetAllAssignments() {
  assignmentsByGroup.kids = [];
  assignmentsByGroup.adults = [];
  if (firebaseReady) {
    await updateDoc(sessionRef, {
      kidsAssignments: [],
      adultsAssignments: []
    });
  }
}

async function resetSingleDrawer(groupKey, drawerId) {
  const fieldName = groupKey === "kids" ? "kidsAssignments" : "adultsAssignments";
  const current = assignmentsByGroup[groupKey];
  const updated = current.filter((a) => a.drawerId !== drawerId);
  assignmentsByGroup[groupKey] = updated;
  if (firebaseReady) {
    await updateDoc(sessionRef, { [fieldName]: updated });
  }
}

let adminStatusTimeout = null;
function showAdminStatus(message) {
  const el = document.getElementById("adminStatus");
  if (!el) return;
  el.textContent = message;
  if (adminStatusTimeout) clearTimeout(adminStatusTimeout);
  adminStatusTimeout = setTimeout(() => {
    el.textContent = "";
  }, 3000);
}

function renderAdmin() {
  // highlight selected group pill
  document.querySelectorAll("[data-admin-group]").forEach((btn) => {
    const key = btn.getAttribute("data-admin-group");
    btn.classList.toggle("admin-pill--active", key === adminSelectedGroup);
  });

  const listEl = document.getElementById("adminDrawerList");
  if (!listEl) return;
  listEl.innerHTML = "";

  const groupKey = adminSelectedGroup;
  const group = groups[groupKey];
  if (!group) return;

  const assignments = assignmentsByGroup[groupKey];
  const drawerIds = new Set(assignments.map((a) => a.drawerId));
  const peopleWithAssignments = group.people.filter((p) => drawerIds.has(p.id));

  if (!peopleWithAssignments.length) {
    const p = document.createElement("p");
    p.className = "results-text-sub";
    p.textContent = "No drawers with assignments yet.";
    listEl.appendChild(p);
    return;
  }

  peopleWithAssignments.forEach((person) => {
    const row = document.createElement("div");
    row.className = "admin-list-item";

    const span = document.createElement("span");
    span.textContent = person.name;

    const btn = document.createElement("button");
    btn.textContent = "Clear";
    btn.addEventListener("click", async () => {
      triggerHaptic();
      playSound("button");
      await resetSingleDrawer(groupKey, person.id);
      showAdminStatus(`Cleared assignment for ${person.name}.`);
      renderAdmin();
    });

    row.appendChild(span);
    row.appendChild(btn);
    listEl.appendChild(row);
  });

  renderAdminFamilyCards();
}

function renderAdminFamilyCards() {
  // highlight style pills
  document.querySelectorAll("[data-card-style]").forEach((btn) => {
    const style = btn.getAttribute("data-card-style");
    btn.classList.toggle("admin-pill--active", style === cardStyle);
  });

  const container = document.getElementById("adminFamilyCards");
  if (!container) return;
  container.innerHTML = "";

  const adultsGroup = groups.adults;
  const couples = adultsGroup.people;

  couples.forEach((couple) => {
    const row = document.createElement("div");
    row.className = "admin-list-item";

    const nameSpan = document.createElement("span");
    nameSpan.textContent = couple.name;

    const btn = document.createElement("button");
    btn.textContent = "Preview card";
    btn.className = "admin-family-preview-btn";
    btn.setAttribute("data-family-id", couple.id);

    row.appendChild(nameSpan);
    row.appendChild(btn);
    container.appendChild(row);
  });

  setupAdminFamilyCardButtons();
}

function setupAdminFamilyCardButtons() {
  const buttons = document.querySelectorAll(".admin-family-preview-btn");
  const overlay = document.getElementById("shareOverlay");
  const imgEl = document.getElementById("shareCardImage");

  buttons.forEach((btn) => {
    btn.onclick = async () => {
      const familyId = btn.getAttribute("data-family-id");
      if (!familyId) return;

      triggerHaptic();
      playSound("button");

      const dataUrl = await buildFamilyCardImage(familyId);
      if (!dataUrl) {
        alert("No assignments found for that family yet.");
        return;
      }

      if (overlay && imgEl) {
        imgEl.src = dataUrl;
        overlay.classList.add("active");
      }
    };
  });
}

async function buildFamilyCardImage(familyId) {
  const canvas = document.getElementById("familyCardCanvas");
  if (!canvas) return "";
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const w = canvas.width;
  const h = canvas.height;

  const adultsGroup = groups.adults;
  const kidsGroup = groups.kids;

  const couple = adultsGroup.people.find((p) => p.id === familyId);
  if (!couple) return "";

  const adultAssignment = assignmentsByGroup.adults.find(
    (a) => a.drawerId === familyId
  );
  let adultLine;
  if (adultAssignment) {
    const adultRecipient = adultsGroup.people.find(
      (p) => p.id === adultAssignment.recipientId
    );
    adultLine = adultRecipient
      ? `${couple.name} have picked ${adultRecipient.name}.`
      : `${couple.name} have picked someone, but recipient wasn't found.`;
  } else {
    adultLine = `${couple.name} have not picked anyone yet.`;
  }

  const kids = kidsGroup.people.filter(
    (child) => child.parentGroupId === familyId
  );

  const kidLines = [];
  kids.forEach((child) => {
    const childAssignment = assignmentsByGroup.kids.find(
      (a) => a.drawerId === child.id
    );
    if (childAssignment) {
      const kidRecipient = kidsGroup.people.find(
        (p) => p.id === childAssignment.recipientId
      );
      if (kidRecipient) {
        kidLines.push(`${child.name} has picked ${kidRecipient.name}.`);
      } else {
        kidLines.push(
          `${child.name} has picked someone, but recipient wasn't found.`
        );
      }
    } else {
      kidLines.push(`${child.name} has not picked anyone yet.`);
    }
  });

  // Clear canvas
  ctx.clearRect(0, 0, w, h);

  if (cardStyle === "festive") {
    drawFestiveFamilyCard(ctx, w, h, adultLine, kidLines, couple.name);
  } else {
    drawSimpleFamilyCard(ctx, w, h, adultLine, kidLines, couple.name);
  }

  return canvas.toDataURL("image/png");
}

function drawSimpleFamilyCard(ctx, w, h, adultLine, kidLines, coupleName) {
  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, "#fdfcfb");
  bgGrad.addColorStop(1, "#e2d1f9");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // White panel
  const margin = 32;
  const panelRadius = 24;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, margin, margin + 40, w - margin * 2, h - margin * 2 - 40, panelRadius, true);

  // Title
  ctx.fillStyle = "#5b1f0d";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 30px system-ui";
  ctx.fillText("Christmas Gift Exchange 2025", w / 2, margin + 20);

  // Couple name + adult line
  let y = margin + 90;
  ctx.textAlign = "left";
  ctx.fillStyle = "#4b1f0b";
  ctx.font = "bold 24px system-ui";
  ctx.fillText(coupleName, margin + 24, y);

  y += 34;
  ctx.font = "18px system-ui";
  wrapText(ctx, adultLine, margin + 24, y, w - (margin + 24) * 2, 24);

  // Kids
  y += 70;
  ctx.font = "bold 20px system-ui";
  ctx.fillText("Kids", margin + 24, y);
  y += 26;

  ctx.font = "18px system-ui";
  if (!kidLines.length) {
    wrapText(
      ctx,
      "No kids linked to this family.",
      margin + 24,
      y,
      w - (margin + 24) * 2,
      24
    );
  } else {
    kidLines.forEach((line) => {
      wrapText(
        ctx,
        "• " + line,
        margin + 24,
        y,
        w - (margin + 24) * 2,
        24
      );
      y += 32;
    });
  }

  // Footer hint in-image
  ctx.font = "14px system-ui";
  ctx.fillStyle = "#6b3a1b";
  ctx.textAlign = "center";
  ctx.fillText(
    "Save this card and send it in a text.",
    w / 2,
    h - margin - 10
  );
}

function drawFestiveFamilyCard(ctx, w, h, adultLine, kidLines, coupleName) {
  // Warm gradient background
  const bgGrad = ctx.createLinearGradient(0, 0, w, h);
  bgGrad.addColorStop(0, "#ff9a9e");
  bgGrad.addColorStop(0.5, "#fecf6a");
  bgGrad.addColorStop(1, "#f6d365");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // Dark header band
  ctx.fillStyle = "rgba(91, 31, 13, 0.9)";
  ctx.fillRect(0, 0, w, 80);

  ctx.fillStyle = "#fff8e5";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 30px system-ui";
  ctx.fillText("Christmas Gift Exchange 2025", w / 2, 40);

  // Little "lights"
  for (let i = 0; i < 18; i++) {
    const x = (w / 18) * i + 10;
    const y = 78;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = i % 3 === 0 ? "#ffe066" : i % 3 === 1 ? "#ff6b6b" : "#51cf66";
    ctx.fill();
  }

  // Cream panel
  const margin = 32;
  roundRect(
    ctx,
    margin,
    90,
    w - margin * 2,
    h - margin * 2 - 15,
    24,
    true,
    "rgba(255,248,229,0.96)"
  );

  let y = 130;
  ctx.textAlign = "left";
  ctx.fillStyle = "#4b1f0b";
  ctx.font = "bold 24px system-ui";
  ctx.fillText(coupleName, margin + 24, y);

  y += 34;
  ctx.font = "18px system-ui";
  wrapText(ctx, adultLine, margin + 24, y, w - (margin + 24) * 2, 24);

  // Kids section
  y += 70;
  ctx.font = "bold 20px system-ui";
  ctx.fillText("Kids", margin + 24, y);
  y += 26;

  ctx.font = "18px system-ui";
  if (!kidLines.length) {
    wrapText(
      ctx,
      "No kids linked to this family.",
      margin + 24,
      y,
      w - (margin + 24) * 2,
      24
    );
  } else {
    kidLines.forEach((line) => {
      wrapText(
        ctx,
        "• " + line,
        margin + 24,
        y,
        w - (margin + 24) * 2,
        24
      );
      y += 32;
    });
  }

  // Footer hint
  ctx.font = "14px system-ui";
  ctx.fillStyle = "#6b3a1b";
  ctx.textAlign = "center";
  ctx.fillText(
    "Save this card and send it in a text.",
    w / 2,
    h - margin - 10
  );
}

// Utility: rounded rectangle
function roundRect(ctx, x, y, width, height, radius, fill, fillStyleOverride) {
  const r = radius || 5;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fillStyleOverride || "#ffffff";
    ctx.fill();
  }
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + " ";
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}


// ---------- FIRESTORE SYNC ----------

async function initFirebaseSync() {
  try {
    // 1) Make sure the session document exists
    const snap = await getDoc(sessionRef);
    if (!snap.exists()) {
      await setDoc(sessionRef, {
        kidsAssignments: [],
        adultsAssignments: []
      });
      assignmentsByGroup.kids = [];
      assignmentsByGroup.adults = [];
    } else {
      const data = snap.data();
      assignmentsByGroup.kids = data.kidsAssignments || [];
      assignmentsByGroup.adults = data.adultsAssignments || [];
    }

    // 2) Live updates so all phones stay in sync
    onSnapshot(sessionRef, (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      assignmentsByGroup.kids = data.kidsAssignments || [];
      assignmentsByGroup.adults = data.adultsAssignments || [];

      // If someone is on these screens, refresh them with latest data
      if (currentScreen === "picker") renderScreen("picker");
      if (currentScreen === "resultsOverview") renderScreen("resultsOverview");
    });

    firebaseReady = true;
  } catch (err) {
    console.error("Error initializing Firebase/Firestore:", err);
    // If this fails, app still works locally, just not synced.
  }
}

// ---------- HAPTIC & SOUND ----------

function triggerHaptic() {
  if (navigator.vibrate) {
    navigator.vibrate(30);
  }
}

const sounds = {
  button: new Audio("sounds/button.mp3")
};

function playSound(name) {
  const sound = sounds[name];
  if (!sound) return;
  sound.currentTime = 0;
  sound.play().catch(() => {});
}

// ---------- SIMPLE NAVIGATION (no history back) ----------

let currentScreen = "home";         // "home" | "picker" | "spin" | "result" | "resultsOverview"
let currentGroupKey = null;         // "kids" | "adults"
let currentDrawerId = null;
let lastResult = null;
let adminSelectedGroup = "kids";
let cardStyle = "simple"; // "simple" or "festive"
let wreathAnimationId = null;
let wreathAngleOffset = 0;
let wreathRadius = 90;


function getCurrentGroup() {
  if (!currentGroupKey) return null;
  return groups[currentGroupKey];
}

function navigateTo(screenId) {
  currentScreen = screenId;
  renderScreen(screenId);
}

function renderScreen(screenId) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  const el = document.getElementById(`screen-${screenId}`);
  if (!el) return;
  el.classList.add("active");

  if (screenId === "home") {
    // nothing extra
  } else if (screenId === "picker") {
    renderPicker();
  } else if (screenId === "spin") {
    if (!currentGroupKey || !currentDrawerId) {
      navigateTo("home");
      return;
    }
    setupWheelForCurrentGroup();
  } else if (screenId === "result") {
    if (!lastResult) {
      navigateTo("picker");
      return;
    }
    populateResultFromLast();
  } else if (screenId === "resultsOverview") {
    renderResultsOverview();
  } else if (screenId === "admin") {
    renderAdmin();
  }
}

// Back mapping: where each screen’s back arrow goes
const backMap = {
  picker: "home",
  spin: "picker",
  result: "picker",
  resultsOverview: "home",
  admin: "home"
};


// ---------- PICKER ----------

function renderPicker() {
  const group = getCurrentGroup();
  if (!group) {
    navigateTo("home");
    return;
  }

  const list = document.getElementById("personList");
  list.innerHTML = "";

  const assignments = assignmentsByGroup[currentGroupKey];
  const doneDrawerIds = new Set(assignments.map((a) => a.drawerId));

  group.people.forEach((person) => {
    const isDone = doneDrawerIds.has(person.id);

    const li = document.createElement("li");
    li.className = "child-item";

    const pill = document.createElement("div");
    pill.className = "child-pill";

    if (isDone) {
      pill.classList.add("child-pill--done");
    } else {
      pill.classList.add("child-pill--active");
      pill.addEventListener("click", () => {
        triggerHaptic();
        playSound("button");
        currentDrawerId = person.id;
        navigateTo("spin");
      });
    }

    pill.innerHTML = `
      <img src="${person.photoUrl}" alt="${person.name}">
      <span>${person.name}${isDone ? " (done)" : ""}</span>
    `;

    li.appendChild(pill);
    list.appendChild(li);
  });
}

// ---------- WHEEL + SPIN ----------

function setupWheelForCurrentGroup() {
  const group = getCurrentGroup();
  if (!group) return;

  const people = group.people;
  const wheel = document.getElementById("ferrisWheel");
  const carousel = document.getElementById("carousel");
  const carouselTrack = document.getElementById("carouselTrack");

  // Reset visuals
  wheel.innerHTML = "";
  carouselTrack.innerHTML = "";
  wheel.style.opacity = "1";
  wheel.style.transform = "scale(1)";
  carousel.style.display = "none";
  carouselTrack.style.transform = "translateX(0)";

  const count = people.length;
  wreathRadius = 120;       // was 90, then was 100
  wreathAngleOffset = 0;

  // tweak these if you want to nudge the ring inside the wreath
  const offsetX = 0;       // move faces a little left
  const offsetY = 0;        // move faces a little down

  // --- WREATH FACES (circle, upright) ---
  people.forEach((person, index) => {
    const baseAngle = (index / count) * 2 * Math.PI;
    const x = wreathRadius * Math.cos(baseAngle);
    const y = wreathRadius * Math.sin(baseAngle);

    const div = document.createElement("div");
    div.className = "wheel-child";
    div.dataset.baseAngle = String(baseAngle);
    div.dataset.offsetX = String(offsetX);
    div.dataset.offsetY = String(offsetY);

    div.style.left = "50%";
    div.style.top = "50%";
    /*div.style.transform =
    `translate(-50%, -50%) translate(${x + offsetX}px, ${y + offsetY}px)`;*/

    div.innerHTML = `<img src="${person.photoUrl}" alt="${person.name}">`;
    wheel.appendChild(div);
  });

  // --- HORIZONTAL CAROUSEL (3 copies for looping) ---
  const all = [...people, ...people, ...people];
  all.forEach((person) => {
    const item = document.createElement("div");
    item.className = "carousel-child"; // match the CSS
    item.innerHTML = `<img src="${person.photoUrl}" alt="${person.name}">`;
    carouselTrack.appendChild(item);
  });


  // Restart the wreath orbit animation
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

  wreathAngleOffset += 0.01;

  const children = wheel.querySelectorAll(".wheel-child");
  children.forEach((div) => {
    const base = parseFloat(div.dataset.baseAngle || "0");
    const angle = base + wreathAngleOffset;
    const x = wreathRadius * Math.cos(angle);
    const y = wreathRadius * Math.sin(angle);
    const offsetX = parseFloat(div.dataset.offsetX || "0");
    const offsetY = parseFloat(div.dataset.offsetY || "0");

    div.style.transform =
      `translate(-50%, -50%) translate(${x + offsetX}px, ${y + offsetY}px)`;
  });

  wreathAnimationId = requestAnimationFrame(animateWreath);
}



function getPossibleRecipients(groupKey, drawerId) {
  const group = groups[groupKey];
  if (!group) return [];

  const people = group.people;
  const me = people.find((p) => p.id === drawerId);
  if (!me) return [];

  const assignments = assignmentsByGroup[groupKey];
  const takenRecipientIds = new Set(assignments.map((a) => a.recipientId));

  const disallowedMap = disallowedPairsByGroup[groupKey] || {};

  return people.filter((person) => {
    // not self
    if (person.id === me.id) return false;

    // not already recipient
    if (takenRecipientIds.has(person.id)) return false;

    // kids-only: not sibling
    if (
      groupKey === "kids" &&
      me.parentGroupId &&
      person.parentGroupId &&
      me.parentGroupId === person.parentGroupId
    ) {
      return false;
    }

    // directed disallowed
    const disallowedList = disallowedMap[me.id] || [];
    if (disallowedList.includes(person.id)) return false;

    return true;
  });
}

function startSpin() {
  if (!currentGroupKey || !currentDrawerId) {
    alert("Please go back and pick who is drawing first.");
    return;
  }

  const possible = getPossibleRecipients(currentGroupKey, currentDrawerId);
  if (possible.length === 0) {
    alert("There are no valid people left for this drawer. Please contact the organizer.");
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
    const fieldName =
      currentGroupKey === "kids" ? "kidsAssignments" : "adultsAssignments";

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

  // fade + shrink wreath
  wheel.style.opacity = "0";
  wheel.style.transform = "scale(0.9)";

  // show carousel shortly after
  setTimeout(() => {
    carousel.style.display = "block";
  }, 400);

    // --- looping horizontal spin (no gaps) ---
  let position = 0;
  const speed = 11;
  let spinning = true;
  let childWidth = 0;

  function step() {
    if (!spinning) return;

    // move the whole row left
    position -= speed;

    // measure one face width once we have layout
    if (!childWidth) {
      const first = carouselTrack.firstElementChild;
      if (first) {
        childWidth = first.offsetWidth;
      }
    }

    // whenever we've scrolled past one full face,
    // move that face from the front to the end and adjust position
    if (childWidth > 0) {
      while (-position >= childWidth) {
        position += childWidth;
        const first = carouselTrack.firstElementChild;
        if (first) {
          carouselTrack.appendChild(first);
        } else {
          break; // no children, bail out
        }
      }
    }

    carouselTrack.style.transform = `translateX(${position}px)`;
    requestAnimationFrame(step);
  }

  requestAnimationFrame(step);


  // stop the spin & show result after a bit longer
  setTimeout(() => {
    spinning = false;
    navigateTo("result");
    triggerHaptic();
    playSound("button");
    launchConfetti();
  }, 3500); // tweak this if you want longer/shorter
}


// ---------- RESULT ----------

function populateResultFromLast() {
  if (!lastResult) return;

  const { groupKey, drawerId, recipientId } = lastResult;
  const group = groups[groupKey];
  if (!group) return;

  const drawer = group.people.find((p) => p.id === drawerId);
  const recipient = group.people.find((p) => p.id === recipientId);
  if (!drawer || !recipient) return;

  const drawerImg = document.getElementById("drawerImg");
  const drawerName = document.getElementById("drawerName");
  const recipientImg = document.getElementById("recipientImg");
  const recipientName = document.getElementById("recipientName");
  const resultText = document.getElementById("resultText");

  drawerImg.src = drawer.photoUrl;
  drawerImg.alt = drawer.name;
  drawerName.textContent = drawer.name;

  recipientImg.src = recipient.photoUrl;
  recipientImg.alt = recipient.name;
  recipientName.textContent = recipient.name;

  resultText.textContent = `${drawer.name} has picked ${recipient.name} for the gift exchange.`;
}

// ---------- CONFETTI ----------

function launchConfetti() {
  const layer = document.getElementById("confettiLayer");
  layer.innerHTML = "";

  const colors = ["#ffe066", "#ff6b6b", "#51cf66", "#339af0", "#f783ac"];
  const count = 70;

  for (let i = 0; i < count; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";

    const startX = window.innerWidth / 2;
    const spread = 180;
    const offsetX = (Math.random() - 0.5) * spread;

    piece.style.left = `${startX}px`;
    piece.style.bottom = "40%";
    piece.style.background =
      colors[Math.floor(Math.random() * colors.length)];
    piece.style.setProperty("--x", `${offsetX}px`);

    layer.appendChild(piece);

    setTimeout(() => piece.remove(), 1000);
  }
}

// ---------- RESULTS OVERVIEW ----------

function renderResultsOverview() {
  const kidsContainer = document.getElementById("resultsKids");
  const adultsContainer = document.getElementById("resultsAdults");

  kidsContainer.innerHTML = "";
  adultsContainer.innerHTML = "";

  // Kids
  const kidsAssignments = assignmentsByGroup.kids;
  const kidsGroup = groups.kids;

  kidsAssignments.forEach((a) => {
    const drawer = kidsGroup.people.find((p) => p.id === a.drawerId);
    const recipient = kidsGroup.people.find((p) => p.id === a.recipientId);
    if (!drawer || !recipient) return;

    const card = document.createElement("div");
    card.className = "results-card";
    card.innerHTML = `
      <div class="results-row">
        <div class="results-avatar">
          <img src="${drawer.photoUrl}" alt="${drawer.name}">
        </div>
        <div>
          <div class="results-text-main">${drawer.name}</div>
          <div class="results-text-sub">has picked</div>
        </div>
        <div class="results-avatar">
          <img src="${recipient.photoUrl}" alt="${recipient.name}">
        </div>
        <div class="results-text-main">${recipient.name}</div>
      </div>
    `;
    kidsContainer.appendChild(card);
  });

  // Adults
  const adultsAssignments = assignmentsByGroup.adults;
  const adultsGroup = groups.adults;

  adultsAssignments.forEach((a) => {
    const drawer = adultsGroup.people.find((p) => p.id === a.drawerId);
    const recipient = adultsGroup.people.find((p) => p.id === a.recipientId);
    if (!drawer || !recipient) return;

    const card = document.createElement("div");
    card.className = "results-card";
    card.innerHTML = `
      <div class="results-row">
        <div class="results-avatar">
          <img src="${drawer.photoUrl}" alt="${drawer.name}">
        </div>
        <div>
          <div class="results-text-main">${drawer.name}</div>
          <div class="results-text-sub">have picked</div>
        </div>
        <div class="results-avatar">
          <img src="${recipient.photoUrl}" alt="${recipient.name}">
        </div>
        <div class="results-text-main">${recipient.name}</div>
      </div>
    `;
    adultsContainer.appendChild(card);
  });
}

// ---------- HOME EMOJI BURSTS ----------

function burstHomeEmojis(type) {
  const layer = document.getElementById("homeAnimationLayer");
  layer.innerHTML = "";

  const isKids = type === "kids";
  const emojis = isKids
    ? ["🧒", "👧", "👦", "🎈", "🎁"]
    : ["👨‍👩‍👧", "👨‍👩‍👧‍👦", "😅", "🏃‍♂️", "🏃‍♀️"];

  const count = 10;

  for (let i = 0; i < count; i++) {
    const span = document.createElement("span");
    span.className = "home-emoji";
    span.textContent = emojis[Math.floor(Math.random() * emojis.length)];

    const x = window.innerWidth / 2 + (Math.random() - 0.5) * 140;
    const y = window.innerHeight / 2 + (Math.random() - 0.3) * 80;

    const dx = (Math.random() - 0.5) * 220;
    const dy = -80 - Math.random() * 80;

    span.style.left = `${x}px`;
    span.style.top = `${y}px`;
    span.style.setProperty("--dx", `${dx}px`);
    span.style.setProperty("--dy", `${dy}px`);

    layer.appendChild(span);
    setTimeout(() => span.remove(), 800);
  }
}

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
  document.getElementById("spinButton").addEventListener("click", startSpin);

  // Done button (after result)
  document.getElementById("doneButton").addEventListener("click", () => {
    triggerHaptic();
    playSound("button");
    navigateTo("picker");
  });

  // Results tabs
  document.querySelectorAll("[data-results-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-results-tab");
      triggerHaptic();
      playSound("button");

      document.querySelectorAll(".results-tab").forEach((t) =>
        t.classList.remove("results-tab--active")
      );
      tab.classList.add("results-tab--active");

      document.querySelectorAll(".results-list").forEach((list) =>
        list.classList.remove("active")
      );

      if (target === "kids") {
        document.getElementById("resultsKids").classList.add("active");
      } else {
        document.getElementById("resultsAdults").classList.add("active");
      }
    });

      // Admin buttons
  document.querySelectorAll("[data-admin-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.getAttribute("data-admin-action");
      triggerHaptic();
      playSound("button");

      if (action === "reset-kids") {
        await resetGroupAssignments("kids");
        showAdminStatus("Kids assignments reset.");
      } else if (action === "reset-adults") {
        await resetGroupAssignments("adults");
        showAdminStatus("Parents assignments reset.");
      } else if (action === "reset-all") {
        await resetAllAssignments();
        showAdminStatus("All assignments reset.");
      }
      renderAdmin();
    });
  });

    // Card style toggles
  document.querySelectorAll("[data-card-style]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const style = btn.getAttribute("data-card-style");
      cardStyle = style === "festive" ? "festive" : "simple";
      triggerHaptic();
      playSound("button");
      renderAdminFamilyCards();
    });
  });

  // Share overlay close
  const shareOverlay = document.getElementById("shareOverlay");
  const shareCloseBtn = document.getElementById("shareCloseBtn");
  if (shareOverlay && shareCloseBtn) {
    shareCloseBtn.addEventListener("click", () => {
      triggerHaptic();
      playSound("button");
      shareOverlay.classList.remove("active");
    });

    // close if tapping background
    shareOverlay.addEventListener("click", (e) => {
      if (e.target === shareOverlay) {
        shareOverlay.classList.remove("active");
      }
    });
  }


  // Admin group toggle (kids / adults)
  document.querySelectorAll("[data-admin-group]").forEach((btn) => {
    btn.addEventListener("click", () => {
      adminSelectedGroup = btn.getAttribute("data-admin-group");
      triggerHaptic();
      playSound("button");
      renderAdmin();
    });
  });

  // Secret long-press on main title to open Admin
  const mainTitle = document.querySelector(".main-title");
  if (mainTitle) {
    let pressTimer = null;
    let tapCount = 0;
    let lastTapTime = 0;

    const openAdmin = () => {
      triggerHaptic();
      playSound("button");
      navigateTo("admin");
    };

    // Long-press (desktop & touch)
    const startPress = () => {
      pressTimer = setTimeout(openAdmin, 700); // a bit quicker
    };

    const cancelPress = () => {
      if (pressTimer !== null) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };

    mainTitle.addEventListener("mousedown", startPress);
    mainTitle.addEventListener("mouseup", cancelPress);
    mainTitle.addEventListener("mouseleave", cancelPress);

    mainTitle.addEventListener("touchstart", (e) => {
      startPress();
    });
    mainTitle.addEventListener("touchend", (e) => {
      cancelPress();
    });
    mainTitle.addEventListener("touchcancel", (e) => {
      cancelPress();
    });

    // Triple-tap / triple-click fallback
    mainTitle.addEventListener("click", () => {
      const now = Date.now();
      if (now - lastTapTime < 500) {
        tapCount += 1;
        if (tapCount >= 3) {
          openAdmin();
          tapCount = 0;
        }
      } else {
        tapCount = 1;
      }
      lastTapTime = now;
    });
  }


  });

    // Start Firebase sync (doesn't block the UI)
  initFirebaseSync();

  // Initial render
  renderScreen("home");
});


