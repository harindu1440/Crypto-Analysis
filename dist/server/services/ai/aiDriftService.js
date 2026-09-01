"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiDriftService = void 0;
const database_1 = require("../../config/database");
const crypto_1 = __importDefault(require("crypto"));
exports.AiDriftService = {
    /**
     * Evaluates if there's significant drift in recent performance vs baseline
     */
    evaluateDrift(baselineWindow, recentWindow) {
        const events = [];
        // Placeholder for actual statistical drift calculation
        // E.g. if baseline win rate was 70% and recent is 40%
        return events;
    },
    logDriftEvent(event) {
        database_1.LocalDatabase.insert('aiDriftEvents', {
            ...event,
            id: crypto_1.default.randomUUID(),
            timestamp: Date.now()
        });
    }
};
