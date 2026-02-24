"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPipoNoteFromSession = exports.getReflectionDates = exports.updateReflectionReadStatus = exports.deleteReflection = exports.updateReflection = exports.getReflectionById = exports.getReflectionsByUser = exports.createReflection = void 0;
const SelfReflection_1 = __importDefault(require("../models/SelfReflection"));
const User_1 = __importDefault(require("../models/User"));
const PracticeSession_1 = __importDefault(require("../models/PracticeSession"));
const Scenario_1 = __importDefault(require("../models/Scenario"));
const mongoose_1 = __importDefault(require("mongoose"));
const practiceSessionAIService_1 = require("../services/practiceSessionAIService");
// Available Pipo images from pipo-for-note folder
const PIPO_NOTE_IMAGES = [
    'articlePipo.png',
    'pipo-coffee.png',
    'pipo-hi.png',
    'pipo-job.png',
    'pipo-loading.png',
    'pipo-complete.png',
    'loginPipo.png',
];
// Available motivation titles for Pipo notes
const MOTIVATION_TITLES = [
    "You trusted yourself a little more today",
    "You showed up — and that's brave",
    "You faced the moment with courage",
    "You're learning to breathe through it",
    "You chose progress over fear",
    "One more step toward your confident self",
    "You spoke with strength today",
    "You turned anxiety into action",
    "You took control — not fear",
    "You're becoming your own supporter",
    "Growth feels scary — and you did it anyway",
    "Your voice mattered today",
    "Courage whispered, and you listened",
    "You're turning discomfort into power",
    "A small victory, a huge step forward"
];
/**
 * Get a random Pipo image filename based on a seed for consistency
 * Uses seeded random so the same seed always returns the same image
 */
const getRandomPipoImage = (seed) => {
    // Convert seed to number
    let seedValue;
    if (typeof seed === 'string') {
        // Extract numbers from string or use hash
        const numStr = seed.replace(/\D/g, '');
        seedValue = numStr ? parseInt(numStr, 10) : seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    }
    else {
        seedValue = seed;
    }
    // Seeded random function
    let value = Math.abs(seedValue);
    const random = () => {
        value = (value * 9301 + 49297) % 233280;
        return value / 233280;
    };
    const index = Math.floor(random() * PIPO_NOTE_IMAGES.length);
    return PIPO_NOTE_IMAGES[Math.max(0, Math.min(index, PIPO_NOTE_IMAGES.length - 1))] || PIPO_NOTE_IMAGES[0];
};
/**
 * Get a random motivation title based on a seed for consistency
 * Uses seeded random so the same seed always returns the same motivation
 */
const getRandomMotivation = (seed) => {
    // Convert seed to number
    let seedValue;
    if (typeof seed === 'string') {
        // Extract numbers from string or use hash
        const numStr = seed.replace(/\D/g, '');
        seedValue = numStr ? parseInt(numStr, 10) : seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    }
    else {
        seedValue = seed;
    }
    // Seeded random function (use different multiplier to get different sequence than image)
    let value = Math.abs(seedValue);
    const random = () => {
        value = (value * 11059 + 49297) % 233280;
        return value / 233280;
    };
    const index = Math.floor(random() * MOTIVATION_TITLES.length);
    return MOTIVATION_TITLES[Math.max(0, Math.min(index, MOTIVATION_TITLES.length - 1))] || MOTIVATION_TITLES[0];
};
/**
 * Create a new self-reflection entry
 */
const createReflection = async (req, res) => {
    try {
        const { userId, title, description, date, type, imageName, readAt } = req.body;
        // Validate required fields
        if (!userId || !title || !date) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: userId, title, and date are required',
            });
        }
        // Validate userId format
        if (!mongoose_1.default.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid userId format',
            });
        }
        // Verify user exists
        const userExists = await User_1.default.findById(userId);
        if (!userExists) {
            return res.status(404).json({
                success: false,
                error: 'User not found',
            });
        }
        // Create new reflection
        let parsedReadAt = undefined;
        if (readAt !== undefined) {
            if (readAt === null || readAt === '') {
                parsedReadAt = null;
            }
            else {
                const readAtDate = new Date(readAt);
                if (Number.isNaN(readAtDate.getTime())) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid readAt value. Expected a valid date string or null.',
                    });
                }
                parsedReadAt = readAtDate;
            }
        }
        const reflection = await SelfReflection_1.default.create({
            userId,
            title,
            description: description || '',
            date: new Date(date),
            type: type || 'self',
            imageName: imageName || undefined, // For Pipo avatar image
            readAt: parsedReadAt ?? undefined,
        });
        return res.status(201).json({
            success: true,
            data: reflection,
        });
    }
    catch (error) {
        console.error('❌ Error creating reflection:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to create reflection',
        });
    }
};
exports.createReflection = createReflection;
/**
 * Get reflections for a user (with optional filters)
 */
const getReflectionsByUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const { date, type, startDate, endDate } = req.query;
        // Validate userId
        if (!mongoose_1.default.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid userId format',
            });
        }
        // Build query
        const query = { userId };
        // Filter by specific date
        if (date) {
            const targetDate = new Date(date);
            const nextDay = new Date(targetDate);
            nextDay.setDate(nextDay.getDate() + 1);
            query.date = {
                $gte: targetDate,
                $lt: nextDay,
            };
        }
        // Filter by date range
        if (startDate && endDate) {
            query.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate),
            };
        }
        // Filter by type
        if (type && (type === 'pipo' || type === 'self')) {
            query.type = type;
        }
        const reflections = await SelfReflection_1.default.find(query)
            .sort({ date: -1, createdAt: -1 });
        return res.status(200).json({
            success: true,
            data: reflections,
        });
    }
    catch (error) {
        console.error('❌ Error fetching reflections:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch reflections',
        });
    }
};
exports.getReflectionsByUser = getReflectionsByUser;
/**
 * Get a single reflection by ID
 */
const getReflectionById = async (req, res) => {
    try {
        const { reflectionId } = req.params;
        if (!mongoose_1.default.Types.ObjectId.isValid(reflectionId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid reflection ID format',
            });
        }
        const reflection = await SelfReflection_1.default.findById(reflectionId);
        if (!reflection) {
            return res.status(404).json({
                success: false,
                error: 'Reflection not found',
            });
        }
        return res.status(200).json({
            success: true,
            data: reflection,
        });
    }
    catch (error) {
        console.error('❌ Error fetching reflection:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch reflection',
        });
    }
};
exports.getReflectionById = getReflectionById;
/**
 * Update a reflection
 */
const updateReflection = async (req, res) => {
    try {
        const { reflectionId } = req.params;
        const { title, description, date, type, imageName, readAt } = req.body;
        if (!mongoose_1.default.Types.ObjectId.isValid(reflectionId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid reflection ID format',
            });
        }
        // Build update object
        const updateData = {};
        if (title !== undefined)
            updateData.title = title;
        if (description !== undefined)
            updateData.description = description;
        if (date !== undefined)
            updateData.date = new Date(date);
        if (type !== undefined && (type === 'pipo' || type === 'self')) {
            updateData.type = type;
        }
        if (imageName !== undefined)
            updateData.imageName = imageName;
        if (readAt !== undefined) {
            if (readAt === null || readAt === '') {
                updateData.readAt = null;
            }
            else {
                const readAtDate = new Date(readAt);
                if (Number.isNaN(readAtDate.getTime())) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid readAt value. Expected a valid date string or null.',
                    });
                }
                updateData.readAt = readAtDate;
            }
        }
        const reflection = await SelfReflection_1.default.findByIdAndUpdate(reflectionId, updateData, { new: true, runValidators: true });
        if (!reflection) {
            return res.status(404).json({
                success: false,
                error: 'Reflection not found',
            });
        }
        return res.status(200).json({
            success: true,
            data: reflection,
        });
    }
    catch (error) {
        console.error('❌ Error updating reflection:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to update reflection',
        });
    }
};
exports.updateReflection = updateReflection;
/**
 * Delete a reflection
 */
const deleteReflection = async (req, res) => {
    try {
        const { reflectionId } = req.params;
        if (!mongoose_1.default.Types.ObjectId.isValid(reflectionId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid reflection ID format',
            });
        }
        const reflection = await SelfReflection_1.default.findByIdAndDelete(reflectionId);
        if (!reflection) {
            return res.status(404).json({
                success: false,
                error: 'Reflection not found',
            });
        }
        return res.status(200).json({
            success: true,
            message: 'Reflection deleted successfully',
            data: reflection,
        });
    }
    catch (error) {
        console.error('❌ Error deleting reflection:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to delete reflection',
        });
    }
};
exports.deleteReflection = deleteReflection;
/**
 * Update read status for a reflection
 * Allows setting readAt to the current time, a specific date, or null (unread)
 */
