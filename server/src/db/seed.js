import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectDB, disconnectDB } from './connection.js';
import User from '../models/User.js';
import Patient from '../models/Patient.js';
import CaregiverLink from '../models/CaregiverLink.js';

async function seed() {
  try {
    console.log('Connecting to database...');
    await connectDB();

    console.log('--- Seeding Initial CareOClock Accounts ---');

    // 1. Doctor
    let doctor = await User.findOne({ email: 'doctor@careoclock.com' });
    if (!doctor) {
      const passwordHash = await User.hashPassword('Doctor123!');
      doctor = await User.create({
        email: 'doctor@careoclock.com',
        passwordHash,
        displayName: 'Dr. Sarah Smith, MD',
        role: 'doctor',
      });
      console.log('✓ Created Doctor: doctor@careoclock.com (Password: Doctor123!)');
    } else {
      console.log('Doctor already exists: doctor@careoclock.com');
    }

    // 2. Patient
    let patientUser = await User.findOne({ email: 'patient@careoclock.com' });
    if (!patientUser) {
      const passwordHash = await User.hashPassword('Patient123!');
      patientUser = await User.create({
        email: 'patient@careoclock.com',
        passwordHash,
        displayName: 'Arthur Pendelton',
        role: 'patient',
      });

      const patientRecord = await Patient.create({
        userId: patientUser._id,
        assignedDoctorId: doctor._id,
        age: 72,
        sex: 'male',
        heightCm: 175,
        weightKg: 78,
        existingConditions: ['Hypertension', 'Type 2 Diabetes'],
      });
      console.log('✓ Created Patient: patient@careoclock.com (Password: Patient123!)');
    } else {
      console.log('Patient already exists: patient@careoclock.com');
      let patientRecord = await Patient.findOne({ userId: patientUser._id });
      if (!patientRecord) {
        await Patient.create({
          userId: patientUser._id,
          assignedDoctorId: doctor._id,
          age: 72,
          sex: 'male',
          heightCm: 175,
          weightKg: 78,
          existingConditions: ['Hypertension', 'Type 2 Diabetes'],
        });
        console.log('✓ Created missing Patient record for patient@careoclock.com');
      }
    }

    // 3. Caregiver
    let caregiverUser = await User.findOne({ email: 'caregiver@careoclock.com' });
    if (!caregiverUser) {
      const passwordHash = await User.hashPassword('Caregiver123!');
      caregiverUser = await User.create({
        email: 'caregiver@careoclock.com',
        passwordHash,
        displayName: 'Emma Pendelton',
        role: 'caregiver',
      });

      const patientRecord = await Patient.findOne({ userId: patientUser._id });
      if (patientRecord) {
        await CaregiverLink.create({
          caregiverUserId: caregiverUser._id,
          patientId: patientRecord._id,
          relationship: 'Daughter',
          status: 'active',
        });
      }
      console.log('✓ Created Caregiver: caregiver@careoclock.com (Password: Caregiver123!)');
    } else {
      console.log('Caregiver already exists: caregiver@careoclock.com');
    }

    console.log('\n--- Seed Complete! ---');
    console.log('You can now log in or register new patients assigned to Dr. Sarah Smith.\n');
  } catch (err) {
    console.error('Seed Error:', err);
  } finally {
    await disconnectDB();
    process.exit(0);
  }
}

seed();
