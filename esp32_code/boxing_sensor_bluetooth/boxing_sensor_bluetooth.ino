/*
 * Boxing Sensor with Bluetooth - Optimized with Dynamic Calibration
 * ESP32 + 2x MPU6050 + Bluetooth Classic
 * 
 * Detects only real punches with automatic recalibration for position changes
 * Improved resolution for accurate punch detection
 * 
 * Sensor placement on the punching bag:
 * Sensor 1: Upper (head/body) - SDA=21, SCL=22, address=0x68
 * Sensor 2: Lower (heavy) - SDA=25, SCL=26, address=0x68
 * 
 * File: boxing_sensor_bluetooth.ino
 * Date: July 2025
 */

#include <Wire.h>
#include <BluetoothSerial.h>
#include <ArduinoJson.h>

// Bluetooth
BluetoothSerial SerialBT;
String device_name = "BoxingSensor_01";

// I2C pins
#define SDA1 21
#define SCL1 22
#define SDA2 25
#define SCL2 26

// Sensor addresses
#define MPU6050_ADDR1 0x68
#define MPU6050_ADDR2 0x68

// Two I2C buses
TwoWire I2C_1 = TwoWire(0);
TwoWire I2C_2 = TwoWire(1);

// Sensor data structure
struct SensorData {
    float current_punch;
    float max_punch;
    int punch_count;
    float baseline_x, baseline_y, baseline_z;
    bool punch_detected;
    unsigned long last_detection;
    unsigned long last_punch_time;
    float moving_avg_x, moving_avg_y, moving_avg_z;
    int stable_count;
    unsigned long last_recalibration;
    float stability_buffer[10]; // 10 samples for stability
    int stability_index;
    bool is_stable;
    float current_stability_baseline_x, current_stability_baseline_y, current_stability_baseline_z;
    unsigned long stability_start_time;
    float acceleration_peak;
    bool in_punch_event;
    unsigned long punch_event_start;
    float variance_threshold;
    unsigned long last_significant_motion;
};

SensorData sensor1, sensor2;

// Global variables
unsigned long training_start_time = 0;
int total_punches = 0;
String session_id = "";

// Configuration
float PUNCH_THRESHOLD = 1.0;
const unsigned long COOLDOWN_BETWEEN_PUNCHES = 100; // 100ms = 10 punches/second
const unsigned long SENSOR_RESET_TIME = 80;         // Extended to 80ms to avoid double-counting
const unsigned long STABLE_POSITION_TIMEOUT = 2000;
const int STABILITY_REQUIRED_SAMPLES = 10;
const float STABILITY_VARIANCE_THRESHOLD = 0.015;
const unsigned long MIN_STABILITY_TIME = 500;
const unsigned long MOTION_COOLDOWN = 400;

// Adaptive learning
const int LEARNING_SAMPLE_SIZE = 10;
float learning_forces[LEARNING_SAMPLE_SIZE];
int learning_index = 0;
bool learning_complete = false;

// Data sending
unsigned long last_data_send = 0;
const unsigned long DATA_SEND_INTERVAL = 100;
unsigned long last_status_send = 0;
const unsigned long DATA_STATUS_INTERVAL = 1000;

// Function declarations
void resetSensorData(SensorData* sensor);
void initMPU6050(TwoWire* wire, const char* name, byte addr);
void readSensor(TwoWire* wire, SensorData* sensor, byte addr);
void updateStabilityTracking(SensorData* sensor, float ax, float ay, float az);
bool isCurrentlyStable(SensorData* sensor);
float calculateVariance(float* buffer, int size, float mean);
void updateMovingBaseline(SensorData* sensor, float ax, float ay, float az);
void detectPunch(SensorData* sensor);
void detectSmartPunch();
float calculateCombinedForce(int primary_sensor);
void adaptToUser(float force);
void calibrateSensor(TwoWire* wire, SensorData* sensor, const char* name, byte addr);
void sendDataToBluetooth();
void sendStatusToBluetooth();
void sendPunchEventToBluetooth(int sensor_num, String zone, float force, float combined_force, float bpm);
void handleBluetoothCommands();
void resetTraining();
void calibrateAllSensors();
void printStatus();
float roundFloat(float value, int decimals);

