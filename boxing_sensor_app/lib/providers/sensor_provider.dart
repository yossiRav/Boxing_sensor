import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/foundation.dart';
import 'package:flutter_bluetooth_serial/flutter_bluetooth_serial.dart';
import '../models/sensor_data.dart';

class SensorProvider with ChangeNotifier {
  BluetoothConnection? _connection;
  StreamSubscription<Uint8List>? _dataSubscription;
  
  bool _isConnected = false;
  bool _isConnecting = false;
  String _connectionStatus = 'Disconnected';
  
  SensorData? _currentSensorData;
  List<PunchEvent> _punchHistory = [];
  List<SensorData> _dataHistory = [];
  String _rawDataBuffer = '';
  
  // Statistics
  double _maxForce = 0.0;
  double _averageForce = 0.0;
  int _totalPunches = 0;
  DateTime? _sessionStartTime;
  
  // Getters
  bool get isConnected => _isConnected;
  bool get isConnecting => _isConnecting;
  String get connectionStatus => _connectionStatus;
  SensorData? get currentSensorData => _currentSensorData;
  List<PunchEvent> get punchHistory => _punchHistory;
  List<SensorData> get dataHistory => _dataHistory;
  double get maxForce => _maxForce;
  double get averageForce => _averageForce;
  int get totalPunches => _totalPunches;
  DateTime? get sessionStartTime => _sessionStartTime;
  
  Duration get sessionDuration {
    if (_sessionStartTime == null) return Duration.zero;
    return DateTime.now().difference(_sessionStartTime!);
  }

Future<List<BluetoothDevice>> getPairedDevices() async {
  try {
    List<BluetoothDevice> devices = await FlutterBluetoothSerial.instance.getBondedDevices();
    return devices;
  } catch (e) {
    debugPrint('Error getting paired devices: $e');
    return [];
  }
}

  Future<bool> connectToDevice(BluetoothDevice device) async {
    if (_isConnecting) return false;
    
    _isConnecting = true;
    _connectionStatus = 'Connecting...';
    notifyListeners();
    
    try {
      _connection = await BluetoothConnection.toAddress(device.address);
      _isConnected = true;
      _isConnecting = false;
      _connectionStatus = 'Connected to ${device.name}';
      _sessionStartTime = DateTime.now();
      
      _startListening();
      notifyListeners();
      return true;
      
    } catch (e) {
      _isConnecting = false;
      _connectionStatus = 'Connection Failed';
      debugPrint('Connection error: $e');
      notifyListeners();
      return false;
    }
  }

  void _startListening() {
    _dataSubscription = _connection?.input?.listen(
      _onDataReceived,
      onError: (error) {
        debugPrint('Bluetooth error: $error');
        disconnect();
      },
      onDone: () {
        debugPrint('Bluetooth connection closed');
        disconnect();
      },
    );
  }

  void _onDataReceived(Uint8List data) {
    String receivedString = String.fromCharCodes(data);
    _rawDataBuffer += receivedString;
    
    // Process complete JSON lines
    List<String> lines = _rawDataBuffer.split('\n');
    _rawDataBuffer = lines.removeLast(); // Keep incomplete line in buffer
    
    for (String line in lines) {
      line = line.trim();
      if (line.startsWith('{') && line.endsWith('}')) {
        _processJsonData(line);
      }
    }
  }

  void _processJsonData(String jsonString) {
    try {
      Map<String, dynamic> data = json.decode(jsonString);
      
      // Check if it's a punch event
      if (data.containsKey('event') && data['event'] == 'punch') {
        _processPunchEvent(data);
      } 
      // Check if it's session data
      else if (data.containsKey('session_id')) {
        _processSensorData(data);
      }
      
    } catch (e) {
      debugPrint('JSON parse error: $e');
    }
  }

  void _processSensorData(Map<String, dynamic> data) {
    _currentSensorData = SensorData.fromJson(data);
    _dataHistory.add(_currentSensorData!);
    
    // Keep only last 500 data points for performance
    if (_dataHistory.length > 500) {
      _dataHistory.removeAt(0);
    }
    
    notifyListeners();
  }

  void _processPunchEvent(Map<String, dynamic> data) {
    PunchEvent punch = PunchEvent.fromJson(data);
    _punchHistory.add(punch);
    
    // Update statistics
    _totalPunches++;
    if (punch.force > _maxForce) {
      _maxForce = punch.force;
    }
    
    // Calculate average force
    if (_punchHistory.isNotEmpty) {
      double totalForce = _punchHistory.fold(0.0, (sum, p) => sum + p.force);
      _averageForce = totalForce / _punchHistory.length;
    }
    
    // Keep only last 100 punches for performance
    if (_punchHistory.length > 100) {
      _punchHistory.removeAt(0);
    }
    
    notifyListeners();
  }

  void disconnect() {
    _dataSubscription?.cancel();
    _connection?.close();
    _connection = null;
    _isConnected = false;
    _isConnecting = false;
    _connectionStatus = 'Disconnected';
    notifyListeners();
  }

  void resetSession() {
    _punchHistory.clear();
    _dataHistory.clear();
    _maxForce = 0.0;
    _averageForce = 0.0;
    _totalPunches = 0;
    _sessionStartTime = DateTime.now();
    _currentSensorData = null;
    notifyListeners();
  }

  @override
  void dispose() {
    disconnect();
    super.dispose();
  }
  Future<bool> connectToBoxingSensorDirect() async {
  if (_isConnecting) return false;
  
  _isConnecting = true;
  _connectionStatus = 'Searching for BoxingSensor_01...';
  notifyListeners();
  
  try {
    // Get all available devices (not just bonded)
    List<BluetoothDevice> devices = await FlutterBluetoothSerial.instance.getBondedDevices();
    
    // Look for our boxing sensor by name
    BluetoothDevice? boxingSensor;
    for (BluetoothDevice device in devices) {
      if (device.name != null && device.name!.contains("BoxingSensor_01")) {
        boxingSensor = device;
        break;
      }
    }
    
    if (boxingSensor == null) {
      _isConnecting = false;
      _connectionStatus = 'BoxingSensor_01 not found. Please pair it first.';
      notifyListeners();
      return false;
    }
    
    _connectionStatus = 'Connecting to ${boxingSensor.name}...';
    notifyListeners();
    
    _connection = await BluetoothConnection.toAddress(boxingSensor.address);
    _isConnected = true;
    _isConnecting = false;
    _connectionStatus = 'Connected to ${boxingSensor.name}';
    _sessionStartTime = DateTime.now();
    
    _startListening();
    notifyListeners();
    return true;
    
  } catch (e) {
    _isConnecting = false;
    _connectionStatus = 'Connection Failed: ${e.toString()}';
    debugPrint('Connection error: $e');
    notifyListeners();
    return false;
  }
}
} 