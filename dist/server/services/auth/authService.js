"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../../config/database");
const HASH_BYTES = 64;
const SALT_BYTES = 16;
const SESSION_EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24 hours
exports.AuthService = {
    hashPassword(password, salt) {
        return crypto_1.default.scryptSync(password, salt, HASH_BYTES).toString('hex');
    },
    register(email, password, displayName) {
        const users = database_1.LocalDatabase.get('users') || [];
        if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
            throw new Error('User already exists');
        }
        const salt = crypto_1.default.randomBytes(SALT_BYTES).toString('hex');
        const passwordHash = this.hashPassword(password, salt);
        const newUser = {
            id: crypto_1.default.randomUUID(),
            email,
            displayName,
            passwordHash,
            salt,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            status: 'ACTIVE'
        };
        users.push(newUser);
        database_1.LocalDatabase.set('users', users);
        // Initialize user preferences and watchlist
        const watchlists = database_1.LocalDatabase.get('watchlists') || {};
        watchlists[newUser.id] = [];
        database_1.LocalDatabase.set('watchlists', watchlists);
        return newUser;
    },
    login(email, password) {
        const users = database_1.LocalDatabase.get('users') || [];
        const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
        if (!user || user.status !== 'ACTIVE') {
            throw new Error('Invalid email or password');
        }
        const hash = this.hashPassword(password, user.salt);
        if (hash !== user.passwordHash) {
            throw new Error('Invalid email or password');
        }
        const token = crypto_1.default.randomBytes(32).toString('hex');
        const sessions = database_1.LocalDatabase.get('sessions') || [];
        const session = {
            id: crypto_1.default.randomUUID(),
            userId: user.id,
            token,
            createdAt: Date.now(),
            expiresAt: Date.now() + SESSION_EXPIRATION_MS
        };
        sessions.push(session);
        database_1.LocalDatabase.set('sessions', sessions);
        const { passwordHash, salt, ...safeUser } = user;
        return { user: safeUser, token };
    },
    logout(token) {
        const sessions = database_1.LocalDatabase.get('sessions') || [];
        const index = sessions.findIndex(s => s.token === token);
        if (index !== -1) {
            sessions.splice(index, 1);
            database_1.LocalDatabase.set('sessions', sessions);
        }
    },
    verifySession(token) {
        const sessions = database_1.LocalDatabase.get('sessions') || [];
        const session = sessions.find(s => s.token === token);
        if (!session || Date.now() > session.expiresAt) {
            if (session)
                this.logout(token);
            return null;
        }
        const users = database_1.LocalDatabase.get('users') || [];
        const user = users.find(u => u.id === session.userId);
        if (!user || user.status !== 'ACTIVE') {
            return null;
        }
        return user;
    }
};
