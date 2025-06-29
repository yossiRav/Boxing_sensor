/**
 * Professional Boxing Sensor App
 * עיצוב מקצועי לאיגרוף
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
  PermissionsAndroid,
  Platform,
  SafeAreaView,
  BackHandler
} from 'react-native';

// Import AsyncStorage
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: screenWidth } = Dimensions.get('window');

const App = () => {
  // ========== State Management ==========
  const [isConnected, setIsConnected] = useState(false);
  const [device, setDevice] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('DISCONNECTED');
  const [isSimulating, setIsSimulating] = useState(false);
  
  // Sensor data from ESP32
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
  const connectionPulse = useRef(new Animated.Value(1)).current;
  
  // Simulation refs
  const simulationInterval = useRef(null);
  const punchInterval = useRef(null);
  const trainingStartTime = useRef(Date.now());
  
  // ========== Lifecycle ==========
  useEffect(() => {
    initializeApp();
    
    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    
    return () => {
      backHandler.remove();
      stopSimulation();
    };
  }, []);

  const handleBackPress = () => {
    if (isConnected) {
      Alert.alert(
        'EXIT',
        'Disconnect sensor and exit?',
        [
          { text: 'CANCEL', style: 'cancel' },
          { text: 'EXIT', onPress: () => {
            stopSimulation();
            BackHandler.exitApp();
          }}
        ]
      );
      return true;
    }
    return false;
  };

  // ========== Initialization ==========
  const initializeApp = async () => {
    console.log('🥊 Initializing Professional Boxing App...');
    
    // Start animations
    startPulseAnimation();
    startConnectionPulse();
    
    // Try to reconnect to last session
    await tryReconnectToLastSession();
  };

  const tryReconnectToLastSession = async () => {
    try {
      const lastSession = await AsyncStorage.getItem('lastBoxingSession');
      if (lastSession) {
        console.log('📊 Found previous session');
      }
    } catch (error) {
      console.log('ℹ️ No previous session found');
    }
  };

  // ========== Simulation Functions ==========
  const scanForDevices = async () => {
    try {
      setConnectionStatus('SCANNING...');
      
      Alert.alert(
        'SENSOR CONNECTION',
        'Choose connection mode:',
        [
          { text: 'CANCEL', style: 'cancel', onPress: () => setConnectionStatus('DISCONNECTED') },
          { text: 'DEMO MODE', onPress: startSimulation },
          { text: 'REAL SENSOR', onPress: () => {
            Alert.alert('INFO', 'Bluetooth sensor support coming soon.\nUsing Demo Mode for now.');
            startSimulation();
          }}
        ]
      );
    } catch (error) {
      Alert.alert('ERROR', 'Connection failed: ' + error.message);
      setConnectionStatus('ERROR');
    }
  };

  const startSimulation = () => {
    console.log('🎬 Starting Professional Demo...');
    setIsConnected(true);
    setIsSimulating(true);
    setConnectionStatus('CONNECTED');
    setDevice({ name: 'PRO_SENSOR_DEMO', id: 'demo_001' });
    trainingStartTime.current = Date.now();
    
    Alert.alert(
      'DEMO MODE ACTIVE',
      'Professional boxing sensor simulation is now running.\n\nYou will see realistic punch data and analytics.',
      [{ text: 'START TRAINING' }]
    );
    
    // Start simulation loops
    simulationInterval.current = setInterval(() => {
      simulateRealtimeData();
    }, 200);
    
    // Start random punches after 2 seconds
    setTimeout(() => {
      simulateRandomPunches();
    }, 2000);
  };
  
  const simulateRealtimeData = () => {
    const currentTime = Date.now();
    const trainingTime = currentTime - trainingStartTime.current;
    
    setSensorData(prev => ({
      ...prev,
      training_time: trainingTime,
      sensor1: {
        ...prev.sensor1,
        current: Math.random() * 0.4 + (Math.random() > 0.92 ? 1.8 : 0)
      },
      sensor2: {
        ...prev.sensor2,
        current: Math.random() * 0.4 + (Math.random() > 0.88 ? 1.6 : 0)
      }
    }));
    
    // Animate sensors
    animateSensorActivity(
      Math.random() * 0.4 + (Math.random() > 0.92 ? 1.8 : 0),
      Math.random() * 0.4 + (Math.random() > 0.88 ? 1.6 : 0)
    );
  };
  
  const simulateRandomPunches = () => {
    if (!isSimulating) return;
    
    const nextPunch = Math.random() * 4000 + 1500; // 1.5-5.5 seconds
    
    punchInterval.current = setTimeout(() => {
      if (isSimulating) {
        const sensor = Math.random() > 0.4 ? 1 : 2; // Favor head shots
        const force = Math.random() * 2.5 + 1.2; // Professional level force
        const zone = sensor === 1 ? 'HEAD' : 'BODY';
        
        handleSimulatedPunch(sensor, zone, force);
        simulateRandomPunches(); // Schedule next punch
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
      bpm: Math.round(Math.random() * 25 + 50),
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
    
    console.log(`🥊 ${zone} STRIKE #${sensorData.total_punches + 1} - Force: ${force.toFixed(2)}`);
  };

  const stopSimulation = () => {
    setIsConnected(false);
    setIsSimulating(false);
    setConnectionStatus('DISCONNECTED');
    setDevice(null);
    
    if (simulationInterval.current) {
      clearInterval(simulationInterval.current);
      simulationInterval.current = null;
    }
    
    if (punchInterval.current) {
      clearTimeout(punchInterval.current);
      punchInterval.current = null;
    }
  };

  // ========== Animations ==========
  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnimation, {
          toValue: 1.05,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnimation, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const startConnectionPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(connectionPulse, {
          toValue: 1.2,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(connectionPulse, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const animateSensorActivity = (sensor1Value, sensor2Value) => {
    Animated.timing(sensor1Animation, {
      toValue: Math.min(sensor1Value * 40, 100),
      duration: 150,
      useNativeDriver: false,
    }).start();
    
    Animated.timing(sensor2Animation, {
      toValue: Math.min(sensor2Value * 40, 100),
      duration: 150,
      useNativeDriver: false,
    }).start();
  };

  const triggerPunchAnimation = (sensorNumber) => {
    const animation = sensorNumber === 1 ? sensor1Animation : sensor2Animation;
    
    Animated.sequence([
      Animated.timing(animation, {
        toValue: 100,
        duration: 200,
        useNativeDriver: false,
      }),
      Animated.timing(animation, {
        toValue: 0,
        duration: 400,
        useNativeDriver: false,
      }),
    ]).start();
  };

  // ========== Commands ==========
  const resetTraining = async () => {
    Alert.alert(
      'RESET SESSION',
      'Reset current training session?',
      [
        { text: 'CANCEL', style: 'cancel' },
        { 
          text: 'RESET', 
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
            console.log('🔄 Training session reset');
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
    if (total === 0) return { head: 50, body: 50 };
    
    return {
      head: Math.round((sensorData.sensor1.punches * 100) / total),
      body: Math.round((sensorData.sensor2.punches * 100) / total)
    };
  };

  const getConnectionColor = () => {
    switch (connectionStatus) {
      case 'CONNECTED': return '#00ff88';
      case 'SCANNING...': return '#ffd700';
      case 'ERROR': return '#ff4757';
      default: return '#ff6b6b';
    }
  };

  // ========== Render ==========
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      
      {/* Header */}
      <View style={styles.header}>
        <Animated.Text 
          style={[styles.headerTitle, { transform: [{ scale: pulseAnimation }] }]}
        >
          BOXING ANALYTICS
        </Animated.Text>
        <Text style={styles.headerSubtitle}>PROFESSIONAL TRAINING SYSTEM</Text>
        
        <Animated.View 
          style={[
            styles.connectionStatus,
            { transform: [{ scale: connectionPulse }] }
          ]}
        >
          <View style={[styles.statusDot, { backgroundColor: getConnectionColor() }]} />
          <Text style={styles.statusText}>
            {connectionStatus}
            {device && ` • ${device.name}`}
          </Text>
        </Animated.View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        
        {/* Connection Section */}
        {!isConnected && (
          <View style={styles.connectionSection}>
            <View style={styles.connectionCard}>
              <Text style={styles.connectionTitle}>SENSOR CONNECTION</Text>
              <Text style={styles.connectionSubtitle}>
                Connect your professional boxing sensor or use demo mode
              </Text>
              <TouchableOpacity 
                style={styles.connectButton} 
                onPress={scanForDevices}
              >
                <Text style={styles.connectButtonText}>CONNECT SENSOR</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Main Dashboard */}
        {isConnected && (
          <>
            {/* Training Summary */}
            <View style={styles.summarySection}>
              <View style={styles.mainStatsCard}>
                <Text style={styles.totalPunches}>{sensorData.total_punches}</Text>
                <Text style={styles.summaryLabel}>TOTAL STRIKES</Text>
                <Text style={styles.trainingTime}>{formatTime(sensorData.training_time)}</Text>
                <Text style={styles.timeLabel}>TRAINING TIME</Text>
              </View>
            </View>

            {/* Strike Distribution */}
            <View style={styles.distributionCard}>
              <Text style={styles.cardTitle}>STRIKE DISTRIBUTION</Text>
              <View style={styles.distributionBar}>
                <View style={[
                  styles.barSegment, 
                  styles.headBar, 
                  { flex: getZonePercentages().head || 1 }
                ]}>
                  <Text style={styles.barText}>
                    HEAD {getZonePercentages().head}%
                  </Text>
                </View>
                <View style={[
                  styles.barSegment, 
                  styles.bodyBar, 
                  { flex: getZonePercentages().body || 1 }
                ]}>
                  <Text style={styles.barText}>
                    BODY {getZonePercentages().body}%
                  </Text>
                </View>
              </View>
            </View>

            {/* Sensor Analytics */}
            <View style={styles.sensorsContainer}>
              
              {/* Head Sensor */}
              <View style={styles.sensorCard}>
                <Text style={styles.sensorTitle}>HEAD TARGET</Text>
                <Animated.View 
                  style={[
                    styles.sensorIndicator,
                    {
                      backgroundColor: sensor1Animation.interpolate({
                        inputRange: [0, 100],
                        outputRange: ['rgba(255, 107, 107, 0.2)', 'rgba(255, 107, 107, 1)']
                      }),
                      borderColor: sensor1Animation.interpolate({
                        inputRange: [0, 100],
                        outputRange: ['rgba(255, 107, 107, 0.5)', 'rgba(255, 255, 255, 1)']
                      }),
                      shadowOpacity: sensor1Animation.interpolate({
                        inputRange: [0, 100],
                        outputRange: [0.2, 0.8]
                      })
                    }
                  ]}
                />
                <View style={styles.sensorStats}>
                  <Text style={styles.statValue}>
                    {sensorData.sensor1.current.toFixed(1)}
                  </Text>
                  <Text style={styles.statLabel}>CURRENT</Text>
                </View>
                <View style={styles.sensorStats}>
                  <Text style={styles.statValue}>
                    {sensorData.sensor1.max.toFixed(1)}
                  </Text>
                  <Text style={styles.statLabel}>MAX FORCE</Text>
                </View>
                <View style={styles.sensorStats}>
                  <Text style={styles.statValue}>{sensorData.sensor1.punches}</Text>
                  <Text style={styles.statLabel}>STRIKES</Text>
                </View>
              </View>

              {/* Body Sensor */}
              <View style={styles.sensorCard}>
                <Text style={styles.sensorTitle}>BODY TARGET</Text>
                <Animated.View 
                  style={[
                    styles.sensorIndicator,
                    {
                      backgroundColor: sensor2Animation.interpolate({
                        inputRange: [0, 100],
                        outputRange: ['rgba(76, 205, 196, 0.2)', 'rgba(76, 205, 196, 1)']
                      }),
                      borderColor: sensor2Animation.interpolate({
                        inputRange: [0, 100],
                        outputRange: ['rgba(76, 205, 196, 0.5)', 'rgba(255, 255, 255, 1)']
                      }),
                      shadowOpacity: sensor2Animation.interpolate({
                        inputRange: [0, 100],
                        outputRange: [0.2, 0.8]
                      })
                    }
                  ]}
                />
                <View style={styles.sensorStats}>
                  <Text style={styles.statValue}>
                    {sensorData.sensor2.current.toFixed(1)}
                  </Text>
                  <Text style={styles.statLabel}>CURRENT</Text>
                </View>
                <View style={styles.sensorStats}>
                  <Text style={styles.statValue}>
                    {sensorData.sensor2.max.toFixed(1)}
                  </Text>
                  <Text style={styles.statLabel}>MAX FORCE</Text>
                </View>
                <View style={styles.sensorStats}>
                  <Text style={styles.statValue}>{sensorData.sensor2.punches}</Text>
                  <Text style={styles.statLabel}>STRIKES</Text>
                </View>
              </View>
            </View>

            {/* Control Panel */}
            <View style={styles.controlPanel}>
              <TouchableOpacity 
                style={[styles.controlButton, styles.resetButton]} 
                onPress={resetTraining}
              >
                <Text style={styles.controlButtonText}>RESET</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.controlButton, styles.disconnectButton]} 
                onPress={stopSimulation}
              >
                <Text style={styles.controlButtonText}>DISCONNECT</Text>
              </TouchableOpacity>
            </View>

            {/* Performance Analytics */}
            <View style={styles.analyticsCard}>
              <Text style={styles.analyticsTitle}>PERFORMANCE ANALYTICS</Text>
              <View style={styles.analyticsGrid}>
                <View style={styles.analyticItem}>
                  <Text style={styles.analyticValue}>{sensorData.punch_threshold.toFixed(1)}</Text>
                  <Text style={styles.analyticLabel}>THRESHOLD</Text>
                </View>
                <View style={styles.analyticItem}>
                  <Text style={styles.analyticValue}>
                    {sessionData.punches.length > 0 ? 
                      (sessionData.punches.reduce((sum, p) => sum + p.force, 0) / sessionData.punches.length).toFixed(1) : 
                      '0.0'
                    }
                  </Text>
                  <Text style={styles.analyticLabel}>AVG FORCE</Text>
                </View>
                <View style={styles.analyticItem}>
                  <Text style={styles.analyticValue}>
                    {sessionData.maxForce.toFixed(1)}
                  </Text>
                  <Text style={styles.analyticLabel}>PEAK FORCE</Text>
                </View>
              </View>
              <Text style={styles.analyticsSubtitle}>
                {sensorData.learning_complete ? 
                  'SYSTEM CALIBRATED FOR OPTIMAL PERFORMANCE' : 
                  'SYSTEM ADAPTING TO YOUR TRAINING STYLE...'
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
    backgroundColor: '#000000',
  },
  header: {
    padding: 25,
    paddingTop: 15,
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: 3,
    textShadowColor: '#ff6b6b',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#888888',
    textAlign: 'center',
    letterSpacing: 2,
    marginTop: 5,
    fontWeight: '600',
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 15,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  statusText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  content: {
    flex: 1,
    backgroundColor: '#111111',
  },
  
  // Connection Section
  connectionSection: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 400,
  },
  connectionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 40,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  connectionTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: 15,
  },
  connectionSubtitle: {
    fontSize: 14,
    color: '#aaaaaa',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 40,
    maxWidth: 280,
  },
  connectButton: {
    backgroundColor: 'linear-gradient(45deg, #ff6b6b, #ee5a52)',
    paddingHorizontal: 50,
    paddingVertical: 18,
    borderRadius: 30,
    shadowColor: '#ff6b6b',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#ff8a80',
  },
  connectButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
  },
  
  // Summary Section
  summarySection: {
    padding: 20,
  },
  mainStatsCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 30,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 8,
  },
  totalPunches: {
    fontSize: 64,
    fontWeight: '900',
    color: '#00ff88',
    textShadowColor: '#00ff88',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#aaaaaa',
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 5,
  },
  trainingTime: {
    fontSize: 28,
    color: '#ffffff',
    marginTop: 20,
    fontWeight: '700',
  },
  timeLabel: {
    fontSize: 12,
    color: '#888888',
    fontWeight: '600',
    letterSpacing: 1,
    marginTop: 5,
  },
  
  // Distribution Card
  distributionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 25,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: 20,
  },
  distributionBar: {
    flexDirection: 'row',
    height: 50,
    borderRadius: 25,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  barSegment: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  headBar: {
    backgroundColor: '#ff6b6b',
  },
  bodyBar: {
    backgroundColor: '#4ecdc4',
  },
  barText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 1,
    textShadowColor: '#000000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  
  // Sensors Container
  sensorsContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 20,
    gap: 15,
  },
  sensorCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 20,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 8,
  },
  sensorTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#ffffff',
    marginBottom: 20,
    letterSpacing: 1,
  },
  sensorIndicator: {
    width: 70,
    height: 70,
    borderRadius: 35,
    marginBottom: 20,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  sensorStats: {
    alignItems: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ffd700',
    textShadowColor: '#ffd700',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  statLabel: {
    fontSize: 10,
    color: '#aaaaaa',
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 3,
  },
  
  // Control Panel
  controlPanel: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 20,
    gap: 15,
  },
  controlButton: {
    flex: 1,
    paddingVertical: 18,
    borderRadius: 15,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  resetButton: {
    backgroundColor: '#2c3e50',
    borderColor: '#34495e',
  },
  disconnectButton: {
    backgroundColor: '#c0392b',
    borderColor: '#e74c3c',
  },
  controlButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },
  
  // Analytics Card
  analyticsCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginHorizontal: 20,
    marginBottom: 30,
    padding: 25,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 8,
  },
  analyticsTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: 25,
  },
  analyticsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  analyticItem: {
    alignItems: 'center',
    flex: 1,
  },
  analyticValue: {
    fontSize: 24,
    fontWeight: '900',
    color: '#00ff88',
    textShadowColor: '#00ff88',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  analyticLabel: {
    fontSize: 10,
    color: '#aaaaaa',
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 5,
  },
  analyticsSubtitle: {
    fontSize: 12,
    color: '#888888',
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 18,
  },
});

export default App;