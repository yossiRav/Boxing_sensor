/*
 * חיישן אגרוף בלוטות' - 2 חיישנים יציבים
 * ESP32 + 2x MPU6050 + Bluetooth Classic
 * 
 * מיקום חיישנים על השק:
 * חיישן 1: עליון (ראש/גוף) - SDA=21, SCL=22, כתובת=0x68
 * חיישן 2: תחתון (כבד) - SDA=25, SCL=26, כתובת=0x68
 * 
 * קובץ: boxing_sensor_bluetooth.ino
 * תאריך: יוני 2025
 * אלגוריתם פשוט ויציב
 */

#include <Wire.h>
#include "BluetoothSerial.h"
#include <ArduinoJson.h>

// בלוטות'
BluetoothSerial SerialBT;
String device_name = "BoxingSensor_01";

// פיני I2C לשני חיישנים
#define SDA1 21  // חיישן עליון
#define SCL1 22
#define SDA2 25  // חיישן תחתון
#define SCL2 26

// כתובות חיישנים - שניהם באותה כתובת (0x68)
#define MPU6050_ADDR1 0x68  // חיישן עליון (AD0=GND)
#define MPU6050_ADDR2 0x68  // חיישן תחתון (AD0=GND) - אותה כתובת!

// שני I2C buses
TwoWire I2C_1 = TwoWire(0);
TwoWire I2C_2 = TwoWire(1);

// מבנה נתונים לכל חיישן
struct SensorData {
    float current_punch;
    float max_punch;
    int punch_count;
    float baseline_x, baseline_y, baseline_z;
    bool punch_detected;
    unsigned long last_detection;
    unsigned long last_punch_time;
    
    // קליברציה דינמית - פשוטה
    float moving_avg_x, moving_avg_y, moving_avg_z;
    int stable_count;
    unsigned long last_recalibration;
};

SensorData sensor1; // עליון (ראש/גוף)
SensorData sensor2; // תחתון (כבד)

// משתנים גלובליים
unsigned long training_start_time = 0;
int total_punches = 0;
String session_id = "";

// הגדרות מעקב אגרופים - פשוטות ויציבות
float PUNCH_THRESHOLD = 0.8;
const unsigned long COOLDOWN_BETWEEN_PUNCHES = 120;  // 120ms = 8.3 מכות/שנייה
const unsigned long SENSOR_RESET_TIME = 50;         // 50ms = זמן מינימלי לזיהוי מכה חדשה

// למידה אוטומטית
const int LEARNING_SAMPLE_SIZE = 10;
float learning_forces[LEARNING_SAMPLE_SIZE];
int learning_index = 0;
bool learning_complete = false;

// משתנים לשליחת נתונים
unsigned long last_data_send = 0;
const unsigned long DATA_SEND_INTERVAL = 100; // שליחה כל 100ms
unsigned long last_status_send = 0;
const unsigned long STATUS_SEND_INTERVAL = 1000; // סטטוס כל שנייה

// הכרזות פונקציות
void resetSensorData(SensorData* sensor);
void initMPU6050(TwoWire* wire, const char* name, byte addr);
void readSensor(TwoWire* wire, SensorData* sensor, byte addr);
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
    
    Serial.println("=== חיישן אגרוף פשוט ויציב + בלוטות' ===");
    Serial.println("מאתחל מערכת...");
    
    // איפוס משתנים
    resetSensorData(&sensor1);
    resetSensorData(&sensor2);
    total_punches = 0;
    training_start_time = millis();
    session_id = "session_" + String(millis());
    
    // אתחול I2C
    Serial.println("🔧 מאתחל I2C buses...");
    I2C_1.begin(SDA1, SCL1, 100000);
    I2C_2.begin(SDA2, SCL2, 100000);
    
    Serial.printf("I2C_1: SDA=%d, SCL=%d (כתובת 0x%02X)\n", SDA1, SCL1, MPU6050_ADDR1);
    Serial.printf("I2C_2: SDA=%d, SCL=%d (כתובת 0x%02X)\n", SDA2, SCL2, MPU6050_ADDR2);
    
    delay(100);
    
    // אתחול חיישנים
    Serial.println("\n📡 מאתחל חיישנים...");
    initMPU6050(&I2C_1, "עליון (ראש/גוף)", MPU6050_ADDR1);
    initMPU6050(&I2C_2, "תחתון (כבד)", MPU6050_ADDR2);
    
    delay(500);
    
    // קליברציה ראשונית
    Serial.println("\n⚖️ מכייל חיישנים...");
    calibrateSensor(&I2C_1, &sensor1, "עליון", MPU6050_ADDR1);
    calibrateSensor(&I2C_2, &sensor2, "תחתון", MPU6050_ADDR2);
    
    // אתחול בלוטות'
    Serial.println("\n🔵 מפעיל בלוטות'...");
    if (!SerialBT.begin(device_name)) {
        Serial.println("❌ שגיאה באתחול בלוטות'!");
        return;
    }
    
    Serial.println("✅ בלוטות' מופעל בהצלחה!");
    Serial.print("📱 שם המכשיר: ");
    Serial.println(device_name);
    Serial.println("⏳ ממתין לחיבור מהאפליקציה...");
    
    Serial.println("\n🥊 מערכת מוכנה לאימון!");
    Serial.println("📋 לוג פעילות:");
    Serial.println("================");
}

