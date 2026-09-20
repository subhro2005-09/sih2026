// Main Application Logic for iGOT Karmayogi Skill Intelligence Platform

const API_BASE = "";

// Authentication & Session Management State
let currentUser = null;
let authMode = "login"; // 'login' or 'register'

function checkAuthState() {
  const storedUser = localStorage.getItem('karmayogi_user');
  if (storedUser) {
    try {
      currentUser = JSON.parse(storedUser);
      renderLoggedInState();
      return;
    } catch (e) {
      localStorage.removeItem('karmayogi_user');
      localStorage.removeItem('authToken');
    }
  }
  renderLoggedOutState();
}
async function requestQuiz(topicName, retryCount = 0) {
  const formData = new FormData();
  formData.append("topic", topicName);

  const res = await fetch(`${API_BASE}/api/generate-quiz`, {
    method: "POST",
    body: formData
  });

  if (res.status === 503 && retryCount < 2) {
    console.warn("Server indicated busy. Retrying in 2 seconds...");
    await new Promise(resolve => setTimeout(resolve, 2000));
    return requestQuiz(topicName, retryCount + 1);
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || "Failed to generate assessment.");
  }
  return data;
}
// Keep track of the active quiz score
let currentQuizScore = {
  answered: 0,
  correct: 0,
  total: 0,
  topic: ""
};

// Update renderQuizQuestions to track score and topic
const originalRenderQuizQuestions = renderQuizQuestions;
function renderQuizQuestions(quizData) {
  currentQuizScore = {
    answered: 0,
    correct: 0,
    total: quizData.length,
    topic: currentUploadedFileName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ") || "General Assessment"
  };
  originalRenderQuizQuestions(quizData);
}

// Modify checkAnswer to record selection and submit upon completion
const originalCheckAnswer = checkAnswer;
function checkAnswer(qId, selectedIdx, correctIdx) {
  originalCheckAnswer(qId, selectedIdx, correctIdx);

  currentQuizScore.answered += 1;
  if (selectedIdx === correctIdx) {
    currentQuizScore.correct += 1;
  }

  // Submit to PostgreSQL when all questions are answered
  if (currentQuizScore.answered === currentQuizScore.total) {
    submitQuizResult();
  }
}

