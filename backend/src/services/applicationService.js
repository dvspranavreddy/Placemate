// src/services/applicationService.js

import { applicationRepository } from "../repo/applicationRepo.js";
import { notificationService } from "./notificationService.js";
import ExcelJS from "exceljs";

export const applicationService = {
  getPrefilledForm: async (studentId, jobId) => {
    const profile = await applicationRepository.getStudentProfile(studentId);
    const existingApp = await applicationRepository.findByStudentAndJob(studentId, jobId);
    return { profile, existingApp };
  },

  submitOrUpdateApplication: async (studentId, jobId, answers, resumeUrl, resumeFilename) => {
    // fetch job to check deadline, and student profile if needed
    const job = await applicationRepository.getJobById(jobId);
    if (!job) {
      const e = new Error("Job not found");
      e.code = "JOB_NOT_FOUND";
      throw e;
    }

    const today = new Date();
    if (job.application_deadline) {
      const deadline = new Date(job.application_deadline);
      // If current time is after the deadline -> block
      if (today > deadline) {
        const err = new Error("Application deadline has passed. Cannot apply or update.");
        err.code = "DEADLINE_PASSED";
        throw err;
      }
    }

    // existing application?
    const existing = await applicationRepository.findByStudentAndJob(studentId, jobId);
    let application;

    if (existing) {
      // Update allowed (we already validated deadline)
      application = await applicationRepository.update(existing.appl_id, answers, resumeUrl, resumeFilename);

      // Send notification (async)
      setImmediate(() => {
        notificationService.notifyStudent(
          studentId,
          `Your application for ${job.company_name} (${job.role}) was updated.`,
          "APPLICATION_UPDATED"
        );
      });
    } else {
      // Create application (transaction increments count)
      application = await applicationRepository.create(studentId, jobId, answers, resumeUrl, resumeFilename);

      setImmediate(() => {
        notificationService.notifyStudent(
          studentId,
          `Your application for ${job.company_name} (${job.role}) was submitted.`,
          "APPLICATION_SUBMITTED"
        );
      });
    }

    return application;
  },
  
  // 👇 NEW FUNCTION: Get dashboard data
  getDashboardData: async (studentId, jobType) => {
    const profile = await applicationRepository.getStudentProfile(studentId); 
    
    if (!profile) {
        throw new Error("Student profile not found. Cannot determine job eligibility.");
    }
    
    const { branch, cgpa, prefered_job_type, preferred_job_type, application_type } = profile; 
    const effectiveJobType = jobType || prefered_job_type || preferred_job_type || application_type || null;
    
    const dashboardData = await applicationRepository.getStudentDashboardData(
        studentId, 
        branch, 
        cgpa,
        effectiveJobType
    );
    
    return dashboardData;
  },

  generateCompanyReport: async (companyName) => {
    const applications = await applicationRepository.getApplicationsByCompany(companyName);
    if (applications.length === 0) return null;
  
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Applications');
  
    worksheet.columns = [
      { header: 'Application ID', key: 'appl_id', width: 15 },
      { header: 'Applicant Name', key: 'applicant_name', width: 20 },
      { header: 'Email', key: 'applicant_email', width: 25 },
      { header: 'Company Name', key: 'company_name', width: 20 },
      { header: 'Role', key: 'role', width: 20 },
      { header: 'Location', key: 'location', width: 20 },
      { header: 'Package Range', key: 'package', width: 15 },
      { header: 'Status', key: 'application_status', width: 15 },
      { header: 'Resume URL', key: 'resume_url', width: 30 },
      { header: 'Applied At', key: 'created_at', width: 20 },
    ];
  
    applications.forEach(app => worksheet.addRow(app));
  
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  },
};