void loop() {
    // קריאת נתוני חיישנים
    readSensor(&I2C_1, &sensor1, MPU6050_ADDR1);
    delay(2);
    readSensor(&I2C_2, &sensor2, MPU6050_ADDR2);
    
    // זיהוי מכות
    detectPunch(&sensor1);
    detectPunch(&sensor2);
    detectSmartPunch();
    
    // עדכון סיכום
    total_punches = sensor1.punch_count + sensor2.punch_count;
    
    // שליחת נתונים לאפליקציה
    sendDataToBluetooth();
    
    // טיפול בפקודות מהאפליקציה
    handleBluetoothCommands();
    
    // הדפסת מצב ב-Serial כל 3 שניות
    static unsigned long last_status = 0;
    if (millis() - last_status > 3000) {
        printStatus();
        last_status = millis();
    }
    
    delay(10); // דגימה מהירה - 100Hz
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
}

void initMPU6050(TwoWire* wire, const char* name, byte addr) {
    Serial.print("📡 מאתחל ");
    Serial.print(name);
    Serial.print(" (0x");
    Serial.print(addr, HEX);
    Serial.print(")...");
    
    wire->beginTransmission(addr);
    byte error = wire->endTransmission();
    
    if (error == 0) {
        Serial.println(" זוהה!");
        
        // אתחול החיישן
        wire->beginTransmission(addr);
        wire->write(0x6B);  // PWR_MGMT_1 register
        wire->write(0);     // wake up the sensor
        wire->endTransmission(true);
        delay(100);
        
        // בדיקת WHO_AM_I
        wire->beginTransmission(addr);
        wire->write(0x75);  // WHO_AM_I register
        wire->endTransmission(false);
        wire->requestFrom(addr, 1, true);
        
        if (wire->available()) {
            byte whoami = wire->read();
            Serial.print("✓ ");
            Serial.print(name);
            Serial.print(" מחובר (ID: 0x");
            Serial.print(whoami, HEX);
            Serial.println(")");
        }
    } else {
        Serial.print(" ❌ שגיאה ");
        Serial.print(error);
        Serial.println(" - בדוק חיווט!");
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
        
        // עדכון baseline רק אם נדרש
        updateMovingBaseline(sensor, ax_g, ay_g, az_g);
        
        // חישוב ההפרש מהבסיס
        float diff_x = ax_g - sensor->moving_avg_x;
        float diff_y = ay_g - sensor->moving_avg_y;
        float diff_z = az_g - sensor->moving_avg_z;
        
        float magnitude = sqrt(diff_x*diff_x + diff_y*diff_y + diff_z*diff_z);
        
        // עדכון עוצמה נוכחית
        sensor->current_punch = magnitude;
        
        // עדכון מקסימום
        if (sensor->current_punch > sensor->max_punch) {
            sensor->max_punch = sensor->current_punch;
        }
    } else {
        sensor->current_punch = 0.0;
    }
    
    delay(1);
}