async function submitQuizResult() {
  if (!currentUser || !currentUser.id) return;

  const payload = {
    employee_id: currentUser.id,
    topic: currentQuizScore.topic,
    score: currentQuizScore.correct,
    total_questions: currentQuizScore.total
  };

  try {
    const res = await fetch(`${API_BASE}/api/quiz/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok) {
      alert(`Quiz completed! Score: ${currentQuizScore.correct}/${currentQuizScore.total} (${data.percentage}%). Saved to your official profile.`);
      loadQuizHistory();
    }
  } catch (err) {
    console.error("Failed to save quiz result:", err);
  }
}

// Fetch and display quiz history from PostgreSQL
async function loadQuizHistory() {
  const tbody = document.getElementById('quizHistoryTableBody');
  if (!tbody || !currentUser || !currentUser.id) return;

  try {
    const res = await fetch(`${API_BASE}/api/quiz/history/${currentUser.id}`);
    const data = await res.json();

    if (!res.ok || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:15px; color:#94A3B8;">No assessments completed yet. Take a quiz using the AI Assessment Engine!</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(item => `
      <tr style="border-bottom:1px solid #F1F5F9;">
        <td style="padding:10px 8px; font-weight:600; color:#1E293B;">${item.topic}</td>
        <td style="padding:10px 8px;">${item.score}</td>
        <td style="padding:10px 8px; font-weight:700; color:${item.percentage >= 70 ? '#16A34A' : '#D97706'};">${item.percentage}%</td>
        <td style="padding:10px 8px; color:#64748B;">${item.date}</td>
        <td style="padding:10px 8px;">
          <span style="background:${item.percentage >= 70 ? '#DCFCE7' : '#FEF3C7'}; color:${item.percentage >= 70 ? '#15803D' : '#B45309'}; padding:2px 8px; border-radius:4px; font-size:0.75rem; font-weight:600;">
            ${item.percentage >= 70 ? 'Passed' : 'Needs Review'}
          </span>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:12px; color:#DC2626;">Could not load assessment history.</td></tr>`;
  }
}

function loginUser(userData) {
  const now = new Date();
  const formattedTime = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ", " +
    now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + " IST";

  // Format user details returned from PostgreSQL
  currentUser = {
    id: userData.id || null,
    email: userData.email,
    name: userData.email.split('@')[0].toUpperCase(),
    title: `Officer (Cadre ID: GOI-${userData.id || 'N/A'}) • MoSPI`,
    experience: userData.years_of_experience || 0,
    lastLogin: formattedTime,
    loginTimestamp: now.getTime(),
    coursesCompleted: 14
  };

  localStorage.setItem('karmayogi_user', JSON.stringify(currentUser));
  closeLoginModal();
  renderLoggedInState();
}

function logoutUser() {
  currentUser = null;
  localStorage.removeItem('karmayogi_user');
  localStorage.removeItem('authToken');
  renderLoggedOutState();
}

function renderLoggedInState() {
  const preLoginSec = document.getElementById('pre-login-section');
  const loggedInDash = document.getElementById('logged-in-dashboard');
  const navAuthContainer = document.querySelector('.nav-auth-buttons');

  if (preLoginSec) preLoginSec.style.display = 'none';
  if (loggedInDash) loggedInDash.style.display = 'block';

  // Update Header Auth Buttons
  if (navAuthContainer && currentUser) {
    navAuthContainer.innerHTML = `
      <div class="user-pill" style="font-size:0.85rem; font-weight:600; color:#1A73E8; margin-right:10px;">
        <i class="fas fa-user-circle"></i> ${currentUser.name} (${currentUser.experience} Yrs)
      </div>
      <button class="btn-login" onclick="logoutUser()">
        <i class="fas fa-sign-out-alt"></i> Log Out
      </button>
    `;
  }

  // Update Learner Profile Card
  const lName = document.getElementById('l-name');
  const lDesig = document.getElementById('l-desig');
  const lDept = document.getElementById('l-dept');
  if (lName) lName.textContent = currentUser.name;
  if (lDesig) lDesig.textContent = `Years of Service: ${currentUser.experience} Years`;
  if (lDept) lDept.textContent = currentUser.title;

  // Update User Banner Stats
  const nameEl = document.getElementById('dash-user-name');
  const titleEl = document.getElementById('dash-user-title');
  const loginEl = document.getElementById('dash-last-login');

  if (nameEl) nameEl.textContent = currentUser.name;
  if (titleEl) titleEl.textContent = currentUser.title;
  if (loginEl) loginEl.textContent = currentUser.lastLogin || "Today, 14:15 IST";

  updateTimeframeStats();

  // Resize charts after container becomes visible
  setTimeout(() => {
    if (competencyDonutChart) competencyDonutChart.resize();
    if (democratisedBarChart) democratisedBarChart.resize();
    if (learnerRadarChart) learnerRadarChart.resize();
    if (adminDeptChart) adminDeptChart.resize();
  }, 100);
}

function renderLoggedOutState() {
  const preLoginSec = document.getElementById('pre-login-section');
  const loggedInDash = document.getElementById('logged-in-dashboard');
  const navAuthContainer = document.querySelector('.nav-auth-buttons');

  if (preLoginSec) preLoginSec.style.display = 'block';
  if (loggedInDash) loggedInDash.style.display = 'none';

  if (navAuthContainer) {
    navAuthContainer.innerHTML = `
      <button class="btn-login" onclick="openLoginModal('login')">Log in</button>
      <button class="btn-register" onclick="openLoginModal('register')">Register</button>
    `;
  }
}

// Timeframe statistics calculation
function updateTimeframeStats() {
  const select = document.getElementById('timeframeSelect');
  const countEl = document.getElementById('dash-courses-count');
  const subEl = document.getElementById('dash-courses-timeframe');
  if (!select || !countEl || !subEl) return;

  const val = select.value;
  if (val === '30days') {
    countEl.textContent = "3 Courses Completed";
    subEl.textContent = "12.0 hrs logged • 3 Certificates (Last 30 Days)";
  } else if (val === '90days') {
    countEl.textContent = "8 Courses Completed";
    subEl.textContent = "28.5 hrs logged • 7 Certificates (Last 90 Days)";
  } else if (val === 'year') {
    countEl.textContent = "12 Courses Completed";
    subEl.textContent = "41.0 hrs logged • 10 Certificates (2026)";
  } else {
    countEl.textContent = "14 Courses Completed";
    subEl.textContent = "48.5 hrs logged • 12 Certificates (All Time)";
  }
}

// Authentication Form Listener (Handles Verification & Registration)
document.getElementById('authForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btnAuthSubmit');
  if (btn) btn.disabled = true;

  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;

  if (authMode === "login") {
    // LOGIN FLOW: Verifies email & password with PostgreSQL
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.detail || "Authentication Failed: Invalid credentials or user not found.");
        return;
      }

      // Save token and login user
      localStorage.setItem('authToken', data.access_token);
      loginUser(data.user);
      alert(`Welcome, ${data.user.email}! Access granted.`);

    } catch (err) {
      alert("Network Error: Could not connect to authentication server.");
    } finally {
      if (btn) btn.disabled = false;
    }

  } else {
    // REGISTRATION FLOW: Inserts new user into PostgreSQL
    const expVal = document.getElementById('authExp') ? (parseInt(document.getElementById('authExp').value, 10) || 5) : 5;
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, years_of_experience: expVal })
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.detail || "Registration failed. Please check inputs.");
        return;
      }

      alert("Registration successful! Please switch to Login mode to sign in.");
      switchAuthMode("login");

    } catch (err) {
      alert("Registration error: " + err.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }
});

