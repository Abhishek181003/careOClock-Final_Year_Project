import mongoose from 'mongoose';
import dns from 'node:dns';

// Fix for Windows Node.js querySrv ECONNREFUSED issue when resolving MongoDB Atlas SRV records
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // Ignore if not supported in environment
}

export async function connectDB(uri) {
  let primaryUri = uri;
  if (!primaryUri) {
    if (process.env.NODE_ENV === 'test') {
      primaryUri = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/careoclock_test';
    } else {
      primaryUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/careoclock';
    }
  }

  // Safety guard: NEVER allow tests to run against live production Atlas database
  if (process.env.NODE_ENV === 'test' && !primaryUri.includes('test') && !process.env.TEST_MONGODB_URI) {
    console.warn('[DB-GUARD] Redirecting test suite away from production URI to local careoclock_test');
    primaryUri = 'mongodb://127.0.0.1:27017/careoclock_test';
  }

  const localFallbackUri = process.env.NODE_ENV === 'test'
    ? 'mongodb://127.0.0.1:27017/careoclock_test'
    : 'mongodb://127.0.0.1:27017/careoclock';

  try {
    const conn = await mongoose.connect(primaryUri);
    if (process.env.NODE_ENV !== 'test') {
      console.log(`MongoDB Connected: ${conn.connection.host} (DB: ${conn.connection.name})`);
    }
    return conn;
  } catch (error) {
    console.error(`MongoDB Connection Error (${primaryUri}): ${error.message}`);
    // If primary failed and was not already local, try local MongoDB fallback
    if (primaryUri !== localFallbackUri && !uri) {
      console.warn(`Attempting fallback to local MongoDB: ${localFallbackUri}`);
      try {
        const fallbackConn = await mongoose.connect(localFallbackUri);
        if (process.env.NODE_ENV !== 'test') {
          console.log(`MongoDB Connected (Local Fallback): ${fallbackConn.connection.host} (DB: ${fallbackConn.connection.name})`);
        }
        return fallbackConn;
      } catch (fallbackErr) {
        console.error(`MongoDB Fallback Connection Error: ${fallbackErr.message}`);
      }
    }
    throw error;
  }
}

export async function disconnectDB() {
  try {
    await mongoose.disconnect();
  } catch (error) {
    console.error(`MongoDB Disconnect Error: ${error.message}`);
    throw error;
  }
}

