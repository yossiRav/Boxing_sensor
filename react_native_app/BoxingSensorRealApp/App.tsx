/**
 * Professional Boxing Sensor App
 * עיצוב מקצועי לאיגרוף - תואם EAS Build
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
  SafeAreaView,
  BackHandler
} from 'react-native';

// Import Expo compatible modules
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const { width: screenWidth } = Dimensions.get('window');

// Bluetooth Manager (תואם EAS Build)
const BluetoothManager = {
  isEnabled: () => Promise.resolve(true),
  
  list: () => Promise.resolve([
    { id: 'boxingsensor_01', name: 'BoxingSensor_01' },
    { id: 'demo', name: 'DEMO_MODE' }
  ]),
  
  connect: (id) => {
    console.log('🔗 Connecting to:', id);
    return new Promise((resolve) => {
      setTimeout(resolve, 1000); // Simulate connection delay
    });
  },
  
  disconnect: () => Promise.resolve(),
  
  on: (event, callback) => {
    console.log('📡 Setting up listener for:', event);
    
    if (event === 'data') {
      // סימולציה של הנתונים האמיתיים שלך
      const simulateRealData = () => {
        const realTimeData = {
          type: "realtime",
          timestamp: Date.now(),
          sensor1: { 
            current: Math.random() * 0.1 + (Math.random() > 0.9 ? 3.5 : 0), 
            max: 4.09, 
            punches: Math.floor(Math.random() * 5) + 25, 
            detected: Math.random() > 0.8 
          },
          sensor2: { 
            current: Math.random() * 0.1 + (Math.random() > 0.85 ? 2.8 : 0), 
            max: 4.1, 
            punches: Math.floor(Math.random() * 3) + 12, 
            detected: Math.random() > 0.85 
          },
          total_punches: Math.floor(Math.random() * 10) + 35,
          training_time: Date.now() % 100000,
          session_id: "session_1039",
          learning_complete: true,
          punch_threshold: 1.5
        };
        
        callback(JSON.stringify(realTimeData));
      };
      
      // שלח נתונים כל 200ms כמו החיישן האמיתי
      const dataInterval = setInterval(simulateRealData, 200);
      
      // סימולציה של מכות מדי פעם
      const punchInterval = setInterval(() => {
        if (Math.random() > 0.7) {
          const punchEvent = {
            type: "punch_event",
            timestamp: Date.now(),
            session_id: "session_1039",
            sensor: Math.random() > 0.6 ? 1 : 2,
            zone: Math.random() > 0.6 ? "עליון" : "תחתון", 
            force: Math.random() * 2 + 1.2,
            combined_force: Math.random() * 2.5 + 1.5,
            bpm: Math.random() * 30 + 60,
            punch_number: Math.floor(Math.random() * 50) + 1,
            total_punches: Math.floor(Math.random() * 10) + 40
          };
          
          callback(JSON.stringify(punchEvent));
        }
      }, 3000);
      
      // Cleanup function
      return () => {
        clearInterval(dataInterval);
        clearInterval(punchInterval);
      };
    }
  },
  
  write: (data) => {
    console.log('📤 Sending command:', data);
    return Promise.resolve();
  }
};

const App = () => {
  // ========== State Management ==========
  const [isConnected, setIsConnected] = useState(false);
  const [device, setDevice] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('DISCONNECTED');
  
  // Sensor data from ESP32 - exactly matching your JSON structure
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
  
  const trainingStartTime = useRef(Date.now());
  const cleanupRef = useRef(null);
  
  // ========== Lifecycle ==========
  useEffect(() => {
    initializeApp();
    
    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    
    return () => {
      backHandler.remove();
      disconnectSensor();
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
            disconnectSensor();
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
    console.log('📱 App Version:', Constants.expoConfig?.version || '1.0.0');
    
    // Start animations
    startPulseAnimation();
    startConnectionPulse();
  };

  // ========== Bluetooth Functions ==========
  const scanForDevices = async () => {
    try {
      setConnectionStatus('SCANNING...');
      
      // Check if Bluetooth is enabled
      const isEnabled = await BluetoothManager.isEnabled();
      if (!isEnabled) {
        Alert.alert('Bluetooth Disabled', 'This is a demo - real Bluetooth will be available soon!');
        setConnectionStatus('DISCONNECTED');
        return;
      }
      
      // Get available devices
      const devices = await BluetoothManager.list();
      console.log('📡 Found devices:', devices);
      
      // Look for your boxing sensor
      const boxingDevices = devices.filter(device => 
        device.name && device.name.includes('BoxingSensor')
      );
      
      if (boxingDevices.length > 0) {
        Alert.alert(
          'SENSOR FOUND',
          `Found: ${boxingDevices[0].name}\n\nNote: Currently showing realistic simulation based on your real sensor data.\n\nReal Bluetooth integration coming in next update!`,
          [
            { text: 'CANCEL', style: 'cancel', onPress: () => setConnectionStatus('DISCONNECTED') },
            { text: 'CONNECT (DEMO)', onPress: () => connectToSensor(boxingDevices[0]) }
          ]
        );
      } else {
        Alert.alert(
          'DEMO MODE',
          'No real sensor detected.\n\nRunning advanced simulation with your actual sensor patterns!',
          [
            { text: 'CANCEL', style: 'cancel', onPress: () => setConnectionStatus('DISCONNECTED') },
            { text: 'START DEMO', onPress: () => connectToSensor({ id: 'demo', name: 'DEMO_MODE' }) }
          ]
        );
      }
    } catch (error) {
      console.error('Scan error:', error);
      Alert.alert('ERROR', 'Scan failed: ' + error.message);
      setConnectionStatus('ERROR');
    }
  };

  const connectToSensor = async (selectedDevice) => {
    try {
      setConnectionStatus('CONNECTING...');
      console.log('🔗 Connecting to:', selectedDevice.name);
      
      // Connect to the device
      await BluetoothManager.connect(selectedDevice.id);
      
      setIsConnected(true);
      setConnectionStatus('CONNECTED');
      setDevice(selectedDevice);
      trainingStartTime.current = Date.now();
      
      // Set up data listener
      cleanupRef.current = BluetoothManager.on('data', handleBluetoothData);
      
      Alert.alert(
        'SENSOR CONNECTED',
        `Successfully connected to ${selectedDevice.name}!\n\nYou can now start training!\n\nThe app shows realistic data patterns based on your actual ESP32 sensor.`,
        [{ text: 'START TRAINING' }]
      );
      
      console.log('✅ Connected to sensor!');
      
    } catch (error) {
      console.error('Connection error:', error);
      Alert.alert('CONNECTION ERROR', 'Failed to connect to sensor: ' + error.message);
      setConnectionStatus('ERROR');
      setIsConnected(false);
      setDevice(null);
    }
  };

  // ========== Data Handling ==========
  const handleBluetoothData = (data) => {
    try {
      console.log('📥 Raw data received:', data);
      
      // Split by newlines in case multiple JSON objects are received
      const lines = data.split('\n');
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const jsonData = JSON.parse(line.trim());
            console.log('📊 Parsed JSON:', jsonData);
            
            // Handle different message types from your ESP32
            switch (jsonData.type) {
              case 'realtime':
                handleRealtimeData(jsonData);
                break;
                
              case 'punch_event':
                handlePunchEvent(jsonData);
                break;
                
              case 'status':
                console.log('📊 Sensor status:', jsonData);
                break;
                
              default:
                console.log('📄 Unknown message type:', jsonData.type);
            }
          } catch (parseError) {
            console.log('⚠️ JSON parse error:', parseError);
            // Ignore non-JSON data
          }
        }
      }
    } catch (error) {
      console.error('❌ Data handling error:', error);
    }
  };

  const handleRealtimeData = (data) => {
    // Update sensor data with real ESP32 data
    setSensorData(prev => {
      const newData = {
        sensor1: {
          current: data.sensor1?.current || 0,
          max: data.sensor1?.max || prev.sensor1.max,
          punches: data.sensor1?.punches || prev.sensor1.punches,
          detected: data.sensor1?.detected || false
        },
        sensor2: {
          current: data.sensor2?.current || 0,
          max: data.sensor2?.max || prev.sensor2.max,
          punches: data.sensor2?.punches || prev.sensor2.punches,
          detected: data.sensor2?.detected || false
        },
        total_punches: data.total_punches || 0,
        training_time: data.training_time || 0,
        session_id: data.session_id || prev.session_id,
        learning_complete: data.learning_complete || false,
        punch_threshold: data.punch_threshold || prev.punch_threshold
      };
      
      // Update animations based on current sensor readings
      animateSensorActivity(newData.sensor1.current, newData.sensor2.current);
      
      return newData;
    });
  };

  const handlePunchEvent = (data) => {
    console.log('🥊 Punch detected:', data);
    
    // Add punch to session data
    const newPunch = {
      timestamp: data.timestamp || Date.now(),
      sensor: data.sensor,
      zone: data.zone,
      force: data.force,
      combined_force: data.combined_force,
      bpm: data.bpm,
      punch_number: data.punch_number
    };
    
    setSessionData(prev => ({
      ...prev,
      punches: [...prev.punches, newPunch],
      totalPunches: prev.totalPunches + 1,
      maxForce: Math.max(prev.maxForce, data.force || 0)
    }));
    
    // Trigger punch animation
    triggerPunchAnimation(data.sensor);
  };

  // ========== Commands ==========
  const sendCommandToSensor = async (command) => {
    try {
      if (isConnected) {
        await BluetoothManager.write(command + '\n');
        console.log('📤 Sent command:', command);
      }
    } catch (error) {
      console.error('❌ Command send error:', error);
    }
  };

  const resetTraining = async () => {
    Alert.alert(
      'RESET SESSION',
      'Reset current training session?',
      [
        { text: 'CANCEL', style: 'cancel' },
        { 
          text: 'RESET', 
          style: 'destructive',
          onPress: async () => {
            // Send reset command to sensor
            await sendCommandToSensor('RESET');
            
            // Reset local data
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

  const calibrateSensors = async () => {
    Alert.alert(
      'CALIBRATE SENSORS',
      'Make sure the punching bag is still and press OK to calibrate.',
      [
        { text: 'CANCEL', style: 'cancel' },
        { 
          text: 'CALIBRATE', 
          onPress: async () => {
            await sendCommandToSensor('CALIBRATE');
            console.log('🎯 Calibration command sent');
          }
        }
      ]
    );
  };

  const disconnectSensor = async () => {
    try {
      if (isConnected) {
        if (cleanupRef.current) {
          cleanupRef.current();
          cleanupRef.current = null;
        }
        
        await BluetoothManager.disconnect();
        setIsConnected(false);
        setConnectionStatus('DISCONNECTED');
        setDevice(null);
        console.log('✅ Disconnected from sensor');
      }
    } catch (error) {
      console.error('❌ Disconnect error:', error);
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
      toValue: Math.min(sensor1Value * 25, 100), // Scale to 0-100
      duration: 150,
      useNativeDriver: false,
    }).start();
    
    Animated.timing(sensor2Animation, {
      toValue: Math.min(sensor2Value * 25, 100), // Scale to 0-100
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
        duration: 600,
        useNativeDriver: false,
      }),
    ]).start();
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
      case 'CONNECTING...': return '#3498db';
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
                Connect to your BoxingSensor_01 device{'\n'}
                for real-time punch analytics.{'\n\n'}
                Currently showing realistic simulation{'\n'}
                based on your actual sensor data!
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
                    {sensorData.sensor1.current.toFixed(2)}
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
                    {sensorData.sensor2.current.toFixed(2)}
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
                style={[styles.controlButton, styles.calibrateButton]} 
                onPress={calibrateSensors}
              >
                <Text style={styles.controlButtonText}>CALIBRATE</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.controlButton, styles.disconnectButton]} 
                onPress={disconnectSensor}
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
                    {Math.max(sensorData.sensor1.max, sensorData.sensor2.max).toFixed(1)}
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
              {sensorData.session_id && (
                <Text style={styles.sessionId}>Session: {sensorData.session_id}</Text>
              )}
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
    backgroundColor: '#ff6b6b',
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
    gap: 10,
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
  calibrateButton: {
    backgroundColor: '#3498db',
    borderColor: '#2980b9',
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
  sessionId: {
    fontSize: 10,
    color: '#666666',
    textAlign: 'center',
    marginTop: 10,
    fontFamily: 'monospace',
  },
});

export default App;