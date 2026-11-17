import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { CompletedWorkoutSession, Landmark, WorkoutSessionConfig, WorkoutSet } from '../types';
import { Sound } from '../utils/sound';
import {
  SquatEngine,
  ShouldersEngine,
  BicepsEngine,
  BaseEngine,
  drawSkeletonOnCanvas
} from '../vision/exerciseEngines';
import { PoseService } from '../vision/poseService';

interface Props {
  sessionConfig: WorkoutSessionConfig;
  onExit: () => void;
  onSaveSet: (set: WorkoutSet) => void;
  onSaveSession?: (session: CompletedWorkoutSession) => void;
}

export const WorkoutRunner: React.FC<Props> = ({ sessionConfig, onExit, onSaveSet, onSaveSession }) => {
  const { exercises, restDurationSeconds } = sessionConfig;
  const startTimeRef = useRef<number>(Date.now());

  // Progression indices
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [currentSetIndex, setCurrentSetIndex] = useState(1);
  const [phase, setPhase] = useState<'countdown' | 'exercise' | 'rest' | 'finished'>('countdown');

  // Exercise execution state
  const currentEx = exercises[currentExerciseIndex];
  const [currentReps, setCurrentReps] = useState(0);
  const [bumpReps, setBumpReps] = useState(false);
  const [statusText, setStatusText] = useState('Приготовьтесь к выполнению');
  const [statusColor, setStatusColor] = useState('#4a4a4a');
  const [errorFlag, setErrorFlag] = useState(false);
  const [angles, setAngles] = useState<Record<string, number>>({});
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'idle'>('idle');

  // Countdown state before each set
  const [countdownText, setCountdownText] = useState('3');
  const [countdownIsGo, setCountdownIsGo] = useState(false);

  // Rest timer state
  const [restSecondsLeft, setRestSecondsLeft] = useState(restDurationSeconds);
  const restTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Manual timer for time-based exercises (like plank)
  const [exerciseTimer, setExerciseTimer] = useState(0);
  const [isExerciseTimerRunning, setIsExerciseTimerRunning] = useState(false);
  const exTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Total summary accumulators
  const [completedSetsCount, setCompletedSetsCount] = useState(0);
  const [completedRepsCount, setCompletedRepsCount] = useState(0);

  // Camera / Video / AI refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const poseServiceRef = useRef<PoseService | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const engineRef = useRef<BaseEngine>(new SquatEngine());
  const lastErrorRef = useRef(false);
  const lastRepsRef = useRef(0);
  const isCompletingSetRef = useRef(false);
  const autoCompleteTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handlePoseLandmarksRef = useRef<(landmarks: Landmark[]) => void>(() => {});
  const handleCompleteSetRef = useRef<(customReps?: number) => void>(() => {});
  const countdownActiveRef = useRef(false);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownResolveRef = useRef<(() => void) | null>(null);

  const cancelCountdown = useCallback(() => {
    countdownActiveRef.current = false;
    if (countdownTimerRef.current) {
      clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (countdownResolveRef.current) {
      countdownResolveRef.current();
      countdownResolveRef.current = null;
    }
  }, []);

  // Reset exercise engine and states for a fresh set or exercise
  const resetSetState = useCallback(() => {
    if (!currentEx) return;

    cancelCountdown();

    if (currentEx.key === 'squat') {
      engineRef.current = new SquatEngine();
    } else if (currentEx.key === 'shoulders') {
      engineRef.current = new ShouldersEngine();
    } else if (currentEx.key === 'biceps') {
      engineRef.current = new BicepsEngine();
    } else {
      engineRef.current = new SquatEngine();
    }

    engineRef.current.reset();
    isCompletingSetRef.current = false;
    if (autoCompleteTimeoutRef.current) {
      clearTimeout(autoCompleteTimeoutRef.current);
      autoCompleteTimeoutRef.current = null;
    }

    const st = engineRef.current.getState();
    setCurrentReps(0);
    lastRepsRef.current = 0;
    setStatusText(st.statusText);
    setStatusColor(st.statusColor);
    setErrorFlag(st.errorFlag);
    lastErrorRef.current = st.errorFlag;
    setAngles(st.angles || {});
    setCameraError(null);
    setExerciseTimer(0);

    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('select_exercise', { exercise: currentEx.key });
      socketRef.current.emit('reset_exercise');
    }
  }, [currentEx, cancelCountdown]);

  // Switch engine and reset whenever exercise or set changes
  useEffect(() => {
    resetSetState();
  }, [currentExerciseIndex, currentSetIndex, resetSetState]);

  // Connect socket for Python MediaPipe backend (optional enhancement for local PC)
  useEffect(() => {
    const socket = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 3,
      timeout: 2500
    });

    socket.on('connect', () => {
      if (currentEx?.hasAiCamera) {
        socket.emit('select_exercise', { exercise: currentEx.key });
        socket.emit('reset_exercise');
      }
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Clean up camera stream and frame sending
  const stopCameraFeed = useCallback(() => {
    cancelCountdown();

    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }, [cancelCountdown]);

  // Finish current set and initiate Rest Timer
  const handleCompleteSet = useCallback((customReps?: number | React.MouseEvent) => {
    cancelCountdown();

    if (autoCompleteTimeoutRef.current) {
      clearTimeout(autoCompleteTimeoutRef.current);
      autoCompleteTimeoutRef.current = null;
    }
    isCompletingSetRef.current = true;

    const finalReps = typeof customReps === 'number'
      ? customReps
      : currentEx.hasAiCamera
      ? Math.max(1, lastRepsRef.current || currentReps)
      : currentEx.unit === 'сек.'
      ? Math.max(1, exerciseTimer || currentEx.targetReps)
      : currentEx.targetReps;

    Sound.playFinishSet();

    // Save set record
    const recordedSet: WorkoutSet = {
      id: Date.now().toString(),
      exercise: currentEx.key,
      exerciseName: currentEx.name,
      reps: finalReps,
      createdAt: new Date().toISOString()
    };
    onSaveSet(recordedSet);

    setCompletedSetsCount(prev => prev + 1);
    setCompletedRepsCount(prev => prev + finalReps);

    stopCameraFeed();

    // Check if entire workout is finished
    const isLastSetOfCurrentEx = currentSetIndex >= currentEx.setsCount;
    const isLastExercise = currentExerciseIndex >= exercises.length - 1;

    if (isLastSetOfCurrentEx && isLastExercise) {
      const totalSetsFinished = completedSetsCount + 1;
      const totalRepsFinished = completedRepsCount + finalReps;
      const duration = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));

      const completedSession: CompletedWorkoutSession = {
        id: Date.now().toString(),
        name: sessionConfig.name,
        completedAt: new Date().toISOString(),
        durationSeconds: duration,
        totalSets: totalSetsFinished,
        totalReps: totalRepsFinished,
        exercises: sessionConfig.exercises.map(e => ({
          key: e.key,
          name: e.name,
          icon: e.icon,
          hasAiCamera: e.hasAiCamera,
          setsCount: e.setsCount,
          targetReps: e.targetReps,
          unit: e.unit
        }))
      };

      if (onSaveSession) {
        onSaveSession(completedSession);
      }

      setPhase('finished');
      return;
    }

    // Transition to Rest phase
    setPhase('rest');
    setRestSecondsLeft(restDurationSeconds);
  }, [
    currentEx,
    currentReps,
    exerciseTimer,
    currentSetIndex,
    currentExerciseIndex,
    exercises.length,
    completedSetsCount,
    completedRepsCount,
    sessionConfig,
    onSaveSet,
    onSaveSession,
    restDurationSeconds,
    stopCameraFeed
  ]);

  handleCompleteSetRef.current = handleCompleteSet;

  // Update exercise state from landmarks detected by MediaPipe
  const handlePoseLandmarks = useCallback((landmarks: Landmark[]) => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Synchronize canvas size with video feed
    const vw = videoRef.current.videoWidth || 640;
    const vh = videoRef.current.videoHeight || 480;
    if (canvas.width !== vw || canvas.height !== vh) {
      canvas.width = vw;
      canvas.height = vh;
    }

    if (landmarks && landmarks.length >= 17) {
      // If we are already finishing this set, keep skeleton rendered and avoid re-triggering
      if (isCompletingSetRef.current) {
        drawSkeletonOnCanvas(ctx, canvas.width, canvas.height, landmarks, false);
        return;
      }

      // Process exercise logic using exact biomechanics engine
      const state = engineRef.current.process(landmarks);

      // Rep count bump and sound
      if (state.reps > lastRepsRef.current) {
        Sound.playSuccess();
        setBumpReps(true);
        setTimeout(() => setBumpReps(false), 250);
      }
      lastRepsRef.current = state.reps;
      setCurrentReps(state.reps);

      if (state.errorFlag && !lastErrorRef.current) {
        Sound.playError();
      }
      lastErrorRef.current = !!state.errorFlag;

      // Draw glowing skeleton overlay
      drawSkeletonOnCanvas(ctx, canvas.width, canvas.height, landmarks, !!state.errorFlag);

      // Auto-advance check: did we reach target reps for vision exercise?
      const targetReps = currentEx?.targetReps ?? 0;
      if (targetReps > 0 && state.reps >= targetReps && !isCompletingSetRef.current) {
        isCompletingSetRef.current = true;
        setStatusText(`🎉 Отлично! Выполнено ${state.reps} из ${targetReps} повт.`);
        setStatusColor('#00aa55');
        setErrorFlag(false);

        if (autoCompleteTimeoutRef.current) {
          clearTimeout(autoCompleteTimeoutRef.current);
        }
        autoCompleteTimeoutRef.current = setTimeout(() => {
          handleCompleteSetRef.current(state.reps);
        }, 700);
        return;
      }

      setStatusText(state.statusText);
      setStatusColor(state.statusColor);
      setErrorFlag(!!state.errorFlag);
      if (state.angles) setAngles(state.angles);
    } else {
      // No person detected or person out of bounds
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!isCompletingSetRef.current) {
        setStatusText('👉 Встаньте перед камерой так, чтобы тело было видно');
        setStatusColor('#4a4a4a');
      }
    }
  }, [currentEx]);

  handlePoseLandmarksRef.current = handlePoseLandmarks;

  // Countdown before starting set with cancellation support
  const runPreSetCountdown = useCallback(async () => {
    cancelCountdown();
    countdownActiveRef.current = true;
    setPhase('countdown');

    const steps = [
      { text: '3', isGo: false, delay: 850 },
      { text: '2', isGo: false, delay: 850 },
      { text: '1', isGo: false, delay: 850 },
      { text: 'СТАРТ!', isGo: true, delay: 650 }
    ];

    for (const step of steps) {
      if (!countdownActiveRef.current) return;
      setCountdownText(step.text);
      setCountdownIsGo(step.isGo);

      if (step.isGo) {
        Sound.playCountdownGo();
      } else {
        Sound.playCountdownTick();
      }

      await new Promise<void>(resolve => {
        countdownResolveRef.current = resolve;
        countdownTimerRef.current = setTimeout(() => {
          countdownTimerRef.current = null;
          countdownResolveRef.current = null;
          resolve();
        }, step.delay);
      });

      if (!countdownActiveRef.current) return;
    }

    if (countdownActiveRef.current) {
      setPhase('exercise');
    }
  }, [cancelCountdown]);

  // Initialize REAL webcam and MediaPipe Vision Core
  const startCameraFeed = useCallback(async () => {
    if (!currentEx?.hasAiCamera) return;
    setCameraError(null);
    setModelStatus('loading');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        if (canvasRef.current) {
          canvasRef.current.width = videoRef.current.videoWidth || 640;
          canvasRef.current.height = videoRef.current.videoHeight || 480;
        }
      }

      // Initialize client-side MediaPipe Pose
      if (!poseServiceRef.current) {
        poseServiceRef.current = new PoseService({
          onResults: (landmarks) => {
            handlePoseLandmarksRef.current(landmarks);
          },
          onStatusChange: (status) => {
            if (status === 'ready') setModelStatus('ready');
            if (status === 'error') setModelStatus('idle');
          }
        });
        await poseServiceRef.current.initialize();
      }

      await runPreSetCountdown();
    } catch (err: any) {
      console.warn('Webcam permission error:', err);
      setModelStatus('idle');
      setCameraError('Веб-камера недоступна. Пожалуйста, подключите камеру и разрешите доступ к ней в настройках браузера.');
    }
  }, [currentEx, runPreSetCountdown]);

  // Frame processing loop with MediaPipe Pose
  useEffect(() => {
    if (phase !== 'exercise' || !currentEx?.hasAiCamera || cameraError) return;

    let isActive = true;

    const renderLoop = async () => {
      if (!isActive) return;

      if (videoRef.current && videoRef.current.readyState >= 2 && poseServiceRef.current) {
        await poseServiceRef.current.processFrame(videoRef.current);
      }

      if (isActive) {
        animFrameIdRef.current = requestAnimationFrame(renderLoop);
      }
    };

    animFrameIdRef.current = requestAnimationFrame(renderLoop);

    return () => {
      isActive = false;
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
    };
  }, [phase, currentEx, cameraError]);

  // Start set sequence
  useEffect(() => {
    if (phase === 'finished') return;

    if (currentEx?.hasAiCamera) {
      startCameraFeed();
    } else {
      if (currentEx?.unit === 'сек.') {
        setExerciseTimer(0);
        setIsExerciseTimerRunning(true);
      }
      runPreSetCountdown();
    }

    return () => {
      stopCameraFeed();
    };
  }, [currentExerciseIndex, currentSetIndex, currentEx, startCameraFeed, stopCameraFeed, runPreSetCountdown]);

  // Destroy pose service and cleanup timers on unmount
  useEffect(() => {
    return () => {
      cancelCountdown();
      if (autoCompleteTimeoutRef.current) {
        clearTimeout(autoCompleteTimeoutRef.current);
        autoCompleteTimeoutRef.current = null;
      }
      if (poseServiceRef.current) {
        poseServiceRef.current.destroy();
        poseServiceRef.current = null;
      }
      stopCameraFeed();
    };
  }, [stopCameraFeed, cancelCountdown]);

  // Timer for manual timed exercises (like Plank)
  useEffect(() => {
    if (phase === 'exercise' && isExerciseTimerRunning) {
      exTimerRef.current = setInterval(() => {
        setExerciseTimer(prev => {
          const next = prev + 1;
          if (
            currentEx?.unit === 'сек.' &&
            currentEx.targetReps > 0 &&
            next >= currentEx.targetReps &&
            !isCompletingSetRef.current
          ) {
            isCompletingSetRef.current = true;
            if (autoCompleteTimeoutRef.current) {
              clearTimeout(autoCompleteTimeoutRef.current);
            }
            autoCompleteTimeoutRef.current = setTimeout(() => {
              handleCompleteSetRef.current(next);
            }, 600);
          }
          return next;
        });
      }, 1000);
    } else if (exTimerRef.current) {
      clearInterval(exTimerRef.current);
    }
    return () => {
      if (exTimerRef.current) clearInterval(exTimerRef.current);
    };
  }, [phase, isExerciseTimerRunning, currentEx]);

  // Rest timer countdown
  useEffect(() => {
    if (phase !== 'rest') return;

    restTimerRef.current = setInterval(() => {
      setRestSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(restTimerRef.current!);
          advanceToNextSet();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (restTimerRef.current) clearInterval(restTimerRef.current);
    };
  }, [phase]);

  // Move to next set or next exercise
  const advanceToNextSet = () => {
    cancelCountdown();
    if (restTimerRef.current) clearInterval(restTimerRef.current);
    if (autoCompleteTimeoutRef.current) {
      clearTimeout(autoCompleteTimeoutRef.current);
      autoCompleteTimeoutRef.current = null;
    }
    isCompletingSetRef.current = false;
    engineRef.current.reset();
    setCurrentReps(0);
    lastRepsRef.current = 0;
    setExerciseTimer(0);

    if (currentSetIndex < currentEx.setsCount) {
      setCurrentSetIndex(prev => prev + 1);
      setPhase('countdown');
    } else if (currentExerciseIndex < exercises.length - 1) {
      setCurrentExerciseIndex(prev => prev + 1);
      setCurrentSetIndex(1);
      setPhase('countdown');
    } else {
      setPhase('finished');
    }
  };

  const handleSkipRest = () => {
    Sound.playClick();
    advanceToNextSet();
  };

  const getNextUpPreview = () => {
    if (currentSetIndex < currentEx.setsCount) {
      return `${currentEx.name} · Подход ${currentSetIndex + 1} из ${currentEx.setsCount}`;
    }
    if (currentExerciseIndex < exercises.length - 1) {
      const nextEx = exercises[currentExerciseIndex + 1];
      return `${nextEx.name} · Подход 1 из ${nextEx.setsCount}`;
    }
    return 'Финальный этап';
  };

  // SCREEN: Workout Finished Celebration
  if (phase === 'finished') {
    return (
      <div className="screen">
        <div className="page-container" style={{ textAlign: 'center', maxWidth: '600px', margin: 'auto' }}>
          <div className="workout-finish-card">
            <div className="finish-trophy">🏆</div>
            <h2 style={{ fontSize: '30px', fontWeight: 900, marginBottom: '8px' }}>
              Тренировка завершена!
            </h2>
            <p style={{ color: '#737373', fontSize: '15px', marginBottom: '28px' }}>
              Отличная работа! Все подходы сохранены в вашей истории.
            </p>

            <div className="finish-stats-grid">
              <div className="finish-stat-box">
                <span className="finish-stat-num">{exercises.length}</span>
                <span className="finish-stat-label">Упражнений</span>
              </div>
              <div className="finish-stat-box">
                <span className="finish-stat-num">{completedSetsCount}</span>
                <span className="finish-stat-label">Подходов</span>
              </div>
              <div className="finish-stat-box highlight">
                <span className="finish-stat-num" style={{ color: 'var(--accent)' }}>
                  {completedRepsCount}
                </span>
                <span className="finish-stat-label">Всего повторов</span>
              </div>
            </div>

            <button
              className="btn btn-accent"
              style={{ width: '100%', padding: '16px', fontSize: '16px', fontWeight: 800 }}
              onClick={() => {
                Sound.playClick();
                onExit();
              }}
            >
              Вернуться на главную <span className="arrow">→</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // SCREEN: Rest Timer Phase
  if (phase === 'rest') {
    return (
      <div className="screen">
        <div className="page-container" style={{ maxWidth: '640px', margin: 'auto' }}>
          <div className="rest-screen-card">
            <span className="rest-badge">ПЕРЕРЫВ И ВОССТАНОВЛЕНИЕ</span>
            <div className="rest-timer-display">{restSecondsLeft}</div>
            <div className="rest-timer-sub">секунд отдыха</div>

            <div className="rest-next-preview">
              <span style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', fontWeight: 700 }}>
                Далее по плану:
              </span>
              <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '4px' }}>
                {getNextUpPreview()}
              </div>
            </div>

            <button
              className="btn btn-outline"
              style={{ width: '100%', padding: '14px', fontSize: '15px' }}
              onClick={handleSkipRest}
            >
              Пропустить отдых и начать подход →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // SCREEN: Active Set Execution (AI Camera or Manual)
  return (
    <div className="screen">
      <div className="page-container">
        {/* Верхняя статусная панель текущей тренировки */}
        <div className="page-header" style={{ marginBottom: '16px' }}>
          <div className="page-title-box">
            <button
              className="back-btn"
              onClick={() => {
                if (window.confirm('Прервать текущую тренировку и выйти в меню?')) {
                  Sound.playClick();
                  if (autoCompleteTimeoutRef.current) {
                    clearTimeout(autoCompleteTimeoutRef.current);
                    autoCompleteTimeoutRef.current = null;
                  }
                  stopCameraFeed();
                  onExit();
                }
              }}
              title="Прервать тренировку"
            >
              ✕
            </button>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>{currentEx.icon}</span>
                <h2 style={{ fontSize: '20px' }}>{currentEx.name}</h2>
                {currentEx.hasAiCamera ? (
                  <span className="ai-camera-badge">👁️ AI Камера</span>
                ) : (
                  <span className="manual-badge">Ручной</span>
                )}
              </div>
              <p style={{ fontSize: '13px', color: '#737373' }}>
                Упражнение {currentExerciseIndex + 1} из {exercises.length} · Подход {currentSetIndex} из {currentEx.setsCount} (Цель: {currentEx.targetReps} {currentEx.unit})
              </p>
            </div>
          </div>

          <div className="runner-progress-indicator">
            <div className="runner-progress-bar">
              <div
                className="runner-progress-fill"
                style={{
                  width: `${Math.round(((currentExerciseIndex + currentSetIndex / currentEx.setsCount) / exercises.length) * 100)}%`
                }}
              />
            </div>
          </div>
        </div>

        {/* ОСНОВНАЯ ЗОНА УПРАЖНЕНИЯ */}
        {currentEx.hasAiCamera ? (
          /* РЕЖИМ С AI-КАМЕРОЙ */
          <div className="trainer-wrapper">
            {cameraError ? (
              /* Сообщение об ошибке камеры без видеофайлов */
              <div className="manual-workout-card" style={{ border: '1.5px solid #fecaca', background: '#fff' }}>
                <span style={{ fontSize: '56px', display: 'block', marginBottom: '14px' }}>📹</span>
                <h3 style={{ fontSize: '22px', fontWeight: 800, color: '#dc2626', marginBottom: '8px' }}>
                  Веб-камера недоступна
                </h3>
                <p style={{ color: '#737373', fontSize: '14px', maxWidth: '480px', margin: '0 auto 24px', lineHeight: 1.5 }}>
                  {cameraError}
                </p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button className="btn btn-accent" onClick={startCameraFeed}>
                    🔄 Повторить запрос к веб-камере
                  </button>
                  <button className="btn btn-outline" onClick={handleCompleteSet}>
                    ✓ Выполнить подход вручную
                  </button>
                </div>
              </div>
            ) : (
              <div className="trainer-stage">
                <video
                  ref={videoRef}
                  className="trainer-video-feed"
                  playsInline
                  autoPlay
                  muted
                />
                <canvas ref={canvasRef} className="trainer-canvas-overlay" />

                {/* Обратный отсчет до старта */}
                {phase === 'countdown' && (
                  <div className="countdown-overlay">
                    <div className="countdown-label">Приготовьтесь к подходу</div>
                    <div className={`countdown-number ${countdownIsGo ? 'go' : ''}`}>
                      {countdownText}
                    </div>
                  </div>
                )}

                {/* HUD оверлей */}
                <div className="trainer-hud">
                  <div className="hud-top">
                    <div className="hud-pill">
                      <span className="live-indicator" />
                      {modelStatus === 'loading'
                        ? 'ЗАГРУЗКА MEDIAPIPE...'
                        : `MEDIAPIPE POSE AI · ПОДХОД ${currentSetIndex}/${currentEx.setsCount}`}
                    </div>
                    <div className="rep-display-box">
                      <div className={`rep-number ${bumpReps ? 'bump' : ''}`}>{currentReps}</div>
                      <div className="rep-label">из {currentEx.targetReps} {currentEx.unit}</div>
                    </div>
                  </div>

                  <div className="hud-bottom">
                    <div className={`trainer-status-banner ${errorFlag ? 'error' : statusColor === '#00aa55' ? 'success' : ''}`}>
                      <div className="status-left">
                        <span className="status-indicator-dot" style={{ backgroundColor: statusColor }} />
                        <span className="status-text">{statusText}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Панель управления сетом */}
            <div className="trainer-controls-panel">
              <div className="controls-left">
                <span style={{ fontSize: '13px', color: '#666' }}>
                  Нейросеть MediaPipe отслеживает ключевые суставы и оценивает чистоту техники
                </span>
              </div>
              <div className="controls-right">
                <button
                  className="btn btn-accent"
                  style={{ padding: '14px 28px' }}
                  onClick={handleCompleteSet}
                >
                  ✓ Завершить подход ({currentReps} повт.)
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* РЕЖИМ БЕЗ КАМЕРЫ (Отжимания, Планка, Выпады, Берпи и т.д.) */
          <div className="manual-workout-card">
            <div className="manual-ex-hero">
              <span className="manual-big-icon">{currentEx.icon}</span>
              <h3 style={{ fontSize: '26px', fontWeight: 900, marginBottom: '6px' }}>
                {currentEx.name}
              </h3>
              <p style={{ color: '#737373', fontSize: '14px', maxWidth: '440px', margin: 'auto' }}>
                Подход {currentSetIndex} из {currentEx.setsCount}. Выполняйте упражнение в своем темпе с правильным дыханием.
              </p>
            </div>

            <div className="manual-target-display">
              {currentEx.unit === 'сек.' ? (
                <div>
                  <div className="manual-big-timer">
                    {Math.floor(exerciseTimer / 60).toString().padStart(2, '0')}:
                    {(exerciseTimer % 60).toString().padStart(2, '0')}
                  </div>
                  <div style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', fontWeight: 700 }}>
                    Цель: {currentEx.targetReps} секунд
                  </div>
                </div>
              ) : (
                <div>
                  <div className="manual-big-reps">{currentEx.targetReps}</div>
                  <div style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', fontWeight: 700 }}>
                    Целевых повторений
                  </div>
                </div>
              )}
            </div>

            <div style={{ maxWidth: '400px', margin: '24px auto 0' }}>
              <button
                className="btn btn-accent"
                style={{ width: '100%', padding: '16px', fontSize: '16px', fontWeight: 800 }}
                onClick={handleCompleteSet}
              >
                ✓ Подход выполнен!
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
