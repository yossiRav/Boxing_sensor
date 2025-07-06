import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/sensor_provider.dart';
import '../widgets/connection_panel.dart';
import '../widgets/sensor_dashboard.dart';
import '../widgets/punch_history.dart';
import '../widgets/statistics_panel.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({Key? key}) : super(key: key);

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with TickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Boxing Sensor Pro',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.red[900],
        elevation: 0,
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(icon: Icon(Icons.dashboard), text: 'Dashboard'),
            Tab(icon: Icon(Icons.sports_martial_arts), text: 'Live Data'),
            Tab(icon: Icon(Icons.history), text: 'History'),
            Tab(icon: Icon(Icons.analytics), text: 'Stats'),
          ],
        ),
        actions: [
          Consumer<SensorProvider>(
            builder: (context, provider, child) {
              return IconButton(
                icon: Icon(
                  provider.isConnected ? Icons.bluetooth_connected : Icons.bluetooth,
                  color: provider.isConnected ? Colors.green : Colors.white,
                ),
                onPressed: () {
                  if (provider.isConnected) {
                    provider.disconnect();
                  } else {
                    _showConnectionDialog(context);
                  }
                },
              );
            },
          ),
        ],
      ),
      body: TabBarView(
        controller: _tabController,
        children: const [
          ConnectionPanel(),
          SensorDashboard(),
          PunchHistory(),
          StatisticsPanel(),
        ],
      ),
      floatingActionButton: Consumer<SensorProvider>(
        builder: (context, provider, child) {
          if (!provider.isConnected) return const SizedBox();
          
          return FloatingActionButton(
            onPressed: () {
              _showResetDialog(context, provider);
            },
            backgroundColor: Colors.red[700],
            child: const Icon(Icons.refresh),
          );
        },
      ),
    );
  }

  void _showConnectionDialog(BuildContext context) async {
    final provider = Provider.of<SensorProvider>(context, listen: false);
    final devices = await provider.getPairedDevices();
    
    if (!mounted) return;
    
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Connect to Boxing Sensor'),
        content: SizedBox(
          width: double.maxFinite,
          height: 300,
          child: devices.isEmpty
              ? const Center(child: Text('No paired devices found'))
              : ListView.builder(
                  itemCount: devices.length,
                  itemBuilder: (context, index) {
                    final device = devices[index];
                    return ListTile(
                      leading: const Icon(Icons.bluetooth),
                      title: Text(device.name ?? 'Unknown Device'),
                      subtitle: Text(device.address),
                      onTap: () async {
                        Navigator.pop(context);
                        await provider.connectToDevice(device);
                      },
                    );
                  },
                ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
        ],
      ),
    );
  }

  void _showResetDialog(BuildContext context, SensorProvider provider) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Reset Session'),
        content: const Text('This will clear all punch data and statistics. Continue?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              provider.resetSession();
              Navigator.pop(context);
            },
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Reset'),
          ),
        ],
      ),
    );
  }
}