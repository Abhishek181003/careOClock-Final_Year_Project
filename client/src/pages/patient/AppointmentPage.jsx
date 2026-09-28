import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  Clock,
  Video,
  MapPin,
  Stethoscope,
  Plus,
  AlertTriangle,
  X,
  CheckCircle2,
  Mic,
  MicOff,
  VideoOff,
  Share2,
  Activity,
  CalendarCheck,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';

const CONSULTATION_TYPES = [
  {
    id: 'video',
    label: 'Video Teleconsultation',
    icon: Video,
    description: 'Encrypted HD video visit from the comfort of home.',
  },
  {
    id: 'in_person',
    label: 'In-Person Clinic Visit',
    icon: Stethoscope,
    description: 'Physical examination and consultation at the clinic.',
  },
  {
    id: 'routine_followup',
    label: 'Routine Telemetry Review',
    icon: Activity,
    description: 'Physician review of your vital patterns and medication.',
  },
];

const TIME_SLOTS = [
  { time: '09:00 AM', period: 'Morning' },
  { time: '10:30 AM', period: 'Morning' },
  { time: '11:45 AM', period: 'Morning' },
  { time: '02:00 PM', period: 'Afternoon' },
  { time: '03:30 PM', period: 'Afternoon' },
  { time: '05:00 PM', period: 'Afternoon' },
];

const COMMON_REASONS = [
  'Routine Telemetry & BP Check',
  'Medication Refill & Review',
  'Follow-up on Mild Dyspnea',
  'Chest Tightness Evaluation',
  'General Well-being Consultation',
];

function formatDoctorName(name, fallback = 'Physician') {
  if (!name) return fallback;
  const clean = name.trim();
  return clean.startsWith('Dr.') ? clean : `Dr. ${clean}`;
}