function switchAuthMode(mode) {
  authMode = mode;
  const title = document.getElementById('modalTitle');
  const submitBtn = document.getElementById('btnAuthSubmit');
  const loginToggle = document.getElementById('btnToggleLogin');
  const regToggle = document.getElementById('btnToggleRegister');

  if (mode === "login") {
    if (title) title.innerHTML = '<i class="fas fa-shield-halved"></i> iGOT Employee Sign In';
    if (submitBtn) submitBtn.textContent = 'Sign In';
    if (loginToggle) loginToggle.style.opacity = '1';
    if (regToggle) regToggle.style.opacity = '0.5';
  } else {
    if (title) title.innerHTML = '<i class="fas fa-shield-halved"></i> iGOT Employee Registration';
    if (submitBtn) submitBtn.textContent = 'Register & Save to PostgreSQL';
    if (regToggle) regToggle.style.opacity = '1';
    if (loginToggle) loginToggle.style.opacity = '0.5';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initTickerValues();
  initCharts();
  initViewTabs();
  initRankingTabs();
  initIndiaMap();
  initQuizGenerator();
  initStatBot();
  initA11y();

  // Modal toggle listeners
  document.getElementById('btnToggleLogin')?.addEventListener('click', () => switchAuthMode('login'));
  document.getElementById('btnToggleRegister')?.addEventListener('click', () => switchAuthMode('register'));

  // Quick Demo Login Event Handler
  document.getElementById('btnQuickDemoLogin')?.addEventListener('click', () => {
    loginUser({ email: "official.iss@gov.in", years_of_experience: 12, id: 101 });
  });

  checkAuthState();
});

// 1. TICKER VALUES INITIALIZER
function initTickerValues() {
  if (typeof IGOT_DATA === 'undefined' || !IGOT_DATA.ticker) return;
  const d = IGOT_DATA.ticker;
  document.getElementById('t-learners').textContent = d.learners;
  document.getElementById('t-courses').textContent = d.courses;
  document.getElementById('t-gaps').textContent = d.skillGapsClosed;
  document.getElementById('t-certs').textContent = d.certifications;
  document.getElementById('t-officials').textContent = d.activeOfficials;
}

