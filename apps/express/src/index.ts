import express, { Express } from 'express';
import { rateLimit } from 'express-rate-limit'
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import bodyParser from 'body-parser';
import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import indexRoutes from './routes/index';
import trackRoutes from './routes/tracks';


const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
  standardHeaders: 'draft-8', // draft-6: `RateLimit-*` headers; draft-7 & draft-8: combined `RateLimit` header
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
  message: 'Too many requests'
  // store: ... , // Redis, Memcached, etc. See below.

})

// Apply the rate limiting middleware to all requests.
dotenv.config();
const app: Express = express();

const port = process.env.PORT || '4000';

// Middleware to protect against common vulnerabilities
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://yourdomain.com', 'phantomhud://desktop-app', 'http://localhost:3000']
    : ['http://localhost:3000', 'http://localhost:3015', 'phantomhud://desktop-app', 'http://localhost:4000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));
app.use(express.static("public"));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"]
    }
  },
  frameguard: { action: 'deny' },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));
app.use(bodyParser.json());



// Auth routes for desktop app
app.use('/tracks', trackRoutes);
app.use(limiter);
app.use('/', indexRoutes);
app.use('/auth', authRoutes);
app.use('/user', userRoutes);

// Use httpServer instead of app.listen for Socket.IO
app.listen(port, () => {
  console.log(`Express server listening at http://localhost:${port}`);
});