import mongoose from 'mongoose';
import dns from 'node:dns';

// Fix for Windows Node.js querySrv ECONNREFUSED issue when resolving MongoDB Atlas SRV records
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // Ignore if not supported in environment
}

export async function connectDB(uri) {
  const primaryUri = uri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/careoclock';
  const localFallbackUri = 'mongodb://127.0.0.1:27017/careoclock';

  try {
    const conn = await mongoose.connect(primaryUri);
    if (process.env.NODE_ENV !== 'test') {
      console.log(`MongoDB Connected: ${conn.connection.host}`);
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
          console.log(`MongoDB Connected (Local Fallback): ${fallbackConn.connection.host}`);
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