// 2. CHART.JS INITIALIZER
let competencyDonutChart, democratisedBarChart, learnerRadarChart, adminDeptChart;

function initCharts() {
  if (typeof IGOT_DATA === 'undefined') return;

  const ctxDonut = document.getElementById('chartCompetencyDonut');
  if (ctxDonut) {
    competencyDonutChart = new Chart(ctxDonut, {
      type: 'doughnut',
      data: IGOT_DATA.ruleToRole.competencyChartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10, weight: '700' } } },
          tooltip: {
            callbacks: {
              label: (context) => ` ${context.label}: ${context.raw} courses`
            }
          }
        }
      }
    });
  }

  const ctxBar = document.getElementById('chartDemocratisedBar');
  if (ctxBar) {
    democratisedBarChart = new Chart(ctxBar, {
      type: 'bar',
      data: {
        labels: IGOT_DATA.democratisedLearning.labels,
        datasets: [
          {
            label: 'Onboarded %',
            data: IGOT_DATA.democratisedLearning.onboarded,
            backgroundColor: '#A0C7FF',
            borderRadius: 4
          },
          {
            label: 'Completion %',
            data: IGOT_DATA.democratisedLearning.completion,
            backgroundColor: '#1A73E8',
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } }
        },
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11, weight: '700' } } }
        }
      }
    });
  }

  const ctxRadar = document.getElementById('chartLearnerRadar');
  if (ctxRadar) {
    learnerRadarChart = new Chart(ctxRadar, {
      type: 'radar',
      data: {
        labels: IGOT_DATA.learnerProfile.competencies.labels,
        datasets: [
          {
            label: 'Current Score',
            data: IGOT_DATA.learnerProfile.competencies.current,
            fill: true,
            backgroundColor: 'rgba(26, 115, 232, 0.25)',
            borderColor: '#1A73E8',
            pointBackgroundColor: '#1A73E8'
          },
          {
            label: 'Target Competency',
            data: IGOT_DATA.learnerProfile.competencies.target,
            fill: true,
            backgroundColor: 'rgba(255, 153, 51, 0.15)',
            borderColor: '#FF9933',
            pointBackgroundColor: '#FF9933',
            borderDash: [5, 5]
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { r: { min: 0, max: 100 } }
      }
    });
  }

  const ctxAdmin = document.getElementById('chartAdminDept');
  if (ctxAdmin) {
    adminDeptChart = new Chart(ctxAdmin, {
      type: 'bar',
      data: {
        labels: IGOT_DATA.adminMetrics.departmentalMatrix.map(d => d.name),
        datasets: [{
          label: 'iGOT Course Compliance %',
          data: [94, 96, 89, 98],
          backgroundColor: ['#00449E', '#1A73E8', '#FF9933', '#059669'],
          borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: { x: { min: 0, max: 100 } }
      }
    });
  }
}

// 3. VIEW MODE TAB SWITCHING
function initViewTabs() {
  const tabs = document.querySelectorAll('.v-tab');
  const sections = document.querySelectorAll('.view-section');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      sections.forEach(s => s.style.display = 'none');

      tab.classList.add('active');
      const targetId = tab.getAttribute('data-target');
      const targetSec = document.getElementById(targetId);
      if (targetSec) {
        targetSec.style.display = 'block';
      }
    });
  });
}

// 4. RANKING TABS (States vs Ministries)
function initRankingTabs() {
  const rankBtns = document.querySelectorAll('.rank-tab-btn');

  rankBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const parentCard = e.currentTarget.closest('.card-body');
      if (parentCard) {
        parentCard.querySelectorAll('.rank-tab-btn').forEach(b => b.classList.remove('active'));
      }
      btn.classList.add('active');

      const mode = btn.getAttribute('data-type');
      renderPodium(mode, parentCard);
    });
  });

  renderPodium('ministries');
}