void setup() {
    Serial.begin(115200);
    delay(1000);
    
    Serial.println(F("Boxing Sensor - Optimized with Dynamic Calibration"));
    Serial.println(F("Initializing system..."));
    
    resetSensorData(&sensor1);
    resetSensorData(&sensor2);
    total_punches = 0;
    training_start_time = millis();
    session_id = "session_" + String(millis());
    
    Serial.println(F("Initializing I2C..."));
    I2C_1.begin(SDA1, SCL1, 100000);
    I2C_2.begin(SDA2, SCL2, 100000);
    
    Serial.printf("I2C_1: SDA=%d, SCL=%d (address 0x%02X)\n", SDA1, SCL1, MPU6050_ADDR1);
    Serial.printf("I2C_2: SDA=%d, SCL=%d (address 0x%02X)\n", SDA2, SCL2, MPU6050_ADDR2);
    
    delay(100);
    
    Serial.println(F("Initializing sensors..."));
    initMPU6050(&I2C_1, "Upper", MPU6050_ADDR1);
    initMPU6050(&I2C_2, "Lower", MPU6050_ADDR2);
    
    delay(500);
    
    Serial.println(F("Calibrating sensors..."));
    calibrateSensor(&I2C_1, &sensor1, "Upper", MPU6050_ADDR1);
    calibrateSensor(&I2C_2, &sensor2, "Lower", MPU6050_ADDR2);
    
    Serial.println(F("Starting Bluetooth..."));
    if (!SerialBT.begin(device_name)) {
        Serial.println(F("Bluetooth initialization failed"));
        return;
    }
    
    Serial.println(F("Bluetooth started successfully"));
    Serial.print(F("Device name: "));
    Serial.println(device_name);
    Serial.println(F("Waiting for app connection..."));
    
    Serial.println(F("System ready for training"));
    Serial.println(F("Activity log:"));
    Serial.println(F("================"));
}

void loop() {
    readSensor(&I2C_1, &sensor1, MPU6050_ADDR1);
    delay(2);
    readSensor(&I2C_2, &sensor2, MPU6050_ADDR2);
    
    detectPunch(&sensor1);
    detectPunch(&sensor2);
    detectSmartPunch();
    
    total_punches = sensor1.punch_count + sensor2.punch_count;
    
    sendDataToBluetooth();
    handleBluetoothCommands();
    
    static unsigned long last_status = 0;
    if (millis() - last_status > 3000) {
        printStatus();
        last_status = millis();
    }
    
    delay(5); // 200Hz sampling for better resolution
}

void resetSensorData(SensorData* sensor) {
    sensor->current_punch = 0.0;
    sensor->max_punch = 0.0;
    sensor->punch_count = 0;
    sensor->baseline_x = 0.0;
    sensor->baseline_y = 0.0;
    sensor->baseline_z = 0.0;
    sensor->punch_detected = false;
    sensor->last_detection = 0;
    sensor->last_punch_time = 0;
    sensor->moving_avg_x = 0.0;
    sensor->moving_avg_y = 0.0;
    sensor->moving_avg_z = 0.0;
    sensor->stable_count = 0;
    sensor->last_recalibration = 0;
    sensor->stability_index = 0;
    sensor->is_stable = false;
    sensor->current_stability_baseline_x = 0.0;
    sensor->current_stability_baseline_y = 0.0;
    sensor->current_stability_baseline_z = 0.0;
    sensor->stability_start_time = 0;
    sensor->acceleration_peak = 0.0;
    sensor->in_punch_event = false;
    sensor->punch_event_start = 0;
    sensor->variance_threshold = STABILITY_VARIANCE_THRESHOLD;
    sensor->last_significant_motion = 0;
    
    for (int i = 0; i < 10; i++) {
        sensor->stability_buffer[i] = 0.0;
    }
}

