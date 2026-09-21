// Main Application Logic for iGOT Karmayogi Skill Intelligence Platform

const API_BASE = "";

// Authentication & Session Management State
let currentUser = null;
let authMode = "login"; // 'login' or 'register'
let currentUploadedFileName = "";

// Keep track of the active quiz score
let currentQuizScore = {
  answered: 0,
  correct: 0,
  total: 0,
  topic: ""
};

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
    name: userData.email ? userData.email.split('@')[0].toUpperCase() : "OFFICER",
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

  // Activate "Upload Resume" tab by default upon login
  const tabs = document.querySelectorAll('.v-tab');
  const sections = document.querySelectorAll('.view-section');
  tabs.forEach(t => {
    if (t.getAttribute('data-target') === 'sec-resume') {
      t.classList.add('active');
    } else {
      t.classList.remove('active');
    }
  });
  sections.forEach(s => {
    if (s.id === 'sec-resume') {
      s.style.display = 'block';
    } else {
      s.style.display = 'none';
    }
  });

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
  loadQuizHistory();

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
  initResumeUploader();
  initStatBot();
  initA11y();

  // Modal toggle listeners
  document.getElementById('btnToggleLogin')?.addEventListener('click', () => switchAuthMode('login'));
  document.getElementById('btnToggleRegister')?.addEventListener('click', () => switchAuthMode('register'));

  checkAuthState();
});

// RESUME UPLOADER & SKILL AI EXTRACTION ENGINE
function initResumeUploader() {
  const dropzone = document.getElementById('resumeDropzone');
  const fileInput = document.getElementById('resumeFileInput');
  const btnSelect = document.getElementById('btnSelectResumeFile');

  if (!dropzone) return;

  btnSelect?.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  dropzone.addEventListener('click', (e) => {
    if (e.target !== btnSelect && !btnSelect.contains(e.target)) {
      fileInput.click();
    }
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('drag-over');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processResumeFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      processResumeFile(fileInput.files[0]);
    }
  });

  // Action Listener for "Sync Skills to Profile"
  document.getElementById('btnSyncProfile')?.addEventListener('click', () => {
    const currentResume = JSON.parse(localStorage.getItem('karmayogi_resume') || '{}');
    if (currentResume.score) {
      syncResumeToRadarChart(currentResume.score);
      alert(`✅ Synced resume score (${currentResume.score}) directly into your Target Competency Graph!`);
    } else {
      alert("Please upload a resume first to sync scores.");
    }
  });

  // Load existing parsed resume if saved
  const storedResume = localStorage.getItem('karmayogi_resume');
  if (storedResume) {
    try {
      const data = JSON.parse(storedResume);
      renderParsedResumeResults(data);
    } catch (e) {}
  }
  loadResumeHistory();
}

