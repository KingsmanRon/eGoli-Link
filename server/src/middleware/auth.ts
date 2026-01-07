import type { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt, StrategyOptions } from 'passport-jwt';
import jwt from 'jsonwebtoken';
import { prisma, User, UserRole } from '../models/index.js';
import { UnauthorizedError, ForbiddenError } from './errorHandler.js';

// JWT Payload interface
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

// Extend Express Request to include user
declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      name: string;
      role: UserRole;
      isActive: boolean;
    }
  }
}

// Configure JWT Strategy
const jwtOptions: StrategyOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET || 'development-secret-change-me',
  algorithms: ['HS256'],
};

passport.use(
  new JwtStrategy(jwtOptions, async (payload: JwtPayload, done) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
        },
      });

      if (!user) {
        return done(null, false);
      }

      if (!user.isActive) {
        return done(null, false);
      }

      return done(null, user);
    } catch (error) {
      return done(error, false);
    }
  })
);

/**
 * Authentication middleware - requires valid JWT
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  passport.authenticate('jwt', { session: false }, (err: Error | null, user: Express.User | false) => {
    if (err) {
      return next(err);
    }

    if (!user) {
      return next(new UnauthorizedError('Invalid or expired token'));
    }

    req.user = user;
    next();
  })(req, res, next);
}

/**
 * Role-based authorization middleware
 */
export function authorize(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError('Insufficient permissions'));
    }

    next();
  };
}

/**
 * Generate JWT tokens
 */
export function generateTokens(user: User) {
  const accessToken = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET || 'development-secret-change-me',
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      algorithm: 'HS256',
    }
  );

  const refreshToken = jwt.sign(
    {
      sub: user.id,
      type: 'refresh',
    },
    process.env.JWT_REFRESH_SECRET || 'development-refresh-secret-change-me',
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
      algorithm: 'HS256',
    }
  );

  return { accessToken, refreshToken };
}

/**
 * Verify refresh token
 */
export function verifyRefreshToken(token: string): { sub: string } | null {
  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_REFRESH_SECRET || 'development-refresh-secret-change-me'
    ) as { sub: string; type: string };

    if (payload.type !== 'refresh') {
      return null;
    }

    return { sub: payload.sub };
  } catch {
    return null;
  }
}

export { passport };
