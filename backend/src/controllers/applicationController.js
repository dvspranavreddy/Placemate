// src/controllers/applicationController.js

import { applicationService } from "../services/applicationService.js";
// import { pool } from "../db/db.js";

const applicationController = {
  async getFormData(req, res) {
    try {
      const studentId = req.user?.id || req.params?.studentId || req.query?.userId;
      const { jobId } = req.params;
      const data = await applicationService.getPrefilledForm(studentId, jobId);
      res.json(data);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch form data" });
    }
  },

  async submitForm(req, res) {
    try {
      const { jobId, studentId } = req.params;
      const { answers, resumeUrl, resumeFilename } = req.body;

      // Basic validation
      if (!studentId || !jobId) {
        return res.status(400).json({ message: "Missing studentId or jobId" });
      }

      const result = await applicationService.submitOrUpdateApplication(studentId, jobId, answers, resumeUrl, resumeFilename);
      return res.json({ success: true, data: result });
    } catch (err) {
      console.error("SubmitForm error:", err);
      if (err.code === "DEADLINE_PASSED") {
        return res.status(400).json({ success: false, message: err.message });
      }
      if (err.code === "JOB_NOT_FOUND") {
        return res.status(404).json({ success: false, message: err.message });
      }
      return res.status(500).json({ success: false, message: "Failed to submit form" });
    }
  },

  // 👇 NEW FUNCTION: Handles the /applications/dashboard route
  async getDashboardData(req, res) {
    try {
      // Use req.user.id from auth middleware, fallback to req.query.userId
      const studentId = req.user?.id || req.query.userId; 
      const jobType = req.query.jobType || req.query.preferred_job_type || req.query.prefered_job_type || null;
      
      if (!studentId) {
        return res.status(401).json({ message: "Authentication required (User ID missing)." });
      }

      const data = await applicationService.getDashboardData(studentId, jobType);
      res.json(data); 
    } catch (err) {
      console.error("Dashboard data fetching failed:", err);
      // Send a clear 500 response
      res.status(500).json({ 
        message: err.message || "Failed to load dashboard data due to a server error." 
      });
    }
  },

  downloadCompanyReport: async (req, res) => {
    try {
      const { companyName } = req.query;
      if (!companyName) {
        return res.status(400).json({ message: 'Company name is required' });
      }
  
      const buffer = await applicationService.generateCompanyReport(companyName);
      if (!buffer) {
        return res.status(404).json({ message: 'No applications found for this company' });
      }
  
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${companyName}_Applications_Report.xlsx`);
      res.send(buffer);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to generate report" });
    }
  },

  getUpcomingDeadline: async (req, res) => {
    // Existing function logic (was in the snippet, keeping for completeness)
    res.status(501).json({ message: "Not Implemented" });
  },

  getApplicationByUser: async (req, res) => {
    // Existing function logic (was in the snippet, keeping for completeness)
    res.status(501).json({ message: "Not Implemented" });
  },
};

export default applicationController; // Export the entire object as default