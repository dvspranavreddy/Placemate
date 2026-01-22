// src/repo/applicationRepo.js
import { pool } from "../db/db.js";

export const applicationRepository = {
  findByStudentAndJob: async (studentId, jobId) => {
    const result = await pool.query(
      "SELECT * FROM applications WHERE user_id = $1 AND job_id = $2",
      [studentId, jobId]
    );
    return result.rows[0];
  },

  // Return job row by id
  getJobById: async (jobId) => {
    const { rows } = await pool.query(
      `SELECT job_id, company_name, role, application_deadline, online_assessment_date,
              interview_dates, applied_count, min_cgpa, eligible_branches
       FROM jobs WHERE job_id = $1`,
      [jobId]
    );
    return rows[0];
  },

  // Create application inside transaction and increment applied_count
  create: async (studentId, jobId, answers, resumeUrl, resumeFilename) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const insertQ = `
        INSERT INTO applications (user_id, job_id, answers, resume_url, resume_filename, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, 'applied', NOW(), NOW())
        RETURNING *;
      `;
      const insertRes = await client.query(insertQ, [
        studentId,
        jobId,
        answers || {},
        resumeUrl || null,
        resumeFilename || null,
      ]);
      // increment applied_count safely (avoid null)
      await client.query(
        `UPDATE jobs SET applied_count = COALESCE(applied_count,0) + 1, updated_at = NOW() WHERE job_id = $1`,
        [jobId]
      );

      await client.query("COMMIT");
      return insertRes.rows[0];
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },

  // Update existing application (answers/resume_url/updated_at)
  update: async (applicationId, answers, resumeUrl, resumeFilename) => {
    const result = await pool.query(
      `UPDATE applications
       SET answers = $1, resume_url = $2, resume_filename = $3, updated_at = NOW()
       WHERE appl_id = $4
       RETURNING *`,
      [answers || {}, resumeUrl || null, resumeFilename || null, applicationId]
    );
    return result.rows[0];
  },

  getStudentProfile: async (studentId) => {
    const result = await pool.query("SELECT * FROM users WHERE user_id = $1", [
      studentId,
    ]);
    return result.rows[0];
  },

  // Fetch eligible + applied jobs + status (already had this, improved slightly)
  getStudentDashboardData: async (studentId, branch, cgpa, jobType) => {
    const query = `
      SELECT
        j.job_id,
        j.company_name,
        j.role,
        j.location,
        j.package,
        j.application_deadline,
        j.online_assessment_date,
        j.interview_dates,
        j.description,
        j.job_description_url,
        j.job_description_filename,
        j.min_cgpa,
        j.custom_questions,
        j.eligible_branches,
        a.status
      FROM jobs j
      LEFT JOIN applications a ON j.job_id = a.job_id AND a.user_id = $1
      WHERE
    (
        (
            $2 = ANY(j.eligible_branches)
            AND j.min_cgpa <= $3
        )
        OR a.user_id IS NOT NULL
    )
      AND (
        $4 IS NULL
        OR LOWER(j.job_type) = LOWER($4)
      )
    AND j.job_status NOT IN ('in review', 'in negotiation', 'in initial stage')
ORDER BY 
    j.application_deadline DESC NULLS LAST,
    j.created_at DESC;
    `;
      const { rows } = await pool.query(query, [studentId, branch, cgpa, jobType || null]);

    return rows.map(row => {
      const today = new Date();
      const deadline = row.application_deadline ? new Date(row.application_deadline) : null;

      let status = row.status || 'not applied';

      // If job is not applied and deadline has passed -> 'deadline missed'
      if (!row.status && deadline && today > deadline) {
        status = 'deadline missed';
      }

      return {
        ...row,
        status
      };
    });
  },

  getApplicationsByCompany: async (companyName) => {
    const query = `
      SELECT 
        a.appl_id,
        u.name AS applicant_name,
        u.email AS applicant_email,
        j.company_name,
        j.role,
        j.location,
        j.package AS package,
        a.status AS application_status,
        a.resume_url,
        a.created_at
      FROM applications a
      JOIN users u ON a.user_id = u.user_id
      JOIN jobs j ON a.job_id = j.job_id
      WHERE LOWER(j.company_name) = LOWER($1)
      ORDER BY a.created_at DESC;
    `;
    const { rows } = await pool.query(query, [companyName]);
    return rows;
  },

  async findApplicationByUser(userId){
    const query = `
      SELECT 
        j.company_name,
        j.role,
        j.description,
        a.updated_at,
        a.status
      FROM applications a 
      JOIN jobs j ON a.job_id = j.job_id 
      WHERE a.user_id = $1
      ORDER BY a.updated_at DESC
    `;
    const { rows } = await pool.query(query, [userId]);
    return rows;
  },
};
