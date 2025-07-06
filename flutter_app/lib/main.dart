import 'package:flutter/material.dart';
import 'package:flutter_bluetooth_serial_ble/flutter_bluetooth_serial_ble.dart';
import 'dart:convert';
import 'dart:async';

void main() => runApp(const MyApp());

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      home: BluetoothApp(),
      debugShowCheckedModeBanner: false,
    );
  }
}

class BluetoothApp extends StatefulWidget {
  const BluetoothApp({super.key});

  @override
  _BluetoothAppState createState() => _BluetoothAppState();
}

class _BluetoothAppState extends State<BluetoothApp> {
  BluetoothConnection? connection;
  String statusMessage = "לא מחובר";
  Map<String, dynamic> latestStatus = {};
  Map<String, dynamic> latestExtraStatus = {};
  List<Map<String, dynamic>> punchEvents = [];
  List<BluetoothDevice> devices = [];
  bool isScanning = false;

  @override
  void initState() {
    super.initState();
    FlutterBluetoothSerial.instance.requestEnable();
  }

  void scanDevices() async {
    setState(() {
      isScanning = true;
      devices.clear();
    });
    try {
      final stream = FlutterBluetoothSerial.instance.startDiscovery();
      await for (var discoveryResult in stream) {
        setState(() {
          devices.add(discoveryResult.device);
        });
      }
    } catch (e) {
      setState(() {
        statusMessage = "שגיאת סריקה: $e";
      });
    } finally {
      setState(() {
        isScanning = false;
      });
    }
  }

  void connectToDevice(String address) async {
    try {
      setState(() {
        statusMessage = "מתחבר ל-BoxingSensor_01...";
      });
      connection = await BluetoothConnection.toAddress(address, type: BluetoothConnectionType.classic);
      setState(() {
        statusMessage = "מחובר ל-BoxingSensor_01!";
      });

      connection!.input!.listen((data) {
        String jsonString = String.fromCharCodes(data).trim();
        try {
          Map<String, dynamic> jsonData = jsonDecode(jsonString);
          setState(() {
            if (jsonData.containsKey('session_id')) {
              latestStatus = jsonData;
            } else if (jsonData.containsKey('status') && jsonData['status'] == 'running') {
              latestExtraStatus = jsonData;
            } else if (jsonData.containsKey('event') && jsonData['event'] == 'punch') {
              punchEvents.add(jsonData);
              if (punchEvents.length > 10) {
                punchEvents.removeAt(0);
              }
            }
          });
        } catch (e) {
          setState(() {
            statusMessage = "שגיאת JSON: $e";
          });
        }
      }).onDone(() {
        setState(() {
          statusMessage = "חיבור נותק";
        });
      });
    } catch (e) {
      setState(() {
        statusMessage = "שגיאת חיבור: $e";
      });
    }
  }

  void sendCommand(String command) {
    if (connection != null && connection!.isConnected) {
      connection!.output.add(ascii.encode('$command\n'));
      setState(() {
        statusMessage = "נשלחה פקודה: $command";
      });
    } else {
      setState(() {
        statusMessage = "שגיאה: לא מחובר לחיישן";
      });
    }
  }

  @override
  void dispose() {
    connection?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("חיבור ל-BoxingSensor_01"),
      ),
      body: SingleChildScrollView(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(8.0),
              child: Text(
                statusMessage,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                ElevatedButton(
                  onPressed: () => sendCommand("RESET"),
                  child: const Text("אפס אימון"),
                ),
                const SizedBox(width: 10),
                ElevatedButton(
                  onPressed: () => sendCommand("CALIBRATE"),
                  child: const Text("כיול מחדש"),
                ),
              ],
            ),
            ElevatedButton(
              onPressed: isScanning ? null : scanDevices,
              child: Text(isScanning ? "סורק..." : "סרוק התקני Bluetooth"),
            ),
            if (devices.isNotEmpty)
              Padding(
                padding: const EdgeInsets.all(8.0),
                child: Column(
                  children: devices.map((device) {
                    return ListTile(
                      title: Text(device.name ?? "מכשיר לא ידוע"),
                      subtitle: Text(device.address),
                      onTap: () => connectToDevice(device.address),
                    );
                  }).toList(),
                ),
              ),
            if (latestStatus.isNotEmpty)
              Padding(
                padding: const EdgeInsets.all(8.0),
                child: DataTable(
                  columns: const [
                    DataColumn(label: Text('שדה')),
                    DataColumn(label: Text('ערך')),
                  ],
                  rows: [
                    DataRow(cells: [
                      const DataCell(Text('מזהה סשן')),
                      DataCell(Text(latestStatus['session_id']?.toString() ?? '')),
                    ]),
                    DataRow(cells: [
                      const DataCell(Text('מכות עליונות')),
                      DataCell(Text(latestStatus['upper_punch']?.toString() ?? '')),
                    ]),
                    DataRow(cells: [
                      const DataCell(Text('מכות תחתונות')),
                      DataCell(Text(latestStatus['lower_punch']?.toString() ?? '')),
                    ]),
                    DataRow(cells: [
                      const DataCell(Text('סה"כ מכות')),
                      DataCell(Text(latestStatus['total_punches']?.toString() ?? '')),
                    ]),
                    DataRow(cells: [
                      const DataCell(Text('זמן פעילות')),
                      DataCell(Text(latestStatus['uptime']?.toString() ?? '')),
                    ]),
                  ],
                ),
              ),
            if (latestExtraStatus.isNotEmpty)
              Padding(
                padding: const EdgeInsets.all(8.0),
                child: DataTable(
                  columns: const [
                    DataColumn(label: Text('שדה')),
                    DataColumn(label: Text('ערך')),
                  ],
                  rows: [
                    DataRow(cells: [
                      const DataCell(Text('סטטוס מערכת')),
                      DataCell(Text(latestExtraStatus['status']?.toString() ?? '')),
                    ]),
                    DataRow(cells: [
                      const DataCell(Text('מכות עליונות')),
                      DataCell(Text(latestExtraStatus['upper_count']?.toString() ?? '')),
                    ]),
                    DataRow(cells: [
                      const DataCell(Text('מכות תחתונות')),
                      DataCell(Text(latestExtraStatus['lower_count']?.toString() ?? '')),
                    ]),
                    DataRow(cells: [
                      const DataCell(Text('סה"כ מכות')),
                      DataCell(Text(latestExtraStatus['total_punches']?.toString() ?? '')),
                    ]),
                    DataRow(cells: [
                      const DataCell(Text('סף זיהוי')),
                      DataCell(Text(latestExtraStatus['threshold']?.toString() ?? '')),
                    ]),
                  ],
                ),
              ),
            const Padding(
              padding: EdgeInsets.all(8.0),
              child: Text(
                "אירועי מכות אחרונים",
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ),
            ListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: punchEvents.length,
              itemBuilder: (context, index) {
                var event = punchEvents[index];
                return ListTile(
                  title: Text("מכה ב-${event['zone']} (חיישן ${event['sensor']})"),
                  subtitle: Text(
                      "עוצמה: ${event['force']}, BPM: ${event['bpm']?.toString() ?? 'N/A'}, זמן: ${event['timestamp']}"),
                );
              },
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => connectToDevice("00:4B:12:3B:16:62"),
        child: const Icon(Icons.bluetooth),
      ),
    );
  }
}