function renderPodium(mode, parentCard = null) {
  let containers = [];
  if (parentCard) {
    const cont = parentCard.querySelector('.podium-list');
    if (cont) containers = [cont];
  } else {
    containers = Array.from(document.querySelectorAll('.podium-list'));
  }

  if (containers.length === 0 || typeof IGOT_DATA === 'undefined') return;

  let listData = IGOT_DATA.stateRankings;
  if (mode === 'states') {
    listData = [
      { rank: 1, name: "Gujarat Statistical Bureau", score: 97.8, completions: "5,40,120", icon: "🏆" },
      { rank: 2, name: "Maharashtra DES", score: 96.5, completions: "4,98,000", icon: "🥈" },
      { rank: 3, name: "Karnataka Cadre Operations", score: 95.1, completions: "4,12,500", icon: "🥉" },
      { rank: 4, name: "Tamil Nadu Economics & Stats", score: 93.8, completions: "3,80,000", icon: "⭐" },
      { rank: 5, name: "Uttar Pradesh Directorate", score: 92.4, completions: "3,50,000", icon: "⭐" }
    ];
  }

  const htmlContent = listData.map(item => `
    <div class="podium-card rank-${item.rank}">
      <div class="podium-badge">${item.icon}</div>
      <div class="podium-details">
        <div class="name">#${item.rank} ${item.name}</div>
        <div class="score">Completion Score: <b>${item.score}%</b> | Completed: ${item.completions}</div>
      </div>
    </div>
  `).join('');

  containers.forEach(container => {
    container.innerHTML = htmlContent;
  });
}

// 5. INTERACTIVE INDIA SVG MAP TOOLTIPS
function initIndiaMap() {
  const mapSvgContainers = document.querySelectorAll('.india-svg-container');
  if (mapSvgContainers.length === 0) return;

  const svgContent = `
    <svg viewBox="0 0 400 450" width="100%" height="100%" style="filter: drop-shadow(0 4px 10px rgba(0,0,0,0.1));">
      <g fill="#1A73E8" stroke="#FFFFFF" stroke-width="1.5" style="cursor: pointer;">
        <path d="M 170 30 L 190 20 L 220 40 L 210 70 L 230 90 L 260 80 L 280 110 L 320 120 L 350 150 L 320 180 L 280 170 L 260 210 L 220 230 L 240 280 L 210 320 L 180 380 L 160 410 L 140 370 L 130 310 L 100 270 L 80 230 L 90 190 L 70 160 L 110 140 L 130 100 Z" opacity="0.85" class="state-main"></path>
        <circle cx="170" cy="80" r="14" fill="#FF9933" class="state-delhi"></circle>
        <circle cx="110" cy="220" r="16" fill="#00449E" class="state-mh"></circle>
        <circle cx="140" cy="330" r="18" fill="#1A73E8" class="state-ka"></circle>
        <circle cx="280" cy="140" r="15" fill="#FFC107" class="state-wb"></circle>
      </g>
    </svg>
    <div class="mapTooltip" style="position: absolute; display: none; background: #003366; color: #fff; padding: 6px 12px; border-radius: 6px; font-size: 0.78rem; pointer-events: none; z-index: 10;"></div>
  `;

  const sampleStateNames = {
    'state-delhi': 'NCR Delhi (Rank #1 UT - 98.9% Competency Score)',
    'state-mh': 'Maharashtra (Rank #2 State - 96.5% iGOT Completion)',
    'state-ka': 'Karnataka (Rank #3 State - 95.1% iGOT Completion)',
    'state-wb': 'West Bengal (Rank #4 State - 93.8% iGOT Completion)',
    'state-main': 'National Overview (28 States & 8 UTs Active)'
  };

  mapSvgContainers.forEach(mapSvgContainer => {
    mapSvgContainer.innerHTML = svgContent;
    const tooltip = mapSvgContainer.querySelector('.mapTooltip');
    const svgPaths = mapSvgContainer.querySelectorAll('path, circle');

    svgPaths.forEach(el => {
      el.addEventListener('mouseenter', () => {
        el.setAttribute('opacity', '1.0');
        const stateKey = el.classList[0] || 'state-main';
        const name = sampleStateNames[stateKey] || 'State Cadre';
        tooltip.textContent = name;
        tooltip.style.display = 'block';
      });

      el.addEventListener('mousemove', (e) => {
        const rect = mapSvgContainer.getBoundingClientRect();
        tooltip.style.left = (e.clientX - rect.left + 15) + 'px';
        tooltip.style.top = (e.clientY - rect.top - 10) + 'px';
      });

      el.addEventListener('mouseleave', () => {
        el.setAttribute('opacity', '0.85');
        tooltip.style.display = 'none';
      });
    });
  });
}