// עדכון baseline פשוט - רק כשיציב לזמן ארוך
void updateMovingBaseline(SensorData* sensor, float ax, float ay, float az) {
    // חישוב ההפרש מהממוצע הנוכחי
    float diff_from_baseline = sqrt(
        pow(ax - sensor->moving_avg_x, 2) +
        pow(ay - sensor->moving_avg_y, 2) +
        pow(az - sensor->moving_avg_z, 2)
    );
    
    // אם יציב מאוד - עדכן לאט
    if (diff_from_baseline < 0.1) {
        const float alpha = 0.001; // עדכון איטי מאוד
        
        sensor->moving_avg_x = sensor->moving_avg_x * (1 - alpha) + ax * alpha;
        sensor->moving_avg_y = sensor->moving_avg_y * (1 - alpha) + ay * alpha;
        sensor->moving_avg_z = sensor->moving_avg_z * (1 - alpha) + az * alpha;
        
        sensor->stable_count++;
        
        // כיול מחדש רק אחרי יציבות ארוכה מאוד (20 שניות!)
        if (sensor->stable_count > 2000) {
            sensor->baseline_x = sensor->moving_avg_x;
            sensor->baseline_y = sensor->moving_avg_y;
            sensor->baseline_z = sensor->moving_avg_z;
            sensor->stable_count = 0;
            
            Serial.println("🔧 כיול אוטומטי - יציבות ארוכה");
        }
    } else {
        // יש תנועה - איפוס ספירה
        sensor->stable_count = 0;
    }
}

void detectPunch(SensorData* sensor) {
    unsigned long current_time = millis();
    
    // זיהוי מכה פשוט
    if (sensor->current_punch > PUNCH_THRESHOLD && 
        !sensor->punch_detected && 
        (current_time - sensor->last_detection > SENSOR_RESET_TIME)) {
        
        sensor->punch_detected = true;
        sensor->last_detection = current_time;
    }
    
    // איפוס זיהוי מכה
    if (sensor->current_punch < PUNCH_THRESHOLD * 0.3) {
        sensor->punch_detected = false;
    }
}

void detectSmartPunch() {
    static unsigned long last_smart_detection = 0;
    unsigned long current_time = millis();
    
    // בדיקה שיש זיהוי בחיישן
    bool any_punch = sensor1.punch_detected || sensor2.punch_detected;
    
    if (any_punch && (current_time - last_smart_detection > COOLDOWN_BETWEEN_PUNCHES)) {
        // איזה חיישן הכי חזק?
        float max_force = 0;
        int winning_sensor = 0;
        String winning_zone = "";
        
        if (sensor1.current_punch > max_force && sensor1.current_punch > PUNCH_THRESHOLD) {
            max_force = sensor1.current_punch;
            winning_sensor = 1;
            winning_zone = "עליון";
        }
        
        if (sensor2.current_punch > max_force && sensor2.current_punch > PUNCH_THRESHOLD) {
            max_force = sensor2.current_punch;
            winning_sensor = 2;
            winning_zone = "תחתון";
        }
        
        // אם יש זוכה ברור
        if (winning_sensor > 0) {
            // רק החיישן הזוכה מקבל נקודה
            if (winning_sensor == 1) {
                sensor1.punch_count++;
                sensor1.last_punch_time = current_time;
            } else {
                sensor2.punch_count++;
                sensor2.last_punch_time = current_time;
            }
            
            // חישוב עוצמה משולבת
            float combined_force = calculateCombinedForce(winning_sensor);
            
            // חישוב BPM
            static unsigned long last_punch_time_for_bpm = 0;
            unsigned long time_between_punches = current_time - last_punch_time_for_bpm;
            float bpm = 0;
            if (last_punch_time_for_bpm > 0 && time_between_punches > 0) {
                bpm = 60000.0 / time_between_punches;
            }
            
            // למידה אוטומטית
            if (!learning_complete) {
                adaptToUser(combined_force);
            }
            
            last_punch_time_for_bpm = current_time;
            
            Serial.print("🥊 מכה ");
            Serial.print(winning_zone);
            Serial.print(" #");
            Serial.print((winning_sensor == 1 ? sensor1.punch_count : sensor2.punch_count));
            Serial.print(" עוצמה: ");
            Serial.print(max_force, 2);
            Serial.print(" (משולב: ");
            Serial.print(combined_force, 2);
            Serial.print(")");
            
            if (bpm > 0 && bpm < 300) {
                Serial.print(" BPM: ");
                Serial.print(bpm, 0);
            }
            
            if (!learning_complete) {
                Serial.print(" [למידה ");
                Serial.print(learning_index);
                Serial.print("/");
                Serial.print(LEARNING_SAMPLE_SIZE);
                Serial.print("]");
            }
            
            Serial.print(" | סה''כ: ");
            Serial.println(sensor1.punch_count + sensor2.punch_count);
            
            // שליחה לאפליקציה
            sendPunchEventToBluetooth(winning_sensor, winning_zone, max_force, combined_force, bpm);
            
            last_smart_detection = current_time;
        }
    }
}

