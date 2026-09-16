import { useState, useEffect, useCallback, useRef } from 'react';
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
} from 'lucide-react';
import './ReportManager.css';

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ReportManager({ token: propToken, patientId, userRole }) {
  const token = propToken || (typeof localStorage !== 'undefined' ? localStorage.getItem('careoclock_token') : '');
  const [reports, setReports] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');

  // Upload Modal / Form State
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
        setError(data.error || 'Failed to retrieve medical reports.');
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

  // Clean preview blob URL when closing or unmounting
  useEffect(() => {
    return () => {
      if (previewBlobUrl) {
        URL.revokeObjectURL(previewBlobUrl);
      }
    };
  }, [previewBlobUrl]);

  // Handle File Validation & Selection
  const validateAndSetFile = (file) => {
    if (!file) return;

    // Check extension
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    const isExtAllowed = ALLOWED_EXTENSIONS.includes(ext);
    const isMimeAllowed = ALLOWED_MIME_TYPES.includes(file.type);

    if (!isExtAllowed && !isMimeAllowed) {
      setError('Invalid file type. Only PDF (.pdf), JPEG (.jpg, .jpeg), and PNG (.png) files are accepted.');
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`File size exceeds 10MB limit (Selected: ${formatBytes(file.size)}).`);
      return;
    }

    setError('');
    setSelectedFile(file);

    // Auto-fill title from filename if title is blank
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
      setError('Please select a PDF or image file to upload.');
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
        setSuccessNotice(`Medical document "${data.report?.title}" uploaded and secured successfully.`);
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

  // Inline View
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
        throw new Error(errData.error || 'Failed to retrieve document stream.');
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      setPreviewBlobUrl(objectUrl);
    } catch (err) {
      setError(`Viewing failed: ${err.message}`);
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

  // Authenticated Download
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

  // Soft Delete
  const handleDelete = async (report) => {
    if (!window.confirm(`Are you sure you want to remove report "${report.title}"?`)) {
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
        setSuccessNotice('Report removed successfully.');
        setReports((prev) => prev.filter((r) => r.id !== report.id));
        setTimeout(() => setSuccessNotice(''), 3000);
      } else {
        setError(data.error || 'Failed to remove report.');
      }
    } catch (err) {
      setError(`Delete error: ${err.message}`);
    }
  };

  // Filtered reports
  const filteredReports = reports.filter((r) => {
    const matchesType = filterType === 'all' || r.reportType === filterType;
    const matchesSearch =
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.originalFilename.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  const pdfCount = reports.filter((r) => r.mimeType === 'application/pdf').length;
  const imgCount = reports.length - pdfCount;

  return (
    <div className="report-manager-container">
      {/* Header & Stats Banner */}
      <div className="report-header-card">
        <div>
          <div className="report-header-title">
            <FileText size={22} color="#06b6d4" />
            <span>Reports & Records Management (FR7)</span>
          </div>
          <div className="report-header-subtitle">
            Secure multi-role storage for prescriptions, lab panels, and diagnostic imaging ({reports.length} total • {pdfCount} PDFs • {imgCount} Images).
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span className="report-security-badge">
            <ShieldCheck size={14} /> Path-Traversal Guarded • RBAC
          </span>
          <button
            onClick={loadReports}
            title="Refresh reports list"
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              padding: '0.45rem',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Alert Notices */}
      {error && (
        <div className="report-alert report-alert-error">
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <span>{error}</span>
          <button
            onClick={() => setError('')}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {successNotice && (
        <div className="report-alert report-alert-success">
          <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
          <span>{successNotice}</span>
        </div>
      )}

      {/* Action Toolbar */}
      <div className="report-toolbar">
        <div className="report-search-filter">
          <div style={{ position: 'relative', flex: 1 }}>
            <Search
              size={14}
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}
            />
            <input
              type="text"
              className="report-search-input"
              style={{ paddingLeft: '2rem', width: '100%' }}
              placeholder="Search by title or filename..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select
            className="report-type-select"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">All Documents ({reports.length})</option>
            <option value="prescription">Prescriptions</option>
            <option value="lab_report">Lab Reports</option>
            <option value="discharge_summary">Discharge Summaries</option>
            <option value="imaging">Imaging & Scans</option>
            <option value="other">Other</option>
          </select>
        </div>

        <button
          className="btn-upload-trigger"
          onClick={() => {
            setShowUploadModal(true);
            setError('');
          }}
        >
          <UploadCloud size={16} /> Upload New Document
        </button>
      </div>

      {/* Upload Modal / Form */}
      {showUploadModal && (
        <div className="upload-card">
          <div className="upload-card-header">
            <div className="upload-card-title">
              <UploadCloud size={18} color="#06b6d4" />
              <span>Upload Medical Document</span>
            </div>
            <button
              className="btn-close-card"
              onClick={() => {
                setShowUploadModal(false);
                setSelectedFile(null);
              }}
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleUploadSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Drag & Drop Area */}
            {!selectedFile ? (
              <div
                className={`dropzone ${dragActive ? 'drag-active' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="file-input-hidden"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={(e) => e.target.files?.[0] && validateAndSetFile(e.target.files[0])}
                />
                <UploadCloud size={36} className="dropzone-icon" />
                <div className="dropzone-prompt">Choose a file or drag & drop here</div>
                <div className="dropzone-subtext">Supports PDF, JPEG, PNG up to 10MB</div>
              </div>
            ) : (
              <div className="selected-file-banner">
                <div className="selected-file-info">
                  {selectedFile.type === 'application/pdf' ? (
                    <FileText size={22} color="#ef4444" />
                  ) : (
                    <ImageIcon size={22} color="#8b5cf6" />
                  )}
                  <div>
                    <div className="selected-file-name">{selectedFile.name}</div>
                    <div className="selected-file-size">{formatBytes(selectedFile.size)}</div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-close-card"
                  onClick={() => setSelectedFile(null)}
                  title="Change file"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {/* Title & Category Fields */}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Document Title *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. CBC Blood Panel March 2026"
                  required
                  value={uploadForm.title}
                  onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Document Category</label>
                <select
                  className="form-select"
                  value={uploadForm.reportType}
                  onChange={(e) => setUploadForm({ ...uploadForm, reportType: e.target.value })}
                >
                  <option value="prescription">Prescription</option>
                  <option value="lab_report">Lab Report</option>
                  <option value="discharge_summary">Discharge Summary</option>
                  <option value="imaging">Diagnostic Imaging (X-Ray / MRI / CT)</option>
                  <option value="other">Other Medical Record</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Notes & Clinical Context (Optional)</label>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder="Key findings, ordering physician, or relevant symptoms..."
                value={uploadForm.description}
                onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
              />
            </div>

            <div className="upload-actions">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => {
                  setShowUploadModal(false);
                  setSelectedFile(null);
                }}
              >
                Cancel
              </button>
              <button type="submit" className="btn-submit-upload" disabled={isUploading || !selectedFile}>
                {isUploading ? (
                  <>
                    <RefreshCw size={14} className="spin" /> Securing & Uploading...
                  </>
                ) : (
                  <>
                    <UploadCloud size={14} /> Upload Document
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reports Grid / Empty State */}
      {filteredReports.length === 0 ? (
        <div className="empty-reports-card">
          <FileText size={38} className="empty-reports-icon" />
          <h4 style={{ color: '#e2e8f0', marginBottom: '0.4rem' }}>No medical documents found</h4>
          <p style={{ fontSize: '0.82rem', margin: 0 }}>
            {searchQuery || filterType !== 'all'
              ? 'Try changing your search keywords or filter category.'
              : 'Upload laboratory reports, prescriptions, or imaging scans to keep records organized.'}
          </p>
        </div>
      ) : (
        <div className="reports-grid">
          {filteredReports.map((report) => {
            const isPdf = report.mimeType === 'application/pdf';
            const badgeClass = `report-type-badge badge-${report.reportType || 'other'}`;

            return (
              <div key={report.id} className="report-card">
                <div>
                  <div className="report-card-top">
                    <div className={`report-icon-wrapper ${isPdf ? 'report-icon-pdf' : 'report-icon-img'}`}>
                      {isPdf ? <FileText size={22} /> : <ImageIcon size={22} />}
                    </div>

                    <div className="report-card-meta">
                      <div className="report-title-row">
                        <span className="report-card-title" title={report.title}>
                          {report.title}
                        </span>
                        <span className={badgeClass}>{report.reportType.replace('_', ' ')}</span>
                      </div>
                      <div className="report-orig-name" title={report.originalFilename}>
                        {report.originalFilename} • {formatBytes(report.fileSizeBytes)}
                      </div>
                    </div>
                  </div>

                  {report.description && (
                    <div className="report-description" style={{ marginTop: '0.65rem' }}>
                      {report.description}
                    </div>
                  )}
                </div>

                <div>
                  <div className="report-footer-meta">
                    <span className="uploader-tag">
                      <User size={12} /> Uploaded by {report.uploaderRole}
                    </span>
                    <span>
                      <Calendar size={11} style={{ marginRight: '3px', verticalAlign: 'text-top' }} />
                      {formatDate(report.createdAt)}
                    </span>
                  </div>

                  <div className="report-actions" style={{ marginTop: '0.65rem' }}>
                    <button
                      className="btn-action btn-action-view"
                      onClick={() => handleView(report)}
                      title="View inline"
                    >
                      <Eye size={13} /> View
                    </button>
                    <button
                      className="btn-action btn-action-download"
                      onClick={() => handleDownload(report)}
                      title="Download file"
                    >
                      <Download size={13} /> Download
                    </button>
                    {(userRole === 'patient' || userRole === 'doctor') && (
                      <button
                        className="btn-action btn-action-delete"
                        onClick={() => handleDelete(report)}
                        title="Remove report"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Inline Preview Modal */}
      {previewReport && (
        <div className="preview-modal-overlay" onClick={handleClosePreview}>
          <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="preview-modal-header">
              <div className="preview-modal-title-group">
                {previewReport.mimeType === 'application/pdf' ? (
                  <FileText size={20} color="#ef4444" />
                ) : (
                  <ImageIcon size={20} color="#8b5cf6" />
                )}
                <span className="preview-modal-title">{previewReport.title}</span>
              </div>
              <button className="btn-close-card" onClick={handleClosePreview}>
                <X size={20} />
              </button>
            </div>

            <div className="preview-modal-body">
              {isPreviewLoading ? (
                <div className="preview-loading">
                  <RefreshCw size={28} className="spin" color="#06b6d4" />
                  <span>Decrypting and loading document stream...</span>
                </div>
              ) : previewBlobUrl ? (
                previewReport.mimeType === 'application/pdf' ? (
                  <iframe
                    src={previewBlobUrl}
                    title={previewReport.title}
                    className="preview-iframe"
                  />
                ) : (
                  <img
                    src={previewBlobUrl}
                    alt={previewReport.title}
                    className="preview-image"
                  />
                )
              ) : (
                <div className="preview-loading">
                  <AlertCircle size={28} color="#f87171" />
                  <span>Unable to preview document content.</span>
                </div>
              )}
            </div>

            <div className="preview-modal-footer">
              <span className="preview-modal-meta">
                {previewReport.originalFilename} ({formatBytes(previewReport.fileSizeBytes)}) •{' '}
                {previewReport.mimeType}
              </span>
              <button
                className="btn-action btn-action-download"
                onClick={() => handleDownload(previewReport)}
              >
                <Download size={14} /> Download File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
