import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  FileText,
  UploadCloud,
  Eye,
  Download,
  Trash2,
  Search,
  X,
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  RefreshCw,
  ShieldCheck,
  Calendar,
  User,
  FolderOpen,
  Activity,
  FileCheck2,
} from 'lucide-react';
import './ReportManager.css';

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const CATEGORIES = [
  { id: 'all', label: 'All Documents', icon: FolderOpen },
  { id: 'lab_report', label: 'Lab Reports', icon: Activity, color: 'teal' },
  { id: 'prescription', label: 'Prescriptions', icon: FileCheck2, color: 'emerald' },
  { id: 'discharge_summary', label: 'Discharge Summaries', icon: FileText, color: 'amber' },
  { id: 'imaging', label: 'Imaging & Scans', icon: ImageIcon, color: 'purple' },
  { id: 'other', label: 'Other Records', icon: FileText, color: 'slate' },
];

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ReportManager({ token: propToken, patientId, userRole = 'patient' }) {
  const token =
    propToken ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('careoclock_token') : '');

  const [reports, setReports] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  // Upload Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadForm, setUploadForm] = useState({
    title: '',
    reportType: 'lab_report',
    description: '',
  });

  // Inline Preview Modal State
  const [previewReport, setPreviewReport] = useState(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState('');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const fileInputRef = useRef(null);

  // Load Reports
  const loadReports = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError('');

    try {
      const queryParam = patientId && userRole !== 'patient' ? `?patientId=${patientId}` : '';
      const res = await fetch(`/api/reports${queryParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (res.ok) {
        setReports(data.reports || []);
      } else {
        setError(data.error || 'Failed to retrieve medical records.');
      }
    } catch (err) {
      setError(`Network error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [token, patientId, userRole]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // Clean preview blob URL on unmount or close
  useEffect(() => {
    return () => {
      if (previewBlobUrl) {
        URL.revokeObjectURL(previewBlobUrl);
      }
    };
  }, [previewBlobUrl]);

  // Validate and select file
  const validateAndSetFile = (file) => {
    if (!file) return;

    const ext = '.' + file.name.split('.').pop().toLowerCase();
    const isExtAllowed = ALLOWED_EXTENSIONS.includes(ext);
    const isMimeAllowed = ALLOWED_MIME_TYPES.includes(file.type);

    if (!isExtAllowed && !isMimeAllowed) {
      setError('Invalid file format. Please upload PDF (.pdf), JPEG (.jpg, .jpeg), or PNG (.png) files.');
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`File size exceeds 10MB limit (Selected: ${formatBytes(file.size)}).`);
      return;
    }

    setError('');
    setSelectedFile(file);

    // Auto-fill title if blank
    if (!uploadForm.title) {
      const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      setUploadForm((prev) => ({ ...prev, title: baseName }));
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  // Submit Upload
  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please select a valid document file to upload.');
      return;
    }

    setIsUploading(true);
    setError('');
    setSuccessNotice('');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('title', uploadForm.title.trim());
      formData.append('reportType', uploadForm.reportType);
      formData.append('description', uploadForm.description.trim());

      if (patientId && userRole !== 'patient') {
        formData.append('patientId', patientId);
      }

      const res = await fetch('/api/reports/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setSuccessNotice(`Document "${data.report?.title}" uploaded and secured successfully.`);
        setSelectedFile(null);
        setUploadForm({ title: '', reportType: 'lab_report', description: '' });
        setShowUploadModal(false);
        loadReports();
        setTimeout(() => setSuccessNotice(''), 4000);
      } else {
        setError(data.error || 'Failed to upload document.');
      }
    } catch (err) {
      setError(`Upload error: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Inline View Handler
  const handleView = async (report) => {
    setPreviewReport(report);
    setIsPreviewLoading(true);
    setError('');

    try {
      if (previewBlobUrl) {
        URL.revokeObjectURL(previewBlobUrl);
        setPreviewBlobUrl('');
      }

      const res = await fetch(`/api/reports/${report.id}/view`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to load document stream.');
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      setPreviewBlobUrl(objectUrl);
    } catch (err) {
      setError(`Unable to open preview: ${err.message}`);
      setPreviewReport(null);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleClosePreview = () => {
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl('');
    }
    setPreviewReport(null);
  };

  // Authenticated Download Handler
  const handleDownload = async (report) => {
    try {
      setError('');
      const res = await fetch(`/api/reports/${report.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to download document.');
      }

      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = report.originalFilename || `${report.title}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (err) {
      setError(`Download failed: ${err.message}`);
    }
  };

  // Soft Delete Handler
  const handleDelete = async (report) => {
    if (!window.confirm(`Are you sure you want to remove "${report.title}" from your medical records?`)) {
      return;
    }

    try {
      setError('');
      const res = await fetch(`/api/reports/${report.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();

      if (res.ok) {
        setSuccessNotice('Document removed successfully.');
        setReports((prev) => prev.filter((r) => r.id !== report.id));
        setTimeout(() => setSuccessNotice(''), 3000);
      } else {
        setError(data.error || 'Failed to remove document.');
      }
    } catch (err) {
      setError(`Delete error: ${err.message}`);
    }
  };

  // Filtered reports
  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      const matchesCategory = activeCategory === 'all' || r.reportType === activeCategory;
      const matchesSearch =
        r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.originalFilename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.description && r.description.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [reports, activeCategory, searchQuery]);

  // Document statistics
  const stats = useMemo(() => {
    const totalBytes = reports.reduce((acc, r) => acc + (r.fileSizeBytes || 0), 0);
    const labsCount = reports.filter((r) => r.reportType === 'lab_report').length;
    const rxCount = reports.filter((r) => r.reportType === 'prescription').length;
    const imgCount = reports.filter((r) => r.reportType === 'imaging').length;
    return {
      total: reports.length,
      totalBytesFormatted: formatBytes(totalBytes),
      labsCount,
      rxCount,
      imgCount,
    };
  }, [reports]);

  return (
    <div className="w-full space-y-6 text-ink">
      {/* ── Header & Storage Summary Banner ──────────────────────────── */}
      <div className="p-5 rounded-ritual bg-surface border border-line shadow-ritual flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-brand-light flex items-center justify-center text-brand">
              <FileText size={20} />
            </div>
            <div>
              <h2 className="text-h2 font-display text-ink">Medical Records & Documents</h2>
              <p className="text-xs text-ink-soft">
                Encrypted multi-role repository for clinical lab panels, verified prescriptions, and diagnostic imaging.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold">
            <ShieldCheck size={14} className="text-emerald-600" />
            <span>Encrypted • HIPAA Guarded</span>
          </span>

          <button
            type="button"
            onClick={loadReports}
            title="Refresh documents list"
            className="p-2 rounded-full border border-line bg-paper hover:bg-surface text-ink-soft hover:text-ink transition-all"
          >
            <RefreshCw size={15} className={isLoading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Quick Stats Grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-ritual bg-surface border border-line shadow-ritual space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
            Total Records
          </span>
          <div className="text-2xl font-display font-bold text-ink">{stats.total}</div>
          <span className="text-[11px] text-ink-soft block">{stats.totalBytesFormatted} stored</span>
        </div>

        <div className="p-3.5 rounded-ritual bg-surface border border-line shadow-ritual space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700">
            Lab Panels
          </span>
          <div className="text-2xl font-display font-bold text-ink">{stats.labsCount}</div>
          <span className="text-[11px] text-ink-soft block">Blood & Pathology</span>
        </div>

        <div className="p-3.5 rounded-ritual bg-surface border border-line shadow-ritual space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
            Prescriptions
          </span>
          <div className="text-2xl font-display font-bold text-ink">{stats.rxCount}</div>
          <span className="text-[11px] text-ink-soft block">Active & Historical</span>
        </div>

        <div className="p-3.5 rounded-ritual bg-surface border border-line shadow-ritual space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700">
            Diagnostic Scans
          </span>
          <div className="text-2xl font-display font-bold text-ink">{stats.imgCount}</div>
          <span className="text-[11px] text-ink-soft block">X-Ray, MRI, CT</span>
        </div>
      </div>

      {/* ── Notification & Alert Banners ──────────────────────────────── */}
      {error && (
        <div className="p-3.5 rounded-ritual bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center justify-between gap-3 animate-pop-report">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-rose-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="text-rose-600 hover:text-rose-900">
            <X size={14} />
          </button>
        </div>
      )}

      {successNotice && (
        <div className="p-3.5 rounded-ritual bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between gap-3 animate-pop-report">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
            <span className="font-medium">{successNotice}</span>
          </div>
          <button onClick={() => setSuccessNotice('')} className="text-emerald-600 hover:text-emerald-900">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Toolbar: Search, Filters & Upload Trigger ─────────────────── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 flex-wrap">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft" />
          <input
            type="text"
            placeholder="Search records by title, filename, or notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-full border border-line bg-surface text-ink text-xs focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all"
          />
        </div>

        {/* Upload Document Button */}
        <button
          type="button"
          onClick={() => {
            setShowUploadModal(true);
            setError('');
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-brand hover:bg-brand-dark text-white text-xs font-semibold shadow-sm hover:shadow-md transition-all active:scale-95"
        >
          <UploadCloud size={16} />
          <span>Upload Document</span>
        </button>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1" role="tablist">
        {CATEGORIES.map(({ id, label, icon: CatIcon }) => {
          const isSelected = activeCategory === id;
          const count =
            id === 'all'
              ? reports.length
              : reports.filter((r) => r.reportType === id).length;

          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveCategory(id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                isSelected
                  ? 'bg-brand text-white shadow-sm'
                  : 'bg-paper text-ink-soft hover:bg-surface border border-line'
              }`}
            >
              <CatIcon size={14} />
              <span>{label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  isSelected ? 'bg-white/25 text-white' : 'bg-surface text-ink-soft border border-line'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Document Cards Grid ───────────────────────────────────────── */}
      {filteredReports.length === 0 ? (
        <div className="p-10 rounded-ritual bg-surface border border-line shadow-ritual text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-full bg-brand-light/50 flex items-center justify-center text-brand">
            <FileText size={28} />
          </div>
          <div>
            <h4 className="text-base font-display font-bold text-ink">No Medical Documents Found</h4>
            <p className="text-xs text-ink-soft max-w-md mx-auto mt-1">
              {searchQuery || activeCategory !== 'all'
                ? 'No documents match your filter keywords. Try resetting your search or selecting "All Documents".'
                : 'Upload medical prescriptions, laboratory test results, and imaging scans to keep records organized and accessible to your clinical team.'}
            </p>
          </div>
          {(searchQuery || activeCategory !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setActiveCategory('all');
              }}
              className="text-xs font-semibold text-brand hover:underline"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredReports.map((report) => {
            const isPdf = report.mimeType === 'application/pdf';

            // Category style helper
            const catConfig = {
              lab_report: { label: 'Lab Report', color: 'bg-teal-50 text-teal-800 border-teal-200' },
              prescription: { label: 'Prescription', color: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
              discharge_summary: { label: 'Discharge', color: 'bg-amber-50 text-amber-800 border-amber-200' },
              imaging: { label: 'Imaging', color: 'bg-purple-50 text-purple-800 border-purple-200' },
              other: { label: 'Record', color: 'bg-slate-100 text-slate-800 border-slate-200' },
            }[report.reportType] || { label: 'Document', color: 'bg-slate-100 text-slate-800 border-slate-200' };

            return (
              <div
                key={report.id}
                className="p-5 rounded-ritual bg-surface border border-line shadow-ritual hover:shadow-md transition-all flex flex-col justify-between space-y-4 animate-pop-report"
              >
                <div className="space-y-3">
                  {/* Card Header: Icon + Title + Category Pill */}
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isPdf ? 'bg-rose-100 text-rose-600' : 'bg-purple-100 text-purple-600'
                      }`}
                    >
                      {isPdf ? <FileText size={20} /> : <ImageIcon size={20} />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-display font-bold text-ink truncate" title={report.title}>
                          {report.title}
                        </h3>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${catConfig.color}`}>
                          {catConfig.label}
                        </span>
                      </div>

                      <div className="text-[11px] text-ink-soft truncate mt-0.5" title={report.originalFilename}>
                        {report.originalFilename} • {formatBytes(report.fileSizeBytes)}
                      </div>
                    </div>
                  </div>

                  {/* Description / Notes */}
                  {report.description && (
                    <p className="text-xs text-ink-soft line-clamp-2 leading-relaxed bg-paper p-2.5 rounded-clinical border border-line">
                      {report.description}
                    </p>
                  )}
                </div>

                {/* Footer Metadata & Actions */}
                <div className="pt-3 border-t border-line space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] text-ink-soft">
                    <span className="flex items-center gap-1 truncate">
                      <User size={12} className="flex-shrink-0" />
                      <span>{report.uploaderRole === 'doctor' ? 'Clinician Upload' : 'Patient Upload'}</span>
                    </span>
                    <span className="flex items-center gap-1 flex-shrink-0">
                      <Calendar size={12} />
                      <span>{formatDate(report.createdAt)}</span>
                    </span>
                  </div>

                  {/* Actions Toolbar */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleView(report)}
                      className="flex-1 py-1.5 px-3 rounded-full bg-brand-light hover:bg-brand text-brand hover:text-white font-semibold text-xs transition-all flex items-center justify-center gap-1.5 active:scale-95"
                    >
                      <Eye size={13} />
                      <span>View</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDownload(report)}
                      className="py-1.5 px-3 rounded-full bg-paper hover:bg-surface text-ink-soft hover:text-ink border border-line font-semibold text-xs transition-all flex items-center justify-center gap-1.5 active:scale-95"
                      title="Download file"
                    >
                      <Download size={13} />
                      <span>Download</span>
                    </button>

                    {(userRole === 'patient' || userRole === 'doctor') && (
                      <button
                        type="button"
                        onClick={() => handleDelete(report)}
                        className="p-1.5 rounded-full hover:bg-rose-50 text-ink-soft hover:text-rose-600 border border-transparent hover:border-rose-200 transition-all active:scale-95"
                        title="Remove document"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal: Drag-and-Drop Document Upload ───────────────────────── */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-pop-report">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto bg-surface rounded-ritual shadow-ritual border border-line p-6 relative space-y-5">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-brand-light flex items-center justify-center text-brand">
                  <UploadCloud size={18} />
                </div>
                <div>
                  <h3 className="text-h3 font-display text-ink">Upload Medical Document</h3>
                  <p className="text-xs text-ink-soft">
                    Securely upload laboratory panels, physician prescriptions, or imaging scans.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setSelectedFile(null);
                }}
                className="p-1.5 rounded-full hover:bg-paper text-ink-soft hover:text-ink transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleUploadSubmit} className="space-y-4">
              {/* Drag & Drop Dropzone */}
              {!selectedFile ? (
                <div
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`p-6 rounded-ritual border-2 border-dashed cursor-pointer transition-all text-center space-y-2 ${
                    dragActive
                      ? 'border-brand bg-brand-light/30 ring-2 ring-brand/20'
                      : 'border-line bg-paper hover:bg-surface hover:border-brand/50'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="file-input-hidden"
                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                    onChange={(e) => e.target.files?.[0] && validateAndSetFile(e.target.files[0])}
                  />
                  <div className="w-12 h-12 mx-auto rounded-full bg-brand-light flex items-center justify-center text-brand">
                    <UploadCloud size={24} />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-ink block">
                      Click to browse or drag and drop files here
                    </span>
                    <span className="text-[11px] text-ink-soft block mt-0.5">
                      Supports PDF, JPEG, and PNG formats (up to 10 MB)
                    </span>
                  </div>
                </div>
              ) : (
                /* Selected File Preview Banner */
                <div className="p-3.5 rounded-ritual bg-brand-light/40 border border-brand/20 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-brand flex-shrink-0 shadow-sm">
                      {selectedFile.type === 'application/pdf' ? (
                        <FileText size={18} className="text-rose-600" />
                      ) : (
                        <ImageIcon size={18} className="text-purple-600" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-ink truncate">{selectedFile.name}</div>
                      <div className="text-[11px] text-ink-soft">{formatBytes(selectedFile.size)}</div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="p-1.5 rounded-full hover:bg-white text-ink-soft hover:text-ink transition-colors"
                    title="Choose different file"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* Document Title & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
                    Document Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CBC Blood Panel March 2026"
                    value={uploadForm.title}
                    onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-clinical border border-line bg-paper text-ink text-xs focus:outline-none focus:ring-2 focus:ring-brand font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
                    Document Category *
                  </label>
                  <select
                    value={uploadForm.reportType}
                    onChange={(e) => setUploadForm({ ...uploadForm, reportType: e.target.value })}
                    className="w-full px-3 py-2 rounded-clinical border border-line bg-paper text-ink text-xs focus:outline-none focus:ring-2 focus:ring-brand font-medium"
                  >
                    <option value="lab_report">Lab Report (Blood / Pathology)</option>
                    <option value="prescription">Prescription / Medication List</option>
                    <option value="discharge_summary">Discharge Summary / Clinic Note</option>
                    <option value="imaging">Diagnostic Imaging (X-Ray / MRI / CT)</option>
                    <option value="other">Other Medical Record</option>
                  </select>
                </div>
              </div>

              {/* Notes & Clinical Context */}
              <div className="space-y-1">
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
                  Notes & Clinical Findings (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Fasting glucose normal, cholesterol slightly elevated. Ordered by Dr. Reed."
                  value={uploadForm.description}
                  onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-clinical border border-line bg-paper text-ink text-xs focus:outline-none focus:ring-2 focus:ring-brand font-medium"
                />
              </div>

              {/* Modal Actions */}
              <div className="pt-3 border-t border-line flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowUploadModal(false);
                    setSelectedFile(null);
                  }}
                  className="px-4 py-2 rounded-full border border-line bg-paper hover:bg-surface text-ink-soft hover:text-ink text-xs font-semibold transition-all"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isUploading || !selectedFile}
                  className="px-5 py-2 rounded-full bg-brand hover:bg-brand-dark text-white text-xs font-semibold shadow-sm hover:shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                >
                  {isUploading ? (
                    <>
                      <RefreshCw size={14} className="spin" />
                      <span>Encrypting & Uploading...</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud size={14} />
                      <span>Upload Document</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: High-Res Inline Document Viewer ─────────────────────── */}
      {previewReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-pop-report"
          onClick={handleClosePreview}
        >
          <div
            className="w-full max-w-4xl max-h-[92vh] flex flex-col bg-surface rounded-ritual shadow-2xl border border-line overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Viewer Header */}
            <div className="p-4 border-b border-line flex items-center justify-between gap-4 bg-surface">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    previewReport.mimeType === 'application/pdf'
                      ? 'bg-rose-100 text-rose-600'
                      : 'bg-purple-100 text-purple-600'
                  }`}
                >
                  {previewReport.mimeType === 'application/pdf' ? (
                    <FileText size={18} />
                  ) : (
                    <ImageIcon size={18} />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-display font-bold text-ink truncate">
                    {previewReport.title}
                  </h3>
                  <p className="text-[11px] text-ink-soft truncate">
                    {previewReport.originalFilename} • {formatBytes(previewReport.fileSizeBytes)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownload(previewReport)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-paper hover:bg-surface border border-line text-ink-soft hover:text-ink text-xs font-semibold transition-all active:scale-95"
                >
                  <Download size={13} />
                  <span>Download</span>
                </button>

                <button
                  type="button"
                  onClick={handleClosePreview}
                  className="p-1.5 rounded-full hover:bg-paper text-ink-soft hover:text-ink transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Viewer Body */}
            <div className="flex-1 p-4 bg-paper/50 overflow-auto flex items-center justify-center min-h-[400px]">
              {isPreviewLoading ? (
                <div className="flex flex-col items-center gap-3 text-ink-soft py-12">
                  <RefreshCw size={28} className="spin text-brand" />
                  <span className="text-xs font-medium">Decrypting and streaming document...</span>
                </div>
              ) : previewBlobUrl ? (
                previewReport.mimeType === 'application/pdf' ? (
                  <iframe
                    src={previewBlobUrl}
                    title={previewReport.title}
                    className="preview-iframe"
                  />
                ) : (
                  <div className="preview-image-container">
                    <img
                      src={previewBlobUrl}
                      alt={previewReport.title}
                      className="preview-image"
                    />
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center gap-2 text-rose-700 py-12">
                  <AlertCircle size={28} />
                  <span className="text-xs font-medium">Unable to load document stream.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