float calculateCombinedForce(int primary_sensor) {
    float primary_force = 0;
    float secondary_boost = 0;
    
    if (primary_sensor == 1) {
        primary_force = sensor1.current_punch;
        secondary_boost = sensor2.current_punch * 0.2;
    } else {
        primary_force = sensor2.current_punch;
        secondary_boost = sensor1.current_punch * 0.2;
    }
    
    return primary_force + secondary_boost;
}

void adaptToUser(float force) {
    if (learning_index < LEARNING_SAMPLE_SIZE) {
        learning_forces[learning_index] = force;
        learning_index++;
        
        if (learning_index >= LEARNING_SAMPLE_SIZE) {
            // חישוב ממוצע
            float avg_force = 0;
            for (int i = 0; i < LEARNING_SAMPLE_SIZE; i++) {
                avg_force += learning_forces[i];
            }
            avg_force /= LEARNING_SAMPLE_SIZE;
            
            // קביעת רף חדש
            PUNCH_THRESHOLD = avg_force * 0.7;
            if (PUNCH_THRESHOLD < 0.3) PUNCH_THRESHOLD = 0.3;
            if (PUNCH_THRESHOLD > 1.5) PUNCH_THRESHOLD = 1.5;
            
            learning_complete = true;
            
            Serial.println("\n✅ למידה הושלמה!");
            Serial.printf("רף זיהוי חדש: %.2f\n", PUNCH_THRESHOLD);
            Serial.printf("על בסיס ממוצע: %.2f\n", avg_force);
        }
    }
}

void calibrateSensor(TwoWire* wire, SensorData* sensor, const char* name, byte addr) {
    Serial.print("⚖️ מכייל ");
    Serial.print(name);
    Serial.print("...");
    
    float sum_x = 0, sum_y = 0, sum_z = 0;
    int samples = 100;
    int successful_reads = 0;
    
    for (int i = 0; i < samples; i++) {
        wire->beginTransmission(addr);
        wire->write(0x3B);
        wire->endTransmission(false);
        wire->requestFrom(addr, 6, true);
        
        if (wire->available() >= 6) {
            int16_t ax = (wire->read() << 8) | wire->read();
            int16_t ay = (wire->read() << 8) | wire->read();
            int16_t az = (wire->read() << 8) | wire->read();
            
            float ax_g = ax / 16384.0;
            float ay_g = ay / 16384.0;
            float az_g = az / 16384.0;
            
            sum_x += ax_g;
            sum_y += ay_g;
            sum_z += az_g;
            successful_reads++;
        }
        delay(10);
        
        if (i % 20 == 0) Serial.print(".");
    }
    
    if (successful_reads > 0) {
        sensor->baseline_x = sum_x / successful_reads;
        sensor->baseline_y = sum_y / successful_reads;
        sensor->baseline_z = sum_z / successful_reads;
        
        sensor->moving_avg_x = sensor->baseline_x;
        sensor->moving_avg_y = sensor->baseline_y;
        sensor->moving_avg_z = sensor->baseline_z;
        
        Serial.print(" ✓ מכויל (");
        Serial.print(sensor->baseline_x, 2);
        Serial.print(", ");
        Serial.print(sensor->baseline_y, 2);
        Serial.print(", ");
        Serial.print(sensor->baseline_z, 2);
        Serial.println(")");
    } else {
        Serial.println(" ❌ כשל בקליברציה");
    }
}

void sendDataToBluetooth() {
    unsigned long current_time = millis();
    
    // שליחת נתונים בזמן אמת
    if (current_time - last_data_send >= DATA_SEND_INTERVAL && SerialBT.hasClient()) {
        DynamicJsonDocument doc(512);
        
        doc["type"] = "realtime";
        doc["timestamp"] = current_time;
        
        // נתוני חיישן 1
        JsonObject s1 = doc.createNestedObject("sensor1");
        s1["current"] = roundFloat(sensor1.current_punch, 2);
        s1["max"] = roundFloat(sensor1.max_punch, 2);
        s1["punches"] = sensor1.punch_count;
        s1["detected"] = sensor1.punch_detected;
        
        // נתוני חיישן 2
        JsonObject s2 = doc.createNestedObject("sensor2");
        s2["current"] = roundFloat(sensor2.current_punch, 2);
        s2["max"] = roundFloat(sensor2.max_punch, 2);
        s2["punches"] = sensor2.punch_count;
        s2["detected"] = sensor2.punch_detected;
        
        // נתונים כלליים
        doc["total_punches"] = total_punches;
        doc["training_time"] = current_time - training_start_time;
        doc["session_id"] = session_id;
        doc["learning_complete"] = learning_complete;
        doc["punch_threshold"] = roundFloat(PUNCH_THRESHOLD, 2);
        
        String output;
        serializeJson(doc, output);
        SerialBT.println(output);
        
        last_data_send = current_time;
    }
    
    // שליחת סטטוס פחות תכוף
    if (current_time - last_status_send >= STATUS_SEND_INTERVAL && SerialBT.hasClient()) {
        sendStatusToBluetooth();
        last_status_send = current_time;
    }
}

