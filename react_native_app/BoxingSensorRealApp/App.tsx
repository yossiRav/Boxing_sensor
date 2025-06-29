// קוד לחיבור Bluetooth אמיתי - עדכון לאפליקציה
// להחליף את הקוד הקיים ב-App.tsx

// ========== Real Bluetooth Functions ==========
const scanForDevices = async () => {
  try {
    setConnectionStatus('SCANNING...');
    
    // בדיקת הרשאות Bluetooth
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
    }
    
    // חיפוש מכשירי Bluetooth
    const devices = await BluetoothSerial.list();
    console.log('📡 Found devices:', devices);
    
    const boxingDevices = devices.filter(device => 
      device.name && device.name.includes('BoxingSensor')
    );
    
    if (boxingDevices.length > 0) {
      Alert.alert(
        'SENSOR FOUND',
        `Found: ${boxingDevices[0].name}\n\nConnect to real sensor?`,
        [
          { text: 'CANCEL', style: 'cancel', onPress: () => setConnectionStatus('DISCONNECTED') },
          { text: 'CONNECT', onPress: () => connectToRealSensor(boxingDevices[0]) }
        ]
      );
    } else {
      Alert.alert(
        'NO SENSORS FOUND',
        'No boxing sensors detected.\n\nOptions:',
        [
          { text: 'RETRY', onPress: scanForDevices },
          { text: 'DEMO MODE', onPress: startSimulation }
        ]
      );
    }
  } catch (error) {
    Alert.alert('ERROR', 'Bluetooth scan failed: ' + error.message);
    setConnectionStatus('ERROR');
  }
};

const connectToRealSensor = async (device) => {
  try {
    setConnectionStatus('CONNECTING...');
    
    // התחברות לחיישן
    await BluetoothSerial.connect(device.id);
    
    setIsConnected(true);
    setConnectionStatus('CONNECTED');
    setDevice(device);
    setIsSimulating(false); // זה חיבור אמיתי!
    trainingStartTime.current = Date.now();
    
    Alert.alert(
      'SENSOR CONNECTED',
      `✅ Connected to ${device.name}\n\nReal-time data streaming started!`,
      [{ text: 'START TRAINING' }]
    );
    
    // התחל להקשיב לנתונים מהחיישן
    startListeningToRealData();
    
  } catch (error) {
    Alert.alert('CONNECTION ERROR', 'Failed to connect: ' + error.message);
    setConnectionStatus('ERROR');
  }
};

const startListeningToRealData = () => {
  console.log('📡 Starting to listen for real sensor data...');
  
  // מאזין לנתונים מהחיישן
  BluetoothSerial.on('data', (data) => {
    try {
      const receivedData = data.toString().trim();
      console.log('📨 Received:', receivedData);
      
      // נסה לפרס את ה-JSON
      const jsonData = JSON.parse(receivedData);
      
      if (jsonData.type === 'realtime') {
        handleRealSensorData(jsonData);
      } else if (jsonData.type === 'punch_event') {
        handleRealPunchEvent(jsonData);
      } else if (jsonData.type === 'status') {
        handleSensorStatus(jsonData);
      }
      
    } catch (error) {
      console.log('❌ JSON Parse Error:', error.message);
      // אם זה לא JSON תקין, התעלם
    }
  });
  
  BluetoothSerial.on('error', (error) => {
    console.log('🚨 Bluetooth Error:', error);
    Alert.alert('CONNECTION ERROR', 'Lost connection to sensor');
    disconnectSensor();
  });
};

const handleRealSensorData = (data) => {
  // עדכון State עם נתונים אמיתיים מהחיישן
  setSensorData(prev => ({
    ...prev,
    sensor1: {
      current: data.sensor1.current,
      max: data.sensor1.max,
      punches: data.sensor1.punches,
      detected: data.sensor1.detected
    },
    sensor2: {
      current: data.sensor2.current,
      max: data.sensor2.max,
      punches: data.sensor2.punches,
      detected: data.sensor2.detected
    },
    total_punches: data.total_punches,
    training_time: data.training_time,
    session_id: data.session_id,
    learning_complete: data.learning_complete,
    punch_threshold: data.punch_threshold
  }));
  
  // עדכון אנימציות
  animateSensorActivity(data.sensor1.current, data.sensor2.current);
  
  // אם יש זיהוי מכה
  if (data.sensor1.detected || data.sensor2.detected) {
    const sensorNum = data.sensor1.detected ? 1 : 2;
    const zone = sensorNum === 1 ? 'HEAD/BODY' : 'LOWER_BODY';
    const force = sensorNum === 1 ? data.sensor1.current : data.sensor2.current;
    
    triggerPunchAnimation(sensorNum);
    addPunchToSession(sensorNum, zone, force);
  }
};

