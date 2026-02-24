"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCompleteSession = exports.deleteSession = exports.getSessionById = exports.getUserSessions = exports.abandonSession = exports.completeSession = exports.addStepToSession = exports.startPracticeSession = void 0;
const models_1 = require("../models");
const SelfReflection_1 = __importDefault(require("../models/SelfReflection"));
const Scenario_1 = __importDefault(require("../models/Scenario"));
const practiceSessionAIService_1 = require("../services/practiceSessionAIService");
const UserScenarioOverrides_1 = __importDefault(require("../models/UserScenarioOverrides"));
const videoStorageService_1 = require("../services/videoStorageService");
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
const generateFeedbackCardsFromFacialAnalysis = (facialAnalysis) => {
    const feedbackCards = [];
    if (!facialAnalysis) {
        return feedbackCards;
    }
    // Add recommendations as tips or warnings
    if (facialAnalysis.recommendations) {
        facialAnalysis.recommendations.forEach(rec => {
            feedbackCards.push({
                title: rec.area,
                body: `${rec.recommendation}\n\n💡 Exercise: ${rec.exercise}\n\n📊 Impact: ${rec.impact}`,
                type: rec.priority === 'high' ? 'warning' : 'tip'
            });
        });
    }
    // Add top 2 strengths as praise
    if (facialAnalysis.strengths) {
        facialAnalysis.strengths.slice(0, 2).forEach(strength => {
            feedbackCards.push({
                title: strength.metric,
                body: `${strength.message}\n\nImpact: ${strength.impact}`,
                type: 'praise'
            });
        });
    }
    // Add high severity weaknesses as warnings
    if (facialAnalysis.weaknesses) {
        facialAnalysis.weaknesses
            .filter(w => w.severity === 'high')
            .forEach(weakness => {
            feedbackCards.push({
                title: `Improve: ${weakness.metric}`,
                body: `${weakness.issue}\n\nWhy it matters: ${weakness.why}`,
                type: 'warning'
            });
        });
    }
    return feedbackCards;
};
const startPracticeSession = async (req, res) => {
    try {
        const { userId, scenarioId, level } = req.body;
        const session = await models_1.PracticeSession.create({
            userId,
            scenarioId,
            level,
            status: 'active',
            steps: [],
            aggregate: {
                wpmAvg: 0,
                fillersPerMin: 0,
                toneScore: 0,
                eyeContactRatio: null,
                score: 0
            },
            aiFeedbackCards: [],
            achievementsUnlocked: [],
            startedAt: new Date(),
            completedAt: null
        });
        res.status(201).json({ success: true, data: session });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.startPracticeSession = startPracticeSession;
const addStepToSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { step } = req.body;
        const session = await models_1.PracticeSession.findById(sessionId);
        if (!session) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        session.steps.push(step);
        await session.save();
        res.json({ success: true, data: session });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.addStepToSession = addStepToSession;
const completeSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { aggregate, facialAnalysis, aiFeedbackCards, achievementsUnlocked } = req.body;
        // Generate AI feedback cards from facial analysis if provided
        let feedbackCards = aiFeedbackCards || [];
        if (facialAnalysis && (!aiFeedbackCards || aiFeedbackCards.length === 0)) {
            feedbackCards = generateFeedbackCardsFromFacialAnalysis(facialAnalysis);
        }
        const session = await models_1.PracticeSession.findByIdAndUpdate(sessionId, {
            status: 'completed',
            completedAt: new Date(),
            aggregate,
            facialAnalysis,
            aiFeedbackCards: feedbackCards,
            achievementsUnlocked
        }, { new: true });
        if (!session) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        const progress = await models_1.Progress.findOne({
            userId: session.userId,
            scenarioId: session.scenarioId
        });
        if (progress) {
            const levelKey = session.level.toString();
            const levelProgress = progress.levels.get(levelKey) || {
                attempts: 0,
                lastCompletedAt: null,
                achievements: [],
                unlockedAt: null
            };
            levelProgress.attempts += 1;
            levelProgress.lastCompletedAt = new Date();
            levelProgress.achievements = [
                ...new Set([...levelProgress.achievements, ...achievementsUnlocked])
            ];
            progress.levels.set(levelKey, levelProgress);
            progress.totalSessions += 1;
            progress.lastPlayedAt = new Date();
            // Don't unlock next level here - wait for videos to be generated
            // Unlock will happen after video generation completes
            await progress.save();
        }
        // Generate and save personalized next-level questions after completion (if applicable)
        const nextLevel = session.level < 3 ? (session.level + 1) : null;
        if (nextLevel) {
            try {
                // Prepare minimal AI data from updated session
                const scenarioTitle = session.scenarioId?.title || 'Practice';
                const aiData = (0, practiceSessionAIService_1.prepareSessionDataForAI)(session, scenarioTitle);
                const nextQuestions = await (0, practiceSessionAIService_1.generateNextLevelQuestions)({ ...aiData, nextLevel });
                if (nextQuestions && nextQuestions.length > 0) {
                    const levelKey = nextLevel === 2 ? 'level2' : 'level3';
                    const update = {};
                    update[levelKey] = { questions: nextQuestions };
                    const saved = await UserScenarioOverrides_1.default.findOneAndUpdate({ userId: session.userId, scenarioId: session.scenarioId }, { $set: update }, { new: true, upsert: true });
                    console.log('💾 Saved personalized next-level questions (completeSession)', {
                        userId: session.userId,
                        scenarioId: session.scenarioId,
                        nextLevel,
                        count: nextQuestions.length,
                        preview: nextQuestions.slice(0, 2)
                    });
                    // Generate and store videos in background, then unlock level
                    (async () => {
                        try {
                            console.log('🎬 Starting background video generation and storage (completeSession)...');
                            const updatedQuestions = await (0, videoStorageService_1.generateAndStoreVideos)(nextQuestions, session.userId.toString(), session.scenarioId.toString(), nextLevel);
                            // Update UserScenarioOverrides with new D-ID video URLs
                            const updatedLevelKey = nextLevel === 2 ? 'level2' : 'level3';
                            const updatedUpdate = {};
                            updatedUpdate[updatedLevelKey] = { questions: updatedQuestions };
                            await UserScenarioOverrides_1.default.findOneAndUpdate({ userId: session.userId, scenarioId: session.scenarioId }, { $set: updatedUpdate });
                            // Count successfully generated videos
                            const successfulVideos = updatedQuestions.filter(q => q.videoUrl && q.videoUrl.startsWith('http')).length;
                            console.log('✅ Successfully updated questions with D-ID video URLs (completeSession)', {
                                userId: session.userId,
                                scenarioId: session.scenarioId,
                                nextLevel,
                                updatedCount: successfulVideos
                            });
                            // Unlock next level only after videos are generated
                            if (aggregate && aggregate.score >= 70 && successfulVideos > 0) {
                                const progress = await models_1.Progress.findOne({
                                    userId: session.userId,
                                    scenarioId: session.scenarioId
                                });
                                if (progress) {
                                    const nextLevelKey = nextLevel.toString();
                                    const nextLevelProgress = progress.levels.get(nextLevelKey) || {
                                        attempts: 0,
                                        lastCompletedAt: null,
                                        achievements: [],
                                        unlockedAt: null
                                    };
                                    if (!nextLevelProgress.unlockedAt) {
                                        nextLevelProgress.unlockedAt = new Date();
                                        progress.levels.set(nextLevelKey, nextLevelProgress);
                                        await progress.save();
                                        console.log('🔓 Next level unlocked after video generation (completeSession)', {
                                            userId: session.userId,
                                            scenarioId: session.scenarioId,
                                            nextLevel
                                        });
                                    }
                                }
                            }
                        }
                        catch (error) {
                            console.error('❌ Background video generation/storage failed (completeSession):', error.message);
                        }
                    })();
                }
                else {
                    console.log('ℹ️ No next-level questions generated in completeSession.');
                }
            }
            catch (e) {
                console.error('⚠️ Failed to generate/save next-level questions (completeSession):', e.message);
            }
        }
        res.json({ success: true, data: session });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.completeSession = completeSession;
const abandonSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await models_1.PracticeSession.findByIdAndUpdate(sessionId, { status: 'abandoned' }, { new: true });
        if (!session) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        res.json({ success: true, data: session });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.abandonSession = abandonSession;
const getUserSessions = async (req, res) => {
    try {
        const { userId } = req.params;
        const { status, limit } = req.query;
        const filter = { userId };
        if (status) {
            filter.status = status;
        }
        const sessions = await models_1.PracticeSession.find(filter)
            .populate('scenarioId')
            .sort({ startedAt: -1 })
            .limit(limit ? parseInt(limit, 10) : 50);
        res.json({ success: true, data: sessions });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.getUserSessions = getUserSessions;
const getSessionById = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await models_1.PracticeSession.findById(sessionId)
            .populate('userId')
            .populate('scenarioId');
        if (!session) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        res.json({ success: true, data: session });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.getSessionById = getSessionById;
const deleteSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await models_1.PracticeSession.findByIdAndDelete(sessionId);
        if (!session) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        res.json({ success: true, message: 'Session deleted' });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.deleteSession = deleteSession;
/**
 * Create a complete practice session in one go
 * This is useful when the frontend has all data ready (steps + facial analysis)
 */
const createCompleteSession = async (req, res) => {
    try {
        const { userId, scenarioId, level, steps, facialAnalysis, aggregate, aiFeedbackCards, achievementsUnlocked } = req.body;
        // Validate required fields
        if (!userId || !scenarioId || !level) {
            res.status(400).json({ error: 'Missing required fields: userId, scenarioId, level' });
            return;
        }
        // Validate ObjectId format for scenarioId
        const mongoose = require('mongoose');
        if (!mongoose.Types.ObjectId.isValid(scenarioId)) {
            res.status(400).json({
                error: `Invalid scenarioId format: "${scenarioId}". Must be a valid MongoDB ObjectId (24 character hex string).`,
                hint: 'Please pass a valid ObjectId for scenarioId'
            });
            return;
        }
        // Fetch scenario title for better AI context
        let scenarioTitle = 'Practice';
        try {
            const scenario = await Scenario_1.default.findById(scenarioId);
            if (scenario) {
                scenarioTitle = scenario.title;
            }
        }
        catch (err) {
            console.warn('Could not fetch scenario title, using default');
        }
        // Prepare temporary session object for AI analysis
        const tempSessionData = {
            userId,
            scenarioId,
            level,
            steps: steps || [],
            aggregate: aggregate || {
                wpmAvg: 0,
                fillersPerMin: 0,
                toneScore: 0,
                eyeContactRatio: null,
                score: 0
            },
            facialAnalysis
        };
        console.log('🤖 Generating AI feedback cards and Pipo note...');
        // Prepare data for AI (minimal, token-efficient)
        const aiData = (0, practiceSessionAIService_1.prepareSessionDataForAI)(tempSessionData, scenarioTitle);
        console.log('📊 AI Data Summary:', {
            wpm: aiData.wpmAvg,
            fillers: aiData.fillersPerMin,
            score: aiData.overallScore,
            transcriptLength: aiData.transcript.length
        });
        // Generate AI feedback cards AND Pipo note IN PARALLEL for speed
        const startTime = Date.now();
        const [feedbackCards, pipoNoteContent] = await Promise.all([
            // AI Feedback Cards
            (0, practiceSessionAIService_1.generateAIFeedbackCards)(aiData).catch((error) => {
                console.error('⚠️ Failed to generate AI cards:', error.message);
                // Fallback to facial analysis cards if AI fails
                return facialAnalysis ? generateFeedbackCardsFromFacialAnalysis(facialAnalysis) : [];
            }),
            // AI Pipo Note
            (0, practiceSessionAIService_1.generatePipoNote)(aiData).catch((error) => {
                console.error('⚠️ Failed to generate AI Pipo note:', error.message);
                return { title: '', body: '' };
            })
        ]);
        const aiTime = Date.now() - startTime;
        console.log(`✅ AI generation completed in ${(aiTime / 1000).toFixed(1)}s`);
        console.log(`   - Generated ${feedbackCards.length} AI feedback cards`);
        console.log(`   - Generated AI Pipo note: "${pipoNoteContent.title}"`);
        // Create the session
        const session = await models_1.PracticeSession.create({
            userId,
            scenarioId,
            level,
            status: 'completed',
            steps: steps || [],
            aggregate: aggregate || {
                wpmAvg: 0,
                fillersPerMin: 0,
                toneScore: 0,
                eyeContactRatio: null,
                score: 0
            },
            facialAnalysis,
            aiFeedbackCards: feedbackCards,
            achievementsUnlocked: achievementsUnlocked || [],
            startedAt: steps && steps.length > 0 ? steps[0].startedAt : new Date(),
            completedAt: new Date()
        });
        // Update progress
        const progress = await models_1.Progress.findOne({ userId, scenarioId });
        if (progress) {
            const levelKey = level.toString();
            const levelProgress = progress.levels.get(levelKey) || {
                attempts: 0,
                lastCompletedAt: null,
                achievements: [],
                unlockedAt: null
            };
            levelProgress.attempts += 1;
            levelProgress.lastCompletedAt = new Date();
            levelProgress.achievements = [
                ...new Set([...levelProgress.achievements, ...(achievementsUnlocked || [])])
            ];
            progress.levels.set(levelKey, levelProgress);
            progress.totalSessions += 1;
            progress.lastPlayedAt = new Date();
            // Don't unlock next level here - wait for videos to be generated
            // Unlock will happen after video generation completes
            await progress.save();
        }
        // If there is a next level (2 or 3), generate personalized questions and save
        const nextLevel = level < 3 ? (level + 1) : null;
        if (nextLevel) {
            try {
                const aiForNext = { ...aiData, nextLevel };
                const nextQuestions = await (0, practiceSessionAIService_1.generateNextLevelQuestions)(aiForNext);
                if (nextQuestions && nextQuestions.length > 0) {
                    const levelKey = nextLevel === 2 ? 'level2' : 'level3';
                    const update = {};
                    update[levelKey] = { questions: nextQuestions };
                    const saved = await UserScenarioOverrides_1.default.findOneAndUpdate({ userId, scenarioId }, { $set: update }, { new: true, upsert: true });
                    console.log('💾 Saved personalized next-level questions', {
                        userId,
                        scenarioId,
                        nextLevel,
                        count: nextQuestions.length,
                        preview: nextQuestions.slice(0, 2)
                    });
                    // Generate and store videos in background (fire-and-forget)
                    // This runs asynchronously and updates the questions with D-ID URLs
                    // After videos are generated, unlock the next level
                    (async () => {
                        try {
                            console.log('🎬 Starting background video generation and storage...');
                            const updatedQuestions = await (0, videoStorageService_1.generateAndStoreVideos)(nextQuestions, userId.toString(), scenarioId.toString(), nextLevel);
                            // Update UserScenarioOverrides with new D-ID video URLs
                            const updatedLevelKey = nextLevel === 2 ? 'level2' : 'level3';
                            const updatedUpdate = {};
                            updatedUpdate[updatedLevelKey] = { questions: updatedQuestions };
                            await UserScenarioOverrides_1.default.findOneAndUpdate({ userId, scenarioId }, { $set: updatedUpdate });
                            // Count successfully generated videos (those with D-ID URLs)
                            const successfulVideos = updatedQuestions.filter(q => q.videoUrl && q.videoUrl.startsWith('http')).length;
                            console.log('✅ Successfully updated questions with D-ID video URLs', {
                                userId,
                                scenarioId,
                                nextLevel,
                                updatedCount: successfulVideos,
                                totalQuestions: updatedQuestions.length
                            });
                            // Unlock next level only after videos are generated
                            // Check if score is high enough and if we have successfully generated videos
                            if (aggregate && aggregate.score >= 70 && successfulVideos > 0) {
                                const progress = await models_1.Progress.findOne({ userId, scenarioId });
                                if (progress) {
                                    const nextLevelKey = nextLevel.toString();
                                    const nextLevelProgress = progress.levels.get(nextLevelKey) || {
                                        attempts: 0,
                                        lastCompletedAt: null,
                                        achievements: [],
                                        unlockedAt: null
                                    };
                                    if (!nextLevelProgress.unlockedAt) {
                                        nextLevelProgress.unlockedAt = new Date();
                                        progress.levels.set(nextLevelKey, nextLevelProgress);
                                        await progress.save();
                                        console.log('🔓 Next level unlocked after video generation', {
                                            userId,
                                            scenarioId,
                                            nextLevel,
                                            unlockedAt: nextLevelProgress.unlockedAt
                                        });
                                    }
                                    else {
                                        console.log('ℹ️ Next level already unlocked', {
                                            userId,
                                            scenarioId,
                                            nextLevel
                                        });
                                    }
                                }
                            }
                            else {
                                console.log('⚠️ Cannot unlock next level:', {
                                    userId,
                                    scenarioId,
                                    nextLevel,
                                    scoreHighEnough: aggregate && aggregate.score >= 70,
                                    videosGenerated: successfulVideos > 0
                                });
                            }
                        }
                        catch (error) {
                            console.error('❌ Background video generation/storage failed:', error.message);
                            // Don't throw - this is a background process, failures shouldn't affect the main flow
                        }
                    })();
                }
                else {
                    console.log('ℹ️ No next-level questions generated. Skipping save.');
                }
            }
            catch (e) {
                console.error('⚠️ Failed to generate/save next-level questions:', e.message);
            }
        }
        // Create Pipo note with AI-generated content
        let pipoNoteId = null;
        if (pipoNoteContent.title && pipoNoteContent.body) {
            try {
                console.log('📝 Creating Pipo note in database...');
                // Generate random image filename and motivation based on sessionId and date for consistency
                const dateStr = (session.completedAt || new Date()).toISOString().split('T')[0].replace(/-/g, '');
                const seed = `${session._id}${dateStr}`;
                const imageFilename = getRandomPipoImage(seed);
                const motivation = getRandomMotivation(seed);
                const pipoNote = await SelfReflection_1.default.create({
                    userId,
                    title: pipoNoteContent.title,
                    description: pipoNoteContent.body,
                    date: session.completedAt || new Date(),
                    type: 'pipo',
                    imageName: imageFilename, // Random Pipo image based on sessionId and date
                    motivation: motivation, // Random motivation title based on sessionId and date
                    linkedSessionId: session._id,
                    scenarioId,
                    level
                });
                // Update session with pipoNoteId
                session.pipoNoteId = pipoNote._id;
                await session.save();
                pipoNoteId = pipoNote._id;
                console.log('✅ Pipo note created and linked:', pipoNote._id);
            }
            catch (pipoError) {
                console.error('⚠️ Failed to create Pipo note in database:', pipoError.message);
                // Session still saved successfully, just without Pipo note
            }
        }
        res.status(201).json({ success: true, data: session });
    }
    catch (error) {
        console.error('Error creating complete session:', error);
        res.status(500).json({ error: error.message });
    }
};
exports.createCompleteSession = createCompleteSession;
//# sourceMappingURL=practiceSessionController.js.map