void sendStatusToBluetooth() {
    DynamicJsonDocument doc(256);
    
    doc["type"] = "status";
    doc["device_name"] = device_name;
    doc["uptime"] = millis();
    doc["free_heap"] = ESP.getFreeHeap();
    doc["learning_progress"] = learning_complete ? 100 : (learning_index * 100 / LEARNING_SAMPLE_SIZE);
    
    String output;
    serializeJson(doc, output);
    SerialBT.println(output);
}

void sendPunchEventToBluetooth(int sensor_num, String zone, float force, float combined_force, float bpm) {
    if (!SerialBT.hasClient()) return;
    
    DynamicJsonDocument doc(512);
    
    doc["type"] = "punch_event";
    doc["timestamp"] = millis();
    doc["session_id"] = session_id;
    doc["sensor"] = sensor_num;
    doc["zone"] = zone;
    doc["force"] = roundFloat(force, 2);
    doc["combined_force"] = roundFloat(combined_force, 2);
    if (bpm > 0 && bpm < 300) {
        doc["bpm"] = roundFloat(bpm, 1);
    }
    doc["punch_number"] = (sensor_num == 1 ? sensor1.punch_count : sensor2.punch_count);
    doc["total_punches"] = total_punches;
    
    // הוספת נתוני חיישנים נוכחיים
    JsonObject sensors = doc.createNestedObject("sensors");
    sensors["sensor1_current"] = roundFloat(sensor1.current_punch, 2);
    sensors["sensor2_current"] = roundFloat(sensor2.current_punch, 2);
    
    String output;
    serializeJson(doc, output);
    SerialBT.println(output);
    
    Serial.print("📤 נשלח: מכה ");
    Serial.print(zone);
    Serial.print(" #");
    Serial.println(sensor_num == 1 ? sensor1.punch_count : sensor2.punch_count);
}

void handleBluetoothCommands() {
    if (SerialBT.available()) {
        String command = SerialBT.readStringUntil('\n');
        command.trim();
        
        Serial.print("📥 פקודה: ");
        Serial.println(command);
        
        DynamicJsonDocument response(256);
        
        if (command == "RESET") {
            resetTraining();
            response["type"] = "response";
            response["command"] = "RESET";
            response["status"] = "success";
            response["message"] = "Training reset successfully";
            
        } else if (command == "CALIBRATE") {
            calibrateAllSensors();
            response["type"] = "response";
            response["command"] = "CALIBRATE";
            response["status"] = "success";
            response["message"] = "Sensors calibrated successfully";
            
        } else if (command == "GET_STATUS") {
            sendStatusToBluetooth();
            return;
            
        } else if (command.startsWith("SET_THRESHOLD:")) {
            float new_threshold = command.substring(14).toFloat();
            if (new_threshold > 0.1 && new_threshold < 5.0) {
                PUNCH_THRESHOLD = new_threshold;
                response["type"] = "response";
                response["command"] = "SET_THRESHOLD";
                response["status"] = "success";
                response["new_threshold"] = new_threshold;
            } else {
                response["type"] = "response";
                response["command"] = "SET_THRESHOLD";
                response["status"] = "error";
                response["message"] = "Invalid threshold value";
            }
            
        } else {
            response["type"] = "response";
            response["command"] = command;
            response["status"] = "error";
            response["message"] = "Unknown command";
        }
        
        String output;
        serializeJson(response, output);
        SerialBT.println(output);
    }
}

