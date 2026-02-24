// src/screens/levels/Level2Screen.js
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import AvatarGenerator from '../../Components/Avatar/AvatarGenerate';
import CameraDetector from '../../Components/Facial/CameraDetector';
import AudioRecorder from '../../Components/Audio/AudioRecorder';
import AudioWaveform from '../../Components/Audio/AudioWaveform';

import scenarioService from '../../services/scenarioService';
import { getUserLevelQuestions } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import BackIcon from '../../../assets/icons/back.svg';
import MicIcon from '../../../assets/icons/mic-white.svg';
import DeleteIcon from '../../../assets/icons/delete-white.svg';

const { width, height } = Dimensions.get('window');

const Level2Screen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { scenarioTitle, scenarioId } = route.params || {};
  const { mongoUser } = useAuth();

  const [showOverlay, setShowOverlay] = useState(false);

  //Scenario States
  const [scenarioData, setScenarioData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userQuestions, setUserQuestions] = useState(null);

  useEffect(() => {
    const loadUserQuestions = async () => {
      try {
        setLoading(true);
        if (scenarioId && mongoUser?._id) {
          // Fetch user-specific questions (includes Supabase video URLs)
          const questionsData = await getUserLevelQuestions(
            mongoUser._id,
            scenarioId,
            'level2',
          );

          console.log(
            '📹 Loaded user questions with video URLs:',
            questionsData,
          );
          setUserQuestions(questionsData.questions || []);

          // Update orb state with question count
          const questionCount = questionsData.questions?.length || 5;
          setOrbState(prev => ({ ...prev, totalLines: questionCount }));

          // Also load scenario data for fallback
          const scenario = await scenarioService.getScenarioById(scenarioId);
          setScenarioData(scenario);
        } else if (scenarioId) {
          // Fallback: use default scenario if no user
          const scenario = await scenarioService.getScenarioById(scenarioId);
          setScenarioData(scenario);
          const questionCount = scenario?.level2?.questions?.length || 5;
          setOrbState(prev => ({ ...prev, totalLines: questionCount }));
        }
      } catch (error) {
        // console.error('Failed to load questions:', error);
        // Fallback to default scenario
        if (scenarioId) {
          try {
            const scenario = await scenarioService.getScenarioById(scenarioId);
            setScenarioData(scenario);
            const questionCount = scenario?.level2?.questions?.length || 5;
            setOrbState(prev => ({ ...prev, totalLines: questionCount }));
          } catch (fallbackError) {
            // console.error('Failed to load fallback scenario:', fallbackError);
          }
        }
      } finally {
        setLoading(false);
      }
    };

    loadUserQuestions();
  }, [scenarioId, mongoUser?._id]);

  const [isRecording, setIsRecording] = useState(false);
  const [avatarReady, setAvatarReady] = useState(false);
  const [transcriptionResults, setTranscriptionResults] = useState([]);
  const [facialAnalysisResults, setFacialAnalysisResults] = useState([]);

  // Flags for tracking last question results received
  const [lastTranscriptionReceived, setLastTranscriptionReceived] =
    useState(false);
  const [lastFacialAnalysisReceived, setLastFacialAnalysisReceived] =
    useState(false);
  const waitingForFinalResult = useRef(false);

  // Drag position for camera overlay
  const [pan] = useState(new Animated.ValueXY({ x: 20, y: 20 }));

  // Refs for components and result buffers
  const avatarRef = useRef(null);
  const cameraRef = useRef(null);
  const audioRecorderRef = useRef(null);
  const waveformRef = useRef(null);
  const transcriptionResultsRef = useRef([]);
  const facialAnalysisResultsRef = useRef([]);
  const transcriptionPromiseRef = useRef(null);

  const [orbState, setOrbState] = useState({
    speaking: false,
    loading: false,
    idx: 0,
    totalLines: 5,
    isInitialized: false,
  });

  // Pan responder to drag camera overlay
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
      useNativeDriver: false,
    }),
    onPanResponderRelease: () => {
      pan.flattenOffset();
    },
    onPanResponderGrant: () => {
      pan.setOffset({
        x: pan.x._value,
        y: pan.y._value,
      });
      pan.setValue({ x: 0, y: 0 });
    },
  });

  const handleStateChange = useCallback(
    newState => {
      setOrbState(newState);
      if (newState.isInitialized && !avatarReady) {
        setAvatarReady(true);
      }
    },
    [avatarReady],
  );

  const handleAvatarInitialized = useCallback(() => {
    setAvatarReady(true);
  }, []);

  const resetLevel = useCallback(() => {
    console.log('🔄 Resetting level to start');

    // Reset local state
    setIsRecording(false);
    setTranscriptionResults([]);
    setOrbState({
      speaking: false,
      loading: false,
      idx: 0,
      totalLines: scenarioData?.level2?.questions?.length || 5,
    });

    transcriptionResultsRef.current = [];

    // Reset AudioRecorder
    if (audioRecorderRef.current?.reset) {
      audioRecorderRef.current.reset();
    }
  }, [scenarioData]);

  // Handle transcription result arrival
  const handleTranscriptionComplete = useCallback(
    report => {
      console.log('📥 Transcription result received:', report);
      setTranscriptionResults(prevResults => {
        const newResults = [...prevResults, report];
        transcriptionResultsRef.current = newResults;

        // Diagnostic log for flag setting
        console.log(
          'Setting lastTranscriptionReceived?',
          waitingForFinalResult.current,
          newResults.length,
          orbState.totalLines,
        );

        console.log('Here', waitingForFinalResult, newResults, orbState);

        if (
          waitingForFinalResult.current &&
          newResults.length === orbState.totalLines
        ) {
          setLastTranscriptionReceived(true);
        }
        return newResults;
      });

      if (transcriptionPromiseRef.current) {
        transcriptionPromiseRef.current.resolve(report);
        transcriptionPromiseRef.current = null;
      }
    },
    [orbState.totalLines],
  );

  // Handle facial analysis result arrival
  const handleFacialAnalysisComplete = useCallback(
    insights => {
      console.log('📥 Facial analysis result received:', insights);
      setFacialAnalysisResults(prevResults => {
        const newResults = [...prevResults, insights];
        facialAnalysisResultsRef.current = newResults;

        // Diagnostic log for flag setting
        console.log(
          'Setting lastFacialAnalysisReceived?',
          waitingForFinalResult.current,
          newResults.length,
          orbState.totalLines,
        );

        if (
          waitingForFinalResult.current &&
          newResults.length === orbState.totalLines
        ) {
          setLastFacialAnalysisReceived(true);
        }
        return newResults;
      });
    },
    [orbState.totalLines],
  );

  // useEffect to watch for both flags and navigate once both are true
  useEffect(() => {
    console.log(
      'useEffect fires!',
      lastTranscriptionReceived,
      lastFacialAnalysisReceived,
      waitingForFinalResult.current,
    );
    if (
      waitingForFinalResult.current &&
      lastTranscriptionReceived &&
      lastFacialAnalysisReceived
    ) {
      console.log('Navigation conditions met.');
      finishAndNavigate();
    }
  }, [lastTranscriptionReceived, lastFacialAnalysisReceived]);

  // Navigation helper - called when both results are ready
  const finishAndNavigate = useCallback(() => {
    console.log('Executing finishAndNavigate...');
    waitingForFinalResult.current = false;
    setLastTranscriptionReceived(false);
    setLastFacialAnalysisReceived(false);

    const currentState = avatarRef.current?.getState();
    console.log('Current avatar state before navigation:', currentState);
    const { scenarioEmoji } = route.params || {};

    console.log(
      'Here My Data',
      transcriptionResultsRef.current,
      facialAnalysisResultsRef.current,
    );

    setTimeout(() => {
      setShowOverlay(false);
      navigation.navigate('Level2ResultScreen', {
        totalQuestions: currentState?.totalLines || 5,
        transcriptionResults: transcriptionResultsRef.current,
        facialAnalysisResults: facialAnalysisResultsRef.current,
        scenarioTitle: scenarioTitle || 'Ordering Coffee',
        scenarioEmoji: scenarioEmoji || '☕',
        scenarioId: scenarioId,
      });
      console.log('Navigation triggered');
    }, 5000);
  }, [navigation, route.params]);

  // Start recording and processing
  const handleStart = async () => {
    if (!avatarReady) {
      console.warn('Avatar not ready yet.');
      return;
    }
    console.log('🎤 Starting recording...');
    setIsRecording(true);

    setTimeout(async () => {
      if (waveformRef.current) {
        await waveformRef.current.start();
      }
      if (cameraRef.current) {
        cameraRef.current.startRecording();
      }
      if (avatarRef.current?.start) {
        avatarRef.current.start();
      }
      if (audioRecorderRef.current) {
        audioRecorderRef.current.startRecording();
      }
    }, 200);
  };

  // Stop recording and reset state
  const handleStop = useCallback(
    async (options = {}) => {
      const { waitForTranscription = true } = options;

      waitingForFinalResult.current = false;
      setLastTranscriptionReceived(false);
      setLastFacialAnalysisReceived(false);

      console.log('🛑 Stopping and resetting...');
      try {
        if (waveformRef.current) {
          await waveformRef.current.stop();
        }
      } catch (error) {
        console.error('Waveform stop error:', error);
      }

      if (cameraRef.current) {
        cameraRef.current.stopRecording();
      }
      if (avatarRef.current?.stop) {
        avatarRef.current.stop();
      }

      let transcriptionPromise;

      if (waitForTranscription) {
        transcriptionPromise = new Promise(resolve => {
          transcriptionPromiseRef.current = { resolve };
          setTimeout(() => {
            if (transcriptionPromiseRef.current) {
              transcriptionPromiseRef.current.resolve(null);
              transcriptionPromiseRef.current = null;
            }
          }, 5000);
        });
      } else if (transcriptionPromiseRef.current) {
        transcriptionPromiseRef.current.resolve(null);
        transcriptionPromiseRef.current = null;
      }

      if (audioRecorderRef.current) {
        audioRecorderRef.current.stopRecording();
      }

      if (transcriptionPromise) {
        await transcriptionPromise;
      }

      resetLevel();
    },
    [resetLevel],
  );

  // Handle "Next" button press in conversation
  const handleNext = useCallback(() => {
    const currentState = avatarRef.current?.getState();
    if (!currentState) {
      console.warn('Avatar state not available');
      return;
    }

    if (currentState.idx === currentState.totalLines - 1) {
      const finishAfterResults = async () => {
        if (isRecording) {
          try {
            if (waveformRef.current) {
              await waveformRef.current.stop();
            }
          } catch (error) {
            console.error('Waveform stop error:', error);
          }

          if (cameraRef.current) {
            cameraRef.current.stopRecording();
          }
          if (avatarRef.current?.stop) {
            avatarRef.current.stop();
          }

          const transcriptionPromise = new Promise(resolve => {
            transcriptionPromiseRef.current = { resolve };
            setTimeout(() => {
              if (transcriptionPromiseRef.current) {
                transcriptionPromiseRef.current.resolve(null);
                transcriptionPromiseRef.current = null;
              }
            }, 5000);
          });

          if (audioRecorderRef.current) {
            audioRecorderRef.current.stopRecording();
          }

          setShowOverlay(true);

          console.log('⏳ Waiting for final transcription...');
          await transcriptionPromise;
          setIsRecording(false);
        }

        await new Promise(resolve => setTimeout(resolve, 500));

        // Start waiting for both results
        waitingForFinalResult.current = true;

        // Check if results already present
        setLastTranscriptionReceived(true);
        setLastFacialAnalysisReceived(true);
      };

      finishAfterResults();
    } else {
      avatarRef.current?.next();
    }
  }, [isRecording]);

  const handleBackPress = useCallback(async () => {
    try {
      if (isRecording) {
        await handleStop({ waitForTranscription: false });
      } else if (cameraRef.current?.isRecording) {
        cameraRef.current.stopRecording();
      }
    } catch (error) {
      console.error('Error stopping session before navigating back:', error);
    } finally {
      navigation.navigate('LevelOptions', route.params);
    }
  }, [isRecording, handleStop, navigation, route.params]);

  const isLastQuestion = orbState.idx === orbState.totalLines - 1;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading scenario...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with Progress */}

      {showOverlay && (
        <View style={styles.overlay}>
          <View style={styles.blurFallback} />
          <ActivityIndicator size="large" color="#6B5B95" />
        </View>
      )}

      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleBackPress}
          style={styles.backButtonContainer}
        >
          <BackIcon width={20} height={20} style={styles.backButton} />
        </TouchableOpacity>
        <View style={styles.progressBarContainer}>
          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${((orbState.idx + 1) / orbState.totalLines) * 100}%`,
                },
              ]}
            />
          </View>
        </View>
      </View>

      {/* Avatar in Center */}
      <View style={styles.middleSection}>
        <AvatarGenerator
          ref={avatarRef}
          onStateChange={handleStateChange}
          onInitialized={handleAvatarInitialized}
          imgURL={
            'https://tiapdsojkbqjucmjmjri.supabase.co/storage/v1/object/public/images/HitinaV2Female.png'
          }
          lines={
            userQuestions?.map(q => q.text) ||
            (scenarioData?.level2?.questions || []).map(q => q.text)
          }
          videoUrls={
            userQuestions
              ?.map(q => q.videoUrl)
              .filter(url => url && url.startsWith('http')) || null
          }
        />

        {/* Draggable Camera Overlay */}
        <Animated.View
          style={[
            styles.cameraComponent,
            {
              transform: [{ translateX: pan.x }, { translateY: pan.y }],
            },
          ]}
          {...panResponder.panHandlers}
        >
          <CameraDetector
            ref={cameraRef}
            onAnalysisComplete={handleFacialAnalysisComplete}
          />
        </Animated.View>
      </View>

      {/* Waveform */}
      <View
        style={isRecording ? styles.waveformVisible : styles.waveformHidden}
      >
        <AudioWaveform ref={waveformRef} />
      </View>

      {/* Bottom Controls */}
      <View style={styles.bottomSection}>
        <AudioRecorder
          ref={audioRecorderRef}
          onTranscriptionComplete={handleTranscriptionComplete}
        />

        {/* Microphone Button */}
        <TouchableOpacity
          style={isRecording ? styles.stopButton : styles.micButton}
          onPress={isRecording ? handleStop : handleStart}
          disabled={!avatarReady && !isRecording}
        >
          <Text style={styles.buttonEmoji}>
            {isRecording ? (
              <DeleteIcon height={24} width={24} />
            ) : (
              <MicIcon height={24} width={24} />
            )}
          </Text>
        </TouchableOpacity>

        {/* Next/Done Button */}
        {isRecording && (
          <TouchableOpacity
            onPress={handleNext}
            disabled={orbState.speaking || orbState.loading}
            style={[
              styles.nextButton,
              (orbState.speaking || orbState.loading) && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.nextButtonText}>
              {isLastQuestion ? '✓' : '→'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  blurFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: 'white',
    gap: 15,
  },
  backButton: {
    fontSize: 28,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#6B5B95',
    borderRadius: 4,
  },
  middleSection: {
    flex: 1,
    backgroundColor: '#E0E0E0',
    position: 'relative',
  },
  cameraComponent: {
    position: 'absolute',
    width: 150,
    height: 200,
    backgroundColor: 'white',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
    overflow: 'hidden',
  },
  waveformHidden: {
    width: 0,
    height: 0,
    overflow: 'hidden',
    opacity: 0,
  },
  waveformVisible: {
    height: 60,
    backgroundColor: 'white',
    paddingHorizontal: 15,
  },
  bottomSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    backgroundColor: 'white',
    gap: 20,
  },
  micButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#6B5B95',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#999',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonEmoji: {
    fontSize: 30,
  },
  nextButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#6B5B95',
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextButtonText: {
    color: 'white',
    fontSize: 24,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  progressBarContainer: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  progressBarTrack: {
    width: '95%',
    height: 14,
    borderRadius: 9,
    backgroundColor: '#e2e2e2',
    alignSelf: 'center',
    overflow: 'hidden',
  },
  progressBarFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#463855',
    borderRadius: 9,
  },
});

export default Level2Screen;
