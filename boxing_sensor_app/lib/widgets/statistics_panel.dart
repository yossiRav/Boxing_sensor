import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:fl_chart/fl_chart.dart';
import '../providers/sensor_provider.dart';

class StatisticsPanel extends StatelessWidget {
  const StatisticsPanel({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Consumer<SensorProvider>(
      builder: (context, provider, child) {
        return SingleChildScrollView(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            children: [
              // Statistics cards
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  _buildStatCard('Total Punches', provider.totalPunches.toString(), Icons.sports_martial_arts),
                  _buildStatCard('Max Force', '${provider.maxForce.toStringAsFixed(1)} N', Icons.trending_up),
                  _buildStatCard('Avg Force', '${provider.averageForce.toStringAsFixed(1)} N', Icons.analytics),
                  _buildStatCard('Session Time', _formatDuration(provider.sessionDuration), Icons.timer),
                ],
              ),
              const SizedBox(height: 24),
              
              // Force distribution chart
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Force Distribution',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 16),
                      SizedBox(
                        height: 200,
                        child: _buildForceDistributionChart(provider),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),
              
              // Zone analysis
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Zone Analysis',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 16),
                      _buildZoneAnalysis(provider),
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

  Widget _buildStatCard(String title, String value, IconData icon) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 32, color: Colors.red[400]),
            const SizedBox(height: 8),
            Text(
              value,
              style: const TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              title,
              style: const TextStyle(
                fontSize: 12,
                color: Colors.grey,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildForceDistributionChart(SensorProvider provider) {
    if (provider.punchHistory.isEmpty) {
      return const Center(child: Text('No punch data available'));
    }

    // Group punches by force ranges
    Map<String, int> forceRanges = {
      '0-1 N': 0,
      '1-2 N': 0,
      '2-3 N': 0,
      '3-4 N': 0,
      '4+ N': 0,
    };

    for (var punch in provider.punchHistory) {
      if (punch.force < 1) {
        forceRanges['0-1 N'] = forceRanges['0-1 N']! + 1;
      } else if (punch.force < 2) {
        forceRanges['1-2 N'] = forceRanges['1-2 N']! + 1;
      } else if (punch.force < 3) {
        forceRanges['2-3 N'] = forceRanges['2-3 N']! + 1;
      } else if (punch.force < 4) {
        forceRanges['3-4 N'] = forceRanges['3-4 N']! + 1;
      } else {
        forceRanges['4+ N'] = forceRanges['4+ N']! + 1;
      }
    }

    return BarChart(
      BarChartData(
        alignment: BarChartAlignment.spaceAround,
        maxY: forceRanges.values.reduce((a, b) => a > b ? a : b).toDouble() * 1.2,
        barTouchData: BarTouchData(enabled: false),
        titlesData: FlTitlesData(
          show: true,
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              getTitlesWidget: (value, meta) {
                const titles = ['0-1', '1-2', '2-3', '3-4', '4+'];
                if (value.toInt() >= 0 && value.toInt() < titles.length) {
                  return Text(titles[value.toInt()]);
                }
                return const Text('');
              },
            ),
          ),
          leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        ),
        borderData: FlBorderData(show: false),
        barGroups: forceRanges.values.toList().asMap().entries.map((entry) {
          return BarChartGroupData(
            x: entry.key,
            barRods: [
              BarChartRodData(
                toY: entry.value.toDouble(),
                color: Colors.red[400],
                width: 20,
                borderRadius: BorderRadius.circular(4),
              ),
            ],
          );
        }).toList(),
      ),
    );
  }

  Widget _buildZoneAnalysis(SensorProvider provider) {
    if (provider.punchHistory.isEmpty) {
      return const Text('No data available');
    }

    int upperPunches = provider.punchHistory.where((p) => p.zone == 'Upper').length;
    int lowerPunches = provider.punchHistory.where((p) => p.zone == 'Lower').length;
    
    double upperAvg = 0.0;
    double lowerAvg = 0.0;

    if (upperPunches > 0) {
      upperAvg = provider.punchHistory
          .where((p) => p.zone == 'Upper')
          .map((p) => p.force)
          .reduce((a, b) => a + b) / upperPunches;
    }

    if (lowerPunches > 0) {
      lowerAvg = provider.punchHistory
          .where((p) => p.zone == 'Lower')
          .map((p) => p.force)
          .reduce((a, b) => a + b) / lowerPunches;
    }

    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: _buildZoneCard('Upper Zone', upperPunches, upperAvg, Colors.blue),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: _buildZoneCard('Lower Zone', lowerPunches, lowerAvg, Colors.orange),
            ),
          ],
        ),
        const SizedBox(height: 16),
        LinearProgressIndicator(
          value: (upperPunches + lowerPunches) > 0 ? upperPunches / (upperPunches + lowerPunches) : 0,
          backgroundColor: Colors.orange[200],
          valueColor: AlwaysStoppedAnimation<Color>(Colors.blue),
        ),
        const SizedBox(height: 8),
        Text(
          (upperPunches + lowerPunches) > 0 
              ? 'Upper: ${(upperPunches / (upperPunches + lowerPunches) * 100).toStringAsFixed(1)}% | '
                'Lower: ${(lowerPunches / (upperPunches + lowerPunches) * 100).toStringAsFixed(1)}%'
              : 'No data available',
          style: const TextStyle(fontSize: 12, color: Colors.grey),
        ),
      ],
    );
  }

  Widget _buildZoneCard(String title, int punches, double avgForce, Color color) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Column(
        children: [
          Text(
            title,
            style: TextStyle(
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            punches.toString(),
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
          Text(
            'punches',
            style: TextStyle(
              fontSize: 12,
              color: color.withOpacity(0.7),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '${avgForce.toStringAsFixed(1)} N avg',
            style: TextStyle(
              fontSize: 14,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  String _formatDuration(Duration duration) {
    String twoDigits(int n) => n.toString().padLeft(2, '0');
    String twoDigitMinutes = twoDigits(duration.inMinutes.remainder(60));
    String twoDigitSeconds = twoDigits(duration.inSeconds.remainder(60));
    return '${twoDigits(duration.inHours)}:$twoDigitMinutes:$twoDigitSeconds';
  }
}