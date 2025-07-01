import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  StatusBar,
  SafeAreaView,
  ImageBackground,
  PermissionsAndroid,
  Platform,
  Animated,
  ToastAndroid,
} from 'react-native';

// ספריית Bluetooth אמיתית
import BluetoothSerial from 'react-native-bluetooth-classic';

const App = () => {
  // ========== State Management ==========
  const [isConnected, setIsConnected] = useState(false);
  const [device, setDevice] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('DISCONNECTED');
  const [bluetoothEnabled, setBluetoothEnabled] = useState(false);
  
  // נתונים מהחיישן - בדיוק כמו שהחיישן שלך שולח
  const [sensorData, setSensorData] = useState({
    sensor1: { current: 0, max: 0, punches: 0, detected: false },
    sensor2: { current: 0, max: 0, punches: 0, detected: false },
    total_punches: 0,
    training_time: 0,
    session_id: '',
    learning_complete: false,
    punch_threshold: 1.5
  });
  
  // נתוני אימון
  const [sessionData, setSessionData] = useState({
    punches: [],
    startTime: null,
    totalPunches: 0,
    maxForce: 0
  });
  
  // אנימציות
  const sensor1Animation = useRef(new Animated.Value(0)).current;
  const sensor2Animation = useRef(new Animated.Value(0)).current;
  const connectionPulse = useRef(new Animated.Value(1)).current;
  
  // Buffer לנתוני JSON
  const dataBuffer = useRef('');
  
  // ========== Lifecycle ==========
  useEffect(() => {
    initializeApp();
    startConnectionPulse();
    
    return () => {
      disconnectSensor();
    };
  }, []);

  const initializeApp = async () => {
    console.log('🥊 Initializing Boxing Sensor App...');
    
    // בקשת הרשאות
    await requestBluetoothPermissions();
    
    // בדיקת Bluetooth
    await checkBluetoothStatus();
    
    console.log('✅ App initialized');
  };

  const requestBluetoothPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const permissions = [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADMIN
        ];
        
        const granted = await PermissionsAndroid.requestMultiple(permissions);
        console.log('📋 Permissions granted:', granted);
        return true;
      } catch (error) {
        console.log('❌ Permission error:', error);
        return false;
      }
    }
    return true;
  };

  const checkBluetoothStatus = async () => {
    try {
      const enabled = await BluetoothSerial.isEnabled();
      setBluetoothEnabled(enabled);
      
      if (!enabled) {
        Alert.alert(
          'Bluetooth כבוי',
          'יש להפעיל Bluetooth כדי להתחבר ל-BoxingSensor_01.',
          [
            { text: 'הפעל', onPress: enableBluetooth },
            { text: 'ביטול', style: 'cancel' }
          ]
        );
      }
    } catch (error) {
      console.log('❌ Bluetooth check error:', error);
    }
  };

  const enableBluetooth = async () => {
    try {
      await BluetoothSerial.enable();
      setBluetoothEnabled(true);
      showToast('Bluetooth הופעל!');
    } catch (error) {
      Alert.alert('שגיאה', 'נכשל בהפעלת Bluetooth: ' + error.message);
    }
  };

  const showToast = (message) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    }
  };

  // ========== חיפוש והתחברות מעודכן ==========
  const scanForDevices = async () => {
    try {
      setConnectionStatus('SCANNING...');
      
      if (!bluetoothEnabled) {
        await checkBluetoothStatus();
        return;
      }
      
      console.log('🔍 Starting comprehensive scan...');
      showToast('מחפש את BoxingSensor_01...');
      
      // חיפוש מקיף יותר
      let allDevices = [];
      
      try {
        // רשימת מכשירים מזווגים
        const pairedDevices = await BluetoothSerial.list();
        console.log('📱 Paired devices:', pairedDevices.length);
        allDevices = [...pairedDevices];
      } catch (error) {
        console.log('❌ Error getting paired devices:', error);
      }
      
      try {
        // סריקה למכשירים חדשים (זה יכול לקחת זמן)
        showToast('סורק מכשירים חדשים...');
        const unpairedDevices = await BluetoothSerial.discoverUnpairedDevices();
        console.log('🔍 Discovered devices:', unpairedDevices.length);
        allDevices = [...allDevices, ...unpairedDevices];
      } catch (error) {
        console.log('❌ Error discovering devices:', error);
      }
      
      // הדפסת כל המכשירים למטרות DEBUG
      console.log(`📡 Total devices found: ${allDevices.length}`);
      allDevices.forEach((device, index) => {
        console.log(`${index + 1}. Name: "${device.name}" | ID: ${device.id}`);
      });
      
      // חיפוש החיישן שלך - יותר מדויק
      const boxingDevices = allDevices.filter(device => {
        if (!device.name) return false;
        
        const name = device.name.toLowerCase();
        return (
          name === 'boxingsensor_01' ||
          name.includes('boxingsensor') ||
          name.includes('boxing') ||
          name.includes('esp32') ||
          device.name === 'BoxingSensor_01'
        );
      });
      
      console.log(`🥊 Boxing devices found: ${boxingDevices.length}`);
      boxingDevices.forEach(device => {
        console.log(`Boxing device: "${device.name}" | ${device.id}`);
      });
      
      if (boxingDevices.length > 0) {
        const sensor = boxingDevices[0];
        console.log('🎯 Found BoxingSensor:', sensor.name);
        showToast(`נמצא ${sensor.name}!`);
        
        Alert.alert(
          '🥊 חיישן נמצא!',
          `נמצא: ${sensor.name}\nID: ${sensor.id}\n\nהתחבר לחיישן?`,
          [
            { text: 'ביטול', style: 'cancel', onPress: () => setConnectionStatus('DISCONNECTED') },
            { text: 'התחבר', onPress: () => connectToSensor(sensor) }
          ]
        );
      } else {
        // לא נמצא החיישן - הצג אפשרויות
        console.log('❌ BoxingSensor_01 not found');
        
        const deviceNames = allDevices.map(d => d.name || 'Unknown').filter(name => name !== 'Unknown');
        
        Alert.alert(
          'חיישן לא נמצא',
          `לא נמצא BoxingSensor_01.\n\nנמצאו ${allDevices.length} מכשירים:\n${deviceNames.slice(0, 5).join('\n')}${deviceNames.length > 5 ? '\n...' : ''}\n\nמה לעשות?`,
          [
            { text: 'נסה שוב', onPress: scanForDevices },
            { text: 'הצג הכל', onPress: () => showAllDevices(allDevices) },
            { text: 'ביטול', style: 'cancel', onPress: () => setConnectionStatus('DISCONNECTED') }
          ]
        );
      }
      
    } catch (error) {
      console.log('❌ Scan error:', error);
      Alert.alert('שגיאת סריקה', `נכשל בחיפוש: ${error.message}\n\nנסה:\n• וודא ש-Bluetooth פעיל\n• וודא שהחיישן דלוק\n• התקרב לחיישן`);
      setConnectionStatus('ERROR');
    }
  };

  // פונקציה חדשה להצגת כל המכשירים
  const showAllDevices = (devices) => {
    if (devices.length === 0) {
      Alert.alert('אין מכשירים', 'לא נמצאו מכשירי Bluetooth');
      setConnectionStatus('DISCONNECTED');
      return;
    }
    
    // הצגת כל המכשירים לבחירה ידנית
    const deviceOptions = devices.map((device, index) => ({
      text: `${device.name || 'Unknown'} (${device.id.substring(0, 8)}...)`,
      onPress: () => {
        Alert.alert(
          'התחבר למכשיר?',
          `האם ${device.name || 'Unknown'} הוא החיישן שלך?`,
          [
            { text: 'לא', style: 'cancel' },
            { text: 'כן', onPress: () => connectToSensor(device) }
          ]
        );
      }
    }));
    
    // הגבלה של 8 מכשירים בכל פעם
    const limitedOptions = deviceOptions.slice(0, 8);
    limitedOptions.push({ text: 'ביטול', style: 'cancel', onPress: () => setConnectionStatus('DISCONNECTED') });
    
    Alert.alert(
      'בחר מכשיר',
      `בחר את החיישן שלך מהרשימה (${devices.length} מכשירים):`,
      limitedOptions
    );
  };

  // שיפור פונקציית ההתחברות
  const connectToSensor = async (device) => {
    try {
      setConnectionStatus('CONNECTING...');
      console.log('🔗 Attempting to connect to:', device.name, device.id);
      showToast(`מתחבר ל-${device.name}...`);
      
      // ניסיון התחברות עם timeout ארוך יותר
      const connectionPromise = BluetoothSerial.connect(device.id);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('זמן חיבור פג')), 20000) // 20 שניות
      );
      
      const connection = await Promise.race([connectionPromise, timeoutPromise]);
      
      if (connection) {
        setIsConnected(true);
        setConnectionStatus('CONNECTED');
        setDevice(device);
        
        console.log('✅ Successfully connected to', device.name);
        showToast('התחבר בהצלחה!');
        
        Alert.alert(
          '🎉 מחובר בהצלחה!',
          `התחברת ל-${device.name}\n\nהחיישן שלך כעת מזרים נתונים בזמן אמת!\n\nהתחל לאמן!`,
          [{ text: 'התחל אימון', style: 'default' }]
        );
        
        // התחל להאזין לנתונים
        startListeningToSensorData();
        
      } else {
        throw new Error('החיבור נכשל - אין תגובה מהמכשיר');
      }
      
    } catch (error) {
      console.log('❌ Connection error:', error);
      setConnectionStatus('ERROR');
      
      Alert.alert(
        'חיבור נכשל',
        `לא ניתן להתחבר ל-${device.name}\n\nשגיאה: ${error.message}\n\nפתרונות:\n• וודא שהחיישן דלוק ופעיל\n• התקרב יותר לחיישן\n• הפעל מחדש את החיישן\n• בדוק שהחיישן לא מחובר למכשיר אחר`,
        [
          { text: 'נסה שוב', onPress: () => connectToSensor(device) },
          { text: 'חזור לסריקה', onPress: scanForDevices },
          { text: 'ביטול', style: 'cancel', onPress: () => setConnectionStatus('DISCONNECTED') }
        ]
      );
    }
  };

  // ========== קבלת נתונים מהחיישן ==========
  const startListeningToSensorData = () => {
    console.log('📡 Starting to listen for sensor data...');
    
    // מאזין לנתונים מהחיישן - JSON כמו שראינו
    BluetoothSerial.on('read', (data) => {
      const receivedData = data.data;
      
      // הוספה לbuffer
      dataBuffer.current += receivedData;
      
      // עיבוד JSON שלם
      processDataBuffer();
    });
    
    // מאזין לניתוק
    BluetoothSerial.on('connectionLost', () => {
      console.log('🚨 Connection lost');
      showToast('החיבור לחיישן אבד');
      Alert.alert('חיבור אבד', 'החיבור לחיישן נותק');
      handleConnectionLost();
    });
    
    BluetoothSerial.on('error', (error) => {
      console.log('🚨 Bluetooth Error:', error);
      Alert.alert('שגיאת Bluetooth', error.message);
    });
  };

  const processDataBuffer = () => {
    const lines = dataBuffer.current.split('\n');
    
    // שמירת השורה האחרונה (חלקית) בbuffer
    dataBuffer.current = lines.pop() || '';
    
    // עיבוד כל השורות השלמות
    lines.forEach(line => {
      line = line.trim();
      if (line.startsWith('{') && line.endsWith('}')) {
        try {
          const jsonData = JSON.parse(line);
          handleSensorData(jsonData);
        } catch (parseError) {
          console.log('❌ JSON Parse Error:', parseError.message);
        }
      }
    });
  };

  const handleSensorData = (data) => {
    switch (data.type) {
      case 'realtime':
        handleRealtimeData(data);
        break;
      case 'punch_event':
        handlePunchEvent(data);
        break;
      case 'status':
        handleStatusData(data);
        break;
    }
  };

  const handleRealtimeData = (data) => {
    // עדכון נתונים בזמן אמת מהחיישן שלך
    setSensorData(prev => ({
      ...prev,
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
      total_punches: data.total_punches || prev.total_punches,
      training_time: data.training_time || prev.training_time,
      session_id: data.session_id || prev.session_id,
      learning_complete: data.learning_complete !== undefined ? data.learning_complete : prev.learning_complete,
      punch_threshold: data.punch_threshold || prev.punch_threshold
    }));
    
    // אנימציות בהתאם לחיישן
    animateSensors(data.sensor1?.current || 0, data.sensor2?.current || 0);
    
    // זיהוי מכות בזמן אמת
    if (data.sensor1?.detected || data.sensor2?.detected) {
      const sensorNum = data.sensor1?.detected ? 1 : 2;
      const force = sensorNum === 1 ? data.sensor1.current : data.sensor2.current;
      
      triggerPunchAnimation(sensorNum);
      console.log(`🥊 מכה זוהתה: חיישן ${sensorNum}, עוצמה: ${force}`);
    }
  };

  const handlePunchEvent = (data) => {
    console.log(`🥊 מכה: ${data.zone} #${data.punch_number} - עוצמה: ${data.force}`);
    showToast(`מכה! עוצמה: ${data.force?.toFixed(1)}`);
    
    // הוספת מכה לסשן
    const newPunch = {
      timestamp: data.timestamp || Date.now(),
      sensor: data.sensor || 1,
      zone: data.zone || 'אלמוני',
      force: data.force || 0,
      combined_force: data.combined_force || data.force || 0,
      bpm: data.bpm || 0,
      punch_number: data.punch_number || sessionData.totalPunches + 1
    };
    
    setSessionData(prev => ({
      ...prev,
      punches: [...prev.punches, newPunch],
      totalPunches: prev.totalPunches + 1,
      maxForce: Math.max(prev.maxForce, newPunch.force)
    }));
    
    triggerPunchAnimation(data.sensor || 1);
  };

  const handleStatusData = (data) => {
    console.log('📊 Sensor Status:', data);
  };

  const handleConnectionLost = () => {
    setIsConnected(false);
    setConnectionStatus('DISCONNECTED');
    setDevice(null);
    
    BluetoothSerial.removeAllListeners();
    dataBuffer.current = '';
  };

  const disconnectSensor = async () => {
    try {
      if (isConnected) {
        await BluetoothSerial.disconnect();
        console.log('🔴 Disconnected');
        showToast('התנתק מהחיישן');
      }
      
      handleConnectionLost();
      
    } catch (error) {
      console.log('Disconnect error:', error);
    }
  };

  // ========== אנימציות ==========
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

  const animateSensors = (sensor1Value, sensor2Value) => {
    Animated.timing(sensor1Animation, {
      toValue: Math.min(sensor1Value * 50, 150),
      duration: 100,
      useNativeDriver: false,
    }).start();
    
    Animated.timing(sensor2Animation, {
      toValue: Math.min(sensor2Value * 50, 150),
      duration: 100,
      useNativeDriver: false,
    }).start();
  };

  const triggerPunchAnimation = (sensorNum) => {
    const animation = sensorNum === 1 ? sensor1Animation : sensor2Animation;
    
    Animated.sequence([
      Animated.timing(animation, {
        toValue: 200,
        duration: 150,
        useNativeDriver: false,
      }),
      Animated.timing(animation, {
        toValue: 10,
        duration: 300,
        useNativeDriver: false,
      }),
    ]).start();
  };

  // ========== פונקציות עזר ==========
  const formatTime = (ms) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'CONNECTED': return '#00ff00';
      case 'CONNECTING...': return '#ffaa00';
      case 'SCANNING...': return '#00aaff';
      case 'ERROR': return '#ff0000';
      default: return '#ff0000';
    }
  };

  // ========== Render ==========
  return (
    <SafeAreaView style={styles.container}>
      <ImageBackground 
        source={require('./assets/images/with_man.jpg')}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>🥊 BOXING SENSOR PRO</Text>
          <View style={[styles.statusIndicator, { 
            backgroundColor: getConnectionStatusColor()
          }]}>
            <Text style={styles.statusText}>{connectionStatus}</Text>
          </View>
          {device && (
            <Text style={styles.deviceInfo}>📱 {device.name}</Text>
          )}
        </View>

        <ScrollView style={styles.content}>
          
          {/* Connection Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>חיבור</Text>
            
            {!isConnected ? (
              <Animated.View style={[styles.connectionButton, { 
                transform: [{ scale: connectionPulse }] 
              }]}>
                <TouchableOpacity 
                  style={styles.connectBtn}
                  onPress={scanForDevices}
                  disabled={connectionStatus.includes('ING')}
                >
                  <Text style={styles.connectBtnText}>
                    {connectionStatus.includes('ING') ? connectionStatus : 'חפש BOXINGSENSOR_01'}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            ) : (
              <View style={styles.connectedDevice}>
                <Text style={styles.deviceName}>✅ {device?.name}</Text>
                <Text style={styles.sensorStatus}>
                  מצב: {sensorData.learning_complete ? 'מוכן' : 'מכייל...'}
                </Text>
                <TouchableOpacity 
                  style={styles.disconnectBtn}
                  onPress={disconnectSensor}
                >
                  <Text style={styles.disconnectBtnText}>התנתק</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Live Sensor Data */}
          {isConnected && (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>נתוני חיישן בזמן אמת</Text>
                
                <View style={styles.sensorsContainer}>
                  {/* Sensor 1 */}
                  <View style={styles.sensorCard}>
                    <Text style={styles.sensorTitle}>חיישן עליון</Text>
                    <Text style={styles.sensorSubtitle}>(ראש/גוף)</Text>
                    <Animated.View 
                      style={[styles.sensorBar, {
                        height: sensor1Animation,
                        backgroundColor: sensorData.sensor1.detected ? '#ff4444' : '#00ff88'
                      }]}
                    />
                    <Text style={styles.sensorValue}>
                      {sensorData.sensor1.current.toFixed(2)}
                    </Text>
                    <Text style={styles.sensorMax}>
                      מקס: {sensorData.sensor1.max.toFixed(2)}
                    </Text>
                    <Text style={styles.sensorCount}>
                      מכות: {sensorData.sensor1.punches}
                    </Text>
                  </View>

                  {/* Sensor 2 */}
                  <View style={styles.sensorCard}>
                    <Text style={styles.sensorTitle}>חיישן תחתון</Text>
                    <Text style={styles.sensorSubtitle}>(גוף/כבד)</Text>
                    <Animated.View 
                      style={[styles.sensorBar, {
                        height: sensor2Animation,
                        backgroundColor: sensorData.sensor2.detected ? '#ff4444' : '#00ff88'
                      }]}
                    />
                    <Text style={styles.sensorValue}>
                      {sensorData.sensor2.current.toFixed(2)}
                    </Text>
                    <Text style={styles.sensorMax}>
                      מקס: {sensorData.sensor2.max.toFixed(2)}
                    </Text>
                    <Text style={styles.sensorCount}>
                      מכות: {sensorData.sensor2.punches}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Training Stats */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>סטטיסטיקות אימון</Text>
                
                <View style={styles.statsGrid}>
                  <View style={styles.statCard}>
                    <Text style={styles.statValue}>{sensorData.total_punches}</Text>
                    <Text style={styles.statLabel}>סה"כ מכות</Text>
                  </View>
                  
                  <View style={styles.statCard}>
                    <Text style={styles.statValue}>
                      {formatTime(sensorData.training_time)}
                    </Text>
                    <Text style={styles.statLabel}>זמן אימון</Text>
                  </View>
                  
                  <View style={styles.statCard}>
                    <Text style={styles.statValue}>
                      {Math.max(sensorData.sensor1.max, sensorData.sensor2.max).toFixed(1)}
                    </Text>
                    <Text style={styles.statLabel}>עוצמה מקסימלית</Text>
                  </View>
                  
                  <View style={styles.statCard}>
                    <Text style={styles.statValue}>
                      {sensorData.learning_complete ? '✅' : '⏳'}
                    </Text>
                    <Text style={styles.statLabel}>כיול</Text>
                  </View>
                </View>
              </View>
            </>
          )}

          {/* Info Section - רק כשלא מחובר */}
          {!isConnected && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>מצב</Text>
              
              <View style={styles.infoCard}>
                <Text style={styles.infoText}>✅ אפליקציה הותקנה בהצלחה</Text>
                <Text style={styles.infoText}>📱 מוכן למכשיר Android</Text>
                <Text style={styles.infoText}>🔵 אינטגרציית Bluetooth מוכנה</Text>
                <Text style={styles.infoText}>🥊 זיהוי חיישן אגרוף מוכן</Text>
              </View>
            </View>
          )}

        </ScrollView>
      </ImageBackground>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
  },
  header: {
    paddingTop: 75,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(51,51,51,0.8)',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: {width: 1, height: 1},
    textShadowRadius: 3,
  },
  statusIndicator: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginVertical: 5,
  },
  statusText: {
    color: '#000',
    fontSize: 12,
    fontWeight: 'bold',
  },
  deviceInfo: {
    color: '#888',
    fontSize: 14,
    marginTop: 5,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: {width: 1, height: 1},
    textShadowRadius: 3,
  },
  connectionButton: {
    alignItems: 'center',
  },
  connectBtn: {
    backgroundColor: 'rgba(0,255,136,0.8)',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 25,
    minWidth: 250,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(0,255,136,1)',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  connectBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  connectedDevice: {
    alignItems: 'center',
  },
  deviceName: {
    color: '#00ff88',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  sensorStatus: {
    color: '#888',
    fontSize: 14,
    marginBottom: 10,
  },
  disconnectBtn: {
    backgroundColor: '#ff4444',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 15,
  },
  disconnectBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  sensorsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sensorCard: {
    flex: 1,
    backgroundColor: 'rgba(17,17,17,0.9)',
    padding: 15,
    borderRadius: 15,
    marginHorizontal: 5,
    alignItems: 'center',
    minHeight: 220,
  },
  sensorTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
    textAlign: 'center',
  },
  sensorSubtitle: {
    color: '#888',
    fontSize: 10,
    marginBottom: 10,
    textAlign: 'center',
  },
  sensorBar: {
    width: 30,
    backgroundColor: '#00ff88',
    borderRadius: 15,
    marginVertical: 10,
    minHeight: 5,
  },
  sensorValue: {
    color: '#00ff88',
    fontSize: 18,
    fontWeight: 'bold',
    marginVertical: 5,
  },
  sensorMax: {
    color: '#888',
    fontSize: 12,
    marginVertical: 2,
  },
  sensorCount: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 5,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    backgroundColor: 'rgba(17,17,17,0.9)',
    padding: 15,
    borderRadius: 15,
    width: '48%',
    marginBottom: 15,
    alignItems: 'center',
  },
  statValue: {
    color: '#00ff88',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  statLabel: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
  },
  infoCard: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 20,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  infoText: {
    color: '#00ff88',
    fontSize: 14,
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: {width: 1, height: 1},
    textShadowRadius: 2,
  },
});

export default App;