class SensorData {
  final String sessionId;
  final double upperPunch;
  final double lowerPunch;
  final int totalPunches;
  final int uptime;
  final DateTime timestamp;

  SensorData({
    required this.sessionId,
    required this.upperPunch,
    required this.lowerPunch,
    required this.totalPunches,
    required this.uptime,
    required this.timestamp,
  });

  factory SensorData.fromJson(Map<String, dynamic> json) {
    return SensorData(
      sessionId: json['session_id'] ?? '',
      upperPunch: (json['upper_punch'] ?? 0.0).toDouble(),
      lowerPunch: (json['lower_punch'] ?? 0.0).toDouble(),
      totalPunches: json['total_punches'] ?? 0,
      uptime: json['uptime'] ?? 0,
      timestamp: DateTime.now(),
    );
  }
}

class PunchEvent {
  final String event;
  final int sensor;
  final String zone;
  final double force;
  final double combinedForce;
  final int timestamp;
  final int bpm;
  final DateTime receivedAt;

  PunchEvent({
    required this.event,
    required this.sensor,
    required this.zone,
    required this.force,
    required this.combinedForce,
    required this.timestamp,
    required this.bpm,
    required this.receivedAt,
  });

  factory PunchEvent.fromJson(Map<String, dynamic> json) {
    return PunchEvent(
      event: json['event'] ?? 'punch',
      sensor: json['sensor'] ?? 0,
      zone: json['zone'] ?? 'Unknown',
      force: (json['force'] ?? 0.0).toDouble(),
      combinedForce: (json['combined_force'] ?? 0.0).toDouble(),
      timestamp: json['timestamp'] ?? 0,
      bpm: json['bpm'] ?? 0,
      receivedAt: DateTime.now(),
    );
  }
}