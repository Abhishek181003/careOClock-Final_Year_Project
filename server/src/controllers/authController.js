import { z } from 'zod';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Patient from '../models/Patient.js';
import CaregiverLink from '../models/CaregiverLink.js';
import AuditLog from '../models/AuditLog.js';
import { generateToken, generateRefreshToken, verifyRefreshToken } from '../utils/token.js';

// ── Zod Validation Schemas ──────────────────────────────────────────

const registerSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .max(254, 'Email exceeds maximum length (254 chars)'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(128, 'Password cannot exceed 128 characters'),
  displayName: z
    .string()
    .min(2, 'Display name must be at least 2 characters')
    .max(100, 'Display name cannot exceed 100 characters')
    .regex(/^[^<>]*$/, 'Display name cannot contain HTML characters (< or >)'),
  role: z.enum(['patient', 'caregiver', 'doctor'], {
    errorMap: () => ({ message: 'Role must be patient, caregiver, or doctor' }),
  }),
  // Doctor-specific invite code requirement (P2-7)
  doctorInviteCode: z.string().optional(),
  // Patient-specific fields
  assignedDoctorId: z.string().optional(),
  age: z.number().min(0).max(130).optional(),
  sex: z.enum(['male', 'female', 'other']).optional(),
  heightCm: z.number().min(50).max(280).optional(),
  weightKg: z.number().min(10).max(400).optional(),
  smokingPackYears: z.number().min(0).optional(),
  alcoholUse: z.enum(['none', 'occasional', 'moderate', 'heavy']).optional(),
  existingConditions: z
    .array(z.string().max(200, 'Condition description cannot exceed 200 characters'))
    .max(50, 'Cannot exceed 50 existing conditions')
    .optional(),
  // Caregiver-specific linking (optional on signup)
  patientId: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address').max(254),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// ── Controllers ──────────────────────────────────────────────────────

/**
 * Register a new User (Patient / Caregiver / Doctor)
 */
export async function register(req, res) {
  let createdUser = null;

  try {
    const validatedData = registerSchema.parse(req.body);
    const { email, password, displayName, role } = validatedData;
    const clientIp = req.ip || req.connection?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    // 1. Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'A user with this email already exists.' });
    }

    // 2. Role-specific authorization checks (Doctor invite code - P2-7)
    if (role === 'doctor') {
      const validDoctorCode = process.env.DOCTOR_INVITE_CODE || 'CAREOCLOCK-DOC-INVITE-2026';
      if (!validatedData.doctorInviteCode || validatedData.doctorInviteCode !== validDoctorCode) {
        return res.status(403).json({
          error: 'Doctor registration requires a valid doctor authorization invite code.',
        });
      }
    }

    // 3. Validate patient requirements (Optional assigned doctor)
    let assignedDoctor = null;
    if (role === 'patient' && validatedData.assignedDoctorId) {
      if (!mongoose.Types.ObjectId.isValid(validatedData.assignedDoctorId)) {
        return res.status(400).json({ error: 'Invalid assignedDoctorId format.' });
      }

      assignedDoctor = await User.findOne({
        _id: validatedData.assignedDoctorId,
        role: 'doctor',
      });

      if (!assignedDoctor) {
        return res.status(400).json({
          error: 'Assigned doctor not found. Please select a registered doctor.',
        });
      }
    }

    // 4. Validate caregiver patient linking upfront (P2-10)
    let linkedPatient = null;
    if (role === 'caregiver' && validatedData.patientId) {
      if (!mongoose.Types.ObjectId.isValid(validatedData.patientId)) {
        return res.status(400).json({ error: 'Invalid patientId format for caregiver linking.' });
      }

      linkedPatient = await Patient.findById(validatedData.patientId);
      if (!linkedPatient) {
        return res.status(400).json({ error: 'Patient not found for caregiver linking.' });
      }
    }

    // 5. Hash password & create user
    const passwordHash = await User.hashPassword(password);
    createdUser = new User({
      email: email.toLowerCase(),
      passwordHash,
      displayName,
      role,
    });
    await createdUser.save();

    // 6. Create role-specific records (Atomic cleanup on error - P2-9)
    let patientRecord = null;
    if (role === 'patient') {
      try {
        patientRecord = new Patient({
          userId: createdUser._id,
          assignedDoctorId: assignedDoctor ? assignedDoctor._id : null,
          age: validatedData.age,
          sex: validatedData.sex,
          heightCm: validatedData.heightCm,
          weightKg: validatedData.weightKg,
          smokingPackYears: validatedData.smokingPackYears || 0,
          alcoholUse: validatedData.alcoholUse || 'none',
          existingConditions: validatedData.existingConditions || [],
        });
        await patientRecord.save();
      } catch (patientErr) {
        // Rollback created user on patient creation failure
        await User.findByIdAndDelete(createdUser._id);
        throw patientErr;
      }
    } else if (role === 'caregiver' && linkedPatient) {
      try {
        await CaregiverLink.create({
          patientId: linkedPatient._id,
          caregiverUserId: createdUser._id,
          status: 'active',
          acceptedAt: new Date(),
        });
      } catch (linkErr) {
        await User.findByIdAndDelete(createdUser._id);
        throw linkErr;
      }
    }

    // 7. Audit log registration
    await AuditLog.logEvent({
      action: 'AUTH_REGISTER',
      userId: createdUser._id,
      role: createdUser.role,
      ipAddress: clientIp,
      userAgent,
      details: { email: createdUser.email },
    });

    // 8. Generate Tokens
    const token = generateToken(createdUser);
    const refreshToken = generateRefreshToken(createdUser);

    return res.status(201).json({
      message: 'User registered successfully',
      token,
      refreshToken,
      user: {
        id: createdUser._id,
        email: createdUser.email,
        displayName: createdUser.displayName,
        role: createdUser.role,
      },
      patient: patientRecord,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      });
    }

    // Handle Mongo unique duplicate key race condition (P2-8)
    if (error.code === 11000) {
      return res.status(400).json({ error: 'A user with this email already exists.' });
    }

    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

/**
 * Login User with Brute-Force Lockout Protection (P1-1)
 */
export async function login(req, res) {
  try {
    const validatedData = loginSchema.parse(req.body);
    const { email, password } = validatedData;
    const clientIp = req.ip || req.connection?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    // 1. Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // 2. Check if account is locked out (P1-1)
    if (user.isLocked()) {
      const minutesRemaining = Math.ceil((new Date(user.lockedUntil) - new Date()) / (60 * 1000));
      await AuditLog.logEvent({
        action: 'AUTH_ACCOUNT_LOCKED',
        userId: user._id,
        role: user.role,
        ipAddress: clientIp,
        userAgent,
        details: { email: user.email, lockedUntil: user.lockedUntil },
      });

      return res.status(423).json({
        error: `Account is temporarily locked due to multiple failed login attempts. Please try again in ${minutesRemaining} minute(s).`,
      });
    }

    // 3. Compare password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await user.incLoginAttempts();

      await AuditLog.logEvent({
        action: 'AUTH_LOGIN_FAILED',
        userId: user._id,
        role: user.role,
        ipAddress: clientIp,
        userAgent,
        details: { email: user.email, attempt: user.failedLoginAttempts + 1 },
      });

      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // 4. Successful login: reset failed login attempts
    await user.resetLoginAttempts();

    await AuditLog.logEvent({
      action: 'AUTH_LOGIN_SUCCESS',
      userId: user._id,
      role: user.role,
      ipAddress: clientIp,
      userAgent,
    });

    // 5. Generate Access & Refresh Tokens
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    // 6. Fetch associated patient record if patient
    let patient = null;
    if (user.role === 'patient') {
      patient = await Patient.findOne({ userId: user._id }).populate(
        'assignedDoctorId',
        'displayName email'
      );
    }

    return res.status(200).json({
      message: 'Login successful',
      token,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
      patient,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      });
    }
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

/**
 * Refresh Access Token (P2-3)
 */
export async function refresh(req, res) {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const decoded = verifyRefreshToken(refreshToken);

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: User no longer exists.' });
    }

    if (user.tokenVersion !== decoded.tokenVersion) {
      return res.status(401).json({ error: 'Unauthorized: Refresh token has been revoked.' });
    }

    const token = generateToken(user);
    const newRefreshToken = generateRefreshToken(user);

    await AuditLog.logEvent({
      action: 'AUTH_TOKEN_REFRESH',
      userId: user._id,
      role: user.role,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return res.status(200).json({
      token,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      });
    }
    return res.status(401).json({ error: 'Invalid or expired refresh token.' });
  }
}

/**
 * Logout User / Invalidate all Active Tokens (P2-4)
 */
export async function logout(req, res) {
  try {
    if (req.user?.id) {
      await User.findByIdAndUpdate(req.user.id, { $inc: { tokenVersion: 1 } });

      await AuditLog.logEvent({
        action: 'AUTH_LOGOUT',
        userId: req.user.id,
        role: req.user.role,
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent'],
      });
    }

    return res.status(200).json({ message: 'Logged out successfully.' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

/**
 * Get Current Authenticated User Session
 */
export async function getMe(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let extraData = {};
    if (user.role === 'patient') {
      const patient = await Patient.findOne({ userId: user._id }).populate(
        'assignedDoctorId',
        'displayName email'
      );
      const caregiverLink = await CaregiverLink.findOne({
        patientId: patient?._id,
        status: 'active',
      }).populate('caregiverUserId', 'displayName email');

      extraData = { patient, caregiver: caregiverLink?.caregiverUserId || null };
    } else if (user.role === 'caregiver') {
      // Protect patient PII from caregiver: select displayName & email for dashboard
      const link = await CaregiverLink.findOne({
        caregiverUserId: user._id,
        status: 'active',
      }).populate({
        path: 'patientId',
        populate: { path: 'userId', select: 'displayName email' },
      });
      extraData = { linkedPatient: link?.patientId || null };
    } else if (user.role === 'doctor') {
      const assignedPatientsCount = await Patient.countDocuments({ assignedDoctorId: user._id });
      extraData = { doctorStats: { assignedPatientsCount } };
    }

    return res.status(200).json({
      user,
      ...extraData,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

/**
 * Update Profile (displayName and patient baseline metrics)
 * PUT /api/auth/profile
 */
export async function updateProfile(req, res) {
  try {
    const { displayName, age, sex, heightCm, weightKg, smokingPackYears, alcoholUse, existingConditions } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (displayName && typeof displayName === 'string') {
      if (displayName.trim().length < 2) {
        return res.status(400).json({ error: 'Display name must be at least 2 characters.' });
      }
      if (/[<>]/.test(displayName)) {
        return res.status(400).json({ error: 'Display name contains invalid characters.' });
      }
      user.displayName = displayName.trim();
      await user.save();
    }

    let patient = null;
    if (user.role === 'patient') {
      patient = await Patient.findOne({ userId: user._id });
      if (patient) {
        if (age !== undefined) patient.age = Number(age);
        if (sex !== undefined) patient.sex = sex;
        if (heightCm !== undefined) patient.heightCm = Number(heightCm);
        if (weightKg !== undefined) patient.weightKg = Number(weightKg);
        if (smokingPackYears !== undefined) patient.smokingPackYears = Number(smokingPackYears);
        if (alcoholUse !== undefined) patient.alcoholUse = alcoholUse;
        if (existingConditions !== undefined && Array.isArray(existingConditions)) {
          patient.existingConditions = existingConditions.map((c) => String(c).trim()).filter(Boolean);
        }
        await patient.save();
        await patient.populate('assignedDoctorId', 'displayName email');
      }
    }

    await AuditLog.logEvent({
      action: 'USER_PROFILE_UPDATED',
      userId: user._id,
      role: user.role,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: { updatedFields: Object.keys(req.body) },
    });

    return res.status(200).json({
      message: 'Profile updated successfully.',
      user,
      patient,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

/**
 * Assign or Update Doctor
 * PUT /api/auth/assign-doctor
 */
export async function assignDoctor(req, res) {
  try {
    if (req.user.role !== 'patient') {
      return res.status(403).json({ error: 'Only patients can assign a primary care doctor.' });
    }

    const { doctorId } = req.body;
    let doctor = null;

    if (doctorId) {
      if (!mongoose.Types.ObjectId.isValid(doctorId)) {
        return res.status(400).json({ error: 'Invalid doctorId format.' });
      }

      doctor = await User.findOne({ _id: doctorId, role: 'doctor' });
      if (!doctor) {
        return res.status(404).json({ error: 'Doctor not found. Please select a registered doctor.' });
      }
    }

    const patient = await Patient.findOne({ userId: req.user.id });
    if (!patient) {
      return res.status(404).json({ error: 'Patient record not found.' });
    }

    patient.assignedDoctorId = doctor ? doctor._id : null;
    await patient.save();
    await patient.populate('assignedDoctorId', 'displayName email');

    await AuditLog.logEvent({
      action: 'DOCTOR_ASSIGNED_TO_PATIENT',
      userId: req.user.id,
      role: req.user.role,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      details: {
        patientId: patient._id,
        assignedDoctorId: doctor ? doctor._id : null,
      },
    });

    return res.status(200).json({
      message: doctor
        ? `Successfully assigned to Dr. ${doctor.displayName}.`
        : 'Doctor unassigned successfully.',
      patient,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

/**
 * List Registered Doctors (for patient registration / assignment selection)
 */
export async function getDoctors(_req, res) {
  try {
    const doctors = await User.find({ role: 'doctor' }).select('_id displayName email createdAt');
    return res.status(200).json({ doctors });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
