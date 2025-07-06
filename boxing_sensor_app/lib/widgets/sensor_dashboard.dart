import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:fl_chart/fl_chart.dart';
import '../providers/sensor_provider.dart';

class SensorDashboard extends StatelessWidget {
  const SensorDashboard({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Consumer<SensorProvider>(
      builder: (context, provider, child) {
        if (!provider.isConnected) {
          return const Center(
            child: Text('Connect to sensor to view live data'),
          );
        }

        return SingleChildScrollView(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            children: [
              // Real-time force indicators
              Row(
                children: [
                  Expanded(
                    child: _buildForceCard(
                      'Upper Zone',
                      provider.currentSensorData?.upperPunch ?? 0.0,
                      Colors.blue,
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: _buildForceCard(
                      'Lower Zone',
                      provider.currentSensorData?.lowerPunch ?? 0.0,
                      Colors.orange,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              
              // Force history chart
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Force History',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 16),
                      SizedBox(
                        height: 200,
                        child: _buildForceChart(provider),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),
              
              // Recent punches
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Recent Punches',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 16),
                      ...provider.punchHistory.take(5).map(
                        (punch) => _buildPunchTile(punch),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildForceCard(String title, double value, Color color) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          children: [
            Text(
              title,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            CircularProgressIndicator(
              value: (value / 5.0).clamp(0.0, 1.0), // Assuming max 5.0 force
              backgroundColor: Colors.grey[300],
              valueColor: AlwaysStoppedAnimation<Color>(color),
              strokeWidth: 8,
            ),
            const SizedBox(height: 8),
            Text(
              value.toStringAsFixed(2),
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildForceChart(SensorProvider provider) {
    if (provider.dataHistory.isEmpty) {
      return const Center(child: Text('No data available'));
    }

    return LineChart(
      LineChartData(
        gridData: const FlGridData(show: true),
        titlesData: const FlTitlesData(show: false),
        borderData: FlBorderData(show: true),
        lineBarsData: [
          LineChartBarData(
            spots: provider.dataHistory.asMap().entries.map((entry) {
              return FlSpot(entry.key.toDouble(), entry.value.upperPunch);
            }).toList(),
            isCurved: true,
            color: Colors.blue,
            barWidth: 2,
            dotData: const FlDotData(show: false),
          ),
          LineChartBarData(
            spots: provider.dataHistory.asMap().entries.map((entry) {
              return FlSpot(entry.key.toDouble(), entry.value.lowerPunch);
            }).toList(),
            isCurved: true,
            color: Colors.orange,
            barWidth: 2,
            dotData: const FlDotData(show: false),
          ),
        ],
      ),
    );
  }

  Widget _buildPunchTile(punch) {
    return ListTile(
      leading: CircleAvatar(
        backgroundColor: punch.zone == 'Upper' ? Colors.blue : Colors.orange,
        child: Text(punch.sensor.toString()),
      ),
      title: Text('${punch.zone} Zone'),
      subtitle: Text('Force: ${punch.force.toStringAsFixed(2)} N'),
      trailing: Text(
        'BPM: ${punch.bpm}',
        style: const TextStyle(fontWeight: FontWeight.bold),
      ),
    );
  }
}