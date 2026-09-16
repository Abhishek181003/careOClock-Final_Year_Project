import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import { connectDB } from './db/connection.js';

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`CareOClock server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Fatal: Failed to connect to database on startup:', err.message);
    process.exit(1);
  });
