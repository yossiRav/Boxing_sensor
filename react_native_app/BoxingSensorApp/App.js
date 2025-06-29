/**
 * BoxingSensorApp - אפליקציה לחיישן אגרוף (Expo Version)
 * קובץ: App.js
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  StatusBar,
  Dimensions,
  Animated,
  Platform,
  SafeAreaView
} from 'react-native';

// Import AsyncStorage
import AsyncStorage from '@react-native-async-storage/async-storage';

// Note: בגרסת Expo נשתמש בסימולציה של בלוטות' לבדיקה
// בהמשך נוסיף את react-native-bluetooth-serial עם expo run:android

const { width: screenWidth } = Dimensions.get('window');

const App = () => {
  // ========== State Management ==========
  const [isConnected, setIsConnected] = useState(false);
  const [device, setDevice] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('מנותק');
  const [isSimulating, setIsSimulating] = useState(false);
  
  // Sensor data simulation
  const [sensorData, setSensorData] = useState({
    sensor1: { current: 0, max: 0, punches: 0, detected: false },
    sensor2: { current: 0, max: 0, punches: 0, detected: false },
    total_punches: 0,
    training_time: 0,
    session_id: '',
    learning_complete: false,
    punch_threshold: 0.8
  });
  
  // Training session data
  const [sessionData, setSessionData] = useState({
    punches: [],
    startTime: null,
    totalPunches: 0,
    maxForce: 0
  });
  
  // Animation values
  const sensor1Animation = useRef(new Animated.Value(0)).current;
  const sensor2Animation = useRef(new Animated.Value(0)).current;
  const pulseAnimation = useRef(new Animated.Value(1)).current;
  
  // Simulation refs
  const simulationInterval = useRef(null);
  const trainingStartTime = useRef(Date.now());
  
  // ========== Lifecycle ==========
  useEffect(() => {
    initializeApp();
    return () => {
      if (simulationInterval.current) {
        clearInterval(simulationInterval.current);
      }
    };
  }, []);

  // ========== Initialization ==========
  const initializeApp = async () => {
    console.log('🚀 מאתחל אפליקציה...');
    startPulseAnimation();
    
    // Try to get last session data
    try {
      const lastSession = await AsyncStorage.getItem('lastBoxingSession');
      if (lastSession) {
        console.log('📱 נמצא סשן קודם');
      }
    } catch (error) {
      console.log('ℹ️ אין סשן קודם');
    }
  };

  // ========== Simulation Functions ==========
  const startSimulation = () => {
    console.log('🎬 מתחיל סימולציה...');
    setIsConnected(true);
    setIsSimulating(true);
    setConnectionStatus('מחובר (סימולציה)');
    setDevice({ name: 'BoxingSensor_Simulator', id: 'sim_001' });
    trainingStartTime.current = Date.now();
    
    Alert.alert(
      'מצב סימולציה 🔬', 
      'האפליקציה פועלת במצב סימולציה לבדיקה.\nתראה נתונים מדומים של חיישן אגרוף.',
      [{ text: 'הבנתי' }]
    );
    
    // Start simulation loop
    console.log('🔄 מתחיל simulation loop...');
    simulationInterval.current = setInterval(() => {
      simulateRealtimeData();
    }, 500);
    
    // Simulate first punch after 3 seconds
    setTimeout(() => {
      console.log('🥊 מתחיל מכות מדומות...');
      simulateRandomPunches();
    }, 3000);
  };
  
  const simulateRealtimeData = () => {
    const currentTime = Date.now();
    const trainingTime = currentTime - trainingStartTime.current;
    
    setSensorData(prev => ({
      ...prev,
      training_time: trainingTime,
      sensor1: {
        ...prev.sensor1,
        current: Math.random() * 0.5 + (Math.random() > 0.9 ? 1.5 : 0)
      },
      sensor2: {
        ...prev.sensor2,
        current: Math.random() * 0.5 + (Math.random() > 0.85 ? 1.2 : 0)
      }
    }));
    
    // Animate sensors
    animateSensorActivity(
      Math.random() * 0.5 + (Math.random() > 0.9 ? 1.5 : 0),
      Math.random() * 0.5 + (Math.random() > 0.85 ? 1.2 : 0)
    );
  };
  
  const simulateRandomPunches = () => {
    console.log('🎯 יוצר מכה מדומה... (בדיקת isSimulating)');
    
    // Random punch every 2-5 seconds
    const nextPunch = Math.random() * 3000 + 2000;
    
    setTimeout(() => {
      // בדיקה פשוטה יותר - בדוק אם connected
      if (isConnected) {
        const sensor = Math.random() > 0.5 ? 1 : 2;
        const force = Math.random() * 2 + 0.8;
        const zone = sensor === 1 ? 'עליון' : 'תחתון';
        
        console.log(`🥊 מכה מדומה: סנסור ${sensor}, אזור ${zone}, עוצמה ${force.toFixed(2)}`);
        handleSimulatedPunch(sensor, zone, force);
        simulateRandomPunches(); // Schedule next punch
      } else {
        console.log('🛑 לא מחובר - עוצר מכות');
      }
    }, nextPunch);
  };
  
  const handleSimulatedPunch = (sensorNum, zone, force) => {
    setSensorData(prev => {
      const newSensor1 = sensorNum === 1 ? 
        { ...prev.sensor1, punches: prev.sensor1.punches + 1, max: Math.max(prev.sensor1.max, force) } :
        prev.sensor1;
      
      const newSensor2 = sensorNum === 2 ? 
        { ...prev.sensor2, punches: prev.sensor2.punches + 1, max: Math.max(prev.sensor2.max, force) } :
        prev.sensor2;
      
      return {
        ...prev,
        sensor1: newSensor1,
        sensor2: newSensor2,
        total_punches: newSensor1.punches + newSensor2.punches
      };
    });
    
    // Add to session data
    const newPunch = {
      timestamp: Date.now(),
      sensor: sensorNum,
      zone: zone,
      force: force,
      combined_force: force * 1.1,
      bpm: Math.round(Math.random() * 30 + 40),
      punch_number: sensorData.total_punches + 1
    };
    
    setSessionData(prev => ({
      ...prev,
      punches: [...prev.punches, newPunch],
      totalPunches: prev.totalPunches + 1,
      maxForce: Math.max(prev.maxForce, force)
    }));
    
    // Trigger animation
    triggerPunchAnimation(sensorNum);
    
    console.log(`🥊 מכה ${zone} #${sensorData.total_punches + 1} - עוצמה: ${force.toFixed(2)}`);
  };

  const stopSimulation = () => {
    setIsConnected(false);
    setIsSimulating(false);
    setConnectionStatus('מנותק');
    setDevice(null);
    
    if (simulationInterval.current) {
      clearInterval(simulationInterval.current);
      simulationInterval.current = null;
    }
  };

  // ========== Bluetooth Functions (Future Implementation) ==========
  const scanForDevices = async () => {
    console.log('🔍 כפתור נלחץ - מתחיל סימולציה');
    
    try {
      // בדפדפן, נתחיל סימולציה ישירות במקום Alert
      if (Platform.OS === 'web') {
        console.log('🌐 מזהה דפדפן - מתחיל סימולציה ישירות');
        startSimulation();
      } else {
        // כרגע נריץ סימולציה, בהמשך נוסיף בלוטות' אמיתי
        Alert.alert(
          'חיפוש מכשירים',
          'כרגע האפליקציה פועלת במצב פיתוח.\nהאם להפעיל סימולציה?',
          [
            { text: 'ביטול', style: 'cancel' },
            { text: 'הפעל סימולציה', onPress: startSimulation }
          ]
        );
      }
    } catch (error) {
      console.error('❌ שגיאה:', error);
      Alert.alert('שגיאה', 'משהו השתבש: ' + error.message);
    }
  };

  // ========== Animations ==========
  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnimation, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnimation, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const animateSensorActivity = (sensor1Value, sensor2Value) => {
    Animated.timing(sensor1Animation, {
      toValue: Math.min(sensor1Value * 50, 100),
      duration: 100,
      useNativeDriver: false,
    }).start();
    
    Animated.timing(sensor2Animation, {
      toValue: Math.min(sensor2Value * 50, 100),
      duration: 100,
      useNativeDriver: false,
    }).start();
  };

  const triggerPunchAnimation = (sensorNumber) => {
    const animation = sensorNumber === 1 ? sensor1Animation : sensor2Animation;
    
    Animated.sequence([
      Animated.timing(animation, {
        toValue: 100,
        duration: 150,
        useNativeDriver: false,
      }),
      Animated.timing(animation, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }),
    ]).start();
  };

  // ========== Commands ==========
  const resetTraining = async () => {
    Alert.alert(
      'איפוס אימון',
      'האם אתה בטוח שברצונך לאפס את האימון?',
      [
        { text: 'ביטול', style: 'cancel' },
        { 
          text: 'אפס', 
          style: 'destructive',
          onPress: () => {
            setSensorData({
              sensor1: { current: 0, max: 0, punches: 0, detected: false },
              sensor2: { current: 0, max: 0, punches: 0, detected: false },
              total_punches: 0,
              training_time: 0,
              session_id: 'session_' + Date.now(),
              learning_complete: false,
              punch_threshold: 0.8
            });
            
            setSessionData({
              punches: [],
              startTime: new Date(),
              totalPunches: 0,
              maxForce: 0
            });
            
            trainingStartTime.current = Date.now();
            console.log('🔄 אימון אופס!');
          }
        }
      ]
    );
  };

  const calibrateSensors = async () => {
    Alert.alert(
      'כיול חיישנים',
      isSimulating ? 
        'במצב סימולציה - כיול מדומה יבוצע' :
        'אנא הנח את החיישנים במצב רגוע ולחץ אישור',
      [
        { text: 'ביטול', style: 'cancel' },
        { 
          text: 'כייל', 
          onPress: () => {
            console.log('🎯 כיול חיישנים...');
            Alert.alert('כיול הושלם', 'החיישנים כוילו בהצלחה!');
          }
        }
      ]
    );
  };

  // ========== Helper Functions ==========
  const formatTime = (milliseconds) => {
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const getZonePercentages = () => {
    const total = sensorData.total_punches;
    if (total === 0) return { upper: 50, lower: 50 };
    
    return {
      upper: Math.round((sensorData.sensor1.punches * 100) / total),
      lower: Math.round((sensorData.sensor2.punches * 100) / total)
    };
  };

  // ========== Render ==========
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#667eea" />
      
      {/* Header */}
      <View style={styles.header}>
        <Animated.Text 
          style={[styles.headerTitle, { transform: [{ scale: pulseAnimation }] }]}
        >
          🥊 חיישן אגרוף
        </Animated.Text>
        <View style={styles.connectionStatus}>
          <View style={[
            styles.statusDot, 
            { backgroundColor: isConnected ? '#00FF88' : '#FF6B6B' }
          ]} />
          <Text style={styles.statusText}>
            {connectionStatus}
            {device && ` (${device.name})`}
          </Text>
        </View>
        {isSimulating && (
          <View style={styles.simulationBadge}>
            <Text style={styles.simulationText}>🔬 מצב סימולציה</Text>
          </View>
        )}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        
        {/* Connection Section */}
        {!isConnected && (
          <View style={styles.connectionSection}>
            <Text style={styles.instructionText}>
              🔗 חיבור לחיישן:
            </Text>
            <Text style={styles.instructionSubText}>
              1. ודא שהחיישן דולק{'\n'}
              2. זווג אותו בהגדרות בלוטות'{'\n'}
              3. לחץ על "חפש חיישנים"
            </Text>
            <TouchableOpacity 
              style={styles.connectButton} 
              onPress={scanForDevices}
            >
              <Text style={styles.connectButtonText}>
                🔍 חפש חיישנים
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Main Dashboard */}
        {isConnected && (
          <>
            {/* Training Summary */}
            <View style={styles.summaryCard}>
              <Text style={styles.totalPunches}>{sensorData.total_punches}</Text>
              <Text style={styles.summaryLabel}>סה"כ מכות</Text>
              <Text style={styles.trainingTime}>{formatTime(sensorData.training_time)}</Text>
              
              {!sensorData.learning_complete && (
                <View style={styles.learningBadge}>
                  <Text style={styles.learningText}>🎓 לומד...</Text>
                </View>
              )}
            </View>

            {/* Zone Distribution */}
            <View style={styles.distributionCard}>
              <Text style={styles.cardTitle}>התפלגות מכות</Text>
              <View style={styles.distributionBar}>
                <View style={[
                  styles.barSegment, 
                  styles.upperBar, 
                  { flex: getZonePercentages().upper || 1 }
                ]}>
                  <Text style={styles.barText}>
                    עליון {getZonePercentages().upper}%
                  </Text>
                </View>
                <View style={[
                  styles.barSegment, 
                  styles.lowerBar, 
                  { flex: getZonePercentages().lower || 1 }
                ]}>
                  <Text style={styles.barText}>
                    תחתון {getZonePercentages().lower}%
                  </Text>
                </View>
              </View>
            </View>

            {/* Sensor Cards */}
            <View style={styles.sensorsContainer}>
              
              {/* Sensor 1 */}
              <View style={styles.sensorCard}>
                <Text style={styles.sensorTitle}>🎯 עליון</Text>
                <Animated.View 
                  style={[
                    styles.sensorIndicator,
                    {
                      backgroundColor: sensor1Animation.interpolate({
                        inputRange: [0, 100],
                        outputRange: ['rgba(255, 107, 107, 0.3)', 'rgba(255, 107, 107, 1)']
                      }),
                      transform: [{
                        scale: sensor1Animation.interpolate({
                          inputRange: [0, 100],
                          outputRange: [1, 1.2]
                        })
                      }]
                    }
                  ]}
                />
                <View style={styles.sensorStats}>
                  <Text style={styles.statValue}>
                    {sensorData.sensor1.current.toFixed(1)}
                  </Text>
                  <Text style={styles.statLabel}>נוכחי</Text>
                </View>
                <View style={styles.sensorStats}>
                  <Text style={styles.statValue}>
                    {sensorData.sensor1.max.toFixed(1)}
                  </Text>
                  <Text style={styles.statLabel}>מקסימום</Text>
                </View>
                <View style={styles.sensorStats}>
                  <Text style={styles.statValue}>{sensorData.sensor1.punches}</Text>
                  <Text style={styles.statLabel}>מכות</Text>
                </View>
              </View>

              {/* Sensor 2 */}
              <View style={styles.sensorCard}>
                <Text style={styles.sensorTitle}>💪 תחתון</Text>
                <Animated.View 
                  style={[
                    styles.sensorIndicator,
                    {
                      backgroundColor: sensor2Animation.interpolate({
                        inputRange: [0, 100],
                        outputRange: ['rgba(76, 205, 196, 0.3)', 'rgba(76, 205, 196, 1)']
                      }),
                      transform: [{
                        scale: sensor2Animation.interpolate({
                          inputRange: [0, 100],
                          outputRange: [1, 1.2]
                        })
                      }]
                    }
                  ]}
                />
                <View style={styles.sensorStats}>
                  <Text style={styles.statValue}>
                    {sensorData.sensor2.current.toFixed(1)}
                  </Text>
                  <Text style={styles.statLabel}>נוכחי</Text>
                </View>
                <View style={styles.sensorStats}>
                  <Text style={styles.statValue}>
                    {sensorData.sensor2.max.toFixed(1)}
                  </Text>
                  <Text style={styles.statLabel}>מקסימום</Text>
                </View>
                <View style={styles.sensorStats}>
                  <Text style={styles.statValue}>{sensorData.sensor2.punches}</Text>
                  <Text style={styles.statLabel}>מכות</Text>
                </View>
              </View>
            </View>

            {/* Control Buttons */}
            <View style={styles.controlsContainer}>
              <TouchableOpacity 
                style={[styles.controlButton, styles.resetButton]} 
                onPress={resetTraining}
              >
                <Text style={styles.controlButtonText}>🔄 איפוס</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.controlButton, styles.calibrateButton]} 
                onPress={calibrateSensors}
              >
                <Text style={styles.controlButtonText}>🎯 כיול</Text>
              </TouchableOpacity>
              
              {isSimulating && (
                <>
                  <TouchableOpacity 
                    style={[styles.controlButton, styles.stopButton]} 
                    onPress={stopSimulation}
                  >
                    <Text style={styles.controlButtonText}>⏹️ עצור</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.controlButton, { backgroundColor: '#9b59b6' }]} 
                    onPress={() => {
                      const sensor = Math.random() > 0.5 ? 1 : 2;
                      const force = Math.random() * 2 + 0.8;
                      const zone = sensor === 1 ? 'עליון' : 'תחתון';
                      handleSimulatedPunch(sensor, zone, force);
                    }}
                  >
                    <Text style={styles.controlButtonText}>🥊 מכה</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* Threshold Display */}
            <View style={styles.thresholdCard}>
              <Text style={styles.thresholdTitle}>
                ⚡ רף זיהוי: {sensorData.punch_threshold.toFixed(2)}
              </Text>
              <Text style={styles.thresholdSubtitle}>
                {sensorData.learning_complete ? 
                  '✅ המערכת סיימה ללמוד את הרגלי האימון שלך' : 
                  '🎓 המערכת לומדת את עוצמת המכות שלך...'
                }
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

