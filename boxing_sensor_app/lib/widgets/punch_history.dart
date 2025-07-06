import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/sensor_provider.dart';

class PunchHistory extends StatelessWidget {
  const PunchHistory({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Consumer<SensorProvider>(
      builder: (context, provider, child) {
        if (provider.punchHistory.isEmpty) {
          return const Center(
            child: Text('No punch data available'),
          );
        }

        return ListView.builder(
          padding: const EdgeInsets.all(16.0),
          itemCount: provider.punchHistory.length,
          itemBuilder: (context, index) {
            final punch = provider.punchHistory[provider.punchHistory.length - 1 - index];
            return Card(
              margin: const EdgeInsets.only(bottom: 8.0),
              child: ListTile(
                leading: CircleAvatar(
                  backgroundColor: punch.zone == 'Upper' ? Colors.blue : Colors.orange,
                  child: Text(
                    punch.sensor.toString(),
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                ),
                title: Text('${punch.zone} Zone Punch'),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Force: ${punch.force.toStringAsFixed(2)} N'),
                    Text('Combined: ${punch.combinedForce.toStringAsFixed(2)} N'),
                    Text('Time: ${_formatTime(punch.receivedAt)}'),
                  ],
                ),
                trailing: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.favorite, color: Colors.red, size: 16),
                    Text(
                      '${punch.bpm} BPM',
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  String _formatTime(DateTime time) {
    return '${time.hour.toString().padLeft(2, '0')}:'
           '${time.minute.toString().padLeft(2, '0')}:'
           '${time.second.toString().padLeft(2, '0')}';
  }
}
