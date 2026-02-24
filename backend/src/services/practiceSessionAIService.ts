import { GoogleGenerativeAI } from '@google/generative-ai';

interface SessionDataForAI {
  wpmAvg: number;
  fillersPerMin: number;
  totalFillers: number;
  pauseCount: number;
  avgPauseDuration: number;
  eyeContactRatio: number | null;
  overallScore: number;
  transcript: string;
  duration: number;
  scenarioTitle?: string;
  level: number;
}

interface AIFeedbackCard {
  title: string;
  body: string;
  type: 'tip' | 'praise' | 'warning';
}

interface PipoNoteContent {
  title: string;
  body: string;
}

export const generateAIFeedbackCards = async (
  sessionData: SessionDataForAI
): Promise<AIFeedbackCard[]> => {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    console.error('❌ Missing GEMINI_API_KEY');
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const prompt = `Analyze this practice session and generate 4-5 specific, actionable feedback cards.

**Session Metrics:**
- Speaking Pace: ${sessionData.wpmAvg} WPM
- Filler Words: ${sessionData.totalFillers} total (${sessionData.fillersPerMin.toFixed(1)} per minute)
- Pauses: ${sessionData.pauseCount} pauses (avg ${sessionData.avgPauseDuration.toFixed(1)}s each)
- Eye Contact: ${sessionData.eyeContactRatio ? Math.round(sessionData.eyeContactRatio * 100) + '%' : 'Not available'}
- Overall Score: ${sessionData.overallScore}/100
- Duration: ${sessionData.duration}s

**What they said:**
"${sessionData.transcript}"

**Generate 4-5 feedback cards covering:**
1. **Pace** - Comment on speaking speed (ideal: 120-160 WPM)
2. **Eye Contact** - If available, comment on eye contact
3. **Fillers** - Comment on filler word usage (ideal: <3 per minute)
4. **Pauses** - Comment on pause frequency and length
5. **Answer Quality** - Comment on their answer content and clarity

**Card Guidelines:**
- Be specific and actionable
- Use encouraging, supportive tone
- Focus on ONE thing per card
- If something is good, use type "praise"
- If something needs work but not critical, use "tip"
- If something is concerning, use "warning"
- Keep body to 2-3 sentences max

Format as **pure JSON**:
{
  "cards": [
    {
      "title": "Clear, specific title (3-5 words)",
      "body": "Specific, actionable feedback. Include the actual metric.",
      "type": "tip" | "praise" | "warning"
    }
  ]
}`;

  try {
    console.log('🤖 Generating AI feedback cards with Gemini...');
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const response = await model.generateContent(prompt);
    const generatedText = response.response.text().trim();
    if (!generatedText) throw new Error('Empty response from Gemini');

    const cleaned = generatedText.replace(/```json\s*|\s*```/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Failed to extract JSON from response');

    const parsed = JSON.parse(jsonMatch[0]);

    console.log('✅ Generated', parsed.cards?.length || 0, 'feedback cards');
    
    return parsed.cards || [];
  } catch (error: any) {
    console.error('❌ Gemini API error:', error.message);
    console.log('⚡ Using fallback feedback cards based on metrics...');
    return generateFallbackFeedbackCards(sessionData);
  }
};

/**
 * Generate fallback feedback cards based on metrics (no API needed)
 */
const generateFallbackFeedbackCards = (sessionData: SessionDataForAI): AIFeedbackCard[] => {
  const cards: AIFeedbackCard[] = [];

  // Pace feedback
  if (sessionData.wpmAvg > 160) {
    cards.push({
      title: 'Pace: Speaking a bit fast',
      body: `You spoke at ${sessionData.wpmAvg} WPM. Try slowing down to 120-150 WPM—this gives listeners time to absorb your words.`,
      type: 'tip'
    });
  } else if (sessionData.wpmAvg >= 120 && sessionData.wpmAvg <= 160) {
    cards.push({
      title: 'Pace: Great speaking speed',
      body: `Excellent pace at ${sessionData.wpmAvg} WPM! This is ideal for clear, engaging communication.`,
      type: 'praise'
    });
  } else if (sessionData.wpmAvg > 0 && sessionData.wpmAvg < 120) {
    cards.push({
      title: 'Pace: A bit slow',
      body: `You spoke at ${sessionData.wpmAvg} WPM. Consider picking up the pace slightly to keep listeners engaged.`,
      type: 'tip'
    });
  }

  // Filler words feedback
  if (sessionData.totalFillers === 0) {
    cards.push({
      title: 'Fillers: Zero filler words',
      body: `Amazing! You spoke without any filler words. Your speech was clear and confident!`,
      type: 'praise'
    });
  } else if (sessionData.fillersPerMin <= 3) {
    cards.push({
      title: 'Fillers: Well managed',
      body: `You used ${sessionData.totalFillers} filler word(s). That's great control—most people use many more. Keep it up!`,
      type: 'praise'
    });
  } else {
    cards.push({
      title: 'Fillers: Reduce filler words',
      body: `You used ${sessionData.totalFillers} filler words (${sessionData.fillersPerMin.toFixed(1)}/min). Try replacing them with brief pauses instead.`,
      type: 'tip'
    });
  }

  // Pauses feedback
  if (sessionData.pauseCount === 0) {
    cards.push({
      title: 'Pauses: Consider adding breaks',
      body: `You didn't use any pauses. Adding natural pauses gives listeners time to absorb your message.`,
      type: 'tip'
    });
  } else if (sessionData.pauseCount > 0 && sessionData.avgPauseDuration > 0) {
    cards.push({
      title: 'Pauses: Good use of breaks',
      body: `Your ${sessionData.pauseCount} pauses (avg ${sessionData.avgPauseDuration.toFixed(1)}s) helped break up your speech naturally.`,
      type: 'praise'
    });
  }

  // Eye contact feedback
  if (sessionData.eyeContactRatio !== null) {
    const eyeContactPercent = Math.round(sessionData.eyeContactRatio * 100);
    if (eyeContactPercent >= 70) {
      cards.push({
        title: 'Eye Contact: Excellent',
        body: `${eyeContactPercent}% eye contact! You maintained great connection with your listener.`,
        type: 'praise'
      });
    } else if (eyeContactPercent >= 50) {
      cards.push({
        title: 'Eye Contact: Good',
        body: `${eyeContactPercent}% eye contact is solid. Try maintaining it a bit more for stronger engagement.`,
        type: 'tip'
      });
    } else {
      cards.push({
        title: 'Eye Contact: Build connection',
        body: `${eyeContactPercent}% eye contact. Try looking more at the camera/person—it builds trust and confidence.`,
        type: 'tip'
      });
    }
  }

  return cards.slice(0, 5); // Return max 5 cards
};

export const generatePipoNote = async (
  sessionData: SessionDataForAI
): Promise<PipoNoteContent> => {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    console.error('❌ Missing GEMINI_API_KEY');
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const scenarioTitle = sessionData.scenarioTitle || 'Practice';

  const hasTranscript = sessionData.transcript && sessionData.transcript !== 'No transcript available' && sessionData.transcript.trim().length > 0;
  const hasFillers = sessionData.totalFillers > 0;
  
  let metricsSection = `**Session:**
- Scenario: ${scenarioTitle} (Level ${sessionData.level})`;
  
  if (sessionData.wpmAvg > 0) {
    metricsSection += `\n- Speaking Pace: ${sessionData.wpmAvg} WPM`;
  }
  
  if (hasFillers) {
    metricsSection += `\n- Filler Words: ${sessionData.totalFillers} total (${sessionData.fillersPerMin.toFixed(1)} per minute)`;
  }
  
  if (sessionData.eyeContactRatio !== null) {
    metricsSection += `\n- Eye Contact: ${Math.round(sessionData.eyeContactRatio * 100)}%`;
  }
  
  if (sessionData.pauseCount > 0) {
    metricsSection += `\n- Pauses: ${sessionData.pauseCount} (avg ${sessionData.avgPauseDuration.toFixed(1)}s each)`;
  }

  let transcriptSection = '';
  if (hasTranscript) {
    transcriptSection = `\n\n**What they said:**\n"${sessionData.transcript}"`;
  }

  const prompt = `You are Pipo, the main character of this app. You reviewed the conversation where someone was practicing by answering questions. You are NOT part of the conversation - you are an observer who watched and analyzed their performance. Now, write a warm, encouraging note giving feedback to the person who answered the questions.

${metricsSection}${transcriptSection}

**Write Pipo's note:**
- You are Pipo, the main character of the app, giving feedback after reviewing their practice session
- Start with "Hey there! " or similar friendly greeting
- Write as if you observed and reviewed their conversation - reference that you watched/listened to them
- Celebrate what they did well (be specific with the metrics provided above)
${hasTranscript ? '- Include a short snippet or reference to what they said (if appropriate)' : ''}
- Give 1-2 gentle tips for improvement based on the metrics
- End with encouraging words
- Use emojis naturally (but not too many)
- Keep it warm, personal, and supportive
- Length: 200-300 words
- IMPORTANT: Only mention metrics that were provided above. Do NOT mention scores, transcripts, or fillers if they weren't included.
- IMPORTANT: You are analyzing and giving feedback to the person who answered the questions, not the person asking them. The app is designed to review the person answering.

Format as **pure JSON**:
{
  "title": "${scenarioTitle} : Level ${sessionData.level}",
  "body": "The complete Pipo note with \\n\\n for paragraph breaks"
}`;

  try {
    console.log('📝 Generating Pipo note with Gemini...');
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const response = await model.generateContent(prompt);
    const generatedText = response.response.text().trim();
    if (!generatedText) throw new Error('Empty response from Gemini');

    const cleaned = generatedText.replace(/```json\s*|\s*```/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Failed to extract JSON from response');

    const parsed = JSON.parse(jsonMatch[0]);

    console.log('✅ Generated Pipo note:', parsed.title);
    
    return {
      title: parsed.title || `${scenarioTitle} : Level ${sessionData.level}`,
      body: parsed.body || 'Great job practicing today! Keep it up! 💪'
    };
  } catch (error: any) {
    console.error('❌ Gemini API error for Pipo note:', error.message);
    console.log('⚡ Using fallback Pipo note based on metrics...');
    return generateFallbackPipoNote(sessionData);
  }
};

/**
 * Generate fallback Pipo note based on metrics (no API needed)
 */
const generateFallbackPipoNote = (sessionData: SessionDataForAI): PipoNoteContent => {
  const scenarioTitle = sessionData.scenarioTitle || 'Practice';
  let praise = '';
  let tips = '';

  // Praise section based on metrics
  if (sessionData.wpmAvg >= 120 && sessionData.wpmAvg <= 160) {
    praise += `Your speaking pace was great at ${sessionData.wpmAvg} WPM! `;
  }
  if (sessionData.totalFillers === 0) {
    praise += `I loved that you spoke clearly without any filler words! `;
  } else if (sessionData.totalFillers <= 3) {
    praise += `You kept filler words to a minimum—that's excellent control! `;
  }
  if (sessionData.eyeContactRatio && sessionData.eyeContactRatio >= 0.7) {
    praise += `Your eye contact was fantastic! `;
  }

  // Tips section
  if (sessionData.wpmAvg > 160) {
    tips += `Try slowing down your pace a bit next time to give listeners more time to absorb your words. `;
  } else if (sessionData.wpmAvg < 120 && sessionData.wpmAvg > 0) {
    tips += `Next time, try speaking a bit faster to keep listeners engaged. `;
  }
  if (sessionData.fillersPerMin > 3) {
    tips += `If you catch yourself using filler words, try replacing them with a brief pause instead. `;
  }
  if (sessionData.pauseCount === 0 && sessionData.fillersPerMin > 0) {
    tips += `Adding natural pauses between thoughts can help you avoid filler words. `;
  }
  if (sessionData.eyeContactRatio && sessionData.eyeContactRatio < 0.5) {
    tips += `Try maintaining eye contact more consistently—it helps build connection. `;
  }

  const body = `Hey there! 🎉

I just reviewed your practice session for ${scenarioTitle} at Level ${sessionData.level}, and I want to give you some feedback!

${praise || "You gave it a great effort! "} Keep practicing and you'll keep getting better. 💪

${tips || "You're doing well—just keep being consistent with your practice. "}

Remember, every practice session is a step forward. I'm proud of you for taking the time to work on your communication skills! ✨

See you next time!`;

  return {
    title: `${scenarioTitle} : Level ${sessionData.level}`,
    body
  };
};

export const prepareSessionDataForAI = (session: any, scenarioTitle?: string): SessionDataForAI => {
  const { aggregate, steps } = session;
  
  let totalPauseDuration = 0;
  let totalPauses = 0;
  steps.forEach((step: any) => {
    if (step.metrics?.pauses) {
      step.metrics.pauses.forEach((pause: any) => {
        totalPauseDuration += pause.len || 0;
        totalPauses++;
      });
    }
  });
  const avgPauseDuration = totalPauses > 0 ? totalPauseDuration / totalPauses : 0;

  let totalFillers = 0;
  steps.forEach((step: any) => {
    totalFillers += step.metrics?.fillers?.length || 0;
  });

  const transcript = steps.map((s: any) => s.transcript).join(' ').trim() || 'No transcript available';

  const totalDuration = steps.reduce((sum: number, step: any) => 
    sum + (step.metrics?.durationSec || 0), 0
  );

  return {
    wpmAvg: aggregate.wpmAvg || 0,
    fillersPerMin: aggregate.fillersPerMin || 0,
    totalFillers,
    pauseCount: totalPauses,
    avgPauseDuration,
    eyeContactRatio: aggregate.eyeContactRatio,
    overallScore: aggregate.score || 0,
    transcript,
    duration: Math.round(totalDuration),
    scenarioTitle,
    level: session.level || 1
  };
};
// Generate next-level questions based on scenario and level (independent questions, not dependent on previous answers)
// Level 2: exactly 3 questions, Level 3: exactly 2 questions
export const generateNextLevelQuestions = async (
  sessionData: SessionDataForAI & { nextLevel: 2 | 3; scenarioTitle?: string }
) => {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    console.error('❌ Missing GEMINI_API_KEY');
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const transcriptText = sessionData.transcript || '';
  const scenarioTitle = sessionData.scenarioTitle || 'Practice';
  const level = sessionData.level;
  const nextLevel = sessionData.nextLevel;
  const questionCount = nextLevel === 2 ? 3 : 2;

  const prompt = `
Create exactly ${questionCount} next-step questions for a user practicing "${scenarioTitle}".

Context:
- Current Level: ${level}
- Next Level: ${nextLevel}
- Transcript (what they said): "${transcriptText}"

${nextLevel === 3 ? `
IMPORTANT FOR LEVEL 3 (Advanced):
- These questions should be SIGNIFICANTLY MORE CHALLENGING than Level 2
- Ask about deeper reasoning, past experiences, or nuanced preferences
- Include follow-up questions that build on previous answers
- Ask "why" and "how" questions that require more thoughtful responses
- Make questions more personalized based on their previous answers
- Questions can be longer and more complex than Level 2
- Examples: Ask about experiences, comparisons, preferences reasons, special circumstances
` : `
IMPORTANT FOR LEVEL 2 (Intermediate):
- These questions are moderately advanced but still straightforward
- Ask about preferences, options, and basic follow-up information
- Keep questions clear and direct
- Each question should be answerable in 1-2 sentences typically
- Build slightly on Level 1 baseline questions
`}

Guidelines:
- Voice and Perspective: Choose the role that naturally asks the user questions, based on scenario:
  - If it's a service setting (e.g., Restaurant, Café, Coffee, Shopping): write as STAFF addressing the user (customer).
  - If it's an Interview (e.g., Interview, Job, Hiring): write as the INTERVIEWER addressing the candidate.
  - Otherwise: write as a FACILITATOR guiding the user.
- Use "you" to refer to the user. Do NOT flip the roles into the user asking questions.
- For Level 2: Preferred patterns: Service → "Would you like...", "Do you prefer..."; Interview → "Can you tell me...", "How did you...", "What would you..."; Facilitator → "Could you try...", "Tell me about...".
- For Level 3: Preferred patterns: Service → "What draws you to...", "How would you compare..."; Interview → "Can you walk me through...", "Tell me about a time when..."; Facilitator → "What would happen if...", "How did that shape...".

- IMPORTANT: Questions must be INDEPENDENT and GENERAL. Each question should stand alone and make sense.
- Questions should be appropriate for the scenario 
- Include a videoUrl placeholder like "${scenarioTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_level${nextLevel}_q{n}.mp4".
- Provide an ordered list starting at 1.

Return JSON only:
{
  "questions": [
    { "order": 1, "text": "...", "videoUrl": "..." }
  ]
}`;

  try {
    console.log('🧩 Generating next-level questions with Gemini...', { scenarioTitle, level, nextLevel });
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const response = await model.generateContent(prompt);
    const generatedText = response.response.text().trim();
    if (!generatedText) throw new Error('Empty response from Gemini');

    const cleaned = generatedText.replace(/```json\s*|```/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Failed to extract JSON from response');

    const parsed = JSON.parse(match[0]);
    const questions = Array.isArray(parsed.questions) ? parsed.questions : [];

    // Ensure we return exactly the requested number of questions
    const trimmedQuestions = questions.slice(0, questionCount);
    
    if (trimmedQuestions.length !== questionCount) {
      console.warn(`⚠️ Expected ${questionCount} questions but got ${questions.length}. Returning ${trimmedQuestions.length}.`);
    }

    console.log('🧪 Next-level questions preview:', trimmedQuestions.slice(0, 2));
    return trimmedQuestions;
  } catch (error: any) {
    console.error('❌ Gemini error generating next questions:', error.message);
    console.log('⚡ Using fallback questions...');
    return generateFallbackQuestions(sessionData.scenarioTitle || 'Practice', sessionData.nextLevel);
  }
};

/**
 * Generate fallback questions based on scenario (no API needed)
 */
const generateFallbackQuestions = (scenarioTitle: string, level: 2 | 3): any[] => {
  const questionCount = level === 2 ? 3 : 2;
  const videoUrlPrefix = scenarioTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_');

  // Level 2: Standard follow-up questions
  const level2Questions: Record<string, any[]> = {
    'coffee': [
      { order: 1, text: 'Would you like to add any pastries to your order today?', videoUrl: `${videoUrlPrefix}_level2_q1.mp4` },
      { order: 2, text: 'How do you usually take your coffee—black, with milk, or with cream?', videoUrl: `${videoUrlPrefix}_level2_q2.mp4` },
      { order: 3, text: 'Would you like your drink for here or to go?', videoUrl: `${videoUrlPrefix}_level2_q3.mp4` }
    ],
    'restaurant': [
      { order: 1, text: 'How many guests will be dining with us today?', videoUrl: `${videoUrlPrefix}_level2_q1.mp4` },
      { order: 2, text: 'Do you have any dietary restrictions I should know about?', videoUrl: `${videoUrlPrefix}_level2_q2.mp4` },
      { order: 3, text: 'Would you like to start with any appetizers or drinks?', videoUrl: `${videoUrlPrefix}_level2_q3.mp4` }
    ],
    'interview': [
      { order: 1, text: 'Can you tell me about a time you overcame a challenge at work?', videoUrl: `${videoUrlPrefix}_level2_q1.mp4` },
      { order: 2, text: 'How do you handle working with difficult team members?', videoUrl: `${videoUrlPrefix}_level2_q2.mp4` },
      { order: 3, text: 'What are your long-term career goals?', videoUrl: `${videoUrlPrefix}_level2_q3.mp4` }
    ]
  };

  // Level 3: More advanced, detailed questions with deeper follow-ups
  const level3Questions: Record<string, any[]> = {
    'coffee': [
      { order: 1, text: 'I see you order here regularly—what draws you to this coffee shop specifically, and how would you compare our coffee to other places you\'ve tried?', videoUrl: `${videoUrlPrefix}_level3_q1.mp4` },
      { order: 2, text: 'Beyond our coffee selection, is there anything else we could improve to make your experience here even better?', videoUrl: `${videoUrlPrefix}_level3_q2.mp4` }
    ],
    'restaurant': [
      { order: 1, text: 'Are you celebrating any special occasion tonight, and do you have any preferences regarding seating or ambiance?', videoUrl: `${videoUrlPrefix}_level3_q1.mp4` },
      { order: 2, text: 'Have you dined with us before, and if so, are there any dishes or experiences from your previous visits that you\'d like to recreate tonight?', videoUrl: `${videoUrlPrefix}_level3_q2.mp4` }
    ],
    'interview': [
      { order: 1, text: 'Can you walk me through a specific project where you demonstrated leadership, and how did that experience shape your approach to team management?', videoUrl: `${videoUrlPrefix}_level3_q1.mp4` },
      { order: 2, text: 'Tell me about a time when you had to adapt your communication style to work effectively with someone very different from you, and what did you learn from that experience?', videoUrl: `${videoUrlPrefix}_level3_q2.mp4` }
    ]
  };

  const questionsMap = level === 2 ? level2Questions : level3Questions;
  let questions = questionsMap['coffee']; // default
  const lowerTitle = scenarioTitle.toLowerCase();
  
  for (const [key, value] of Object.entries(questionsMap)) {
    if (lowerTitle.includes(key)) {
      questions = value;
      break;
    }
  }

  return questions.slice(0, questionCount);
};