void resetTraining() {
    resetSensorData(&sensor1);
    resetSensorData(&sensor2);
    total_punches = 0;
    training_start_time = millis();
    session_id = "session_" + String(millis());
    
    // איפוס למידה
    learning_index = 0;
    learning_complete = false;
    PUNCH_THRESHOLD = 0.8;
    
    Serial.println("🔄 אימון אופס!");
}

void calibrateAllSensors() {
    Serial.println("🎯 מכייל חיישנים מחדש...");
    calibrateSensor(&I2C_1, &sensor1, "עליון", MPU6050_ADDR1);
    calibrateSensor(&I2C_2, &sensor2, "תחתון", MPU6050_ADDR2);
    Serial.println("✅ כיול הושלם!");
}

void printStatus() {
    unsigned long training_duration = millis() - training_start_time;
    unsigned long minutes = (training_duration % 3600000) / 60000;
    unsigned long seconds = (training_duration % 60000) / 1000;
    
    Serial.println("\n" + String("=").substring(0, 50));
    Serial.print("⏱️  זמן אימון: ");
    if (minutes < 10) Serial.print("0");
    Serial.print(minutes);
    Serial.print(":");
    if (seconds < 10) Serial.print("0");
    Serial.println(seconds);
    
    Serial.print("🥊 סה''כ מכות: ");
    Serial.println(total_punches);
    
    Serial.println("\n📊 נתונים לפי אזור:");
    Serial.printf("🎯 עליון  | מכות: %2d | מקס: %.1f | נוכחי: %.1f\n", 
                  sensor1.punch_count, sensor1.max_punch, sensor1.current_punch);
    Serial.printf("💪 תחתון  | מכות: %2d | מקס: %.1f | נוכחי: %.1f\n", 
                  sensor2.punch_count, sensor2.max_punch, sensor2.current_punch);
    
    // חישוב אחוזים
    if (total_punches > 0) {
        Serial.println("\n📈 התפלגות מכות:");
        Serial.printf("עליון: %d%% | תחתון: %d%%\n",
                      (sensor1.punch_count * 100) / total_punches,
                      (sensor2.punch_count * 100) / total_punches);
    }
    
    // מצב למידה
    if (!learning_complete) {
        Serial.printf("🎓 למידה: %d/%d | רף נוכחי: %.2f\n", 
                      learning_index, LEARNING_SAMPLE_SIZE, PUNCH_THRESHOLD);
    } else {
        Serial.printf("✅ למידה הושלמה | רף: %.2f\n", PUNCH_THRESHOLD);
    }
    
    Serial.printf("🔵 בלוטות': %s\n", SerialBT.hasClient() ? "מחובר" : "מנותק");
    
    Serial.println(String("=").substring(0, 50));
}

// פונקציית עזר לעיגול
float roundFloat(float value, int decimals) {
    float multiplier = pow(10.0, decimals);
    return round(value * multiplier) / multiplier;
}

/*
 * הוראות התקנה למערכת 2 חיישנים פשוטה ויציבה + בלוטות':
 * 
 * חיווט:
 * חיישן 1 (עליון): SDA=21, SCL=22, VCC=3.3V, GND=GND, AD0=GND (כתובת 0x68)
 * חיישן 2 (תחתון): SDA=25, SCL=26, VCC=3.3V, GND=GND, AD0=GND (כתובת 0x68)
 * 
 * יתרונות האלגוריתם הפשוט:
 * ✅ אלגוריתם זיהוי מכות פשוט ויציב
 * ✅ כיול אוטומטי רק כשבאמת נדרש (20 שניות יציבות)
 * ✅ למידה אוטומטית של עוצמת המשתמש (10 מכות)
 * ✅ זיהוי החיישן החזק ביותר בכל מכה
 * ✅ שליחת נתונים בזמן אמת לאפליקציה
 * ✅ פחות הודעות מטרידות
 * ✅ יציבות גבוהה
 * 
 * שימוש:
 * 1. העלה את הקוד לESP32
 * 2. פתח Serial Monitor (115200 baud)
 * 3. התחבר מהאפליקציה לחיישן "BoxingSensor_01"
 * 4. התחל לאמן!
 * 
 * תכונות:
 * - זיהוי מכות פשוט ואמין
 * - כיול אוטומטי חכם (רק כשנדרש)
 * - למידה מהירה של עוצמת המשתמש
 * - שליחת נתונים מלאים לאפליקציה
 * - התפלגות מכות באחוזים
 * - חישוב BPM (מכות לדקה)
 * - תמיכה בפקודות מהאפליקציה
 * - יציבות מקסימלית
 */