void initMPU6050(TwoWire* wire, const char* name, byte addr) {
    Serial.print(F("Initializing "));
    Serial.print(name);
    Serial.print(F(" (0x"));
    Serial.print(addr, HEX);
    Serial.print(F(")..."));
    
    wire->beginTransmission(addr);
    byte error = wire->endTransmission();
    
    if (error == 0) {
        Serial.println(F("Detected"));
        
        wire->beginTransmission(addr);
        wire->write(0x6B);
        wire->write(0);
        wire->endTransmission(true);
        delay(100);
        
        wire->beginTransmission(addr);
        wire->write(0x75);
        wire->endTransmission(false);
        wire->requestFrom(addr, 1, true);
        
        if (wire->available()) {
            byte whoami = wire->read();
            Serial.print(F("Sensor "));
            Serial.print(name);
            Serial.print(F(" connected (ID: 0x"));
            Serial.print(whoami, HEX);
            Serial.println(F(")"));
        }
    } else {
        Serial.print(F("Error "));
        Serial.print(error);
        Serial.println(F(" - Check wiring"));
    }
}

void readSensor(TwoWire* wire, SensorData* sensor, byte addr) {
    wire->beginTransmission(addr);
    wire->write(0x3B);
    byte error = wire->endTransmission(false);
    
    if (error != 0) {
        sensor->current_punch = 0.0;
        return;
    }
    
    wire->requestFrom(addr, 6, true);
    
    if (wire->available() >= 6) {
        int16_t ax = (wire->read() << 8) | wire->read();
        int16_t ay = (wire->read() << 8) | wire->read();
        int16_t az = (wire->read() << 8) | wire->read();
        
        float ax_g = ax / 16384.0;
        float ay_g = ay / 16384.0;
        float az_g = az / 16384.0;
        
        updateStabilityTracking(sensor, ax_g, ay_g, az_g);
        updateMovingBaseline(sensor, ax_g, ay_g, az_g);
        
        float diff_x = ax_g - sensor->current_stability_baseline_x;
        float diff_y = ay_g - sensor->current_stability_baseline_y;
        float diff_z = az_g - sensor->current_stability_baseline_z;
        
        float magnitude = sqrt(diff_x*diff_x + diff_y*diff_y + diff_z*diff_z);
        
        unsigned long current_time = millis();
        
        if (magnitude > PUNCH_THRESHOLD) {
            sensor->current_punch = magnitude;
            if (!sensor->in_punch_event) {
                sensor->in_punch_event = true;
                sensor->punch_event_start = current_time;
                sensor->acceleration_peak = magnitude;
            } else if (magnitude > sensor->acceleration_peak) {
                sensor->acceleration_peak = magnitude;
            }
            sensor->last_significant_motion = current_time;
        } else if (magnitude < PUNCH_THRESHOLD * 0.3 && sensor->in_punch_event) {
            if (current_time - sensor->punch_event_start > SENSOR_RESET_TIME) {
                sensor->in_punch_event = false;
                sensor->current_punch = sensor->acceleration_peak;
            } else {
                sensor->current_punch = magnitude;
            }
        } else {
            sensor->current_punch = magnitude;
        }
        
        if (sensor->current_punch > sensor->max_punch) {
            sensor->max_punch = sensor->current_punch;
        }
    } else {
        sensor->current_punch = 0.0;
    }
}

void updateStabilityTracking(SensorData* sensor, float ax, float ay, float az) {
    unsigned long current_time = millis();
    
    float total_magnitude = sqrt(ax*ax + ay*ay + az*az);
    
    sensor->stability_buffer[sensor->stability_index] = total_magnitude;
    sensor->stability_index = (sensor->stability_index + 1) % 10;
    
    float mean = 0;
    for (int i = 0; i < 10; i++) {
        mean += sensor->stability_buffer[i];
    }
    mean /= 10.0;
    
    float variance = calculateVariance(sensor->stability_buffer, 10, mean);
    
    bool currently_stable = (variance < sensor->variance_threshold);
    
    if (currently_stable && !sensor->is_stable) {
        sensor->is_stable = true;
        sensor->stability_start_time = current_time;
        sensor->current_stability_baseline_x = ax;
        sensor->current_stability_baseline_y = ay;
        sensor->current_stability_baseline_z = az;
        
        Serial.print(F("New stable position: ("));
        Serial.print(ax, 2);
        Serial.print(F(", "));
        Serial.print(ay, 2);
        Serial.print(F(", "));
        Serial.print(az, 2);
        Serial.println(F(")"));
    } else if (currently_stable && sensor->is_stable) {
        if ((current_time - sensor->stability_start_time) > MIN_STABILITY_TIME) {
            const float alpha = 0.005;
            sensor->current_stability_baseline_x = sensor->current_stability_baseline_x * (1 - alpha) + ax * alpha;
            sensor->current_stability_baseline_y = sensor->current_stability_baseline_y * (1 - alpha) + ay * alpha;
            sensor->current_stability_baseline_z = sensor->current_stability_baseline_z * (1 - alpha) + az * alpha;
        }
    } else if (!currently_stable && sensor->is_stable) {
        sensor->is_stable = false;
        sensor->last_significant_motion = current_time;
        Serial.println(F("Motion detected"));
    }
}