async function processResumeFile(file) {
  const dropTitle = document.getElementById('resumeDropTitle');
  const dropSub = document.getElementById('resumeDropSub');
  const progressContainer = document.getElementById('resumeProgressContainer');
  const progressFill = document.getElementById('resumeProgressFill');
  const progressPercent = document.getElementById('resumeProgressPercent');
  const progressText = document.getElementById('resumeProgressText');
  const resultsArea = document.getElementById('resumeResultsArea');

  if (dropTitle) dropTitle.innerHTML = `📄 Analyzing Resume: <b>${file.name}</b>`;
  if (dropSub) dropSub.textContent = "Extracting qualifications, technical skills, and iGOT cadre alignment via ONNX engine...";

  if (progressContainer) progressContainer.style.display = 'block';
  if (resultsArea) resultsArea.style.display = 'none';
  if (progressFill) progressFill.style.width = '30%';
  if (progressPercent) progressPercent.textContent = '30%';
  if (progressText) progressText.textContent = 'Sending PDF to competency extraction engine...';

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch(`${API_BASE}/api/analyze-resume`, {
      method: "POST",
      body: formData
    });

    if (progressFill) progressFill.style.width = '80%';
    if (progressPercent) progressPercent.textContent = '80%';
    if (progressText) progressText.textContent = 'Calculating cadre skill gap matrix...';

    const gapData = await res.json();

    if (!res.ok) {
      alert(`Resume Analysis Error: ${gapData.detail || "Could not analyze resume."}`);
      if (progressContainer) progressContainer.style.display = 'none';
      return;
    }

    if (progressFill) progressFill.style.width = '100%';
    if (progressPercent) progressPercent.textContent = '100%';

    // Extract matched skills array
    const matchedSkills = gapData.top_matched_skills && gapData.top_matched_skills.length > 0
      ? gapData.top_matched_skills.map(s => typeof s === 'object' ? (s.name || s.competency || JSON.stringify(s)) : s)
      : [];

    // STRICT MATCH SCORE CALCULATION
    const TOTAL_REQUIRED_COMPETENCIES = 13; 
    const matchedCount = matchedSkills.length;
    
    let calculatedScore = 0;
    if (matchedCount > 0) {
      calculatedScore = Math.min(100, Math.round((matchedCount / TOTAL_REQUIRED_COMPETENCIES) * 100));
    }

    const parsedData = {
      fileName: file.name,
      name: currentUser ? currentUser.name : file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").toUpperCase(),
      title: matchedCount > 0 ? "Statistical Cadre Applicant • MoSPI" : "Unsuitable / Low Match Candidate",
      cadre: "MINISTRY OF STATISTICS & PROGRAMME IMPLEMENTATION",
      score: `${calculatedScore}%`,
      skills: matchedSkills.length > 0 ? matchedSkills : ["No Core MoSPI Competencies Evidenced"],
      gaps: gapData.identified_skill_gaps && gapData.identified_skill_gaps.length > 0
        ? gapData.identified_skill_gaps.map(g => typeof g === 'object' ? (g.name || g.competency || JSON.stringify(g)) : g)
        : ["Core Cadre Prerequisites Missing"],
      courses: [
        { title: "Foundational Official Statistics & Data Standards", code: "IGOT-STAT-101", duration: "6.0 Hours" },
        { title: "National Data Governance & Privacy Framework", code: "IGOT-GOV-204", duration: "4.5 Hours" }
      ]
    };

    setTimeout(() => {
      if (progressContainer) progressContainer.style.display = 'none';
      if (dropTitle) dropTitle.innerHTML = `✅ <b>${file.name}</b> Analyzed & Indexed Successfully!`;
      if (dropSub) dropSub.textContent = "Your ONNX competency insights have been generated below.";
      renderParsedResumeResults(parsedData);
      recordResumeHistory(file.name, parsedData);
      localStorage.setItem('karmayogi_resume', JSON.stringify(parsedData));
    }, 300);

  } catch (err) {
    if (progressContainer) progressContainer.style.display = 'none';
    alert("Connection Error: Could not reach the competency analysis server.");
  }
}

function loadResumeHistory() {
  const tbody = document.getElementById('resumeHistoryTableBody');
  if (!tbody) return;

  const history = JSON.parse(localStorage.getItem('karmayogi_resume_history') || '[]');
  if (history.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:15px; color:#94A3B8;">No uploaded resume documents logged yet. Upload your PDF resume above!</td></tr>`;
    return;
  }

  tbody.innerHTML = history.map(item => `
    <tr style="border-bottom:1px solid #F1F5F9;">
      <td style="padding:10px 8px; font-weight:600; color:#1E293B;"><i class="fas fa-file-pdf" style="color:#DC2626; margin-right:6px;"></i> ${item.fileName}</td>
      <td style="padding:10px 8px; color:#334155;">${item.name}</td>
      <td style="padding:10px 8px; font-weight:700; color:${parseInt(item.score, 10) >= 50 ? '#16A34A' : '#DC2626'};">${item.score} Match</td>
      <td style="padding:10px 8px; color:#64748B;">${item.date}</td>
      <td style="padding:10px 8px;">
        <span style="background:#DCFCE7; color:#15803D; padding:2px 8px; border-radius:4px; font-size:0.75rem; font-weight:600;">Indexed</span>
      </td>
    </tr>
  `).join('');
}

function recordResumeHistory(fileName, data) {
  const history = JSON.parse(localStorage.getItem('karmayogi_resume_history') || '[]');
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const newItem = {
    fileName: fileName,
    name: data.name || (currentUser ? currentUser.name : "Officer Candidate"),
    score: data.score || "0%",
    date: dateStr
  };

  history.unshift(newItem);
  if (history.length > 10) history.pop();
  localStorage.setItem('karmayogi_resume_history', JSON.stringify(history));
  loadResumeHistory();
}

// Syncs the parsed resume match score and competencies with the Learner Radar Chart
function syncResumeToRadarChart(scorePercentage) {
  if (!learnerRadarChart) return;

  // Extract score percentage number ("75%" -> 75)
  const numericScore = parseInt(scorePercentage, 10) || 0;

  // Calculate dynamic radar chart values based on the resume match
  const scaledCurrentScores = [
    Math.round(numericScore * 0.95), // Official Statistics
    Math.round(numericScore * 0.85), // Data Science & Python
    Math.round(numericScore * 0.70), // Sample Survey Design
    Math.round(numericScore * 0.60), // AI & ML in Governance
    Math.round(numericScore * 0.90), // Public Policy Analytics
    Math.round(numericScore * 0.50)  // Cyber Security
  ];

  // Update Dataset 0 (Current Score)
  learnerRadarChart.data.datasets[0].data = scaledCurrentScores;
  
  // Re-render chart UI
  learnerRadarChart.update();
}

