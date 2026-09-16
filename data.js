// Simulated Data Store for iGOT Karmayogi Skill Intelligence Platform

const IGOT_DATA = {
  ticker: {
    learners: "1,72,32,208",
    courses: "6,738",
    skillGapsClosed: "15,27,42,116",
    certifications: "16,37,126",
    activeOfficials: "2,49,682"
  },
  
  ruleToRole: {
    unionCBPs: "1,434",
    employeesCBP: "43,45,664",
    stateCBPs: "2,609",
    roleCompletions: "12,374,227",
    levels: {
      basic: "3,757",
      intermediate: "1,034",
      advanced: "42"
    },
    competencyChartData: {
      labels: ['Domain Competency', 'Functional Competency', 'Behavioral Competency'],
      datasets: [{
        data: [1280, 3113, 1425],
        backgroundColor: ['#1A73E8', '#00449E', '#FF9933'],
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    }
  },

  democratisedLearning: {
    labels: ['Group A', 'Group B', 'Group C,D & Others', 'State Cadre Officers'],
    onboarded: [7, 12, 82, 64],
    completion: [7, 15, 78, 59]
  },

  stateRankings: [
    { rank: 1, name: "Ministry of Coal", score: 98.4, completions: "4,12,940", icon: "🏆" },
    { rank: 2, name: "Dept. of Food & Public Distribution", score: 96.2, completions: "3,88,120", icon: "🥈" },
    { rank: 3, name: "Ministry of Mines", score: 94.8, completions: "3,45,600", icon: "🥉" },
    { rank: 4, name: "Ministry of Statistics & Programme Implementation (MoSPI)", score: 93.5, completions: "3,10,450", icon: "⭐" },
    { rank: 5, name: "Ministry of Earth Sciences", score: 91.1, completions: "2,98,000", icon: "⭐" }
  ],

  nationalAspirations: [
    { name: "AI & Emerging Tech", count: "3,38,80,712", percentage: 88, target: "4.0 Cr" },
    { name: "Citizen Centricity & Jan Bhagidari", count: "1,50,86,052", percentage: 65, target: "2.5 Cr" },
    { name: "Viksit Bharat 2047 Data Analytics", count: "1,10,49,297", percentage: 52, target: "2.0 Cr" },
    { name: "Official Statistical Systems Modernization", count: "89,45,210", percentage: 44, target: "1.5 Cr" }
  ],

  igotCourses: [
    {
      id: "IGOT-STAT-101",
      title: "Advanced Data Analytics for Official Statistics",
      provider: "NSSTA & iGOT Karmayogi",
      competency: "Domain",
      level: "Intermediate",
      duration: "12 Hours",
      rating: 4.9,
      enrolled: 42350,
      skills: ["R Programming", "Sample Survey", "Data Scrubbing"],
      recommendedFor: "Directorate Officials & ISS Officers"
    },
    {
      id: "IGOT-AI-202",
      title: "Machine Learning Applications in Public Governance",
      provider: "iGOT Karmayogi Bharat",
      competency: "Domain",
      level: "Advanced",
      duration: "20 Hours",
      rating: 4.8,
      enrolled: 31200,
      skills: ["Python", "Predictive Analytics", "NLP"],
      recommendedFor: "Group A Officers & Statisticians"
    },
    {
      id: "IGOT-GOV-301",
      title: "Jan Bhagidari & Public Service Delivery Excellence",
      provider: "Karmayogi Academy",
      competency: "Behavioral",
      level: "Basic",
      duration: "6 Hours",
      rating: 4.7,
      enrolled: 89400,
      skills: ["Communication", "Empathy", "Citizen Service"],
      recommendedFor: "All Government Personnel"
    },
    {
      id: "IGOT-STAT-404",
      title: "National Sample Survey (NSS) Methodology & Standards",
      provider: "NSSTA National Training Centre",
      competency: "Functional",
      level: "Intermediate",
      duration: "15 Hours",
      rating: 4.95,
      enrolled: 15400,
      skills: ["Sampling Design", "Survey Audit", "Indicator Calculation"],
      recommendedFor: "MoSPI & Field Operations Officers"
    }
  ],

  sampleUploadedMaterials: {
    statisticalPolicy: `Official Statistics System (OSS) in India plays a vital role in national development planning and policy monitoring. The Ministry of Statistics and Programme Implementation (MoSPI) oversees the National Statistical Office (NSO). key methodologies include Probability Proportional to Size (PPS) sampling, Consumer Price Index (CPI) basket weighting, and GDP quarterly estimates. Modernization efforts focus on integrating automated data capture via API, machine learning anomaly detection in survey data, and iGOT Karmayogi continuous competency frameworks for statistical cadres.`,
    
    generatedQuiz: [
      {
        id: 1,
        question: "Which nodal ministry oversees the National Statistical Office (NSO) in India?",
        options: ["Ministry of Finance", "Ministry of Statistics & Programme Implementation (MoSPI)", "NITI Aayog", "Ministry of Home Affairs"],
        answer: 1,
        explanation: "MoSPI is the apex ministry responsible for statistical standards, conducting large-scale surveys, and managing the NSO.",
        difficulty: "Basic",
        competency: "Domain Knowledge"
      },
      {
        id: 2,
        question: "What primary sampling design is frequently utilized for multi-stage National Sample Surveys?",
        options: ["Simple Random Sampling without Replacement", "Probability Proportional to Size (PPS) Sampling", "Convenience Cluster Sampling", "Snowball Sampling"],
        answer: 1,
        explanation: "PPS sampling ensures first-stage units (villages/urban frame survey blocks) are selected proportional to population size for unbiased representation.",
        difficulty: "Intermediate",
        competency: "Statistical Methodology"
      },
      {
        id: 3,
        question: "How does the AI-Enabled Skill Intelligence platform enhance capacity building in MoSPI?",
        options: ["By replacing human statisticians with robots", "By providing continuous competency mapping, personalized iGOT course paths, and automated AI assessments", "By eliminating all survey field work", "By hosting only offline pen-and-paper exams"],
        answer: 1,
        explanation: "The platform dynamically tracks competency gaps, recommends targeted iGOT & NSSTA learning modules, and evaluates officials continuously using AI-generated quizzes.",
        difficulty: "Advanced",
        competency: "Digital Governance & AI Integration"
      }
    ]
  },

  learnerProfile: {
    name: "Subhrajit Roy, ISS",
    designation: "Senior Statistical Officer (Group A)",
    department: "National Sample Survey Office (NSSO), MoSPI",
    employeeId: "GOI-ISS-2024-8842",
    competencies: {
      labels: ['Sample Survey Methods', 'Data Analytics & Python', 'Official Statistics Standards', 'Public Service Leadership', 'AI in Governance', 'Survey Quality Control'],
      current: [85, 62, 90, 75, 45, 80],
      target: [95, 85, 95, 90, 80, 90]
    },
    learningHours: 48.5,
    coursesCompleted: 12,
    badges: ['iGOT Master Analyst', 'Viksit Bharat Innovator', 'AI Ready Official'],
    skillGap: [
      { skill: "AI & Machine Learning in Governance", gapLevel: "High", priority: "Urgent", recommendedCourse: "IGOT-AI-202" },
      { skill: "Python Data Wrangling", gapLevel: "Medium", priority: "Moderate", recommendedCourse: "IGOT-STAT-101" },
      { skill: "Advanced Econometrics", gapLevel: "Low", priority: "Optional", recommendedCourse: "IGOT-STAT-404" }
    ]
  },

  adminMetrics: {
    totalCadreCount: 14250,
    activeLearnersPercentage: 92.4,
    competencyGrowth: "+18.6% YoY",
    departmentalMatrix: [
      { name: "NSSO Field Operations", headCount: 4200, compliance: "94%", topCompetency: "Survey Methodology" },
      { name: "National Accounts Division (NAD)", headCount: 1850, compliance: "96%", topCompetency: "Macroeconomic Accounting" },
      { name: "Economic Statistics Division (ESD)", headCount: 2300, compliance: "89%", topCompetency: "Index Number Theory" },
      { name: "Data Informatics & Innovation Division (DIID)", headCount: 1200, compliance: "98%", topCompetency: "Cloud & Big Data" }
    ],
    predictiveNeeds: [
      { skill: "Big Data & Geo-spatial Analytics", currentSupply: "24%", projectedDemand2027: "85%", gapStatus: "Critical" },
      { skill: "AI-Powered Survey Quality Auditing", currentSupply: "31%", projectedDemand2027: "90%", gapStatus: "High Risk" },
      { skill: "Automated API Data Integration", currentSupply: "54%", projectedDemand2027: "95%", gapStatus: "Moderate" }
    ]
  }
};
