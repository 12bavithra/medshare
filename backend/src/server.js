import dotenv from 'dotenv';

// Load environment variables at the very top
dotenv.config();


// Validate required environment variables
const requiredEnvVars = [
  'PORT',
  'MONGODB_URI', 
  'JWT_SECRET',
  'EMAIL_USER',
  'EMAIL_PASS',
  'ADMIN_EMAIL',
  'CLIENT_ORIGIN'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.warn('⚠️ Missing required environment variables:');
  missingEnvVars.forEach(envVar => console.warn(`  - ${envVar}`));
  console.warn('App will still run, but may cause issues.');
}
console.log("PORT:", process.env.PORT);
console.log("MONGO:", process.env.MONGODB_URI ? "OK" : "MISSING");
console.log("JWT:", process.env.JWT_SECRET ? "OK" : "MISSING");
console.log('✅ All required environment variables are present');

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import medicineRoutes from './routes/medicineRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import requestRoutes from './routes/requestRoutes.js';
import './tasks/expiryCron.js';

// Debug: Check if email credentials are loaded
console.log("Loaded email user:", process.env.EMAIL_USER);
console.log("Loaded email pass:", process.env.EMAIL_PASS ? "✅ Exists" : "❌ Missing");

const app = express();
const PORT = process.env.PORT;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve frontend directory (prefer medshare-frontend/, else project root)
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const FRONTEND_DIR = PROJECT_ROOT;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

connectDB();

// Allow requests from configured client origin and also same-origin (localhost:PORT)
const allowedOrigins = [
  CLIENT_ORIGIN,
  "https://medshare-5u9n.onrender.com"
];
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

// CSP headers - allow only self scripts, block inline scripts
app.use((req, res, next) => {
	res.setHeader(
  "Content-Security-Policy",
  "default-src 'self' https: data: blob: 'unsafe-inline' 'unsafe-eval';"
);
	next();
});

app.use('/api/auth', authRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/requests', requestRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Serve static frontend assets
app.use(express.static(FRONTEND_DIR));

// Root should serve the frontend index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));


