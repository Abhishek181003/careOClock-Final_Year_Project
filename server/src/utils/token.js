import jwt from 'jsonwebtoken';

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'test') {
      return 'test_jwt_secret_key_minimum_32_characters_long_for_testing_purposes';
    }
    throw new Error('FATAL: JWT_SECRET environment variable is missing or less than 32 characters long.');
  }
  return secret;
}

function getJwtRefreshSecret() {
  const refreshSecret = process.env.JWT_REFRESH_SECRET || (getJwtSecret() + '_refresh');
  return refreshSecret;
}

const TOKEN_ISSUER = 'careoclock-server';
const API_AUDIENCE = 'careoclock-api';
const REFRESH_AUDIENCE = 'careoclock-refresh';

/**
 * Generate a JWT access token containing user identity, role, and tokenVersion claim
 * @param {Object} user - User object or payload
 * @returns {string} Signed JWT token
 */
export function generateToken(user) {
  const payload = {
    id: user._id ? user._id.toString() : user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    tokenVersion: user.tokenVersion !== undefined ? user.tokenVersion : 0,
  };

  const secret = getJwtSecret();
  const expiresIn = process.env.JWT_EXPIRES_IN || '1h';

  return jwt.sign(payload, secret, {
    expiresIn,
    issuer: TOKEN_ISSUER,
    audience: API_AUDIENCE,
  });
}

/**
 * Verify and decode an access JWT token
 * @param {string} token
 * @returns {Object} Decoded payload
 */
export function verifyToken(token) {
  const secret = getJwtSecret();
  return jwt.verify(token, secret, {
    issuer: TOKEN_ISSUER,
    audience: API_AUDIENCE,
  });
}

/**
 * Generate a long-lived refresh token
 * @param {Object} user
 * @returns {string}
 */
export function generateRefreshToken(user) {
  const payload = {
    id: user._id ? user._id.toString() : user.id,
    tokenVersion: user.tokenVersion !== undefined ? user.tokenVersion : 0,
  };

  const secret = getJwtRefreshSecret();
  const expiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

  return jwt.sign(payload, secret, {
    expiresIn,
    issuer: TOKEN_ISSUER,
    audience: REFRESH_AUDIENCE,
  });
}

/**
 * Verify and decode a refresh token
 * @param {string} token
 * @returns {Object}
 */
export function verifyRefreshToken(token) {
  const secret = getJwtRefreshSecret();
  return jwt.verify(token, secret, {
    issuer: TOKEN_ISSUER,
    audience: REFRESH_AUDIENCE,
  });
}
