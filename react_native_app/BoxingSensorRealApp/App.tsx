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
  Vibration,
} from 'react-native';

// ספריית Bluetooth אמיתית
import BluetoothSerial from 'react-native-bluetooth-classic';

// בופר גלובלי לנתונים
let dataBuffer = '';

const App = () => {
  // ========== State Management ==========
  const [isConnected, setIsConnected] = useState(false);
  const [device, setDevice] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('DISCONNECTED');
  const [bluetoothEnabled, setBluetoothEnabled] = useState(false);
  
  // נתונים מהחיישן - מותאם לפורמט שלך
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
          PermissionsAndroid.PERMISSIONS.BLUETOOTH,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADMIN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        ];
        
        const granted = await PermissionsAndroid.requestMultiple(permissions);
        console.log('📋 Permissions granted:', granted);
        
        const allGranted = Object.values(granted).every(
          status => status === PermissionsAndroid.RESULTS.GRANTED
        );
        
        if (!allGranted) {
          Alert.alert('הרשאות חסרות', 'נדרשות הרשאות Bluetooth ומיקום');
          return false;
        }
        
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

  // ========== חיפוש והתחברות מתוקן ==========
  const scanForDevices = async () => {
    try {
      setConnectionStatus('REQUESTING_PERMISSIONS...');
      
      // בקשת הרשאות קודם
      const hasPermissions = await requestBluetoothPermissions();
      if (!hasPermissions) {
        setConnectionStatus('PERMISSION_DENIED');
        return;
      }

      setConnectionStatus('CHECKING_BLUETOOTH...');
      
      const isEnabled = await BluetoothSerial.isEnabled();
      if (!isEnabled) {
        Alert.alert(
          'Bluetooth כבוי',
          'יש להפעיל Bluetooth כדי למצוא את החיישן',
          [
            { text: 'הפעל', onPress: async () => {
              try {
                await BluetoothSerial.enable();
                setTimeout(scanForDevices, 1000);
              } catch (error) {
                Alert.alert('שגיאה', 'נכשל בהפעלת Bluetooth');
              }
            }},
            { text: 'ביטול', style: 'cancel', onPress: () => setConnectionStatus('DISCONNECTED') }
          ]
        );
        return;
      }

      setConnectionStatus('SCANNING...');
      console.log('🔍 Scanning for BoxingSensor_01...');
      showToast('מחפש את BoxingSensor_01...');
      
      // סריקה למכשירים מזווגים
      const pairedDevices = await BluetoothSerial.list();
      console.log(`📱 Found ${pairedDevices.length} paired devices:`);
      
      pairedDevices.forEach((device, index) => {
        console.log(`  ${index + 1}. "${device.name}" | ${device.id}`);
      });
      
      // חיפוש החיישן במכשירים מזווגים
      const boxingSensor = pairedDevices.find(device => 
        device.name === 'BoxingSensor_01' ||
        device.name === 'BoxingSensor_01\u0000' ||
        device.name?.trim() === 'BoxingSensor_01'
      );
      
      if (boxingSensor) {
        console.log('🎯 Found BoxingSensor_01 in paired devices!');
        Alert.alert(
          '🥊 חיישן נמצא!',
          `נמצא: ${boxingSensor.name}\nID: ${boxingSensor.id}\n\nהתחבר לחיישן?`,
          [
            { text: 'ביטול', style: 'cancel', onPress: () => setConnectionStatus('DISCONNECTED') },
            { text: 'התחבר', onPress: () => connectToSensor(boxingSensor) }
          ]
        );
        return;
      }

      // אם לא נמצא במזווגים, נסה לסרוק מכשירים חדשים
      try {
        showToast('סורק מכשירים חדשים...');
        const discoveredDevices = await BluetoothSerial.discoverUnpairedDevices();
        
        console.log(`🔍 Found ${discoveredDevices.length} new devices:`);
        discoveredDevices.forEach((device, index) => {
          console.log(`  ${index + 1}. "${device.name}" | ${device.id}`);
        });
        
        const newBoxingSensor = discoveredDevices.find(device => 
          device.name === 'BoxingSensor_01' ||
          device.name?.includes('BoxingSensor') ||
          device.name?.includes('ESP32')
        );
        
        if (newBoxingSensor) {
          console.log('🎯 Found BoxingSensor_01 in new devices!');
          Alert.alert(
            '🥊 חיישן נמצא!',
            `נמצא: ${newBoxingSensor.name}\nID: ${newBoxingSensor.id}\n\nהתחבר לחיישן?`,
            [
              { text: 'ביטול', style: 'cancel', onPress: () => setConnectionStatus('DISCONNECTED') },
              { text: 'התחבר', onPress: () => connectToSensor(newBoxingSensor) }
            ]
          );
        } else {
          showNoDevicesDialog([...pairedDevices, ...discoveredDevices]);
        }
        
      } catch (error) {
        console.log('❌ Discovery error:', error);
        showNoDevicesDialog(pairedDevices);
      }
      
    } catch (error) {
      console.log('❌ Scan error:', error);
      Alert.alert('שגיאת סריקה', error.message);
      setConnectionStatus('ERROR');
    }
  };

  const showNoDevicesDialog = (allDevices) => {
    const deviceNames = allDevices
      .map(d => d.name || 'Unknown')
      .filter(name => name !== 'Unknown')
      .slice(0, 5);
    
    const message = allDevices.length > 0 
      ? `לא נמצא BoxingSensor_01.\n\nנמצאו ${allDevices.length} מכשירים:\n${deviceNames.join('\n')}\n\nודא שהחיישן פועל ובטווח.`
      : 'לא נמצאו מכשירי Bluetooth.\n\nודא שהחיישן פועל ובטווח.';
    
    Alert.alert(
      'חיישן לא נמצא',
      message,
      [
        { text: 'נסה שוב', onPress: scanForDevices },
        { text: 'הצג הכל', onPress: () => showAllDevices(allDevices) },
        { text: 'ביטול', style: 'cancel', onPress: () => setConnectionStatus('DISCONNECTED') }
      ]
    );
  };

  const showAllDevices = (devices) => {
    if (devices.length === 0) {
      Alert.alert('אין מכשירים', 'לא נמצאו מכשירי Bluetooth');
      setConnectionStatus('DISCONNECTED');
      return;
    }
    
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
    
    const limitedOptions = deviceOptions.slice(0, 8);
    limitedOptions.push({ text: 'ביטול', style: 'cancel', onPress: () => setConnectionStatus('DISCONNECTED') });
    
    Alert.alert(
      'בחר מכשיר',
      `בחר את החיישן שלך מהרשימה (${devices.length} מכשירים):`,
      limitedOptions
    );
  };

  // ========== התחברות מתוקנת ==========
  const connectToSensor = async (device) => {
    try {
      setConnectionStatus('CONNECTING...');
      showToast(`מתחבר ל-${device.name}...`);
      
      console.log(`🔗 Connecting to: ${device.name} (${device.id})`);
      
      await BluetoothSerial.connect(device.id);
      
      console.log('✅ Connected successfully!');
      
      setIsConnected(true);
      setConnectionStatus('CONNECTED');
      setDevice(device);
      
      // איפוס נתוני סשן
      setSessionData({
        punches: [],
        startTime: Date.now(),
        totalPunches: 0,
        maxForce: 0
      });
      
      // איפוס בופר
      dataBuffer = '';
      
      Alert.alert(
        'חיישן מחובר!',
        `✅ מחובר ל-${device.name}\n\nזרימת נתונים בזמן אמת החלה!`,
        [{ text: 'התחל אימון' }]
      );
      
      // התחל להקשיב לנתונים
      startListeningToSensorData();
      
    } catch (error) {
      console.log('❌ Connection failed:', error);
      Alert.alert(
        'שגיאת חיבור', 
        `נכשל בחיבור ל-${device.name}:\n${error.message}`,
        [
          { text: 'נסה שוב', onPress: () => connectToSensor(device) },
          { text: 'חזור לסריקה', onPress: scanForDevices }
        ]
      );
      setConnectionStatus('ERROR');
    }
  };

  // ========== קבלת נתונים מתוקנת ==========
  const startListeningToSensorData = () => {
    console.log('📡 Starting to listen for sensor data...');
    
    BluetoothSerial.on('data', (data) => {
      try {
        const receivedData = data.toString();
        console.log('📨 Raw data received:', receivedData);
        
        // הוספה לבופר
        dataBuffer += receivedData;
        
        // עיבוד שורות שלמות
        processCompleteLines();
        
      } catch (error) {
        console.log('❌ Data processing error:', error);
      }
    });
    
    BluetoothSerial.on('error', (error) => {
      console.log('🚨 Bluetooth Error:', error);
      Alert.alert('שגיאת חיבור', 'החיבור לחיישן נותק');
      handleConnectionLost();
    });
  };

  const processCompleteLines = () => {
    const lines = dataBuffer.split('\n');
    
    // שמור את השורה האחרונה (שעלולה להיות חלקית) בבופר
    dataBuffer = lines.pop() || '';
    
    // עבד כל שורה שלמה
    lines.forEach(line => {
      line = line.trim();
      if (line.startsWith('{') && line.endsWith('}')) {
        try {
          const jsonData = JSON.parse(line);
          handleSensorData(jsonData);
        } catch (error) {
          console.log('❌ JSON Parse Error:', error.message, 'Line:', line);
        }
      }
    });
  };

  const handleSensorData = (data) => {
    console.log('📊 Processed data:', data);
    
    if (data.event === 'punch') {
      // אירוע מכה
      handlePunchEvent(data);
    } else if (data.session_id && data.upper_punch !== undefined && data.lower_punch !== undefined) {
      // נתוני זמן אמת
      handleRealtimeData(data);
    } else {
      console.log('⚠️ Unknown data format:', data);
    }
  };

  const handleRealtimeData = (data) => {
    // עדכון State עם נתונים אמיתיים
    setSensorData(prev => ({
      ...prev,
      sensor1: {
        current: data.upper_punch || 0,
        max: Math.max(prev.sensor1.max, data.upper_punch || 0),
        punches: prev.sensor1.punches,
        detected: (data.upper_punch || 0) > 1.5
      },
      sensor2: {
        current: data.lower_punch || 0,
        max: Math.max(prev.sensor2.max, data.lower_punch || 0),
        punches: prev.sensor2.punches,
        detected: (data.lower_punch || 0) > 1.5
      },
      total_punches: data.total_punches || prev.total_punches,
      training_time: data.uptime || prev.training_time,
      session_id: data.session_id || prev.session_id,
      learning_complete: true,
      punch_threshold: 1.5
    }));
    
    // עדכון אנימציות
    animateSensors(data.upper_punch || 0, data.lower_punch || 0);
  };

  const handlePunchEvent = (data) => {
    console.log(`🥊 PUNCH! Sensor: ${data.sensor}, Zone: ${data.zone}, Force: ${data.force}`);
    
    // עדכון מונה המכות
    setSensorData(prev => {
      const newData = { ...prev };
      if (data.sensor === 1) {
        newData.sensor1.punches += 1;
      } else if (data.sensor === 2) {
        newData.sensor2.punches += 1;
      }
      return newData;
    });
    
    // הוסף מכה לסשן
    const newPunch = {
      timestamp: data.timestamp || Date.now(),
      sensor: data.sensor || 1,
      zone: data.zone || (data.sensor === 1 ? 'Upper' : 'Lower'),
      force: data.force || 0,
      combined_force: data.combined_force || data.force || 0,
      bpm: data.bmp || 0,
      punch_number: sessionData.totalPunches + 1
    };
    
    setSessionData(prev => ({
      ...prev,
      punches: [...prev.punches, newPunch],
      totalPunches: prev.totalPunches + 1,
      maxForce: Math.max(prev.maxForce, data.force || 0)
    }));
    
    // אנימציה ורטט
    triggerPunchAnimation(data.sensor || 1);
    
    if (Platform.OS === 'android') {
      Vibration.vibrate(100);
    }
    
    // הודעה זמנית
    setConnectionStatus(`PUNCH ${(data.zone || 'Unknown').toUpperCase()}! Force: ${(data.force || 0).toFixed(1)}`);
    setTimeout(() => setConnectionStatus('CONNECTED'), 2000);
    
    showToast(`מכה! ${data.zone} - עוצמה: ${(data.force || 0).toFixed(1)}`);
  };

  const handleConnectionLost = () => {
    setIsConnected(false);
    setConnectionStatus('DISCONNECTED');
    setDevice(null);
    
    BluetoothSerial.removeAllListeners();
    dataBuffer = '';
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
    // אנימציה לחיישן עליון
    const upperNormalized = Math.min(sensor1Value * 50, 150);
    Animated.timing(sensor1Animation, {
      toValue: upperNormalized,
      duration: 100,
      useNativeDriver: false,
    }).start();
    
    // אנימציה לחיישן תחתון
    const lowerNormalized = Math.min(sensor2Value * 50, 150);
    Animated.timing(sensor2Animation, {
      toValue: lowerNormalized,
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
  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
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
                  {/* Sensor 1 - Upper */}
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

                  {/* Sensor 2 - Lower */}
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
                      {sessionData.maxForce.toFixed(1)}
                    </Text>
                    <Text style={styles.statLabel}>מכה חזקה ביותר</Text>
                  </View>
                </View>
              </View>

              {/* Session Info */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>מידע סשן</Text>
                <View style={styles.infoCard}>
                  <Text style={styles.infoText}>🆔 Session: {sensorData.session_id}</Text>
                  <Text style={styles.infoText}>📊 מכות בסשן: {sessionData.totalPunches}</Text>
                  <Text style={styles.infoText}>📈 עליון: {sensorData.sensor1.punches} | תחתון: {sensorData.sensor2.punches}</Text>
                  <Text style={styles.infoText}>⚖️ סף זיהוי: {sensorData.punch_threshold}</Text>
                </View>
              </View>
            </>
          )}

          {/* Info Section - רק כשלא מחובר */}
          {!isConnected && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>מצב</Text>
              
              <View style={styles.infoCard}>
                <Text style={styles.infoText}>✅ אפליקציה מוכנה</Text>
                <Text style={styles.infoText}>📱 תמיכה ב-Android</Text>
                <Text style={styles.infoText}>🔵 Bluetooth Classic מוכן</Text>
                <Text style={styles.infoText}>🥊 מחפש BoxingSensor_01</Text>
                <Text style={styles.infoText}>📊 מותאם לפורמט החיישן</Text>
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