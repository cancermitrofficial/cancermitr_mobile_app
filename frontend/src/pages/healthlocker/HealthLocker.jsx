import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    FileText,
    Search,
    AlertCircle,
    CheckCircle,
    Clock,
    X,
    Plus,
    RefreshCw,
    ArrowLeft,
    Trash2,
    Eye,
} from 'lucide-react';
import axios from '../../lib/axios';
import { useNavigate } from 'react-router-dom';

// --- auth + cookie helpers (trimmed) ---
const cookies = {
    get(name) {
        const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
        if (!m) return null;
        try { return decodeURIComponent(m[1]); } catch { return m[1]; }
    },
    remove(name, path = '/') {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=${path}`;
    }
};
const auth = {
    get token() { return cookies.get('token'); },
    isAuthed() { return !!cookies.get('token'); },
    clear() { cookies.remove('token'); }
};

const HealthLocker = () => {
    const navigate = useNavigate();

    // ui/view state
    const [view, setView] = useState('categories'); // 'categories' | 'reports'
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // data state
    const [categories, setCategories] = useState([]);
    const [currentCategory, setCurrentCategory] = useState(null);
    const [reports, setReports] = useState([]);

    // controls
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [pagination, setPagination] = useState({ total: 0, limit: 20, offset: 0, hasMore: false });

    // modals
    const [showUpload, setShowUpload] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState([]);
    const fileInputRef = useRef(null);

    const [showReportModal, setShowReportModal] = useState(false);
    const [selectedReport, setSelectedReport] = useState(null);

    // ---- helpers ----
    const authGuard = () => {
        if (!auth.isAuthed()) {
            setError('Authentication required. Please log in again.');
            return false;
        }
        axios.defaults.headers.common.Authorization = `Bearer ${auth.token}`;
        return true;
    };

    const onHttpError = (err, label) => {
        if (err?.response?.status === 401 || err?.response?.status === 403) {
            setError('Session expired. Please log in again.');
            auth.clear();
            return;
        }
        setError(`${label}: ${err?.response?.data?.message || err.message}`);
    };

    const formatFileSize = (bytes = 0) => {
        if (!bytes) return '0 Bytes';
        const k = 1024, units = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
    };

    const statusIcon = (s) => {
        const cls = 'w-4 h-4';
        if (s === 'COMPLETED') return <CheckCircle className={`${cls} text-green-500`} />;
        if (s === 'PROCESSING') return <Clock className={`${cls} text-yellow-500`} />;
        if (s === 'FAILED') return <AlertCircle className={`${cls} text-red-500`} />;
        return <Clock className={`${cls} text-gray-500`} />;
    };

    // ---- effects ----
    // init: auth + categories
    useEffect(() => {
        if (!authGuard()) return;
        (async () => {
            try {
                const { data } = await axios.get('/reports/categories');
                if (data.success) setCategories(data.categories || []);
                else setError(`Failed to fetch categories: ${data.message || 'Unknown error'}`);
            } catch (e) { onHttpError(e, 'Categories fetch error'); }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // fetch reports when view/category/status/pagination changes
    useEffect(() => {
        if (view !== 'reports' || !currentCategory) return;
        if (!authGuard()) return;

        const fetchReports = async () => {
            setLoading(true);
            setError('');
            try {
                const params = {
                    category: currentCategory.value,
                    limit: pagination.limit,
                    offset: pagination.offset,
                    includeSummaryStatus: true,
                };
                if (status) params.status = status;

                const { data } = await axios.get('/reports', { params });
                if (data.success) {
                    setReports(data.reports || []);
                    setPagination(data.pagination || { total: 0, limit: 20, offset: 0, hasMore: false });
                } else {
                    setError(`Failed to fetch reports: ${data.message || 'Unknown error'}`);
                }
            } catch (e) { onHttpError(e, 'Reports fetch error'); }
            finally { setLoading(false); }
        };
        fetchReports();
    }, [view, currentCategory, status, pagination.offset]); // eslint-disable-line react-hooks/exhaustive-deps

    // ---- derived ----
    const filteredReports = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return reports;
        return reports.filter(r =>
            r.originalName?.toLowerCase().includes(q) ||
            r.summary?.toLowerCase().includes(q)
        );
    }, [reports, search]);

    // ---- actions ----
    const openCategory = (cat) => {
        setCurrentCategory(cat);
        setView('reports');
        setPagination((p) => ({ ...p, offset: 0 }));
        setSearch('');
        setStatus('');
    };

    const handleBack = () => {
        if (view === 'reports') {
            setView('categories');
            setCurrentCategory(null);
            setReports([]);
            setSearch('');
            setStatus('');
            setPagination({ total: 0, limit: 20, offset: 0, hasMore: false });
        } else {
            navigate('/dashboard');
        }
    };

    const handleFileSelect = (e) => setSelectedFiles(Array.from(e.target.files || []));

    const uploadReports = async () => {
        if (!selectedFiles.length) return alert('Please select files to upload');
        if (!authGuard()) return;

        setUploading(true);
        setError('');
        try {
            const formData = new FormData();
            selectedFiles.forEach(f => formData.append('files', f));
            formData.append('createChatSession', 'true');

            const { data } = await axios.post('/reports/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            if (data.success) {
                alert(`Uploaded ${data.results.successful.length} report(s).`);
                setSelectedFiles([]);
                setShowUpload(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
                // refresh view
                if (view === 'reports' && currentCategory) {
                    // trigger by touching offset (or call fetch via state ping)
                    setPagination((p) => ({ ...p }));
                } else {
                    // refetch categories
                    try {
                        const res = await axios.get('/reports/categories');
                        if (res.data.success) setCategories(res.data.categories || []);
                    } catch (e) { onHttpError(e, 'Categories refresh error'); }
                }
            } else {
                const msg = data.message || 'Unknown error';
                setError(`Upload failed: ${msg}`);
                alert(`Upload failed: ${msg}`);
            }
        } catch (e) {
            onHttpError(e, 'Upload error');
            alert(`Upload failed: ${e?.response?.data?.message || e.message}`);
        } finally { setUploading(false); }
    };

    const fetchReportDetails = async (id) => {
        if (!authGuard()) return;
        try {
            const { data } = await axios.get(`/reports/${id}`);
            if (data.success) {
                setSelectedReport(data.report);
                setShowReportModal(true);
            }
        } catch (e) { onHttpError(e, 'Failed to fetch report details'); }
    };

    const deleteReport = async (id) => {
        if (!confirm('Delete this report?')) return;
        if (!authGuard()) return;
        try {
            const { data } = await axios.delete(`/reports/${id}`);
            if (data.success) {
                alert('Report deleted');
                // refresh current list
                setPagination((p) => ({ ...p })); // ping
            }
        } catch (e) { onHttpError(e, 'Failed to delete report'); }
    };

    // ---- render ----
    return (
        <div className="max-w-7xl mx-auto p-6">
            {/* Header: SINGLE back button with dynamic behavior */}
            <div className="mb-8">
                <div className="flex items-center gap-4">
                    <button
                        onClick={handleBack}
                        className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                        title={view === 'reports' ? 'Back to Categories' : 'Back to Dashboard'}
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>

                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">
                            {view === 'categories' ? 'Health Locker' : currentCategory?.label}
                        </h1>
                        <p className="text-gray-600">
                            {view === 'categories'
                                ? 'Your medical reports organized by AI-detected categories'
                                : (currentCategory?.description || 'View and manage your reports')}
                        </p>
                    </div>
                </div>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center gap-2 text-red-800">
                        <AlertCircle className="w-5 h-5" />
                        <span>{error}</span>
                        <button onClick={() => setError('')} className="ml-auto text-red-600 hover:text-red-800">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Controls */}
            <div className="mb-6">
                <button
                    onClick={() => setShowUpload(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700"
                >
                    <Plus className="w-4 h-4" />
                    Upload Reports
                </button>
            </div>

            {/* Categories */}
            {view === 'categories' && (
                categories.length ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {categories.map(c => (
                            <div
                                key={c.value}
                                onClick={() => openCategory(c)}
                                className="bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer border hover:border-blue-300 group"
                            >
                                <div className="p-6">
                                    <div className="flex items-center gap-4 mb-4">
                                        <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                                            <FileText className="w-6 h-6 text-blue-600" />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                                                {c.label}
                                            </h3>
                                        </div>
                                    </div>
                                    <p className="text-gray-600 text-sm mb-4 leading-relaxed">{c.description}</p>
                                    <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                                        <span className="text-sm text-gray-500">Click to view reports</span>
                                        <div className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors">→</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-12">
                        <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No categories available</h3>
                        <p className="text-gray-600">Categories will appear here once they are configured</p>
                    </div>
                )
            )}

            {/* Reports */}
            {view === 'reports' && (
                <>
                    <div className="flex flex-col md:flex-row gap-4 mb-6">
                        <div className="flex-1 relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search reports..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">All Status</option>
                            <option value="PENDING">Pending</option>
                            <option value="PROCESSING">Processing</option>
                            <option value="COMPLETED">Completed</option>
                            <option value="FAILED">Failed</option>
                        </select>

                        <button
                            onClick={() => setPagination((p) => ({ ...p }))}
                            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Refresh
                        </button>
                    </div>

                    {loading ? (
                        <div className="flex justify-center items-center h-64">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {filteredReports.map(r => (
                                    <div key={r.id} className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow border">
                                        <div className="p-6">
                                            <div className="flex items-start justify-between mb-4">
                                                <div className="flex items-center gap-2">
                                                    <FileText className="w-5 h-5 text-blue-600" />
                                                    <span className="font-medium text-gray-900 truncate">{r.originalName}</span>
                                                </div>
                                                <div className="flex items-center gap-1">{statusIcon(r.analysisStatus)}</div>
                                            </div>

                                            <div className="space-y-2 mb-4 text-sm text-gray-600">
                                                <div>Size: {formatFileSize(r.fileSize)}</div>
                                                <div>Uploaded: {new Date(r.uploadedAt).toLocaleDateString()}</div>
                                            </div>

                                            {r.summary && (
                                                <p className="text-sm text-gray-700 line-clamp-3 mb-4">{r.summary}</p>
                                            )}

                                            {Array.isArray(r.keyFindings) && r.keyFindings.length > 0 && (
                                                <div className="mb-4">
                                                    <div className="text-sm font-medium text-gray-900 mb-1">Key Findings:</div>
                                                    <div className="flex flex-wrap gap-1">
                                                        {r.keyFindings.slice(0, 2).map((f, i) => (
                                                            <span key={i} className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                                                                {f}
                                                            </span>
                                                        ))}
                                                        {r.keyFindings.length > 2 && (
                                                            <span className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">
                                                                +{r.keyFindings.length - 2} more
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            <div className="flex justify-between items-center pt-4 border-t">
                                                <button
                                                    onClick={() => fetchReportDetails(r.id)}
                                                    className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                    View Details
                                                </button>
                                                <button
                                                    onClick={() => deleteReport(r.id)}
                                                    className="text-red-600 hover:text-red-800 flex items-center gap-1"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {!filteredReports.length && (
                                <div className="text-center py-12">
                                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                                    <h3 className="text-lg font-medium text-gray-900 mb-2">No reports found</h3>
                                    <p className="text-gray-600">Upload your first report to get started</p>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}

            {/* Upload Modal */}
            {showUpload && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                        <div className="flex justify-between items-center p-6 border-b">
                            <div>
                                <h3 className="text-lg font-semibold">Upload Reports</h3>
                                <p className="text-sm text-gray-500 mt-1">AI will automatically categorize your files</p>
                            </div>
                            <button onClick={() => setShowUpload(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Select Files (Max 5 files, 25MB each)
                                </label>
                                <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                    <div className="flex items-start gap-2">
                                        <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                        <p className="text-sm text-blue-800">
                                            Our AI analyzes and categorizes your medical reports based on content.
                                        </p>
                                    </div>
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    multiple
                                    accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.bmp,.tiff"
                                    onChange={handleFileSelect}
                                    className="w-full"
                                />
                                {selectedFiles.length > 0 && (
                                    <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                                        <p className="text-sm font-medium text-gray-700 mb-2">Selected files:</p>
                                        <ul className="text-sm text-gray-800 space-y-1">
                                            {selectedFiles.map((f, i) => (
                                                <li key={i} className="truncate flex items-center gap-2">
                                                    <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
                                                    {f.name}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    onClick={() => setShowUpload(false)}
                                    className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={uploadReports}
                                    disabled={uploading || selectedFiles.length === 0}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {uploading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
                                    {uploading ? 'Uploading...' : 'Upload & Analyze'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Report Details Modal */}
            {showReportModal && selectedReport && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center p-6 border-b">
                            <h3 className="text-lg font-semibold">{selectedReport.originalName}</h3>
                            <button onClick={() => setShowReportModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <h4 className="font-medium text-gray-900 mb-2">Report Information</h4>
                                    <div className="space-y-1 text-sm">
                                        <p><span className="font-medium">Category:</span> {categories.find(c => c.value === selectedReport.category)?.label || 'Auto-detected'}</p>
                                        <p><span className="font-medium">Status:</span> {selectedReport.analysisStatus}</p>
                                        <p><span className="font-medium">File Size:</span> {formatFileSize(selectedReport.fileSize)}</p>
                                        <p><span className="font-medium">Uploaded:</span> {new Date(selectedReport.uploadedAt).toLocaleString()}</p>
                                    </div>
                                </div>
                            </div>

                            {selectedReport.summary && (
                                <div>
                                    <h4 className="font-medium text-gray-900 mb-2">Summary</h4>
                                    <p className="text-gray-700">{selectedReport.summary}</p>
                                </div>
                            )}

                            {Array.isArray(selectedReport.keyFindings) && selectedReport.keyFindings.length > 0 && (
                                <div>
                                    <h4 className="font-medium text-gray-900 mb-2">Key Findings</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedReport.keyFindings.map((f, i) => (
                                            <span key={i} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                                                {f}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {Array.isArray(selectedReport.abnormalFindings) && selectedReport.abnormalFindings.length > 0 && (
                                <div>
                                    <h4 className="font-medium text-gray-900 mb-2">Abnormal Findings</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedReport.abnormalFindings.map((f, i) => (
                                            <span key={i} className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm">
                                                {f}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {Array.isArray(selectedReport.labValues) && selectedReport.labValues.length > 0 && (
                                <div>
                                    <h4 className="font-medium text-gray-900 mb-2">Lab Values</h4>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Parameter</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Normal Range</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {selectedReport.labValues.map((lab, i) => (
                                                    <tr key={i}>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{lab.parameter}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{lab.value}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{lab.normalRange}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <span
                                                                className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                                                    lab.status === 'HIGH'
                                                                        ? 'bg-red-100 text-red-800'
                                                                        : lab.status === 'LOW'
                                                                        ? 'bg-yellow-100 text-yellow-800'
                                                                        : 'bg-green-100 text-green-800'
                                                                }`}
                                                            >
                                                                {lab.status}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {Array.isArray(selectedReport.recommendations) && selectedReport.recommendations.length > 0 && (
                                <div>
                                    <h4 className="font-medium text-gray-900 mb-2">Recommendations</h4>
                                    <ul className="list-disc list-inside space-y-1">
                                        {selectedReport.recommendations.map((rec, i) => (
                                            <li key={i} className="text-gray-700">{rec}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HealthLocker;