float calculateVariance(float* buffer, int size, float mean) {
    float variance = 0;
    for (int i = 0; i < size; i++) {
        variance += pow(buffer[i] - mean, 2);
    }
    return variance / size;
}

bool isCurrentlyStable(SensorData* sensor) {
    return sensor->is_stable && 
           (millis() - sensor->stability_start_time) > MIN_STABILITY_TIME &&
           (millis() - sensor->last_significant_motion) > MOTION_COOLDOWN;
}

void updateMovingBaseline(SensorData* sensor, float ax, float ay, float az) {
    unsigned long current_time = millis();
    
    if (isCurrentlyStable(sensor)) {
        sensor->stable_count++;
        
        if (sensor->stable_count > STABILITY_REQUIRED_SAMPLES && 
            (current_time - sensor->last_recalibration) > STABLE_POSITION_TIMEOUT) {
            sensor->baseline_x = sensor->current_stability_baseline_x;
            sensor->baseline_y = sensor->current_stability_baseline_y;
            sensor->baseline_z = sensor->current_stability_baseline_z;
            
            sensor->moving_avg_x = sensor->baseline_x;
            sensor->moving_avg_y = sensor->baseline_y;
            sensor->moving_avg_z = sensor->baseline_z;
            
            sensor->last_recalibration = current_time;
            sensor->stable_count = 0;
            
            Serial.println(F("Automatic recalibration - New position"));
        }
    } else {
        sensor->stable_count = 0;
    }
}

void detectPunch(SensorData* sensor) {
    unsigned long current_time = millis();
    
    bool can_detect_punch = !isCurrentlyStable(sensor) || 
                           (current_time - sensor->last_significant_motion) < MOTION_COOLDOWN;
    
    if (sensor->in_punch_event && 
        !sensor->punch_detected && 
        can_detect_punch &&
        (current_time - sensor->punch_event_start > SENSOR_RESET_TIME) &&
        (current_time - sensor->last_detection > COOLDOWN_BETWEEN_PUNCHES)) {
        
        sensor->punch_detected = true;
        sensor->last_detection = current_time;
    }
    
    if (!sensor->in_punch_event) {
        sensor->punch_detected = false;
    }
}

