import express, { Express } from 'express';
import http from 'http'; // Import http module
import { rateLimit } from 'express-rate-limit'
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import bodyParser from 'body-parser';
import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import indexRoutes from './routes/index';
import streamRoutes from './routes/stream-file';
import r2StreamRoutes from './routes/stream-r2';


const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
  standardHeaders: 'draft-8', // draft-6: `RateLimit-*` headers; draft-7 & draft-8: combined `RateLimit` header
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
  message: 'Too many requests'
  // store: ... , // Redis, Memcached, etc. See below.

})

dotenv.config();
const app: Express = express();

const port = process.env.PORT || '4000';
const appDomain = process.env.APP_DOMAIN ?? '';
// Middleware to protect against common vulnerabilities
app.use(cors({
  origin: process.env.NEXT_URL ?? (process.env.APP_DOMAIN ?? '*'),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
  exposedHeaders: ['Content-Range', 'Content-Length', 'Accept-Ranges', 'Content-Type']
}));
app.use(express.static("public"));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));


app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:", "data:", "*"],
      connectSrc: ["'self'", "blob:", "data:", "*"]
    }
  },
  frameguard: { action: 'sameorigin' },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false
}));
app.use(bodyParser.json());



// Auth routes for desktop app
app.use('/tracks', r2StreamRoutes);
// app.use('/tracks', streamRoutes);

// Apply rate limiting to non-streaming routes
app.use(['/auth', '/user', '/'], limiter);

app.use('/', indexRoutes);
app.use('/auth', authRoutes);
app.use('/user', userRoutes);

// --- Server Creation and Start ---
const server = http.createServer(app);

// Set a longer server timeout (e.g., 15 minutes)
// This prevents Node from closing idle connections too early, especially during pending chunk requests
server.timeout = 15 * 60 * 1000; // 900000 ms = 15 minutes

server.listen(port, () => {
  console.log(`Express server listening at http://localhost:${port}`);
});