const handleRealPunchEvent = (data) => {
  console.log(`🥊 Real Punch Detected: ${data.zone} #${data.punch_number} - Force: ${data.force}`);
  
  // הוסף מכה לסשן
  const newPunch = {
    timestamp: data.timestamp,
    sensor: data.sensor,
    zone: data.zone,
    force: data.force,
    combined_force: data.combined_force,
    bpm: data.bpm || 0,
    punch_number: data.punch_number
  };
  
  setSessionData(prev => ({
    ...prev,
    punches: [...prev.punches, newPunch],
    totalPunches: prev.totalPunches + 1,
    maxForce: Math.max(prev.maxForce, data.force)
  }));
  
  // אנימציה חזקה למכה
  triggerPunchAnimation(data.sensor);
};

const handleSensorStatus = (data) => {
  console.log('📊 Sensor Status:', data);
  // עדכון סטטוס המכשיר
  // ניתן להוסיף UI אלמנטים לבדיקת חיבור, זיכרון, וכו'
};

const disconnectSensor = async () => {
  try {
    if (isConnected) {
      await BluetoothSerial.disconnect();
    }
    
    setIsConnected(false);
    setIsSimulating(false);
    setConnectionStatus('DISCONNECTED');
    setDevice(null);
    
    // עצירת כל האזנה
    BluetoothSerial.removeAllListeners('data');
    BluetoothSerial.removeAllListeners('error');
    
    console.log('🔴 Disconnected from sensor');
    
  } catch (error) {
    console.log('Disconnect error:', error);
  }
};

const addPunchToSession = (sensorNum, zone, force) => {
  const newPunch = {
    timestamp: Date.now(),
    sensor: sensorNum,
    zone: zone,
    force: force,
    combined_force: force * 1.1,
    bpm: Math.round(Math.random() * 30 + 140), // נחישב BPM אמיתי בהמשך
    punch_number: sensorData.total_punches
  };
  
  setSessionData(prev => ({
    ...prev,
    punches: [...prev.punches, newPunch],
    totalPunches: prev.totalPunches + 1,
    maxForce: Math.max(prev.maxForce, force)
  }));
};

// פונקציה לשליחת פקודות לחיישן
const sendCommandToSensor = async (command) => {
  try {
    if (isConnected && !isSimulating) {
      await BluetoothSerial.write(command);
      console.log('📤 Sent command:', command);
    }
  } catch (error) {
    console.log('❌ Send command error:', error);
  }
};

// לכיול מחדש של החיישן
const recalibrateSensor = () => {
  Alert.alert(
    'RECALIBRATE SENSOR',
    'This will reset sensor baseline.\nMake sure the punching bag is still.',
    [
      { text: 'CANCEL', style: 'cancel' },
      { text: 'CALIBRATE', onPress: () => {
        sendCommandToSensor('calibrate');
        Alert.alert('CALIBRATING', 'Keep the bag still for 5 seconds...');
      }}
    ]
  );
};

// איפוס נתוני אימון
const resetTrainingSession = () => {
  Alert.alert(
    'RESET SESSION',
    'This will clear all punch data.\nAre you sure?',
    [
      { text: 'CANCEL', style: 'cancel' },
      { text: 'RESET', onPress: () => {
        sendCommandToSensor('reset_session');
        setSensorData(prev => ({
          ...prev,
          sensor1: { ...prev.sensor1, punches: 0, max: 0 },
          sensor2: { ...prev.sensor2, punches: 0, max: 0 },
          total_punches: 0
        }));
        setSessionData({
          punches: [],
          startTime: Date.now(),
          totalPunches: 0,
          maxForce: 0
        });
        trainingStartTime.current = Date.now();
      }}
    ]
  );
};