import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Search, Filter, RefreshCw, FileText, Calendar, ExternalLink } from "lucide-react";
import axiosClient from "../../api/axiosClient";
import { formatDateTime } from "../../utils/helpers"; 
import Loader from "../../components/UI/Loader";
import { useNavigate } from "react-router-dom";

// --- Helper Component for Statistics Cards ---
const StatCard = ({ label, count, textColor, isLoading }) => (
  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
    {isLoading ? (
      <div className="animate-pulse">
        <div className="h-8 bg-slate-100 rounded w-16 mb-2"></div>
        <div className="h-4 bg-slate-100 rounded w-20"></div>
      </div>
    ) : (
      <>
        <div className={`text-2xl font-bold ${textColor}`} role="status" aria-label={`${label}: ${count}`}>
          {count}
        </div>
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</div>
      </>
    )}
  </div>
);

// --- Helper Component for Status Badge ---
const StatusBadge = ({ status }) => {
  const statusLower = String(status || "not applied").toLowerCase();
  const normalized = statusLower.replace(/[-_]+/g, " ").trim();

  const statusConfig = useMemo(() => {
    const configs = {
      "not applied": { color: "indigo", label: "Need to Apply" },
      "ineligible": { color: "gray", label: "Ineligible" },
      "applied": { color: "blue", label: "Applied" },
      "shortlisted": { color: "yellow", label: "Shortlisted" },
      "interviewed": { color: "purple", label: "Interviewed" },
      "selected": { color: "green", label: "Selected" },
      "rejected": { color: "red", label: "Rejected" },
      "deadline missed": { color: "red", label: "Deadline Missed" },
    };

    for (const key in configs) {
      if (normalized.includes(key)) return configs[key];
    }
    return { color: "gray", label: "not applied" };
  }, [normalized]);

  const badgeColors = {
    gray: "bg-slate-100 text-slate-700 border-slate-200",
    red: "bg-red-50 text-red-700 border-red-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    yellow: "bg-amber-50 text-amber-700 border-amber-100",
    purple: "bg-purple-50 text-purple-700 border-purple-100",
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-100"
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badgeColors[statusConfig.color]}`}>
      {statusConfig.label}
    </span>
  );
};

const UpcomingDashboard = () => { 
  const navigate = useNavigate();
  const [jobsData, setJobsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('applications'); 
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [userCgpa, setUserCgpa] = useState(null);
  const [preferredJobType, setPreferredJobType] = useState(() => localStorage.getItem('application_type') || null);

  useEffect(() => {
    const storedCgpa = localStorage.getItem('cgpa');
    const parsedCgpa = parseFloat(storedCgpa);
    if (!Number.isNaN(parsedCgpa)) setUserCgpa(parsedCgpa);

    const storedJobType = localStorage.getItem('application_type');
    if (storedJobType) setPreferredJobType(storedJobType);
  }, []);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axiosClient.get(`/applications/dashboard`, {
        params: {
          jobType: preferredJobType || undefined,
        },
      });
      setJobsData(response.data);
      
    } catch (err) {
      setError("Failed to load dashboard data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [preferredJobType]);

  const checkCgpaEligibility = useCallback((job) => {
    const required = job?.min_cgpa ?? job?.minCgpa ?? job?.minCGPA;
    const requiredNum = required !== undefined ? parseFloat(required) : NaN;
    if (Number.isNaN(requiredNum) || userCgpa === null) return { ineligible: false, reason: null };
    const ineligible = userCgpa < requiredNum;
    return { ineligible, reason: ineligible ? `Required: ${requiredNum}` : null, requiredCgpa: requiredNum };
  }, [userCgpa]);

  useEffect(() => {
    fetchDashboardData();
    window.addEventListener("application:submitted", fetchDashboardData);
    return () => window.removeEventListener("application:submitted", fetchDashboardData);
  }, [fetchDashboardData]);

  const statusCounts = useMemo(() => {
    const counts = { total: jobsData.length, 'not applied': 0, applied: 0, shortlisted: 0, interviewed: 0, selected: 0, rejected: 0 };
    jobsData.forEach(job => {
      const status = job.status?.toLowerCase();
      if (counts.hasOwnProperty(status)) counts[status] += 1;
    });
    counts['active'] = counts.applied + counts.shortlisted + counts.interviewed;
    return counts;
  }, [jobsData]);

  const filteredApplications = useMemo(() => {
    return jobsData.filter(job => {
      const matchesSearch = job.company_name.toLowerCase().includes(searchTerm.toLowerCase()) || job.role.toLowerCase().includes(searchTerm.toLowerCase());
      const jobStatus = job.status?.toLowerCase();
      const matchesStatus = statusFilter === 'all' || jobStatus === statusFilter || (statusFilter === 'need to apply' && jobStatus === 'not applied');
      return matchesSearch && matchesStatus;
    });
  }, [jobsData, searchTerm, statusFilter]);

  const upcomingDeadlines = useMemo(() => {
    const today = Date.now();
    return jobsData.filter(job => {
        if (job.status === 'rejected' || job.status === 'selected') return false;
        let isDeadlineUpcoming = (job.status === 'not applied' && job.application_deadline && new Date(job.application_deadline).getTime() > today);
        let isActivityUpcoming = (job.status !== 'not applied' && (
            (job.online_assessment_date && new Date(job.online_assessment_date).getTime() > today) ||
            (Array.isArray(job.interview_dates) && job.interview_dates.length > 0 && new Date(job.interview_dates[0]).getTime() > today)
        ));
        return isDeadlineUpcoming || isActivityUpcoming;
      })
      .map(job => {
        let sortDate = null; let activityType = "";
        const deadline = job.application_deadline ? new Date(job.application_deadline).getTime() : null;
        const oa = job.online_assessment_date ? new Date(job.online_assessment_date).getTime() : null;
        const interview = Array.isArray(job.interview_dates) ? new Date(job.interview_dates[0]).getTime() : null;

        if (job.status === 'not applied' && deadline > today) { sortDate = deadline; activityType = 'Deadline'; }
        if (oa && oa > today && (!sortDate || oa < sortDate)) { sortDate = oa; activityType = 'OA'; }
        if (interview && interview > today && (!sortDate || interview < sortDate)) { sortDate = interview; activityType = 'Interview'; }

        return { ...job, upcoming_date: sortDate ? new Date(sortDate).toISOString() : null, activity_type: activityType };
      })
      .filter(job => job.upcoming_date)
      .sort((a, b) => new Date(a.upcoming_date) - new Date(b.upcoming_date));
  }, [jobsData]);

  const handleViewJob = (jobId) => {
    const job = jobsData.find(j => j.job_id === jobId);
    if (!job) return;
    const mappedJob = { ...job, id: job.job_id, title: job.role, company: job.company_name };
    navigate(`/student/apply/${job.job_id}`, { state: { job: mappedJob } });
  };

  if (loading && jobsData.length === 0) return <Loader text="Loading Dashboard..." />;

  const currentList = activeTab === 'applications' ? filteredApplications : upcomingDeadlines;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Placement Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">Track your applications and upcoming assessments</p>
        </header>
        
        {/* STATS SECTION - Scrollable on mobile */}
        <div className="flex overflow-x-auto pb-4 md:grid md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8 no-scrollbar">
          <div className="min-w-[150px] flex-shrink-0 md:min-w-0">
            <StatCard label="Total Jobs" count={statusCounts.total} textColor="text-slate-800" isLoading={loading} />
          </div>
          <div className="min-w-[150px] flex-shrink-0 md:min-w-0">
            <StatCard label="Active" count={statusCounts.active} textColor="text-blue-600" isLoading={loading} />
          </div>
          <div className="min-w-[150px] flex-shrink-0 md:min-w-0">
            <StatCard label="Pending" count={statusCounts['not applied']} textColor="text-indigo-600" isLoading={loading} />
          </div>
          <div className="min-w-[150px] flex-shrink-0 md:min-w-0">
             <StatCard label="Applied" count={statusCounts.applied} textColor="text-amber-600" isLoading={loading} />
          </div>
          <div className="min-w-[150px] flex-shrink-0 md:min-w-0">
            <StatCard label="Selected" count={statusCounts.selected} textColor="text-emerald-600" isLoading={loading} />
          </div>
          <div className="min-w-[150px] flex-shrink-0 md:min-w-0">
            <StatCard label="Rejected" count={statusCounts.rejected} textColor="text-red-600" isLoading={loading} />
          </div>
        </div>

        {error && <div className="p-4 bg-red-50 border border-red-100 text-red-700 rounded-xl mb-6 text-sm">{error}</div>}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {/* TABS */}
          <div className="flex bg-slate-50/50 px-4 pt-2 border-b border-slate-200">
            {['applications', 'deadlines'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-3 px-4 text-sm font-bold transition-all border-b-2 relative ${
                  activeTab === tab ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab === 'applications' ? 'All Jobs' : 'Deadlines'}
                {tab === 'deadlines' && upcomingDeadlines.length > 0 && (
                  <span className="ml-2 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                    {upcomingDeadlines.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* FILTERS */}
          <div className="p-4 md:p-6 flex flex-col md:flex-row gap-4 border-b border-slate-100">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search company or role..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm"
              />
            </div>
            
            <div className="flex gap-2">
              <div className="relative flex-1 md:w-48" style={{ display: activeTab === 'deadlines' ? 'none' : 'block' }}>
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full pl-10 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg appearance-none text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none cursor-pointer"
                >
                  <option value="all">All Statuses</option>
                  <option value="not applied">Need to Apply</option>
                  <option value="applied">Applied</option>
                  <option value="shortlisted">Shortlisted</option>
                  <option value="selected">Selected</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <button
                onClick={fetchDashboardData}
                className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 transition-all disabled:opacity-50"
                disabled={loading}
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* CONTENT AREA */}
          <div className="overflow-hidden">
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50/50 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="px-6 py-4">Company & Role</th>
                    <th className="px-6 py-4">{activeTab === 'deadlines' ? 'Next Activity' : 'Deadline'}</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentList.map((job) => {
                    const { ineligible, reason, requiredCgpa } = checkCgpaEligibility(job);
                    const isDeadlineMissed = job.application_deadline && new Date(job.application_deadline).getTime() < Date.now();
                    
                    return (
                      <tr key={job.job_id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-900">{job.company_name}</div>
                          <div className="text-sm text-slate-500">{job.role}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            {activeTab === 'deadlines' 
                              ? `${formatDateTime(job.upcoming_date, 'date')} [${job.activity_type}]`
                              : job.application_deadline ? formatDateTime(job.application_deadline, 'date') : 'N/A'
                            }
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={ineligible ? "ineligible" : job.status} />
                          {ineligible && <div className="text-[10px] text-red-500 mt-1 font-medium">{reason} (Your: {userCgpa})</div>}
                        </td>
                        <td className="px-6 py-4 text-right">
                           <div className="flex flex-col items-end gap-1.5">
                              <ActionButtons job={job} ineligible={ineligible} deadlineMissed={isDeadlineMissed} handleViewJob={handleViewJob} />
                           </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-slate-100">
              {currentList.map((job) => {
                const { ineligible, reason } = checkCgpaEligibility(job);
                const isDeadlineMissed = job.application_deadline && new Date(job.application_deadline).getTime() < Date.now();

                return (
                  <div key={job.job_id} className="p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-slate-900 leading-tight">{job.company_name}</h4>
                        <p className="text-sm text-slate-500">{job.role}</p>
                      </div>
                      <StatusBadge status={ineligible ? "ineligible" : job.status} />
                    </div>
                    
                    <div className="flex items-center justify-between text-xs text-slate-500 bg-slate-50 p-2 rounded-lg">
                       <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>
                            {activeTab === 'deadlines' ? job.activity_type : 'Deadline'}: {formatDateTime(activeTab === 'deadlines' ? job.upcoming_date : job.application_deadline, 'date')}
                          </span>
                       </div>
                       {ineligible && <span className="text-red-500 font-medium">{reason}</span>}
                    </div>

                    <div className="flex items-center justify-between pt-1">
                       {job.job_description_url ? (
                         <a href={job.job_description_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-semibold text-indigo-600">
                           <FileText className="w-3.5 h-3.5" /> JD
                         </a>
                       ) : <div />}
                       <ActionButtons job={job} ineligible={ineligible} deadlineMissed={isDeadlineMissed} handleViewJob={handleViewJob} isMobile />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Empty State */}
            {currentList.length === 0 && (
              <div className="py-20 text-center">
                <div className="bg-slate-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-6 h-6 text-slate-400" />
                </div>
                <p className="text-slate-500 font-medium">No results found</p>
                <p className="text-slate-400 text-xs mt-1">Try adjusting your search or filters</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Sub-component to clean up logic for Action Buttons
const ActionButtons = ({ job, ineligible, deadlineMissed, handleViewJob, isMobile }) => {
  const btnClass = isMobile 
    ? "px-4 py-1.5 rounded-lg text-sm font-bold transition-all" 
    : "text-sm font-bold hover:underline transition-all";

  if (ineligible) return <span className="text-xs text-slate-400 font-bold uppercase tracking-tighter">Ineligible</span>;
  
  if (deadlineMissed) return (
    <button onClick={() => handleViewJob(job.job_id)} className={`${btnClass} text-slate-600`}>View Details</button>
  );

  const isNotApplied = (job.status || "").toLowerCase().trim() === "not applied";
  
  return (
    <button 
      onClick={() => handleViewJob(job.job_id)} 
      className={`${btnClass} ${isNotApplied ? 'text-emerald-600' : 'text-amber-600'}`}
    >
      {isNotApplied ? 'Apply Now' : 'Update'}
    </button>
  );
};

export default UpcomingDashboard;