void detectSmartPunch() {
    static unsigned long last_smart_detection = 0;
    unsigned long current_time = millis();
    
    bool any_punch = sensor1.punch_detected || sensor2.punch_detected;
    
    if (any_punch && (current_time - last_smart_detection > COOLDOWN_BETWEEN_PUNCHES)) {
        float max_force = 0;
        int winning_sensor = 0;
        String winning_zone = "";
        
        if (sensor1.punch_detected && sensor1.current_punch > max_force && sensor1.current_punch > PUNCH_THRESHOLD) {
            max_force = sensor1.current_punch;
            winning_sensor = 1;
            winning_zone = "Upper";
        }
        
        if (sensor2.punch_detected && sensor2.current_punch > max_force && sensor2.current_punch > PUNCH_THRESHOLD) {
            max_force = sensor2.current_punch;
            winning_sensor = 2;
            winning_zone = "Lower";
        }
        
        if (winning_sensor > 0) {
            SensorData* winning_sensor_data = (winning_sensor == 1) ? &sensor1 : &sensor2;
            bool legitimate_punch = !isCurrentlyStable(winning_sensor_data) ||
                                   (current_time - winning_sensor_data->last_significant_motion) < MOTION_COOLDOWN;
            
            if (legitimate_punch) {
                if (winning_sensor == 1) {
                    sensor1.punch_count++;
                    sensor1.last_punch_time = current_time;
                } else {
                    sensor2.punch_count++;
                    sensor2.last_punch_time = current_time;
                }
                
                float combined_force = calculateCombinedForce(winning_sensor);
                
                static unsigned long last_punch_time_for_bpm = 0;
                unsigned long time_between_punches = current_time - last_punch_time_for_bpm;
                float bpm = 0;
                if (last_punch_time_for_bpm > 0 && time_between_punches > 0) {
                    bpm = 60000.0 / time_between_punches;
                }
                
                if (!learning_complete) {
                    adaptToUser(combined_force);
                }
                
                last_punch_time_for_bpm = current_time;
                
                Serial.print(F("Punch "));
                Serial.print(winning_zone);
                Serial.print(F(" #"));
                Serial.print((winning_sensor == 1 ? sensor1.punch_count : sensor2.punch_count));
                Serial.print(F(" Force: "));
                Serial.print(max_force, 2);
                Serial.print(F(" (Combined: "));
                Serial.print(combined_force, 2);
                Serial.print(F(")"));
                
                Serial.print(F(" ["));
                Serial.print(isCurrentlyStable(winning_sensor_data) ? F("Stable") : F("In motion"));
                Serial.print(F("]"));
                
                if (bpm > 0 && bpm < 300) {
                    Serial.print(F(" BPM: "));
                    Serial.print(bpm, 0);
                }
                
                if (!learning_complete) {
                    Serial.print(F(" [Learning "));
                    Serial.print(learning_index);
                    Serial.print(F("/"));
                    Serial.print(LEARNING_SAMPLE_SIZE);
                    Serial.print(F("]"));
                }
                
                Serial.print(F(" | Total: "));
                Serial.println(sensor1.punch_count + sensor2.punch_count);
                
                sendPunchEventToBluetooth(winning_sensor, winning_zone, max_force, combined_force, bpm);
                
                last_smart_detection = current_time;
            } else {
                Serial.println(F("Punch blocked - Sensor stable"));
            }
        }
    }
}

float calculateCombinedForce(int primary_sensor) {
    float primary_force = (primary_sensor == 1) ? sensor1.current_punch : sensor2.current_punch;
    float secondary_boost = (primary_sensor == 1) ? sensor2.current_punch * 0.2 : sensor1.current_punch * 0.2;
    return primary_force + secondary_boost;
}

void adaptToUser(float force) {
    if (learning_index < LEARNING_SAMPLE_SIZE) {
        learning_forces[learning_index++] = force;
        
        if (learning_index >= LEARNING_SAMPLE_SIZE) {
            float avg_force = 0;
            for (int i = 0; i < LEARNING_SAMPLE_SIZE; i++) {
                avg_force += learning_forces[i];
            }
            avg_force /= LEARNING_SAMPLE_SIZE;
            
            PUNCH_THRESHOLD = avg_force * 0.7;
            if (PUNCH_THRESHOLD < 0.5) PUNCH_THRESHOLD = 0.5;
            if (PUNCH_THRESHOLD > 2.0) PUNCH_THRESHOLD = 2.0;
            
            learning_complete = true;
            
            Serial.println(F("Learning completed"));
            Serial.print(F("New threshold: "));
            Serial.println(PUNCH_THRESHOLD, 2);
        }
    }
}

void calibrateSensor(TwoWire* wire, SensorData* sensor, const char* name, byte addr) {
    Serial.print(F("Calibrating "));
    Serial.print(name);
    Serial.print(F("..."));
    
    float ax_sum = 0, ay_sum = 0, az_sum = 0;
    int valid_readings = 0;
    const int CALIBRATION_SAMPLES = 50;
    
    for (int i = 0; i < CALIBRATION_SAMPLES; i++) {
        wire->beginTransmission(addr);
        wire->write(0x3B);
        if (wire->endTransmission(false) == 0) {
            wire->requestFrom(addr, 6, true);
            if (wire->available() >= 6) {
                int16_t ax = (wire->read() << 8) | wire->read();
                int16_t ay = (wire->read() << 8) | wire->read();
                int16_t az = (wire->read() << 8) | wire->read();
                
                ax_sum += ax / 16384.0;
                ay_sum += ay / 16384.0;
                az_sum += az / 16384.0;
                valid_readings++;
            }
        }
        delay(10);
    }
    
    if (valid_readings > 0) {
        sensor->baseline_x = ax_sum / valid_readings;
        sensor->baseline_y = ay_sum / valid_readings;
        sensor->baseline_z = az_sum / valid_readings;
        
        sensor->moving_avg_x = sensor->baseline_x;
        sensor->moving_avg_y = sensor->baseline_y;
        sensor->moving_avg_z = sensor->baseline_z;
        
        sensor->current_stability_baseline_x = sensor->baseline_x;
        sensor->current_stability_baseline_y = sensor->baseline_y;
        sensor->current_stability_baseline_z = sensor->baseline_z;
        
        Serial.print(F("Completed: ("));
        Serial.print(sensor->baseline_x, 2);
        Serial.print(F(", "));
        Serial.print(sensor->baseline_y, 2);
        Serial.print(F(", "));
        Serial.print(sensor->baseline_z, 2);
        Serial.println(F(")"));
    } else {
        Serial.println(F("Calibration failed"));
    }
}