// ========== Styles ==========
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#667eea',
  },
  header: {
    padding: 20,
    paddingTop: 10,
    backgroundColor: '#667eea',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    marginBottom: 10,
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
  simulationBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'center',
    marginTop: 8,
  },
  simulationText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  
  // Connection Section
  connectionSection: {
    padding: 30,
    alignItems: 'center',
    marginTop: 30,
  },
  instructionText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 15,
  },
  instructionSubText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 30,
  },
  connectButton: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 40,
    paddingVertical: 18,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  connectButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  
  // Summary Card
  summaryCard: {
    backgroundColor: 'white',
    margin: 15,
    padding: 25,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  totalPunches: {
    fontSize: 56,
    fontWeight: 'bold',
    color: '#00FF88',
  },
  summaryLabel: {
    fontSize: 18,
    color: '#666',
    marginTop: 5,
  },
  trainingTime: {
    fontSize: 24,
    color: '#333',
    marginTop: 10,
    fontWeight: '600',
  },
  learningBadge: {
    backgroundColor: '#FFF3CD',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    marginTop: 10,
  },
  learningText: {
    color: '#856404',
    fontSize: 12,
    fontWeight: 'bold',
  },
  
  // Distribution Card
  distributionCard: {
    backgroundColor: 'white',
    marginHorizontal: 15,
    marginBottom: 15,
    padding: 20,
    borderRadius: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 15,
  },
  distributionBar: {
    flexDirection: 'row',
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  barSegment: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  upperBar: {
    backgroundColor: '#FF6B6B',
  },
  lowerBar: {
    backgroundColor: '#4ECDC4',
  },
  barText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  
  // Sensors Container
  sensorsContainer: {
    flexDirection: 'row',
    marginHorizontal: 15,
    marginBottom: 15,
    gap: 10,
  },
  sensorCard: {
    flex: 1,
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 15,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  sensorTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  sensorIndicator: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 15,
  },
  sensorStats: {
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
  },
  
  // Controls
  controlsContainer: {
    flexDirection: 'row',
    marginHorizontal: 15,
    marginBottom: 15,
    gap: 10,
  },
  controlButton: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  resetButton: {
    backgroundColor: '#FF6B6B',
  },
  calibrateButton: {
    backgroundColor: '#4ECDC4',
  },
  stopButton: {
    backgroundColor: '#95a5a6',
  },
  controlButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  
  // Threshold Card
  thresholdCard: {
    backgroundColor: 'white',
    marginHorizontal: 15,
    marginBottom: 20,
    padding: 20,
    borderRadius: 15,
    borderLeftWidth: 4,
    borderLeftColor: '#667eea',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  thresholdTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  thresholdSubtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
});

export default App;