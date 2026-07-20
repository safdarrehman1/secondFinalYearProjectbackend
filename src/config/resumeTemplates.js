const resumeTemplates = [
  {
    id: "minimalist",
    name: "Minimalist Executive",
    thumbnailUrl: "https://images.unsplash.com/photo-1586281380349-632531db7ed4?auto=format&fit=crop&w=300&q=80",
    supportedColors: ["#0f172a", "#1e293b", "#000000", "#1b2a47"],
    sections: ["personalInfo", "summary", "experience", "education", "skills", "projects", "certifications", "custom"]
  },
  {
    id: "modern",
    name: "Modern Professional",
    thumbnailUrl: "https://images.unsplash.com/photo-1626379616459-b2ce1d9decbc?auto=format&fit=crop&w=300&q=80",
    supportedColors: ["#059669", "#0f172a", "#2563eb", "#d97706"],
    sections: ["personalInfo", "summary", "experience", "education", "skills", "projects", "certifications", "custom"]
  },
  {
    id: "creative",
    name: "Creative Developer",
    thumbnailUrl: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=300&q=80",
    supportedColors: ["#7c3aed", "#4f46e5", "#db2777", "#ea580c"],
    sections: ["personalInfo", "summary", "experience", "education", "skills", "projects", "certifications", "custom"]
  },
  {
    id: "executive",
    name: "Executive Classic",
    thumbnailUrl: "https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=300&q=80",
    supportedColors: ["#1e3a8a", "#0f172a", "#0369a1", "#047857"],
    sections: ["personalInfo", "summary", "experience", "education", "skills", "projects", "certifications", "custom"]
  },
  {
    id: "ats-clean",
    name: "ATS-Friendly Classic",
    thumbnailUrl: "https://images.unsplash.com/photo-1497032628192-86f99bcd76bc?auto=format&fit=crop&w=300&q=80",
    supportedColors: ["#000000", "#1f2937", "#374151"],
    sections: ["personalInfo", "summary", "experience", "education", "skills", "certifications", "custom"],
    notes: "Single-column, no graphics/tables — optimized to parse cleanly through applicant tracking systems."
  },
  {
    id: "corporate-blue",
    name: "Corporate Standard",
    thumbnailUrl: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=300&q=80",
    supportedColors: ["#1e40af", "#0c4a6e", "#334155", "#075985"],
    sections: ["personalInfo", "summary", "experience", "education", "skills", "certifications", "custom"]
  },
  {
    id: "tech-mono",
    name: "Technical Monospace",
    thumbnailUrl: "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=300&q=80",
    supportedColors: ["#0f172a", "#166534", "#7c2d12", "#1e293b"],
    sections: ["personalInfo", "summary", "skills", "experience", "projects", "education", "certifications", "custom"],
    notes: "Monospace typography, code-adjacent aesthetic — popular for SWE/dev roles."
  },
  {
    id: "academic-cv",
    name: "Academic CV",
    thumbnailUrl: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=300&q=80",
    supportedColors: ["#000000", "#1e293b", "#4b5563"],
    sections: ["personalInfo", "summary", "education", "experience", "certifications", "projects", "custom"],
    notes: "Education-first ordering, dense text layout — suited for research/academic applicants with publications in custom sections."
  },
  {
    id: "compact-twocolumn",
    name: "Compact Two-Column",
    thumbnailUrl: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=300&q=80",
    supportedColors: ["#0f172a", "#065f46", "#7c2d12", "#1e3a8a"],
    sections: ["personalInfo", "summary", "skills", "experience", "education", "projects", "certifications", "custom"],
    notes: "Sidebar for skills/contact, main column for experience — fits more content on one page."
  },
  {
    id: "elegant-serif",
    name: "Elegant Serif",
    thumbnailUrl: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=300&q=80",
    supportedColors: ["#1c1917", "#44403c", "#78350f", "#164e63"],
    sections: ["personalInfo", "summary", "experience", "education", "skills", "projects", "certifications", "custom"],
    notes: "Serif typography, generous whitespace — suited for senior/leadership and design-adjacent roles."
  },
  {
    id: "bold-timeline",
    name: "Bold Timeline",
    thumbnailUrl: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=300&q=80",
    supportedColors: ["#dc2626", "#ea580c", "#0891b2", "#4f46e5"],
    sections: ["personalInfo", "summary", "experience", "education", "skills", "projects", "certifications", "custom"],
    notes: "Vertical timeline visual for experience/education — strong visual hierarchy for career-progression storytelling."
  }
];

module.exports = resumeTemplates;