const updateReflectionReadStatus = async (req, res) => {
    try {
        const { reflectionId } = req.params;
        const { readAt, read } = req.body;
        if (!mongoose_1.default.Types.ObjectId.isValid(reflectionId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid reflection ID format',
            });
        }
        let newReadAt;
        if (readAt !== undefined) {
            if (readAt === null || readAt === '') {
                newReadAt = null;
            }
            else {
                const parsed = new Date(readAt);
                if (Number.isNaN(parsed.getTime())) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid readAt value. Expected a valid date string or null.',
                    });
                }
                newReadAt = parsed;
            }
        }
        else if (read !== undefined) {
            newReadAt = read ? new Date() : null;
        }
        else {
            return res.status(400).json({
                success: false,
                error: 'Provide readAt (date/null) or read (boolean) to update status',
            });
        }
        const reflection = await SelfReflection_1.default.findByIdAndUpdate(reflectionId, { readAt: newReadAt }, { new: true });
        if (!reflection) {
            return res.status(404).json({
                success: false,
                error: 'Reflection not found',
            });
        }
        return res.status(200).json({
            success: true,
            data: reflection,
        });
    }
    catch (error) {
        console.error('❌ Error updating reflection read status:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to update reflection read status',
        });
    }
};
exports.updateReflectionReadStatus = updateReflectionReadStatus;
/**
 * Get dates that have reflections for a user (for calendar markers)
 */
const getReflectionDates = async (req, res) => {
    try {
        const { userId } = req.params;
        const { startDate, endDate, type } = req.query;
        if (!mongoose_1.default.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid userId format',
            });
        }
        const query = { userId };
        // Filter by date range
        if (startDate && endDate) {
            query.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate),
            };
        }
        // Filter by type
        if (type && (type === 'pipo' || type === 'self')) {
            query.type = type;
        }
        // Get unique dates
        const reflections = await SelfReflection_1.default.find(query)
            .select('date type')
            .sort({ date: -1 });
        // Format dates for calendar
        const dates = reflections.map(r => ({
            date: r.date.toISOString().split('T')[0],
            type: r.type,
        }));
        return res.status(200).json({
            success: true,
            data: dates,
        });
    }
    catch (error) {
        console.error('❌ Error fetching reflection dates:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch reflection dates',
        });
    }
};
exports.getReflectionDates = getReflectionDates;
/**
 * Create a Pipo note from a completed practice session
 */
const createPipoNoteFromSession = async (req, res) => {
    try {
        const { sessionId } = req.body;
        // Validate sessionId
        if (!sessionId || !mongoose_1.default.Types.ObjectId.isValid(sessionId)) {
            return res.status(400).json({
                success: false,
                error: 'Valid sessionId is required',
            });
        }
        // Fetch the practice session
        const session = await PracticeSession_1.default.findById(sessionId);
        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Practice session not found',
            });
        }
        // Check if session is completed
        if (session.status !== 'completed') {
            return res.status(400).json({
                success: false,
                error: 'Can only create Pipo notes from completed sessions',
            });
        }
        // Check if Pipo note already exists for this session
        if (session.pipoNoteId) {
            const existingNote = await SelfReflection_1.default.findById(session.pipoNoteId);
            if (existingNote) {
                return res.status(200).json({
                    success: true,
                    data: existingNote,
                    message: 'Pipo note already exists for this session',
                });
            }
        }
        // Fetch scenario title for better AI context
        let scenarioTitle = 'Practice';
        try {
            const scenario = await Scenario_1.default.findById(session.scenarioId);
            if (scenario) {
                scenarioTitle = scenario.title;
            }
        }
        catch (err) {
            console.warn('Could not fetch scenario title');
        }
        // Generate AI-powered Pipo message
        const aiData = (0, practiceSessionAIService_1.prepareSessionDataForAI)(session, scenarioTitle);
        const pipoMessage = await (0, practiceSessionAIService_1.generatePipoNote)(aiData);
        // Generate random image filename and motivation based on sessionId and date for consistency
        const dateStr = (session.completedAt || new Date()).toISOString().split('T')[0].replace(/-/g, '');
        const seed = `${session._id}${dateStr}`;
        const imageFilename = getRandomPipoImage(seed);
        const motivation = getRandomMotivation(seed);
        // Create the Pipo reflection note
        const pipoNote = await SelfReflection_1.default.create({
            userId: session.userId,
            title: pipoMessage.title,
            description: pipoMessage.body,
            date: session.completedAt || new Date(),
            type: 'pipo',
            imageName: imageFilename, // Random Pipo image based on sessionId and date
            motivation: motivation, // Random motivation title based on sessionId and date
            linkedSessionId: session._id,
            scenarioId: session.scenarioId,
            level: session.level,
        });
        // Update the session with the pipoNoteId (two-way link)
        session.pipoNoteId = pipoNote._id;
        await session.save();
        return res.status(201).json({
            success: true,
            data: pipoNote,
            message: 'Pipo note created successfully',
        });
    }
    catch (error) {
        console.error('❌ Error creating Pipo note from session:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to create Pipo note from session',
        });
    }
};
exports.createPipoNoteFromSession = createPipoNoteFromSession;
//# sourceMappingURL=selfReflection.controller.js.map