export default function AppointmentPage() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [assignedDoctor, setAssignedDoctor] = useState(null);
  const [latestVital, setLatestVital] = useState(null);
  const [activeTab, setActiveTab] = useState('upcoming'); // upcoming | past | cancelled
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [activeVideoCall, setActiveVideoCall] = useState(null); // appointment object
  const [rescheduleTarget, setRescheduleTarget] = useState(null); // appointment object
  const [cancelTarget, setCancelTarget] = useState(null); // appointment object

  // Booking Form State
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [consultType, setConsultType] = useState('video');
  const [selectedDate, setSelectedDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
  });
  const [selectedSlot, setSelectedSlot] = useState('10:30 AM');
  const [reason, setReason] = useState(COMMON_REASONS[0]);
  const [symptomsInput, setSymptomsInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState('');

  // Video Room Simulated Controls
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [newChatText, setNewChatText] = useState('');

  // Load real appointments, registered doctors, and assigned primary physician
  const loadAppointmentsData = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Fetch user's real appointments
      const res = await api.get('/appointments');
      setAppointments(res.data?.appointments || []);

      // 2. Fetch registered doctors
      try {
        const docRes = await api.get('/auth/doctors');
        const docs = docRes.data?.doctors || [];
        setDoctors(docs);
      } catch {
        // Retain empty
      }

      // 3. Fetch user profile to find real assigned doctor
      try {
        const meRes = await api.get('/auth/me');
        if (meRes.data?.patient?.assignedDoctorId) {
          const docObj = meRes.data.patient.assignedDoctorId;
          setAssignedDoctor(docObj);
          setSelectedDoctorId(docObj._id || docObj);
        }
      } catch {
        // Retain
      }

      // 4. Fetch latest real vital reading for the video call HUD
      try {
        const vitRes = await api.get('/clinical/vitals?limit=1');
        const vitList = vitRes.data?.vitals || [];
        if (vitList.length > 0) {
          setLatestVital(vitList[0]);
        }
      } catch {
        // Retain
      }
    } catch (err) {
      console.error('Failed to load appointments:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAppointmentsData();
  }, [loadAppointmentsData]);

  // Set chat greeting when video room opens with real doctor name
  useEffect(() => {
    if (activeVideoCall) {
      const docName = formatDoctorName(
        activeVideoCall.doctorId?.displayName || assignedDoctor?.displayName,
        'Physician'
      );
      setChatMessages([
        { sender: 'System', text: 'Encrypted clinical consultation room connected.' },
        { sender: docName, text: 'Good day! I have your latest telemetry on screen.' },
      ]);
    }
  }, [activeVideoCall, assignedDoctor]);

  // Derived categorized appointments
  const upcomingAppointments = useMemo(() => {
    return appointments.filter((a) => a.status === 'scheduled' || a.status === 'in_progress');
  }, [appointments]);

  const pastAppointments = useMemo(() => {
    return appointments.filter((a) => a.status === 'completed');
  }, [appointments]);

  const cancelledAppointments = useMemo(() => {
    return appointments.filter((a) => a.status === 'cancelled');
  }, [appointments]);

  // Next imminent appointment (Hero highlight)
  const nextAppointment = useMemo(() => {
    if (upcomingAppointments.length === 0) return null;
    return [...upcomingAppointments].sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))[0];
  }, [upcomingAppointments]);

  // Handle Booking Submit
  const handleBookAppointment = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const scheduledDateTime = new Date(`${selectedDate}T10:00:00.000Z`);
      const payload = {
        doctorId: selectedDoctorId || undefined,
        scheduledAt: scheduledDateTime.toISOString(),
        timeSlot: selectedSlot,
        type: consultType,
        reason,
        symptoms: symptomsInput
          ? symptomsInput.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
      };

      await api.post('/appointments', payload);
      setIsBookingOpen(false);
      setActionSuccessMessage('Appointment successfully scheduled!');
      setTimeout(() => setActionSuccessMessage(''), 5000);
      loadAppointmentsData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to book appointment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Reschedule
  const handleRescheduleSubmit = async () => {
    if (!rescheduleTarget) return;
    try {
      const scheduledDateTime = new Date(`${selectedDate}T10:00:00.000Z`);
      await api.patch(`/appointments/${rescheduleTarget._id}`, {
        scheduledAt: scheduledDateTime.toISOString(),
        timeSlot: selectedSlot,
        status: 'scheduled',
      });
      setRescheduleTarget(null);
      setActionSuccessMessage('Appointment successfully rescheduled.');
      setTimeout(() => setActionSuccessMessage(''), 5000);
      loadAppointmentsData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to reschedule.');
    }
  };

  // Handle Cancellation
  const handleCancelSubmit = async () => {
    if (!cancelTarget) return;
    try {
      await api.patch(`/appointments/${cancelTarget._id}`, {
        status: 'cancelled',
        cancellationReason: 'Cancelled by patient request',
      });
      setCancelTarget(null);
      setActionSuccessMessage('Appointment has been cancelled.');
      setTimeout(() => setActionSuccessMessage(''), 5000);
      loadAppointmentsData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to cancel appointment.');
    }
  };

  // Send Chat Message in Video Room
  const handleSendChat = (e) => {
    e.preventDefault();
    if (!newChatText.trim()) return;
    setChatMessages((prev) => [
      ...prev,
      { sender: user?.displayName || 'You', text: newChatText.trim() },
    ]);
    setNewChatText('');
  };

  return (
    <div className="space-y-8 text-ink pb-12">
      {/* ── Header & Action Bar ──────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <CalendarCheck className="text-brand" size={28} />
            <h1 className="text-h1 font-display text-ink">Clinical Appointments</h1>
          </div>
          <p className="text-sm text-ink-soft mt-1">
            Manage your physician consultations, scheduled telemetry reviews, and virtual teleconsultations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadAppointmentsData()}
            title="Refresh Appointments"
            className="p-2.5 rounded-full border border-line bg-surface hover:bg-paper text-ink-soft hover:text-ink transition-colors"
          >
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={() => setIsBookingOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-brand text-white font-semibold text-base shadow-sm hover:bg-brand-dark transition-all transform active:scale-95"
          >
            <Plus size={20} />
            <span>Book New Appointment</span>
          </button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {actionSuccessMessage && (
        <div className="p-4 rounded-ritual bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-600" />
            <span className="font-semibold">{actionSuccessMessage}</span>
          </div>
          <button onClick={() => setActionSuccessMessage('')} className="text-emerald-700 hover:text-emerald-950">
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Hero: Next Scheduled Appointment Highlight ────────────────── */}
      {nextAppointment ? (
        <div className="rounded-ritual bg-gradient-to-br from-brand/10 via-surface to-brand-light/20 border border-brand/30 p-6 shadow-ritual relative overflow-hidden">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-3 max-w-xl">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider text-brand px-3 py-1 rounded-full bg-brand-light/50 border border-brand/30 flex items-center gap-1.5">
                  <Calendar size={13} />
                  Next Upcoming Consultation
                </span>
                <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-emerald-100 text-emerald-800">
                  Confirmed
                </span>
              </div>

              <div>
                <h2 className="text-h2 font-display text-ink">
                  {nextAppointment.type === 'video'
                    ? 'Virtual Video Consultation'
                    : nextAppointment.type === 'in_person'
                    ? 'In-Person Clinic Visit'
                    : 'Routine Telemetry Review'}
                </h2>
                <p className="text-sm text-ink-soft mt-1 flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-ink">
                    {formatDoctorName(nextAppointment.doctorId?.displayName, 'Assigned Physician')}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Clock size={14} />
                    {new Date(nextAppointment.scheduledAt).toLocaleDateString([], {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    at {nextAppointment.timeSlot}
                  </span>
                </p>
              </div>

              <p className="text-xs text-ink-soft bg-surface/70 border border-line rounded-clinical p-2.5 inline-block">
                <strong>Clinical Focus:</strong> {nextAppointment.reason || 'General health evaluation'}
              </p>
            </div>

            {/* Quick Actions for Next Appointment */}
            <div className="flex flex-col sm:flex-row md:flex-col items-stretch sm:items-center md:items-end gap-3 w-full md:w-auto">
              {nextAppointment.type === 'video' ? (
                <button
                  onClick={() => setActiveVideoCall(nextAppointment)}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-brand text-white font-semibold text-base shadow-ritual hover:bg-brand-dark transition-all transform active:scale-95"
                >
                  <Video size={18} />
                  <span>Join Video Call</span>
                </button>
              ) : (
                <div className="p-3 rounded-clinical bg-surface border border-line text-xs text-ink-soft flex items-center gap-2">
                  <MapPin size={16} className="text-brand" />
                  <span>CareOClock Clinical Annex</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 text-xs">
                <button
                  onClick={() => setRescheduleTarget(nextAppointment)}
                  className="text-brand hover:text-brand-dark font-medium underline px-2 py-1"
                >
                  Reschedule
                </button>
                <span className="text-ink-soft">•</span>
                <button
                  onClick={() => setCancelTarget(nextAppointment)}
                  className="text-tier-high hover:text-rose-800 font-medium underline px-2 py-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-ritual bg-surface border border-dashed border-line p-8 text-center space-y-3">
          <CalendarCheck size={36} className="text-brand/50 mx-auto" />
          <h3 className="text-h3 font-display text-ink">No Upcoming Appointments Scheduled</h3>
          <p className="text-sm text-ink-soft max-w-md mx-auto">
            Maintain regular clinical touchpoints with your physician. Book a routine telemetry check-in or video consultation.
          </p>
          <button
            onClick={() => setIsBookingOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-brand text-white font-semibold text-sm hover:bg-brand-dark transition-colors"
          >
            <Plus size={16} />
            <span>Schedule a Visit</span>
          </button>
        </div>
      )}

      {/* ── Main Layout: Appointment Tabs & Physician Sidebar ───────── */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Tabs & Appointment Cards List */}
        <div className="lg:col-span-2 space-y-4">
          {/* Tabs */}
          <div className="flex items-center gap-2 border-b border-line pb-2">
            <button
              onClick={() => setActiveTab('upcoming')}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors flex items-center gap-2 ${
                activeTab === 'upcoming'
                  ? 'bg-brand text-white shadow-sm'
                  : 'text-ink-soft hover:text-ink hover:bg-paper'
              }`}
            >
              <span>Upcoming Visits</span>
              <span className="text-xs px-2 py-0.2 rounded-full bg-white/20 font-bold">
                {upcomingAppointments.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('past')}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors flex items-center gap-2 ${
                activeTab === 'past'
                  ? 'bg-brand text-white shadow-sm'
                  : 'text-ink-soft hover:text-ink hover:bg-paper'
              }`}
            >
              <span>Past Consultations</span>
              <span className="text-xs px-2 py-0.2 rounded-full bg-line text-ink font-bold">
                {pastAppointments.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('cancelled')}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors flex items-center gap-2 ${
                activeTab === 'cancelled'
                  ? 'bg-brand text-white shadow-sm'
                  : 'text-ink-soft hover:text-ink hover:bg-paper'
              }`}
            >
              <span>Cancelled</span>
              {cancelledAppointments.length > 0 && (
                <span className="text-xs px-2 py-0.2 rounded-full bg-rose-100 text-rose-800 font-bold">
                  {cancelledAppointments.length}
                </span>
              )}
            </button>
          </div>

          {/* List of Appointments based on active tab */}
          <div className="space-y-3">
            {activeTab === 'upcoming' &&
              (upcomingAppointments.length > 0 ? (
                upcomingAppointments.map((apt) => (
                  <AppointmentCard
                    key={apt._id}
                    appointment={apt}
                    onJoinVideo={() => setActiveVideoCall(apt)}
                    onReschedule={() => setRescheduleTarget(apt)}
                    onCancel={() => setCancelTarget(apt)}
                  />
                ))
              ) : (
                <div className="p-8 text-center text-ink-soft rounded-ritual bg-surface border border-line">
                  No upcoming visits found. Click &quot;Book New Appointment&quot; to schedule one.
                </div>
              ))}

            {activeTab === 'past' &&
              (pastAppointments.length > 0 ? (
                pastAppointments.map((apt) => (
                  <AppointmentCard
                    key={apt._id}
                    appointment={apt}
                    isPast
                  />
                ))
              ) : (
                <div className="p-8 text-center text-ink-soft rounded-ritual bg-surface border border-line">
                  No completed appointment records yet.
                </div>
              ))}

            {activeTab === 'cancelled' &&
              (cancelledAppointments.length > 0 ? (
                cancelledAppointments.map((apt) => (
                  <AppointmentCard
                    key={apt._id}
                    appointment={apt}
                    isCancelled
                  />
                ))
              ) : (
                <div className="p-8 text-center text-ink-soft rounded-ritual bg-surface border border-line">
                  No cancelled appointments.
                </div>
              ))}
          </div>
        </div>

        {/* Right 1 Col: Assigned Physician & Emergency Notice Card */}
        <div className="space-y-5">
          {/* Assigned Doctor Profile Card */}
          <div className="rounded-ritual bg-surface border border-line p-5 shadow-ritual space-y-4">
            <div className="flex items-center gap-2 border-b border-line pb-3">
              <Stethoscope className="text-brand" size={20} />
              <h3 className="text-h3 font-display text-ink">Primary Care Physician</h3>
            </div>

            {assignedDoctor ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-brand-light flex items-center justify-center text-brand font-bold text-lg">
                    {assignedDoctor.displayName ? assignedDoctor.displayName.charAt(0) : 'D'}
                  </div>
                  <div>
                    <h4 className="font-semibold text-ink text-base">
                      {formatDoctorName(assignedDoctor.displayName)}
                    </h4>
                    <p className="text-xs text-ink-soft">{assignedDoctor.email}</p>
                    <p className="text-xs text-brand font-medium">CareOClock Clinical Network</p>
                  </div>
                </div>

                <div className="p-3 rounded-clinical bg-paper text-xs space-y-1.5 text-ink-soft border border-line">
                  <div className="flex justify-between">
                    <span>Consultation Status:</span>
                    <strong className="text-emerald-700">Active Linked</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Telemetry Sync:</span>
                    <strong className="text-ink">Real-time Connected</strong>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSelectedDoctorId(assignedDoctor._id || '');
                    setIsBookingOpen(true);
                  }}
                  className="w-full py-2.5 rounded-full border border-brand text-brand hover:bg-brand hover:text-white font-semibold text-sm transition-colors"
                >
                  Consult {formatDoctorName(assignedDoctor.displayName)}
                </button>
              </>
            ) : (
              <div className="text-center py-4 space-y-3">
                <p className="text-xs text-ink-soft">
                  You do not have an assigned primary physician linked yet.
                </p>
                <Link
                  to="/app/profile"
                  className="inline-block w-full py-2 rounded-full bg-brand text-white font-semibold text-xs text-center hover:bg-brand-dark transition-colors"
                >
                  Select Doctor in Profile
                </Link>
              </div>
            )}
          </div>

          {/* Emergency Helpline Box */}
          <div className="rounded-ritual bg-rose-50 border border-rose-200 p-5 text-rose-950 space-y-3">
            <div className="flex items-center gap-2 font-bold text-rose-900 text-sm">
              <AlertTriangle size={18} className="text-rose-600 flex-shrink-0" />
              <span>Emergency Clinical Notice</span>
            </div>
            <p className="text-xs leading-relaxed text-rose-800">
              Virtual appointments and routine check-ins are not designed for acute, life-threatening emergencies. If you
              experience sudden severe chest pain, extreme breathlessness, or collapse:
            </p>
            <div className="flex items-center justify-between bg-white/80 p-2.5 rounded-clinical border border-rose-200">
              <span className="text-xs font-bold text-rose-900">National Emergency Helpline:</span>
              <a
                href="tel:112"
                className="font-mono font-extrabold text-rose-700 text-sm px-2.5 py-1 rounded bg-rose-100 hover:bg-rose-200 transition-colors"
              >
                Dial 112 / 911
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ── Modal: Book New Appointment ──────────────────────────────── */}
      {isBookingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto bg-surface rounded-ritual shadow-ritual border border-line p-6 relative space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div>
                <h3 className="text-h2 font-display text-ink">Schedule Physician Consultation</h3>
                <p className="text-xs text-ink-soft">Select your preferred date, time, and consultation mode.</p>
              </div>
              <button
                onClick={() => setIsBookingOpen(false)}
                className="p-2 rounded-full hover:bg-paper text-ink-soft hover:text-ink transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleBookAppointment} className="space-y-4 text-sm">
              {/* Doctor Selector */}
              <div>
                <label className="block font-semibold text-ink text-xs mb-1.5 uppercase tracking-wide">
                  Select Physician
                </label>
                <select
                  value={selectedDoctorId}
                  onChange={(e) => setSelectedDoctorId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-ritual border border-line bg-paper text-ink focus:outline-none focus:border-brand"
                >
                  {doctors.map((doc) => (
                    <option key={doc._id} value={doc._id}>
                      {formatDoctorName(doc.displayName)} ({doc.email})
                    </option>
                  ))}
                  {doctors.length === 0 && (
                    <option value="">
                      {assignedDoctor ? formatDoctorName(assignedDoctor.displayName) : 'Default Physician'}
                    </option>
                  )}
                </select>
              </div>

              {/* Consultation Mode */}
              <div>
                <label className="block font-semibold text-ink text-xs mb-1.5 uppercase tracking-wide">
                  Consultation Mode
                </label>
                <div className="grid sm:grid-cols-3 gap-2">
                  {CONSULTATION_TYPES.map((type) => {
                    const Icon = type.icon;
                    const isSelected = consultType === type.id;
                    return (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setConsultType(type.id)}
                        className={`p-3 rounded-ritual border text-left transition-all ${
                          isSelected
                            ? 'border-brand bg-brand-light/30 text-brand-dark font-semibold'
                            : 'border-line bg-paper text-ink-soft hover:bg-surface'
                        }`}
                      >
                        <Icon size={18} className={isSelected ? 'text-brand' : 'text-ink-soft'} />
                        <div className="text-xs font-bold mt-1.5">{type.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Date & Time Selection */}
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-ink text-xs mb-1.5 uppercase tracking-wide">
                    Preferred Date
                  </label>
                  <input
                    type="date"
                    min={new Date().toISOString().slice(0, 10)}
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-ritual border border-line bg-paper text-ink focus:outline-none focus:border-brand font-mono text-sm"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-ink text-xs mb-1.5 uppercase tracking-wide">
                    Time Slot
                  </label>
                  <select
                    value={selectedSlot}
                    onChange={(e) => setSelectedSlot(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-ritual border border-line bg-paper text-ink focus:outline-none focus:border-brand font-mono text-sm"
                  >
                    {TIME_SLOTS.map((slot) => (
                      <option key={slot.time} value={slot.time}>
                        {slot.time} ({slot.period})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Reason for Visit */}
              <div>
                <label className="block font-semibold text-ink text-xs mb-1.5 uppercase tracking-wide">
                  Reason for Consultation
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {COMMON_REASONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setReason(r)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        reason === r
                          ? 'bg-brand text-white border-brand'
                          : 'bg-paper text-ink-soft border-line hover:bg-surface'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="Describe your health concern or questions..."
                  className="w-full px-3.5 py-2 rounded-clinical border border-line bg-paper text-ink focus:outline-none focus:border-brand text-xs"
                />
              </div>

              {/* Symptoms Checklist */}
              <div>
                <label className="block font-semibold text-ink text-xs mb-1 uppercase tracking-wide">
                  Active Symptoms (Optional)
                </label>
                <input
                  type="text"
                  value={symptomsInput}
                  onChange={(e) => setSymptomsInput(e.target.value)}
                  placeholder="e.g. Mild shortness of breath, morning headache (comma-separated)"
                  className="w-full px-3.5 py-2 rounded-clinical border border-line bg-paper text-ink focus:outline-none focus:border-brand text-xs"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setIsBookingOpen(false)}
                  className="px-4 py-2 rounded-full border border-line text-ink-soft hover:text-ink text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2 rounded-full bg-brand text-white font-semibold text-sm hover:bg-brand-dark transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Confirming...' : 'Confirm Appointment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Interactive Video Consultation Room ───────────────── */}
      {activeVideoCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-6 backdrop-blur-md">
          <div className="w-full max-w-5xl h-[88vh] bg-slate-900 text-white rounded-ritual shadow-2xl border border-slate-700 flex flex-col overflow-hidden relative">
            {/* Call Header */}
            <div className="px-5 py-3.5 bg-slate-800/90 border-b border-slate-700 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Telehealth Room: {formatDoctorName(activeVideoCall.doctorId?.displayName)}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono">
                      ENCRYPTED HD
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Consultation in progress • Patient: {user?.displayName || 'Patient'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setActiveVideoCall(null)}
                className="p-1.5 rounded-full hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Main Stage: Video Feeds & Side Telemetry HUD */}
            <div className="flex-1 grid md:grid-cols-3 gap-4 p-4 min-h-0 bg-slate-950 overflow-y-auto">
              {/* Video Feeds Area (2 cols) */}
              <div className="md:col-span-2 flex flex-col gap-3">
                {/* Doctor's Main Simulated Stream */}
                <div className="flex-1 bg-slate-800 rounded-ritual border border-slate-700 relative overflow-hidden flex items-center justify-center min-h-[260px]">
                  <div className="text-center space-y-2 p-6">
                    <div className="w-20 h-20 rounded-full bg-brand/30 border-2 border-brand text-brand-light flex items-center justify-center mx-auto text-2xl font-display font-bold">
                      {activeVideoCall.doctorId?.displayName
                        ? activeVideoCall.doctorId.displayName.charAt(0).toUpperCase()
                        : 'D'}
                    </div>
                    <h4 className="font-semibold text-white text-base">
                      {formatDoctorName(activeVideoCall.doctorId?.displayName)}
                    </h4>
                    <p className="text-xs text-emerald-400 flex items-center justify-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Physician stream connected & audio verified
                    </p>
                  </div>

                  {/* Doctor Video Status Tag */}
                  <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded bg-black/60 backdrop-blur-sm text-[11px] text-white">
                    {formatDoctorName(activeVideoCall.doctorId?.displayName)} (Physician)
                  </div>
                </div>

                {/* Self View Floating Box */}
                <div className="h-32 bg-slate-900 rounded-clinical border border-slate-800 relative flex items-center justify-between px-4 overflow-hidden">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center font-bold text-white">
                      {user?.displayName ? user.displayName.charAt(0) : 'P'}
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-white block">
                        {user?.displayName || 'Patient'} (You)
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Camera: {isVideoMuted ? 'Off' : 'Active'} • Mic: {isAudioMuted ? 'Muted' : 'Active'}
                      </span>
                    </div>
                  </div>

                  {/* Audio waveform simulation */}
                  <div className="flex items-center gap-1">
                    {[16, 24, 12, 28, 20, 8].map((h, i) => (
                      <span
                        key={i}
                        className={`w-1 rounded-full transition-all ${
                          isAudioMuted ? 'bg-slate-700 h-2' : 'bg-brand h-6 animate-pulse'
                        }`}
                        style={{ height: isAudioMuted ? '6px' : `${h}px` }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Side Panel: Live Real Telemetry HUD & Clinical Chat */}
              <div className="bg-slate-900 rounded-ritual border border-slate-800 p-4 flex flex-col justify-between space-y-4">
                {/* HUD Telemetry Card with Real Patient Vitals */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Activity size={14} className="text-brand" /> Live Telemetry Feed
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono">
                      SYNCED
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded bg-slate-800/80 border border-slate-700/50">
                      <span className="text-[10px] text-slate-400 block">Blood Pressure</span>
                      <strong className="text-sm font-mono text-emerald-400">
                        {latestVital ? `${latestVital.systolicBp}/${latestVital.diastolicBp} mmHg` : 'No reading yet'}
                      </strong>
                    </div>
                    <div className="p-2 rounded bg-slate-800/80 border border-slate-700/50">
                      <span className="text-[10px] text-slate-400 block">Heart Rate</span>
                      <strong className="text-sm font-mono text-white">
                        {latestVital ? `${latestVital.heartRate} bpm` : '—'}
                      </strong>
                    </div>
                    <div className="p-2 rounded bg-slate-800/80 border border-slate-700/50">
                      <span className="text-[10px] text-slate-400 block">Oxygen (SpO2)</span>
                      <strong className="text-sm font-mono text-white">
                        {latestVital ? `${latestVital.spo2}%` : '—'}
                      </strong>
                    </div>
                    <div className="p-2 rounded bg-slate-800/80 border border-slate-700/50">
                      <span className="text-[10px] text-slate-400 block">Temperature</span>
                      <strong className="text-sm font-mono text-white">
                        {latestVital?.temperatureC ? `${latestVital.temperatureC}°C` : '—'}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Consultation Chat Box */}
                <div className="flex-1 flex flex-col min-h-[160px] border-t border-slate-800 pt-3">
                  <span className="text-xs font-bold text-slate-400 mb-2">Physician Chat & Notes</span>
                  <div className="flex-1 overflow-y-auto space-y-2 text-xs pr-1">
                    {chatMessages.map((msg, i) => (
                      <div key={i} className="p-2 rounded bg-slate-800/90 border border-slate-700/60">
                        <span className="font-semibold text-brand-light block text-[11px]">{msg.sender}</span>
                        <p className="text-slate-200 mt-0.5 leading-relaxed">{msg.text}</p>
                      </div>
                    ))}
                  </div>

                  <form onSubmit={handleSendChat} className="mt-2 flex gap-1.5">
                    <input
                      type="text"
                      value={newChatText}
                      onChange={(e) => setNewChatText(e.target.value)}
                      placeholder="Type note to doctor..."
                      className="flex-1 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-brand"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-full bg-brand hover:bg-brand-dark text-xs font-semibold text-white"
                    >
                      Send
                    </button>
                  </form>
                </div>
              </div>
            </div>

            {/* Bottom Controls Bar */}
            <div className="px-6 py-3.5 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsAudioMuted((m) => !m)}
                  className={`p-2.5 rounded-full border transition-colors ${
                    isAudioMuted
                      ? 'bg-rose-600 border-rose-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                  title={isAudioMuted ? 'Unmute Mic' : 'Mute Mic'}
                >
                  {isAudioMuted ? <MicOff size={18} /> : <Mic size={18} />}
                </button>

                <button
                  onClick={() => setIsVideoMuted((v) => !v)}
                  className={`p-2.5 rounded-full border transition-colors ${
                    isVideoMuted
                      ? 'bg-rose-600 border-rose-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                  title={isVideoMuted ? 'Start Video' : 'Stop Video'}
                >
                  {isVideoMuted ? <VideoOff size={18} /> : <Video size={18} />}
                </button>

                <button
                  onClick={() => setIsScreenSharing((s) => !s)}
                  className={`p-2.5 rounded-full border transition-colors ${
                    isScreenSharing
                      ? 'bg-brand border-brand text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                  title="Share Screen"
                >
                  <Share2 size={18} />
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActiveVideoCall(null)}
                  className="px-6 py-2.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm transition-colors shadow-lg"
                >
                  Leave Consultation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Reschedule Appointment ─────────────────────────────── */}
      {rescheduleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md bg-surface rounded-ritual shadow-ritual border border-line p-6 relative space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <h3 className="text-h3 font-display text-ink">Reschedule Appointment</h3>
              <button onClick={() => setRescheduleTarget(null)} className="p-1 rounded-full text-ink-soft hover:text-ink">
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-ink-soft">
              Select a new date and time slot for your consultation with{' '}
              {formatDoctorName(rescheduleTarget.doctorId?.displayName)}.
            </p>

            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">New Date</label>
                <input
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-ritual border border-line bg-paper text-ink font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">New Time Slot</label>
                <select
                  value={selectedSlot}
                  onChange={(e) => setSelectedSlot(e.target.value)}
                  className="w-full px-3 py-2 rounded-ritual border border-line bg-paper text-ink font-mono"
                >
                  {TIME_SLOTS.map((s) => (
                    <option key={s.time} value={s.time}>
                      {s.time} ({s.period})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
              <button
                onClick={() => setRescheduleTarget(null)}
                className="px-4 py-1.5 rounded-full border border-line text-xs font-semibold text-ink-soft"
              >
                Cancel
              </button>
              <button
                onClick={handleRescheduleSubmit}
                className="px-5 py-1.5 rounded-full bg-brand text-white text-xs font-semibold hover:bg-brand-dark"
              >
                Save New Time
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Cancel Appointment Confirmation ───────────────────── */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-surface rounded-ritual shadow-ritual border border-line p-6 relative space-y-4">
            <div className="flex items-center gap-2 text-rose-600 font-bold text-sm">
              <AlertTriangle size={20} />
              <span>Cancel Appointment?</span>
            </div>

            <p className="text-xs text-ink-soft leading-relaxed">
              Are you sure you want to cancel your consultation with{' '}
              {formatDoctorName(cancelTarget.doctorId?.displayName)} scheduled for{' '}
              {new Date(cancelTarget.scheduledAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} at{' '}
              {cancelTarget.timeSlot}?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
              <button
                onClick={() => setCancelTarget(null)}
                className="px-4 py-1.5 rounded-full border border-line text-xs font-semibold text-ink-soft"
              >
                Keep Visit
              </button>
              <button
                onClick={handleCancelSubmit}
                className="px-5 py-1.5 rounded-full bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Subcomponent: Appointment Card ────────────────────────────────────
function AppointmentCard({ appointment, isPast, isCancelled, onJoinVideo, onReschedule, onCancel }) {
  const isVideo = appointment.type === 'video';
  const dateObj = new Date(appointment.scheduledAt);
  const dateStr = dateObj.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="rounded-ritual bg-surface border border-line p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
              isVideo
                ? 'bg-blue-50 text-blue-800 border border-blue-200'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            }`}
          >
            {isVideo ? <Video size={12} /> : <Stethoscope size={12} />}
            <span className="capitalize">{appointment.type.replace('_', ' ')}</span>
          </span>

          <span className="text-xs text-ink-soft font-mono font-medium">{appointment.timeSlot}</span>
        </div>

        <h4 className="text-base font-display font-bold text-ink">
          {formatDoctorName(appointment.doctorId?.displayName, 'Physician Consultation')}
        </h4>

        <p className="text-xs text-ink-soft">
          <strong className="text-ink">Date:</strong> {dateStr} •{' '}
          <span className="text-ink-soft">{appointment.reason}</span>
        </p>

        {appointment.doctorNotes && (
          <div className="mt-2 p-2.5 rounded-clinical bg-paper border border-line text-xs text-ink-soft">
            <strong className="text-ink block mb-0.5">Doctor Summary & Notes:</strong>
            {appointment.doctorNotes}
          </div>
        )}

        {isCancelled && appointment.cancellationReason && (
          <p className="text-xs text-rose-700 italic">
            Reason: {appointment.cancellationReason}
          </p>
        )}
      </div>

      {/* Action Buttons */}
      {!isPast && !isCancelled && (
        <div className="flex items-center gap-2 self-stretch sm:self-center justify-end flex-wrap pt-2 sm:pt-0">
          {isVideo && onJoinVideo && (
            <button
              onClick={onJoinVideo}
              className="px-4 py-2 rounded-full bg-brand text-white font-semibold text-xs hover:bg-brand-dark transition-colors flex items-center gap-1.5"
            >
              <Video size={14} />
              <span>Join Call</span>
            </button>
          )}

          {onReschedule && (
            <button
              onClick={onReschedule}
              className="px-3.5 py-2 rounded-full border border-line hover:bg-paper text-xs font-semibold text-ink-soft hover:text-ink transition-colors"
            >
              Reschedule
            </button>
          )}

          {onCancel && (
            <button
              onClick={onCancel}
              className="px-3 py-2 rounded-full border border-transparent hover:bg-rose-50 text-xs font-semibold text-tier-high transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}