void sendDataToBluetooth() {
    if (millis() - last_data_send < DATA_SEND_INTERVAL) return;
    
    StaticJsonDocument<128> doc;
    doc["session_id"] = session_id;
    doc["upper_punch"] = roundFloat(sensor1.current_punch, 2);
    doc["lower_punch"] = roundFloat(sensor2.current_punch, 2);
    doc["total_punches"] = total_punches;
    doc["uptime"] = millis() / 1000;
    
    String json;
    serializeJson(doc, json);
    SerialBT.println(json);
    
    last_data_send = millis();
}

void sendStatusToBluetooth() {
    if (millis() - last_status_send < DATA_STATUS_INTERVAL) return;
    
    StaticJsonDocument<128> doc;
    doc["status"] = "running";
    doc["upper_count"] = sensor1.punch_count;
    doc["lower_count"] = sensor2.punch_count;
    doc["total_punches"] = total_punches;
    doc["threshold"] = roundFloat(PUNCH_THRESHOLD, 2);
    
    String json;
    serializeJson(doc, json);
    SerialBT.println(json);
    
    last_status_send = millis();
}

void sendPunchEventToBluetooth(int sensor_num, String zone, float force, float combined_force, float bpm) {
    StaticJsonDocument<128> doc;
    doc["event"] = "punch";
    doc["sensor"] = sensor_num;
    doc["zone"] = zone;
    doc["force"] = roundFloat(force, 2);
    doc["combined_force"] = roundFloat(combined_force, 2);
    doc["timestamp"] = millis();
    if (bpm > 0 && bpm < 300) {
        doc["bpm"] = roundFloat(bpm, 0);
    }
    
    String json;
    serializeJson(doc, json);
    SerialBT.println(json);
}

void handleBluetoothCommands() {
    if (SerialBT.available()) {
        String command = SerialBT.readStringUntil('\n');
        command.trim();
        
        if (command == "RESET") {
            resetTraining();
        } else if (command == "CALIBRATE") {
            calibrateAllSensors();
        }
    }
}

void resetTraining() {
    resetSensorData(&sensor1);
    resetSensorData(&sensor2);
    total_punches = 0;
    training_start_time = millis();
    session_id = "session_" + String(millis());
    learning_index = 0;
    learning_complete = false;
    Serial.println(F("Training reset"));
}

void calibrateAllSensors() {
    Serial.println(F("Recalibrating sensors..."));
    calibrateSensor(&I2C_1, &sensor1, "Upper", MPU6050_ADDR1);
    calibrateSensor(&I2C_2, &sensor2, "Lower", MPU6050_ADDR2);
    Serial.println(F("Calibration completed"));
}

void printStatus() {
    Serial.println(F("System status:"));
    Serial.print(F("Upper sensor: "));
    Serial.print(sensor1.punch_count);
    Serial.print(F(" punches, Force: "));
    Serial.println(sensor1.current_punch, 2);
    
    Serial.print(F("Lower sensor: "));
    Serial.print(sensor2.punch_count);
    Serial.print(F(" punches, Force: "));
    Serial.println(sensor2.current_punch, 2);
    
    Serial.print(F("Total punches: "));
    Serial.println(total_punches);
    
    Serial.print(F("Detection threshold: "));
    Serial.println(PUNCH_THRESHOLD, 2);
}

float roundFloat(float value, int decimals) {
    float multiplier = pow(10.0, decimals);
    return round(value * multiplier) / multiplier;
}