const axios = require("axios");
const path = require("path");
const fs = require("fs").promises;
const config = require("../config/config");
const ApiError = require("../utils/ApiError");
const httpStatus = require("http-status");
const { uploadFileToS3 } = require("../utils/s3Upload");

/**
 * Generate PDF from HTML using Puppeteer
 * @param {string} htmlContent
 * @returns {Promise<Buffer>}
 */
const generatePdfFromHtml = async (htmlContent) => {
  let puppeteer;
  try {
    puppeteer = require("puppeteer");
  } catch (err) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Puppeteer is not installed or available on this system");
  }

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "20mm",
        right: "20mm",
        bottom: "20mm",
        left: "20mm",
      },
    });
    return pdfBuffer;
  } finally {
    await browser.close();
  }
};

/**
 * Render a resume model to HTML string based on template
 * @param {object} resume
 * @returns {string}
 */
const compileResumeHtml = (resume) => {
  const { templateId, colorTheme, sections } = resume;
  const p = sections.personalInfo || {};
  const themeColor = colorTheme || "#0f172a";

  const summaryHtml = sections.summary
    ? `<div class="section-title" style="color: ${themeColor};">Professional Summary</div>
       <p class="summary-text">${sections.summary}</p>`
    : "";

  const experienceHtml =
    sections.experience && sections.experience.length > 0
      ? `<div class="section-title" style="color: ${themeColor};">Work Experience</div>
       ${sections.experience
         .map(
           (exp) => `
         <div class="item">
           <div class="item-header">
             <span class="item-title">${exp.role || "Role"}</span>
             <span class="item-date">${exp.startDate} - ${exp.current ? "Present" : exp.endDate}</span>
           </div>
           <div class="item-sub">
             <strong>${exp.company}</strong>, ${exp.location}
           </div>
           ${
             exp.bullets && exp.bullets.length > 0
               ? `<ul class="bullets">
                 ${exp.bullets.map((b) => `<li>${b}</li>`).join("")}
               </ul>`
               : ""
           }
         </div>
       `
         )
         .join("")}`
      : "";

  const educationHtml =
    sections.education && sections.education.length > 0
      ? `<div class="section-title" style="color: ${themeColor};">Education</div>
       ${sections.education
         .map(
           (edu) => `
         <div class="item">
           <div class="item-header">
             <span class="item-title">${edu.degree || "Degree"} in ${edu.field || "Field"}</span>
             <span class="item-date">${edu.startDate} - ${edu.endDate}</span>
           </div>
           <div class="item-sub">
             <strong>${edu.institution}</strong> ${edu.gpa ? `• GPA: ${edu.gpa}` : ""}
           </div>
         </div>
       `
         )
         .join("")}`
      : "";

  const skillsHtml =
    sections.skills && sections.skills.length > 0
      ? `<div class="section-title" style="color: ${themeColor};">Skills & Expertise</div>
       <div class="skills-container">
         ${sections.skills.map((s) => `<span class="skill-tag" style="border-color: ${themeColor}40; background: ${themeColor}10; color: ${themeColor};">${s}</span>`).join("")}
       </div>`
      : "";

  const projectsHtml =
    sections.projects && sections.projects.length > 0
      ? `<div class="section-title" style="color: ${themeColor};">Projects</div>
       ${sections.projects
         .map(
           (proj) => `
         <div class="item">
           <div class="item-header">
             <span class="item-title">${proj.name}</span>
             ${proj.link ? `<span class="item-date"><a href="${proj.link}" target="_blank" style="color: ${themeColor}; text-decoration: none;">Link 🔗</a></span>` : ""}
           </div>
           <p class="summary-text">${proj.description}</p>
           ${
             proj.tech && proj.tech.length > 0
               ? `<div class="tech-stack">
                 ${proj.tech.map((t) => `<span class="tech-pill">${t}</span>`).join("")}
               </div>`
               : ""
           }
         </div>
       `
         )
         .join("")}`
      : "";

  const certsHtml =
    sections.certifications && sections.certifications.length > 0
      ? `<div class="section-title" style="color: ${themeColor};">Certifications</div>
       ${sections.certifications
         .map(
           (cert) => `
         <div class="item">
           <div class="item-header">
             <span class="item-title">${cert.name}</span>
             <span class="item-date">${cert.date}</span>
           </div>
           <div class="item-sub">${cert.issuer}</div>
         </div>
       `
         )
         .join("")}`
      : "";

  const customHtml =
    sections.custom && sections.custom.length > 0
      ? sections.custom
          .map(
            (c) => `
         <div class="section-title" style="color: ${themeColor};">${c.sectionTitle}</div>
         <p class="summary-text" style="white-space: pre-wrap;">${c.content}</p>
       `
          )
          .join("")
      : "";

  let templateSpecificCss = "";
  if (templateId === "minimalist") {
    templateSpecificCss = `
      body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.5; padding: 0; }
      .header-container { text-align: center; border-bottom: 2px solid ${themeColor}; padding-bottom: 15px; margin-bottom: 20px; }
      .user-name { font-size: 28px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: ${themeColor}; margin: 0 0 5px 0; }
      .user-contact { font-size: 11px; color: #64748b; font-weight: 500; }
    `;
  } else if (templateId === "modern") {
    templateSpecificCss = `
      body { font-family: 'Segoe UI', Roboto, sans-serif; color: #0f172a; line-height: 1.6; }
      .header-container { display: flex; align-items: center; justify-content: space-between; border-left: 6px solid ${themeColor}; padding-left: 20px; margin-bottom: 25px; }
      .user-name { font-size: 32px; font-weight: 700; color: ${themeColor}; margin: 0 0 2px 0; }
      .user-contact { font-size: 12px; color: #475569; text-align: right; }
    `;
  } else if (templateId === "creative") {
    templateSpecificCss = `
      body { font-family: 'Outfit', 'Inter', sans-serif; color: #1e293b; line-height: 1.5; }
      .header-container { background: ${themeColor}; color: white; padding: 25px; border-radius: 12px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: center; }
      .user-name { font-size: 30px; font-weight: 900; margin: 0; color: white; }
      .user-contact { font-size: 12px; opacity: 0.9; text-align: right; color: white; }
    `;
  } else if (templateId === "executive") {
    templateSpecificCss = `
      body { font-family: 'Georgia', serif; color: #1e293b; line-height: 1.6; }
      .header-container { text-align: left; border-bottom: 3px double ${themeColor}; padding-bottom: 15px; margin-bottom: 20px; }
      .user-name { font-size: 32px; font-family: 'Georgia', serif; font-weight: 500; color: ${themeColor}; margin: 0 0 5px 0; }
      .user-contact { font-size: 11px; color: #475569; font-weight: 600; line-height: 1.5; }
    `;
  }

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Resume Export</title>
      <style>
        ${templateSpecificCss}
        .section-title {
          font-size: 14px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-top: 25px;
          margin-bottom: 12px;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 5px;
        }
        .summary-text {
          font-size: 12px;
          color: #475569;
          margin: 0 0 15px 0;
          line-height: 1.6;
        }
        .item {
          margin-bottom: 15px;
        }
        .item-header {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          font-weight: 700;
          color: #0f172a;
        }
        .item-title {
          font-size: 13px;
        }
        .item-date {
          font-weight: 500;
          color: #64748b;
        }
        .item-sub {
          font-size: 11px;
          color: #64748b;
          margin-top: 2px;
        }
        .bullets {
          margin: 5px 0 0 0;
          padding-left: 20px;
          font-size: 12px;
          color: #475569;
        }
        .bullets li {
          margin-bottom: 3px;
        }
        .skills-container {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 5px;
        }
        .skill-tag {
          font-size: 11px;
          font-weight: 600;
          padding: 3px 8px;
          border: 1px solid;
          border-radius: 4px;
        }
        .tech-stack {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-top: 4px;
        }
        .tech-pill {
          font-size: 10px;
          background: #f1f5f9;
          color: #475569;
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: 500;
        }
      </style>
    </head>
    <body>
      <div class="header-container">
        <div>
          <h1 class="user-name">${p.fullName || "Your Name"}</h1>
        </div>
        <div class="user-contact">
          ${p.email ? `<div>Email: ${p.email}</div>` : ""}
          ${p.phone ? `<div>Phone: ${p.phone}</div>` : ""}
          ${p.location ? `<div>Location: ${p.location}</div>` : ""}
          ${p.linkedin ? `<div>LinkedIn: ${p.linkedin}</div>` : ""}
          ${p.website ? `<div>Website: ${p.website}</div>` : ""}
        </div>
      </div>

      ${summaryHtml}
      ${experienceHtml}
      ${educationHtml}
      ${skillsHtml}
      ${projectsHtml}
      ${certsHtml}
      ${customHtml}
    </body>
    </html>
  `;
};

/**
 * Render resume to PDF and return file URL
 * @param {object} resume
 * @returns {Promise<string>}
 */
const renderResumeToPdf = async (resume) => {
  const htmlContent = compileResumeHtml(resume);
  const pdfBuffer = await generatePdfFromHtml(htmlContent);

  // Use uploadFileToS3 helper to save the file
  const mockFileObj = {
    fieldname: "jobFile",
    originalname: `${resume.title.replace(/\s+/g, "_")}_export.pdf`,
    mimetype: "application/pdf",
    buffer: pdfBuffer,
  };

  const uploadResult = await uploadFileToS3(mockFileObj, resume.user.toString());
  return uploadResult.url;
};

/**
 * Call Gemini LLM to generate/refine section content
 * @param {string} prompt
 * @param {object} context
 * @returns {Promise<string>}
 */
const aiService = require("./aiService");

const generateSectionContent = async (prompt, context) => {
  const systemInstruction = `You are a professional, expert CV/resume writer and career coach. Your task is to rewrite, refine, or write content for a resume section based on the user's raw input. Do not include conversational filler, intro/outro, greetings, or markdown fences (like \`\`\`). Return ONLY the refined, clean content directly suitable for copy-pasting into a resume. The user is focusing on the section: "${context.sectionType}".`;

  const queryPrompt = `User Raw Input: "${prompt}"\nExisting Content in Section: "${context.existingContent || ""}"\nOther Resume Context (Title/Role): "${context.title || ""}"`;

  const result = await aiService.generateContent(
    systemInstruction,
    queryPrompt,
    { temperature: 0.3, maxOutputTokens: 1024 },
    context.userId,
    "/v1/resume/chat-assist"
  );

  return result.text
    .replace(/^```[a-zA-Z]*\n/gm, "")
    .replace(/```$/gm, "")
    .replace(/^["']/g, "")
    .replace(/["']$/g, "")
    .trim();
};

module.exports = {
  renderResumeToPdf,
  generateSectionContent,
  compileResumeHtml,
};
