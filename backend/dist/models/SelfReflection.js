"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const SelfReflectionSchema = new mongoose_1.Schema({
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    title: {
        type: String,
        required: true,
        trim: true,
    },
    description: {
        type: String,
        default: '',
        trim: true,
    },
    date: {
        type: Date,
        required: true,
        index: true,
    },
    type: {
        type: String,
        enum: ['pipo', 'self'],
        required: true,
        default: 'self',
    },
    readAt: {
        type: Date,
        default: null,
        // Null until the user views the note
    },
    imageName: {
        type: String,
        trim: true,
        // Optional: Used for Pipo messages to store avatar image name
    },
    motivation: {
        type: String,
        trim: true,
        // Optional: Used for Pipo messages to store motivation title
    },
    linkedSessionId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'PracticeSession',
        default: null,
        // Optional: Links Pipo notes to the practice session they came from
    },
    scenarioId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Scenario',
        default: null,
        // Optional: Quick reference to scenario for filtering
    },
    level: {
        type: Number,
        min: 1,
        max: 3,
        default: null,
        // Optional: Level of the practice session (1, 2, or 3)
    },
}, {
    timestamps: true,
});
// Compound index for efficient querying by user and date
SelfReflectionSchema.index({ userId: 1, date: -1 });
SelfReflectionSchema.index({ userId: 1, type: 1, date: -1 });
SelfReflectionSchema.index({ linkedSessionId: 1 });
SelfReflectionSchema.index({ userId: 1, scenarioId: 1, level: 1 });
SelfReflectionSchema.index({ userId: 1, type: 1, readAt: 1 });
const SelfReflection = mongoose_1.default.model('SelfReflection', SelfReflectionSchema);
exports.default = SelfReflection;
//# sourceMappingURL=SelfReflection.js.map