// 6. DYNAMIC AI QUIZ GENERATOR ENGINE (CONNECTED TO FASTAPI)
let currentUploadedFileName = "";

function initQuizGenerator() {
  const uploadDropzone = document.getElementById('uploadDropzone');
  const fileInput = document.getElementById('pdfFileInput');
  const uploadText = document.getElementById('uploadFileName');
  const btnGenerate = document.getElementById('btnGenerateQuiz');
  const quizOutput = document.getElementById('quizOutputArea');

  if (!uploadDropzone || !btnGenerate) return;

  uploadDropzone.addEventListener('click', (e) => {
    if (e.target !== btnGenerate && !btnGenerate.contains(e.target)) {
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', async () => {
    if (fileInput.files.length === 0) return;
    const file = fileInput.files[0];
    currentUploadedFileName = file.name;
    uploadText.textContent = `Uploading and processing: ${file.name}...`;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        uploadText.innerHTML = `✅ <b>${file.name}</b> indexed successfully! Click below to generate MCQs.`;
      } else {
        uploadText.textContent = `Upload error: ${data.detail || "Failed to process"}`;
      }
    } catch (err) {
      uploadText.textContent = "Failed to connect to server.";
    }
  });

  btnGenerate.addEventListener('click', async (e) => {
    e.stopPropagation();

    if (!currentUploadedFileName) {
      alert("Please click the box to upload a PDF document first.");
      return;
    }

    btnGenerate.disabled = true;
    btnGenerate.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Generating questions from ${currentUploadedFileName}...`;

    try {
      const cleanTopic = currentUploadedFileName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
      const formData = new FormData();
      formData.append("topic", cleanTopic);

      const res = await fetch(`${API_BASE}/api/generate-quiz`, {
        method: "POST",
        body: formData
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.detail || "Error generating quiz.");
        return;
      }

      quizOutput.style.display = 'block';
      renderQuizQuestions(data.quiz);
    } catch (err) {
      alert("Connection error: " + err.message);
    } finally {
      btnGenerate.disabled = false;
      btnGenerate.innerHTML = `<i class="fas fa-brain"></i> Generate AI Assessment (MCQs)`;
    }
  });
}

function renderQuizQuestions(quizData) {
  const container = document.getElementById('questionsContainer');
  if (!container) return;

  container.innerHTML = quizData.map((q, idx) => {
    let correctIdx = q.answer;
    if (typeof q.answer === 'string') {
      const charCode = q.answer.trim().toUpperCase().charCodeAt(0);
      if (charCode >= 65 && charCode <= 68) {
        correctIdx = charCode - 65;
      } else {
        correctIdx = parseInt(q.answer, 10) || 0;
      }
    }

    return `
    <div class="question-card" id="q-card-${idx}">
      <div class="q-title">
        <span class="q-badge">${q.difficulty || 'Intermediate'}</span>
        <span class="q-badge" style="background:#E0F2FE; color:#0369A1;">${q.competency || 'General'}</span>
        <br/><br/>
        <b>Q${idx + 1}. ${q.question}</b>
      </div>
      <div class="options-list">
        ${q.options.map((opt, oIdx) => `
          <button class="opt-btn" onclick="checkAnswer(${idx}, ${oIdx}, ${correctIdx})">
            ${String.fromCharCode(65 + oIdx)}. ${opt}
          </button>
        `).join('')}
      </div>
      <div class="explanation-box" id="exp-${idx}">
        <strong>💡 Pedagogical Explanation:</strong> ${q.explanation || 'No explanation provided.'}
      </div>
    </div>
    `;
  }).join('');
}

function checkAnswer(qId, selectedIdx, correctIdx) {
  const card = document.getElementById(`q-card-${qId}`);
  if (!card) return;
  const buttons = card.querySelectorAll('.opt-btn');
  const expBox = document.getElementById(`exp-${qId}`);

  buttons.forEach((btn, idx) => {
    btn.disabled = true;
    if (idx === correctIdx) {
      btn.classList.add('correct');
    } else if (idx === selectedIdx && selectedIdx !== correctIdx) {
      btn.classList.add('wrong');
    }
  });

  if (expBox) {
    expBox.style.display = 'block';
  }
}

// 7. STATBOT AI CHAT ASSISTANT
function initStatBot() {
  const trigger = document.getElementById('statbotTrigger');
  const chatWindow = document.getElementById('statbotChatWindow');
  const closeBtn = document.getElementById('statbotClose');
  const sendBtn = document.getElementById('statbotSend');
  const inputEl = document.getElementById('statbotInput');
  const msgsContainer = document.getElementById('statbotMsgs');

  if (!trigger) return;

  trigger.addEventListener('click', () => {
    chatWindow.style.display = chatWindow.style.display === 'flex' ? 'none' : 'flex';
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      chatWindow.style.display = 'none';
    });
  }

  function handleSend() {
    const text = inputEl.value.trim();
    if (!text) return;

    appendMsg(text, 'user');
    inputEl.value = '';

    setTimeout(() => {
      let botReply = "I am Karmayogi StatBot AI. I can guide you on iGOT Karmayogi courses, MoSPI official statistics competencies, or generate custom quizzes for your cadre.";
      const lower = text.toLowerCase();
      if (lower.includes('course') || lower.includes('recommend')) {
        botReply = "Based on your ISS Group A profile, I recommend: 1. Advanced Data Analytics (IGOT-STAT-101) & 2. Machine Learning in Public Governance (IGOT-AI-202).";
      } else if (lower.includes('quiz') || lower.includes('mcq') || lower.includes('test')) {
        botReply = "You can use the 'AI Assessment Engine' tab to upload PDF/Word documents and instantly generate Bloom's taxonomy MCQs!";
      } else if (lower.includes('competency') || lower.includes('gap')) {
        botReply = "Your current AI in Governance competency score is 45%. Completing 12 hours of iGOT modules will bridge this gap to 80%.";
      }
      appendMsg(botReply, 'bot');
    }, 600);
  }

  if (sendBtn) sendBtn.addEventListener('click', handleSend);
  if (inputEl) {
    inputEl.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleSend();
    });
  }

  function appendMsg(msg, sender) {
    const div = document.createElement('div');
    div.className = `msg ${sender}`;
    div.textContent = msg;
    msgsContainer.appendChild(div);
    msgsContainer.scrollTop = msgsContainer.scrollHeight;
  }
}

// 8. ACCESSIBILITY TOGGLES
function initA11y() {
  const contrastBtn = document.getElementById('toggleContrast');
  if (contrastBtn) {
    contrastBtn.addEventListener('click', () => {
      document.body.classList.toggle('high-contrast');
    });
  }
}

// Modal helpers
function openLoginModal(initialMode = 'login') {
  switchAuthMode(initialMode);
  document.getElementById('loginModal').style.display = 'flex';
}

function closeLoginModal() {
  document.getElementById('loginModal').style.display = 'none';
}