function renderParsedResumeResults(data) {
  const resultsArea = document.getElementById('resumeResultsArea');
  if (!resultsArea) return;

  const cadreTag = document.getElementById('res-cadre-tag');
  const candName = document.getElementById('res-candidate-name');
  const candTitle = document.getElementById('res-candidate-title');
  const candScore = document.getElementById('res-match-score');
  const skillsContainer = document.getElementById('resExtractedSkills');
  const gapsContainer = document.getElementById('resIdentifiedGaps');
  const coursesContainer = document.getElementById('resRecommendedCourses');

  if (cadreTag) cadreTag.textContent = data.cadre || "MINISTRY OF STATISTICS & PROGRAMME IMPLEMENTATION";
  if (candName) candName.textContent = data.name || (currentUser ? currentUser.name : "OFFICER CANDIDATE");
  if (candTitle) candTitle.textContent = data.title || "Statistical Cadre Applicant";
  if (candScore) candScore.textContent = data.score || "0%";

  if (skillsContainer && data.skills) {
    skillsContainer.innerHTML = data.skills.map(s => `
      <span class="skill-tag"><i class="fas fa-check-circle"></i> ${s}</span>
    `).join('');
  }

  if (gapsContainer && data.gaps) {
    gapsContainer.innerHTML = data.gaps.map(g => `
      <span class="gap-tag"><i class="fas fa-exclamation-triangle"></i> ${g}</span>
    `).join('');
  }

  if (coursesContainer && data.courses) {
    coursesContainer.innerHTML = data.courses.map((c, idx) => `
      <div class="rec-course-card">
        <div>
          <strong style="color: var(--card-dark-blue); font-size: 0.9rem;">${idx + 1}. ${c.title}</strong><br/>
          <small style="color: var(--text-muted);">iGOT Code: ${c.code} • Duration: ${c.duration}</small>
        </div>
        <button class="btn-login" style="font-size:0.75rem; padding:4px 10px;" onclick="alert('Enrolled in ${c.title}!')">Enroll Now</button>
      </div>
    `).join('');
  }

  resultsArea.style.display = 'block';

  // AUTOMATIC SYNC WITH RADAR CHART
  syncResumeToRadarChart(data.score);
}

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

  currentQuizScore = {
    answered: 0,
    correct: 0,
    total: quizData.length,
    topic: currentUploadedFileName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ") || "General Assessment"
  };

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
          <button class="opt-btn" onclick="checkAnswer(${idx}, ${oIdx},${correctIdx})">
            ${String.fromCharCode(65 + oIdx)}.${opt}
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

  currentQuizScore.answered += 1;
  if (selectedIdx === correctIdx) {
    currentQuizScore.correct += 1;
  }

  // Submit to PostgreSQL when all questions are answered
  if (currentQuizScore.answered === currentQuizScore.total) {
    submitQuizResult();
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
        botReply = "Based on your officer profile, I recommend: 1. Advanced Data Analytics (IGOT-STAT-101) & 2. Machine Learning in Public Governance (IGOT-AI-202).";
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
async function loadPredictiveNeeds() {
    try {
        const response = await fetch(`${API_BASE}/api/predictive-needs`);

        if (!response.ok) {
            throw new Error("Failed to fetch predictive needs");
        }

        const needs = await response.json();

        renderPredictiveNeeds(needs);

    } catch (error) {
        console.error("Predictive needs error:", error);
    }
}

function renderPredictiveNeeds(needs) {
    const container = document.getElementById("predictiveNeedsContainer");

    if (!container) return;

    container.innerHTML = needs.map(item => `
        <div class="predictive-need-card">

            <h3>${item.topic}</h3>

            <div class="prediction-stats">
                <span>
                    Supply: <strong>${item.supply_percentage}%</strong>
                </span>

                <span>
                    Demand: <strong>${item.demand_percentage}%</strong>
                    by ${item.target_year}
                </span>
            </div>

            <div class="risk-badge">
                ${item.risk_level}
            </div>

            <div class="critical-gap">
                <strong>Critical Gap</strong>
            </div>

        </div>
    `).join("");
}

loadPredictiveNeeds();

// Modal helpers
function openLoginModal(initialMode = 'login') {
  switchAuthMode(initialMode);
  document.getElementById('loginModal').style.display = 'flex';
}

function closeLoginModal() {
  document.getElementById('loginModal').style.display = 'none';
}
